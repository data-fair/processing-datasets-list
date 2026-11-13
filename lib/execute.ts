import type { RunFunction, ProcessingContext } from '@data-fair/lib-common-types/processings.js'
import type { ProcessingConfig } from '#types/processingConfig/index.ts'
import { buildCatalogSchema, buildConceptTitles, buildCustomColumns, buildVirtualUsageIndex, toCatalogLine, LIST_SELECT, RETIRED_KEYS, type ConceptTitles } from './catalog.ts'
import { extraColumns, mergeSchema, mergeLine, type SchemaColumn } from './preserve.ts'
import { dfRetry } from './retry.ts'

type DatasetRef = { id: string, title: string }
type Owner = { type?: string, id?: string, department?: string }

const LIST_PAGE_SIZE = 1000
const BULK_CHUNK_SIZE = 1000

/**
 * True when an interruption is requested for this processing.
 * Set by the `stop` function, checked at every loop boundary of `run`.
 */
let shouldBeStopped = false

export const run: RunFunction<ProcessingConfig> = async (context) => {
  const { log, processingConfig } = context

  const catalog = await resolveCatalogDataset(context)
  if (shouldBeStopped) return

  const datasets = await fetchAllDatasets(context, catalog.id, catalog.owner)
  if (shouldBeStopped) return

  const conceptTitles = await fetchConceptTitles(context)
  if (shouldBeStopped) return

  // Custom metadata columns are discovered from the keys present on the datasets
  // themselves (the owner settings, which would give nicer titles, require a member
  // role on the org that the processing API key does not have).
  const customColumns = buildCustomColumns(datasets)
  const generatedSchema = buildCatalogSchema(customColumns)

  // Load the catalog: sync the schema (static + discovered custom columns) then
  // write the lines, all under a single "data loading" step.
  await log.step('Loading data into the catalog')

  const extras = processingConfig.preserveExtraColumns === false
    ? []
    : extraColumns(catalog.schema, generatedSchema, RETIRED_KEYS)
  if (extras.length) {
    await log.info(`Preserving ${extras.length} column(s) added by hand: ${extras.map(c => c.key).join(', ')}`)
  }

  // Read the lines BEFORE patching the schema: data-fair unsets the columns a schema patch
  // drops, on every line, so reading afterwards would read away what we are preserving.
  const existing = await fetchExistingLines(context, catalog.id, extras.map(c => c.key))
  if (shouldBeStopped) return

  await syncSchema(context, catalog.id, mergeSchema(generatedSchema, extras))
  if (shouldBeStopped) return

  const virtualUsage = buildVirtualUsageIndex(datasets)
  const lines = datasets.map(d => mergeLine(
    toCatalogLine(d, { virtualUsage, customColumns, conceptTitles }),
    existing.values.get(d.id),
    extras
  ))
  const summary = await syncLines(context, catalog.id, lines, existing.ids)
  if (shouldBeStopped) return

  // We don't wait for a finalize event: data-fair finalizes the dataset on its own
  // once `_bulk_lines` has returned, and the finalize fires near-instantly for small
  // datasets — before a journal subscription could catch it, which would hang the run.
  await log.info(`Catalog updated: ${summary.nbOk} line(s) written, ${summary.nbDeleted} deleted, ${summary.nbErrors} in error`)
}

/**
 * Sets `shouldBeStopped = true` to indicate that the processing should stop.
 * The `run` function checks this flag to interrupt gracefully.
 */
export const stop: () => Promise<void> = async () => { shouldBeStopped = true }

/**
 * Creates the catalog dataset (REST) in 'create' mode and switches the config to
 * 'update', or fetches the existing one in 'update' mode. The schema is synced
 * separately (see `syncSchema`) once the custom metadata columns are known.
 */
const resolveCatalogDataset = async (context: ProcessingContext<ProcessingConfig>): Promise<DatasetRef & { owner: Owner, schema: SchemaColumn[] }> => {
  const { processingConfig, processingId, axios, log, patchConfig } = context

  if (processingConfig.datasetMode === 'create') {
    const title = processingConfig.datasetTitle as string
    await log.step(`Creating the catalog dataset "${title}"`)
    // A freshly created, empty REST dataset does not emit a finalize event yet: we
    // don't wait here, the finalize is awaited once the lines have been written.
    const dataset = (await dfRetry(() => axios.post('api/v1/datasets', {
      title,
      isRest: true,
      schema: buildCatalogSchema(),
      extras: { processingId }
    }), log, { label: 'Catalog dataset creation', creates: true })).data
    await log.info(`Catalog dataset created, id="${dataset.id}", title="${dataset.title}"`)
    const ref = { id: dataset.id, title: dataset.title }
    await patchConfig({ datasetMode: 'update', dataset: ref } as any)
    return { ...ref, owner: dataset.owner ?? {}, schema: dataset.schema ?? [] }
  }

  const ref = processingConfig.dataset as DatasetRef
  await log.step(`Checking the catalog dataset "${ref?.title || ref?.id}"`)
  const dataset = (await axios.get(`api/v1/datasets/${ref.id}`)).data
  if (!dataset) throw new Error(`The catalog dataset does not exist, id="${ref.id}"`)
  await log.info(`Catalog dataset found, id="${dataset.id}", title="${dataset.title}"`)
  return { id: dataset.id, title: dataset.title, owner: dataset.owner ?? {}, schema: dataset.schema ?? [] }
}

/**
 * Re-syncs the catalog schema so new (and custom) columns appear without a manual
 * rebuild. The resulting finalize is awaited together with the bulk write below.
 */
const syncSchema = async (context: ProcessingContext<ProcessingConfig>, catalogId: string, schema: any[]) => {
  const { axios, log } = context
  await log.info(`Updating the catalog schema (${schema.length} columns)`)
  await dfRetry(() => axios.patch(`api/v1/datasets/${catalogId}`, { schema }), log, { label: 'Catalog schema update' })
}

/**
 * Builds the data-fair `owner` filter value used to scope the dataset list to the
 * catalog's owner. Without it, the list endpoint returns every dataset readable by
 * the API key — including globally-public datasets that belong to other orgs.
 *
 * The scope follows the catalog owner (see data-fair `ownerFilters`):
 * - org root (`type:id`, no department) → the whole organization, every department
 *   included;
 * - department (`type:id:department`) → that department only, excluding the org
 *   root and the other departments.
 */
const ownerFilter = (owner: Owner): string | undefined => {
  if (!owner?.type || !owner?.id) return undefined
  return owner.department ? `${owner.type}:${owner.id}:${owner.department}` : `${owner.type}:${owner.id}`
}

/**
 * Fetches data-fair's vocabulary to label the concepts carried by the dataset columns.
 * The route is open, so no scope is needed — but for that same reason it only serves the
 * standard vocabulary: concepts an organization defines privately are not in there, and
 * would only become visible if the API key ever gained a `settings` scope. Those still
 * come through when data-fair has resolved them into `x-concept.title` on the column.
 * A failure is not worth aborting a run over, so it degrades to an empty index.
 */
const fetchConceptTitles = async (context: ProcessingContext<ProcessingConfig>): Promise<ConceptTitles> => {
  const { axios, log } = context
  try {
    const { data } = await axios.get('api/v1/vocabulary')
    const titles = buildConceptTitles(data)
    await log.info(`Loaded ${Object.keys(titles).length} concept label(s) from the vocabulary`)
    return titles
  } catch (err: any) {
    await log.warning(`Vocabulary unavailable (${err.message}): unresolved concepts will show their technical value`)
    return {}
  }
}

/**
 * Fetches the datasets owned by the catalog's owner, paginated. Scoped with the
 * `owner` filter so foreign public datasets are excluded. The catalog dataset
 * itself is excluded so it does not reference itself and churn on every run.
 */
const fetchAllDatasets = async (context: ProcessingContext<ProcessingConfig>, catalogId: string, owner: Owner): Promise<any[]> => {
  const { axios, log } = context
  await log.step('Fetching the datasets of the owner')

  const ownerParam = ownerFilter(owner)
  if (!ownerParam) await log.warning('Unknown catalog owner: every dataset readable by the API key will be listed')

  const all: any[] = []
  let page = 1
  let fetched = 0
  let total = Infinity
  while (fetched < total) {
    if (shouldBeStopped) break
    const { data } = await axios.get('api/v1/datasets', {
      params: { size: LIST_PAGE_SIZE, page, select: LIST_SELECT, sort: 'createdAt:-1', ...(ownerParam ? { owner: ownerParam } : {}) }
    })
    total = data.count ?? 0
    const results = data.results ?? []
    if (!results.length) break
    fetched += results.length
    for (const d of results) {
      if (d.id === catalogId) continue
      all.push(d)
    }
    page++
  }

  await log.info(`${all.length} dataset(s) to list in the catalog`)
  return all
}

/**
 * Upserts every catalog line and deletes the lines of datasets that no longer
 * exist. Everything goes through the `_bulk_lines` JSON API.
 */
const syncLines = async (context: ProcessingContext<ProcessingConfig>, catalogId: string, lines: any[], existingIds: string[]) => {
  const { log } = context

  const actions: any[] = lines.map(line => ({ ...line, _action: 'createOrUpdate' }))

  const keepIds = new Set(lines.map(l => l._id))
  const staleIds = existingIds.filter(id => !keepIds.has(id))
  for (const id of staleIds) actions.push({ _id: id, _action: 'delete' })
  const nbDeleted = staleIds.length
  if (nbDeleted) await log.info(`${nbDeleted} line(s) of datasets that no longer exist to delete`)

  await log.task('Writing the catalog lines')
  await log.progress('Writing the catalog lines', 0, actions.length)
  let done = 0
  let nbOk = 0
  let nbErrors = 0
  for (let i = 0; i < actions.length; i += BULK_CHUNK_SIZE) {
    if (shouldBeStopped) break
    const chunk = actions.slice(i, i + BULK_CHUNK_SIZE)
    // Bulk writes are only retried on 429: a gateway error may hide a batch that went through.
    const result = (await dfRetry(() => context.axios.post(`api/v1/datasets/${catalogId}/_bulk_lines`, chunk), log, { label: `Catalog lines ${i + 1}-${i + chunk.length}`, creates: true })).data
    nbOk += result?.nbOk ?? 0
    nbErrors += result?.nbErrors ?? 0
    if (result?.nbErrors) {
      await log.error(`${result.nbErrors} error(s) while writing ${chunk.length} catalog line(s)`)
      for (const error of (result.errors ?? [])) await log.error(JSON.stringify(error))
    }
    done += chunk.length
    await log.progress('Writing the catalog lines', done, actions.length)
  }

  // nbOk from the bulk response counts every applied action (upserts and deletes);
  // report the upserts separately from the deletions we explicitly queued.
  return { nbOk: Math.max(0, nbOk - nbDeleted), nbDeleted, nbErrors }
}

/**
 * Reads the lines currently stored in the catalog, paginated: their `_id` (to prune the ones
 * whose dataset is gone) and the values of the columns to preserve. Selecting the extra
 * columns here costs no extra request, the pagination happens either way.
 */
const fetchExistingLines = async (context: ProcessingContext<ProcessingConfig>, catalogId: string, extraKeys: string[]): Promise<{ ids: string[], values: Map<string, Record<string, any>> }> => {
  const { axios } = context
  const ids: string[] = []
  const values = new Map<string, Record<string, any>>()
  let page = 1
  let more = true
  while (more) {
    if (shouldBeStopped) break
    const { data } = await axios.get(`api/v1/datasets/${catalogId}/lines`, {
      params: { size: LIST_PAGE_SIZE, page, select: ['_id', ...extraKeys].join(',') }
    })
    const results = data.results ?? []
    for (const r of results) {
      ids.push(r._id)
      if (extraKeys.length) values.set(r._id, r)
    }
    if (results.length < LIST_PAGE_SIZE) more = false
    else page++
  }
  return { ids, values }
}
