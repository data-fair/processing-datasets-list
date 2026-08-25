# <img alt="Data FAIR logo" src="https://cdn.jsdelivr.net/gh/data-fair/data-fair@master/ui/public/assets/logo.svg" width="30"> @data-fair/processing-datasets-list

Plugin for [data-fair/processings](https://github.com/data-fair/processings). Builds and maintains a REST dataset that catalogs every dataset owned by the catalog's owner (the organization, or department, that owns the catalog dataset).

Unlike the back-office datasets list view, this runs asynchronously: it can perform per-dataset computations and aggregations that would be too costly to do on the fly, and it materializes the result as a regular dataset — so it can be filtered, charted, embedded and published like any other.

## How it works

1. **Catalog dataset** — on first run (`create` mode) it creates a REST dataset with the catalog schema (see below) and switches its own config to `update` mode, storing the reference.
2. **Collect** — it paginates through `GET /api/v1/datasets`, scoped to the catalog owner with the `owner` filter (so foreign public datasets are excluded), excluding the catalog dataset itself.
3. **Read** — the existing catalog lines are read: their ids, to prune the ones whose dataset is gone, and the values of the columns to preserve (see below). This happens **before** the schema is patched, because that patch unsets the columns it drops on every line.
4. **Schema sync** — the catalog schema is re-pushed (`PATCH`), so new columns appear on existing catalogs without a manual rebuild.
5. **Upsert** — each dataset becomes one line (keyed by the dataset id) pushed through the `_bulk_lines` API.
6. **Prune** — lines of datasets that no longer exist are deleted so the catalog stays in sync.

## Columns added by hand

A catalog is a good place to annotate datasets, and those annotations are added as extra
columns on the catalog dataset itself. They are not something this processing produces, so
without care every run would destroy them twice over: a schema `PATCH` that drops a column
makes data-fair `$unset` it on every line, and `_bulk_lines` replaces whole lines rather than
merging them.

With **`preserveExtraColumns`** (on by default), any column of the live catalog that this
processing does not produce is carried over, schema and values. Columns data-fair computes
itself (`x-calculated`) are left alone, and columns this processing deliberately retired are
never mistaken for hand-added ones, so they can actually be dropped.

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
| Métadonnées calculées | `bbox`, `projection`, `timeZone` (auto-detected, not editable), `metadataScore` |
| Propriété & visibilité | `owner` (avatar), `visibility`, `published` |
| Fichier | `fileName`, `fileFormat` |
| Structure & stockage | `count`, `nbColumns`, `concepts`, `primaryKey`, `storageSize`, `indexedSize` |
| Relations & enrichissements | `nbExtensions`, `nbAttachments`, `nbChildren` (virtual sources), `nbUsedInVirtual` (datasets reusing it), `nbApplications`, `nbRelatedDatasets` |
| Données de référence | `isMasterData` (exposes reference-data services), `nbBulkSearchs` (bulk enrichment endpoints), `nbSingleSearchs` (code/label search endpoints) — derived from the dataset's `masterData` config |
| Publication | `publicationPortals` (portal identifiers `type:id`), `nbPublicationSites`, `nbRequestedPublicationSites` |
| État | `status` |
| Audit & dates | `createdAt`, `updatedAt`, `dataUpdatedAt`, `finalizedAt`, `portalModified` (modification date shown on the portal: `modified` › `dataUpdatedAt` › `updatedAt`) |

The catalog carries **no author column**: who created or last updated a dataset names a
person, and a catalog is made to be published. They are not requested from the API at all.

Multi-valued columns (`keywords`, `topics`, `concepts`, `relatedDatasets`, `primaryKey`,
`publicationPortals`) carry a `separator` so data-fair treats them as arrays. That separator
is a **semicolon**, not a comma: topic labels, keywords and dataset titles routinely contain
commas, which a comma separator would split into bogus values.

`concepts` lists the semantic concepts carried by the dataset's columns, as **labels**, never
as URIs. data-fair maintains an `x-concept` annotation (`{ id, title }`, title already in
French) on every column that carries an `x-refersTo`, so the title is read straight from
there. Datasets not re-finalized since `x-concept` was introduced only carry the raw
`x-refersTo` URI, which is looked up in data-fair's vocabulary. That vocabulary is fetched
once per run from `GET /api/v1/vocabulary` — an open route, no scope required — and indexed
by concept id and by identifier URI. It only carries the **standard** vocabulary: concepts an
organization defines privately would need a `settings` scope the processing API key does not
have, and reach the catalog only through the `x-concept.title` data-fair already resolved.
When nothing resolves — a private concept on a stale dataset, a vocabulary entry newer than
the run, an unreachable endpoint — the technical value is written rather than the concept
being dropped. Calculated columns are skipped, and a concept shared by several columns is
listed once.

`metadataScore` rates the metadata of each dataset from 0 to 100. Ten criteria receive a note
from 0 to 1, weighted in points and scaled on their total; the column documents its own
formula, so any score can be explained by reading the column description. Presence is only
part of it: a description repeating the title, a summary carrying html or markdown, one
keyword or thirty, all score below a field simply being filled.

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
| Jeu de données catalogue | `preserveExtraColumns` | Carry over the columns added by hand on the catalog, schema and values. On by default; turning it off makes every run delete them for good |

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
