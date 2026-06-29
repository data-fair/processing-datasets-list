import type { RunFunction, ProcessingContext } from '@data-fair/lib-common-types/processings.js'
import type { ProcessingConfig } from '#types/processingConfig/index.ts'
import { buildCatalogSchema, buildCustomColumns, buildVirtualUsageIndex, toCatalogLine, LIST_SELECT } from './catalog.ts'

type DatasetRef = { id: string, title: string }
type Owner = { type?: string, id?: string }
type OwnerSettings = { customDefs: Map<string, string>, siteNames: Map<string, string> }

const LIST_PAGE_SIZE = 1000
const BULK_CHUNK_SIZE = 1000

/**
 * True when an interruption is requested for this processing.
 * Set by the `stop` function, checked at every loop boundary of `run`.
 */
let shouldBeStopped = false

export const run: RunFunction<ProcessingConfig> = async (context) => {
  const { processingConfig, log } = context
  await log.step('Démarrage du traitement')

  const catalog = await resolveCatalogDataset(context)
  if (shouldBeStopped) return

  const datasets = await fetchAllDatasets(context, catalog.id)
  if (shouldBeStopped) return

  // Resolve human-readable labels (custom metadata titles, portal names) from the
  // owner settings — best-effort, falls back to raw keys/ids if not accessible.
  const settings = await fetchOwnerSettings(context, catalog.owner)
  const customColumns = buildCustomColumns(datasets, settings.customDefs)

  // Sync the schema (static columns + the discovered custom metadata columns).
  await syncSchema(context, catalog.id, buildCatalogSchema(customColumns))
  if (shouldBeStopped) return

  const virtualUsage = buildVirtualUsageIndex(datasets)
  const lines = datasets.map(d => toCatalogLine(d, {
    virtualUsage,
    siteNames: settings.siteNames,
    customColumns,
    computeStorageSize: !!processingConfig.computeStorageSize
  }))
  const summary = await syncLines(context, catalog.id, lines)
  if (shouldBeStopped) return

  // We don't wait for a finalize event: data-fair finalizes the dataset on its own
  // once `_bulk_lines` has returned, and the finalize fires near-instantly for small
  // datasets — before a journal subscription could catch it, which would hang the run.
  await log.info(`Catalogue mis à jour : ${summary.nbOk.toLocaleString()} ligne(s) écrite(s), ${summary.nbDeleted.toLocaleString()} supprimée(s), ${summary.nbErrors.toLocaleString()} en erreur`)
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
const resolveCatalogDataset = async (context: ProcessingContext<ProcessingConfig>): Promise<DatasetRef & { owner: Owner }> => {
  const { processingConfig, processingId, axios, log, patchConfig } = context

  if (processingConfig.datasetMode === 'create') {
    const title = processingConfig.datasetTitle as string
    await log.step(`Création du jeu de données catalogue "${title}"`)
    // A freshly created, empty REST dataset does not emit a finalize event yet: we
    // don't wait here, the finalize is awaited once the lines have been written.
    const dataset = (await axios.post('api/v1/datasets', {
      title,
      isRest: true,
      schema: buildCatalogSchema(),
      extras: { processingId }
    })).data
    await log.info(`Jeu de données créé, id="${dataset.id}", title="${dataset.title}"`)
    const ref = { id: dataset.id, title: dataset.title }
    await patchConfig({ datasetMode: 'update', dataset: ref } as any)
    return { ...ref, owner: dataset.owner ?? {} }
  }

  const ref = processingConfig.dataset as DatasetRef
  await log.step(`Vérification du jeu de données catalogue "${ref?.title || ref?.id}"`)
  const dataset = (await axios.get(`api/v1/datasets/${ref.id}`)).data
  if (!dataset) throw new Error(`Le jeu de données catalogue n'existe pas, id="${ref.id}"`)
  await log.info(`Jeu de données catalogue trouvé, id="${dataset.id}", title="${dataset.title}"`)
  return { id: dataset.id, title: dataset.title, owner: dataset.owner ?? {} }
}

/**
 * Re-syncs the catalog schema so new (and custom) columns appear without a manual
 * rebuild. The resulting finalize is awaited together with the bulk write below.
 */
const syncSchema = async (context: ProcessingContext<ProcessingConfig>, catalogId: string, schema: any[]) => {
  const { axios, log } = context
  await log.step(`Synchronisation du schéma (${schema.length} colonnes)`)
  await axios.patch(`api/v1/datasets/${catalogId}`, { schema })
}

/**
 * Fetches owner-level settings used to resolve human-readable labels:
 * - custom metadata field definitions (key -> title)
 * - publication sites (`type:id` -> title)
 * Best-effort: if the API key cannot read settings, returns empty maps and the
 * mapping falls back to raw keys/ids.
 */
const fetchOwnerSettings = async (context: ProcessingContext<ProcessingConfig>, owner: Owner): Promise<OwnerSettings> => {
  const { axios, log } = context
  const customDefs = new Map<string, string>()
  const siteNames = new Map<string, string>()
  if (!owner?.type || !owner?.id) return { customDefs, siteNames }

  try {
    const data = (await axios.get(`api/v1/settings/${owner.type}/${owner.id}/datasets-metadata`)).data
    for (const c of (data?.custom ?? [])) if (c?.key) customDefs.set(c.key, c.title || c.key)
  } catch {
    await log.info('Définitions de métadonnées personnalisées non accessibles : libellés bruts utilisés')
  }

  try {
    const data = (await axios.get(`api/v1/settings/${owner.type}/${owner.id}/publication-sites`)).data
    for (const s of (Array.isArray(data) ? data : [])) {
      if (s?.type && s?.id) siteNames.set(`${s.type}:${s.id}`, s.title || s.url || `${s.type}:${s.id}`)
    }
  } catch {
    await log.info('Sites de publication non accessibles : identifiants bruts utilisés')
  }

  return { customDefs, siteNames }
}

/**
 * Fetches every dataset accessible to the API key, paginated. The catalog dataset
 * itself is excluded so it does not reference itself and churn on every run.
 */
const fetchAllDatasets = async (context: ProcessingContext<ProcessingConfig>, catalogId: string): Promise<any[]> => {
  const { processingConfig, axios, log } = context
  await log.step('Récupération des jeux de données de l\'organisation')

  const all: any[] = []
  let page = 1
  let fetched = 0
  let total = Infinity
  while (fetched < total) {
    if (shouldBeStopped) break
    const { data } = await axios.get('api/v1/datasets', {
      params: { size: LIST_PAGE_SIZE, page, select: LIST_SELECT, sort: 'createdAt:-1' }
    })
    total = data.count ?? 0
    const results = data.results ?? []
    if (!results.length) break
    fetched += results.length
    for (const d of results) {
      if (d.id === catalogId) continue
      if (d.isMetaOnly && !processingConfig.includeMetaOnly) continue
      all.push(d)
    }
    page++
  }

  await log.info(`${all.length.toLocaleString()} jeu(x) de données à référencer`)
  return all
}

/**
 * Upserts every catalog line and, when `deleteStale` is enabled, deletes the lines
 * of datasets that no longer exist. Everything goes through the `_bulk_lines` JSON API.
 */
const syncLines = async (context: ProcessingContext<ProcessingConfig>, catalogId: string, lines: any[]) => {
  const { processingConfig, log } = context

  const actions: any[] = lines.map(line => ({ ...line, _action: 'createOrUpdate' }))
  let nbDeleted = 0

  if (processingConfig.deleteStale) {
    const keepIds = new Set(lines.map(l => l._id))
    const existingIds = await fetchExistingLineIds(context, catalogId)
    const staleIds = existingIds.filter(id => !keepIds.has(id))
    for (const id of staleIds) actions.push({ _id: id, _action: 'delete' })
    nbDeleted = staleIds.length
    if (nbDeleted) await log.info(`${nbDeleted.toLocaleString()} ligne(s) obsolète(s) à supprimer`)
  }

  await log.task('Écriture des lignes du catalogue')
  await log.progress('Écriture des lignes du catalogue', 0, actions.length)
  let done = 0
  let nbOk = 0
  let nbErrors = 0
  for (let i = 0; i < actions.length; i += BULK_CHUNK_SIZE) {
    if (shouldBeStopped) break
    const chunk = actions.slice(i, i + BULK_CHUNK_SIZE)
    const result = (await context.axios.post(`api/v1/datasets/${catalogId}/_bulk_lines`, chunk)).data
    nbOk += result?.nbOk ?? 0
    nbErrors += result?.nbErrors ?? 0
    if (result?.nbErrors) {
      await log.error(`${result.nbErrors} erreur(s) lors de l'écriture des lignes`)
      for (const error of (result.errors ?? [])) await log.error(JSON.stringify(error))
    }
    done += chunk.length
    await log.progress('Écriture des lignes du catalogue', done, actions.length)
  }

  // nbOk from the bulk response counts every applied action (upserts and deletes);
  // report the upserts separately from the deletions we explicitly queued.
  return { nbOk: Math.max(0, nbOk - nbDeleted), nbDeleted, nbErrors }
}

/**
 * Returns all `_id` values currently stored in the catalog dataset, paginated.
 */
const fetchExistingLineIds = async (context: ProcessingContext<ProcessingConfig>, catalogId: string): Promise<string[]> => {
  const { axios } = context
  const ids: string[] = []
  let page = 1
  let more = true
  while (more) {
    if (shouldBeStopped) break
    const { data } = await axios.get(`api/v1/datasets/${catalogId}/lines`, {
      params: { size: LIST_PAGE_SIZE, page, select: '_id' }
    })
    const results = data.results ?? []
    for (const r of results) ids.push(r._id)
    if (results.length < LIST_PAGE_SIZE) more = false
    else page++
  }
  return ids
}
