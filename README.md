# <img alt="Data FAIR logo" src="https://cdn.jsdelivr.net/gh/data-fair/data-fair@master/ui/public/assets/logo.svg" width="30"> @data-fair/processing-datasets-list

Plugin for [data-fair/processings](https://github.com/data-fair/processings). Builds and maintains a REST dataset that catalogs every dataset owned by the catalog's owner (the organization, or department, that owns the catalog dataset).

Unlike the back-office datasets list view, this runs asynchronously: it can perform per-dataset computations and aggregations that would be too costly to do on the fly, and it materializes the result as a regular dataset — so it can be filtered, charted, embedded and published like any other.

## How it works

1. **Catalog dataset** — on first run (`create` mode) it creates a REST dataset with the catalog schema (see below) and switches its own config to `update` mode, storing the reference.
2. **Schema sync** — on every run the catalog schema is re-pushed (`PATCH`), so new columns appear on existing catalogs without a manual rebuild.
3. **Collect** — it paginates through `GET /api/v1/datasets`, scoped to the catalog owner with the `owner` filter (so foreign public datasets are excluded), excluding the catalog dataset itself.
4. **Upsert** — each dataset becomes one line (keyed by the dataset id) pushed through the `_bulk_lines` API.
5. **Prune** — when enabled, lines of datasets that no longer exist are deleted so the catalog stays in sync.

## Catalog schema

One line per dataset. It exposes the metadata data-fair stores on a dataset, plus
aggregates that are not available in one click from the back-office. Columns are
ordered by theme (data-fair renders dataset columns as a flat table, so the
grouping is conveyed by ordering). Definitions live in `lib/catalog.ts`.

Columns are grouped with `x-group`. The schema leans on data-fair native
rendering where it helps: `owner` carries the **account** concept (renders the
owner avatar; value is `type:id[:department]`), `page` the **WebPage** concept
(clickable link), `description` the **description** concept (markdown). `Type`,
`frequency` and `visibility` store a stable code and map it to a nice label via
`x-labels` (e.g. `rest` → *Éditable*). Only concepts that exist in data-fair's
vocabulary (`api/contract/vocabulary.js`) are used.

| Group (`x-group`) | Columns |
| ----- | ------- |
| Général | `storageType` (Type: Fichier/Éditable/Virtuel/Métadonnées), `page` (link), `id`, `slug`, `title`, `summary`, `description` (markdown), `image`, `keywords`, `topics` |
| Métadonnées | `license`, `conformsTo` + `conformsToVersion` + `conformsToUrl`, `origin`, `creator`, `frequency`, `spatial`, `temporalStart`, `temporalEnd`, `modified` (DCAT source modification date), `relatedDatasets`, then one column per owner-defined custom field (discovered per run) |
| Métadonnées calculées | `bbox`, `projection`, `timeZone` (auto-detected, not editable) |
| Propriété & visibilité | `owner` (avatar), `visibility`, `published` |
| Fichier | `fileName`, `fileFormat` |
| Structure & stockage | `count`, `nbColumns`, `primaryKey`, `storageSize`, `indexedSize` |
| Relations & enrichissements | `nbExtensions`, `nbAttachments`, `nbChildren` (virtual sources), `nbUsedInVirtual` (datasets reusing it), `nbApplications`, `nbRelatedDatasets` |
| Données de référence | `isMasterData` (exposes reference-data services), `nbBulkSearchs` (bulk enrichment endpoints), `nbSingleSearchs` (code/label search endpoints) — derived from the dataset's `masterData` config |
| Publication | `publicationPortals` (portal identifiers `type:id`), `nbPublicationSites`, `nbRequestedPublicationSites` |
| État | `status` |
| Audit & dates | `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `dataUpdatedAt`, `dataUpdatedBy`, `finalizedAt`, `portalModified` (modification date shown on the portal: `modified` › `dataUpdatedAt` › `updatedAt`) |

Multi-valued columns (`keywords`, `topics`, `relatedDatasets`, `primaryKey`,
`publicationPortals`) carry a `separator` so data-fair treats them as arrays.

The computed aggregates (`nbColumns`, `nbChildren`, `nbUsedInVirtual`,
`nbApplications`…) are cross-dataset information a synchronous list view cannot
afford; `nbUsedInVirtual` is a reverse index built once per run over the whole
dataset list. **Custom metadata** columns are appended dynamically (one per
custom key found on the datasets) at the end of the **Métadonnées** group. Their
titles, and the **publication portals**, use the raw keys/identifiers: the nicer
labels live in the owner settings (`datasets-metadata`, `publication-sites`),
which require a member role on the org that the processing API key does not have.
`portalModified` is recomputed locally (`modified` › `dataUpdatedAt` ›
`updatedAt`) because data-fair stores it as the internal `_modified` field, which
the public API does not expose.

## Configuration

| Tab | Field | Description |
| --- | ----- | ----------- |
| Jeu de données catalogue | `datasetMode` | `create` to create the catalog dataset, `update` to target an existing one |
| Jeu de données catalogue | `datasetTitle` / `dataset` | Title to create, or reference to the dataset to update |

The catalog always includes metadata-only datasets, populates the storage size
columns, and deletes catalog lines of datasets that no longer exist — these are
not configurable.

## Development

```bash
npm install
npm run build-types       # generates the .type/ artifacts from the JSON schemas
npm run lint
npm test                  # runs against the data-fair instance in config/local-test.mjs
```

Create a `config/local-test.mjs` (gitignored) with a `dataFairUrl` and a `dataFairAPIKey` to run the integration test against a real instance.

## Release

Publishing is handled automatically by CI: the plugin is pushed to the data-fair registry (`@data-fair/registry`), not to the public npm registry. A push to `main`/`master` publishes to the staging registry; pushing a `v*` tag publishes to production:

```bash
npm version minor       # version bump + v* tag
git push --follow-tags  # CI publishes to the production registry
```
