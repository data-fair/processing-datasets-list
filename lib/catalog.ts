/**
 * Schema and mapping of the catalog dataset.
 *
 * The catalog exposes, for every dataset of the organization, the metadata
 * data-fair stores on a dataset, plus aggregates that are not available in one
 * click from the back-office (number of columns, virtual children, datasets that
 * reuse it, applications…).
 *
 * Columns are grouped via `x-group` (data-fair groups columns sharing the same
 * value). A few columns use data-fair native rendering:
 * - `x-refersTo` concepts (valid ones only, from api/contract/vocabulary.js):
 *   account (owner avatar), WebPage (clickable link), description (markdown),
 *   image, dateCreated.
 * - `x-labels` maps stored codes to nice labels (type, frequency, visibility).
 *
 * Custom metadata columns are appended dynamically (one per owner-defined field).
 */

const concept = {
  label: 'http://www.w3.org/2000/01/rdf-schema#label',
  description: 'http://schema.org/description',
  image: 'http://schema.org/image',
  webPage: 'https://schema.org/WebPage',
  dateCreated: 'http://schema.org/dateCreated',
  account: 'https://github.com/data-fair/lib/account'
}

const group = {
  base: 'Général',
  coverage: 'Métadonnées',
  computed: 'Métadonnées calculées',
  ownership: 'Propriété & visibilité',
  file: 'Fichier',
  structure: 'Structure & stockage',
  relations: 'Relations & enrichissements',
  masterData: 'Données de référence',
  publication: 'Publication',
  state: 'État',
  audit: 'Audit & dates'
}

/** Separator used for multi-valued (array) string columns. */
const MULTI_SEP = ', '

/** Stored code -> nice label maps (rendered in the table through `x-labels`). */
const STORAGE_TYPE_LABELS: Record<string, string> = {
  file: 'Fichier',
  rest: 'Éditable',
  virtual: 'Virtuel',
  metadata: 'Métadonnées'
}

const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Public',
  protected: 'Protégé',
  private: 'Privé'
}

// Mirrors data-fair's frequency labels (ui dataset-metadata-form.vue / dataset schema enum).
const FREQUENCY_LABELS: Record<string, string> = {
  triennial: 'Tous les 3 ans',
  biennial: 'Tous les 2 ans',
  annual: 'Tous les ans',
  semiannual: '2 fois par an',
  threeTimesAYear: '3 fois par an',
  quarterly: 'Chaque trimestre',
  bimonthly: 'Tous les 2 mois',
  monthly: 'Tous les mois',
  semimonthly: '2 fois par mois',
  biweekly: 'Toutes les 2 semaines',
  threeTimesAMonth: '3 fois par mois',
  weekly: 'Chaque semaine',
  semiweekly: '2 fois par semaine',
  threeTimesAWeek: '3 fois par semaine',
  daily: 'Tous les jours',
  continuous: 'En continu',
  irregular: 'Irrégulière'
}

export type CustomColumn = { srcKey: string, key: string, title: string }

/**
 * Builds the catalog schema. Static columns are grouped by theme; the custom
 * metadata columns (discovered per run) are appended at the end of the
 * "Métadonnées" group.
 */
export const buildCatalogSchema = (customColumns: CustomColumn[] = []) => [
  // — Général —
  { key: 'storageType', type: 'string', title: 'Type', 'x-group': group.base, 'x-labels': STORAGE_TYPE_LABELS, description: 'Mode de stockage du jeu : Fichier (téléversé), Éditable (REST, modifiable ligne à ligne), Virtuel (vue sur d\'autres jeux) ou Métadonnées (référencement sans données).' },
  { key: 'page', type: 'string', title: 'Lien', 'x-group': group.base, 'x-refersTo': concept.webPage, description: 'Lien vers la page du jeu de données sur data-fair.' },
  { key: 'id', type: 'string', title: 'Identifiant', 'x-group': group.base, description: 'Identifiant technique unique du jeu de données.' },
  { key: 'slug', type: 'string', title: 'Slug', 'x-group': group.base, description: 'Identifiant lisible du jeu, utilisé dans les URLs, modifiable.' },
  { key: 'title', type: 'string', title: 'Titre', 'x-group': group.base, 'x-refersTo': concept.label, description: 'Titre du jeu de données.' },
  { key: 'summary', type: 'string', title: 'Résumé', 'x-group': group.base, description: 'Court résumé du jeu de données (une à deux phrases maximum).' },
  { key: 'description', type: 'string', title: 'Description', 'x-group': group.base, 'x-refersTo': concept.description, description: 'Description détaillée du jeu de données (texte markdown).' },
  { key: 'image', type: 'string', title: 'Image', 'x-group': group.base, 'x-refersTo': concept.image, description: 'URL de l\'image d\'illustration du jeu. Peut référencer une pièce jointe via son url.' },
  { key: 'keywords', type: 'string', separator: MULTI_SEP, title: 'Mots-clés', 'x-group': group.base, description: 'Mots-clés libres associés au jeu de données.' },
  { key: 'topics', type: 'string', separator: MULTI_SEP, title: 'Thématiques', 'x-group': group.base, description: 'Thématiques (référentiel défini dans les paramètres de l\'organisation) rattachées au jeu.' },

  // — Métadonnées —
  { key: 'license', type: 'string', title: 'Licence', 'x-group': group.coverage, description: 'Licence de réutilisation des données.' },
  { key: 'conformsTo', type: 'string', title: 'Schéma (conforme à)', 'x-group': group.coverage, description: 'Schéma ou standard de données auquel le jeu déclare se conformer.' },
  { key: 'conformsToVersion', type: 'string', title: 'Schéma — version', 'x-group': group.coverage, description: 'Version du schéma de conformité.' },
  { key: 'conformsToUrl', type: 'string', title: 'Schéma — URL', 'x-group': group.coverage, description: 'URL de la définition du schéma de conformité.' },
  { key: 'origin', type: 'string', title: 'Origine', 'x-group': group.coverage, description: 'Origine des données (URL ou description de la source).' },
  { key: 'creator', type: 'string', title: 'Créateur', 'x-group': group.coverage, description: 'Auteur ou producteur des données.' },
  { key: 'frequency', type: 'string', title: 'Fréquence de mise à jour', 'x-group': group.coverage, 'x-labels': FREQUENCY_LABELS, description: 'Fréquence de mise à jour annoncée pour les données (métadonnée DCAT).' },
  { key: 'spatial', type: 'string', title: 'Couverture spatiale', 'x-group': group.coverage, description: 'Description textuelle de la couverture géographique des données.' },
  { key: 'temporalStart', type: 'string', format: 'date', title: 'Début de couverture temporelle', 'x-group': group.coverage, description: 'Date de début de la période couverte par les données.' },
  { key: 'temporalEnd', type: 'string', format: 'date', title: 'Fin de couverture temporelle', 'x-group': group.coverage, description: 'Date de fin de la période couverte par les données.' },
  { key: 'modified', type: 'string', format: 'date', title: 'Date de modification de la source', 'x-group': group.coverage, description: 'Métadonnée DCAT « date de modification de la source » (saisie sur le jeu de données).' },
  { key: 'relatedDatasets', type: 'string', separator: MULTI_SEP, title: 'Jeux de données associés', 'x-group': group.coverage, description: 'Autres jeux de données recommandés en lien avec celui-ci.' },
  // — Métadonnées personnalisées (dynamiques) — rattachées au groupe Métadonnées, en fin de groupe.
  ...customColumns.map(c => ({ key: c.key, type: 'string', title: c.title, 'x-group': group.coverage, description: 'Métadonnée personnalisée définie par l\'organisation.' })),

  // — Métadonnées calculées (auto-détectées, non paramétrables) —
  { key: 'bbox', type: 'string', title: 'Boîte englobante', 'x-group': group.computed, description: 'Emprise géographique calculée automatiquement (min lon, min lat, max lon, max lat).' },
  { key: 'projection', type: 'string', title: 'Projection', 'x-group': group.computed, description: 'Système de projection géographique détecté pour les données.' },
  { key: 'timeZone', type: 'string', title: 'Fuseau horaire', 'x-group': group.computed, description: 'Fuseau horaire détecté pour les colonnes de date/heure du jeu.' },

  // — Propriété & visibilité —
  { key: 'owner', type: 'string', title: 'Propriétaire', 'x-group': group.ownership, 'x-refersTo': concept.account, description: 'Compte propriétaire du jeu (utilisateur ou organisation, éventuellement un de ses départements).' },
  { key: 'visibility', type: 'string', title: 'Visibilité', 'x-group': group.ownership, 'x-labels': VISIBILITY_LABELS, description: 'Visibilité du jeu : Public (accessible à tous), Protégé (accès restreint par permissions) ou Privé.' },
  { key: 'published', type: 'boolean', title: 'Publié', 'x-group': group.ownership, description: 'Vrai si le jeu est publié sur au moins un site/portail de publication (équivaut à « Nombre de sites de publication » > 0).' },

  // — Fichier —
  { key: 'fileName', type: 'string', title: 'Nom du fichier', 'x-group': group.file, description: 'Nom du fichier d\'origine téléversé (jeux de type Fichier).' },
  { key: 'fileFormat', type: 'string', title: 'Format du fichier', 'x-group': group.file, description: 'Type MIME du fichier d\'origine.' },

  // — Structure & stockage —
  { key: 'count', type: 'integer', title: 'Nombre de lignes', 'x-group': group.structure, description: 'Nombre de lignes (enregistrements) indexées dans le jeu.' },
  { key: 'nbColumns', type: 'integer', title: 'Nombre de colonnes', 'x-group': group.structure, description: 'Nombre de colonnes du schéma, hors colonnes calculées.' },
  { key: 'primaryKey', type: 'string', separator: MULTI_SEP, title: 'Clé primaire', 'x-group': group.structure, description: 'Colonne(s) composant la clé primaire, qui identifie de façon unique une ligne.' },
  { key: 'storageSize', type: 'integer', title: 'Taille de stockage (octets)', 'x-group': group.structure, description: 'Taille de stockage des données (fichier et base).' },
  { key: 'indexedSize', type: 'integer', title: 'Taille indexée (octets)', 'x-group': group.structure, description: 'Taille de l\'index de recherche.' },

  // — Relations & enrichissements —
  { key: 'nbExtensions', type: 'integer', title: 'Nombre d\'enrichissements', 'x-group': group.relations, description: 'Nombre d\'enrichissements (extensions) appliqués au jeu pour compléter ses données à partir de sources externes.' },
  { key: 'nbAttachments', type: 'integer', title: 'Nombre de pièces jointes', 'x-group': group.relations, description: 'Nombre de fichiers joints au jeu de données.' },
  { key: 'nbChildren', type: 'integer', title: 'Nombre de jeux sources (virtuel)', 'x-group': group.relations, description: 'Pour un jeu virtuel, nombre de jeux sources qu\'il agrège.' },
  { key: 'nbUsedInVirtual', type: 'integer', title: 'Réutilisé dans N jeux virtuels', 'x-group': group.relations, description: 'Nombre de jeux virtuels qui utilisent ce jeu comme source (calculé sur l\'ensemble du catalogue).' },
  { key: 'nbApplications', type: 'integer', title: 'Nombre d\'applications', 'x-group': group.relations, description: 'Nombre de visualisations/applications réutilisant ce jeu de données.' },
  { key: 'nbRelatedDatasets', type: 'integer', title: 'Nombre de jeux associés', 'x-group': group.relations, description: 'Nombre de jeux de données déclarés comme associés/recommandés.' },

  // — Données de référence (masterData) —
  { key: 'isMasterData', type: 'boolean', title: 'Donnée de référence', 'x-group': group.masterData, description: 'Vrai si le jeu est exploitable comme donnée de référence : il expose au moins un service d\'enrichissement ou de recherche code/libellé réutilisable par d\'autres jeux.' },
  { key: 'nbBulkSearchs', type: 'integer', title: 'Enrichissements proposés (en masse)', 'x-group': group.masterData, description: 'Nombre de services « récupération de lignes en masse » exposés ; chacun constitue une source d\'enrichissement réutilisable par d\'autres jeux.' },
  { key: 'nbSingleSearchs', type: 'integer', title: 'Recherches code/libellé', 'x-group': group.masterData, description: 'Nombre de services de recherche code/libellé exposés, utilisables dans les formulaires de saisie des jeux éditables.' },

  // — Publication —
  { key: 'publicationPortals', type: 'string', separator: MULTI_SEP, title: 'Portails de publication', 'x-group': group.publication, description: 'Noms des sites/portails sur lesquels le jeu est effectivement publié.' },
  { key: 'nbPublicationSites', type: 'integer', title: 'Nombre de sites de publication', 'x-group': group.publication, description: 'Nombre de sites/portails sur lesquels le jeu est effectivement publié.' },
  { key: 'nbRequestedPublicationSites', type: 'integer', title: 'Sites de publication demandés', 'x-group': group.publication, description: 'Nombre de demandes de publication en attente de validation par un administrateur.' },

  // — État —
  { key: 'status', type: 'string', title: 'Statut', 'x-group': group.state, description: 'État courant du jeu dans data-fair (par ex. finalized, indexing, error, draft).' },

  // — Audit & dates —
  { key: 'createdAt', type: 'string', format: 'date-time', title: 'Date de création', 'x-group': group.audit, 'x-refersTo': concept.dateCreated, description: 'Date de création du jeu de données.' },
  { key: 'createdBy', type: 'string', title: 'Créé par', 'x-group': group.audit, description: 'Utilisateur ayant créé le jeu.' },
  { key: 'updatedAt', type: 'string', format: 'date-time', title: 'Date de mise à jour', 'x-group': group.audit, description: 'Date de la dernière modification du jeu (métadonnées ou données).' },
  { key: 'updatedBy', type: 'string', title: 'Mis à jour par', 'x-group': group.audit, description: 'Utilisateur ayant effectué la dernière modification.' },
  { key: 'dataUpdatedAt', type: 'string', format: 'date-time', title: 'Date de mises à jour des données', 'x-group': group.audit, description: 'Date de la dernière mise à jour des données elles-mêmes.' },
  { key: 'dataUpdatedBy', type: 'string', title: 'Données mises à jour par', 'x-group': group.audit, description: 'Utilisateur ayant effectué la dernière mise à jour des données.' },
  { key: 'finalizedAt', type: 'string', format: 'date-time', title: 'Date de finalisation', 'x-group': group.audit, description: 'Date de fin du dernier traitement d\'indexation (jeu prêt à l\'emploi).' },
  { key: 'portalModified', type: 'string', format: 'date-time', title: 'Date de modification (portail)', 'x-group': group.audit, description: 'La date utilisée pour le tri et l\'affichage sur le portail (modified, sinon dataUpdatedAt, sinon updatedAt).' }
]

/** Top-level dataset fields to request from the list endpoint (drives the columns above). */
export const LIST_SELECT = [
  'id', 'slug', 'title', 'page', 'summary', 'description', 'image', 'keywords', 'topics',
  'license', 'conformsTo', 'origin', 'creator', 'frequency', 'spatial', 'temporal', 'modified', 'relatedDatasets',
  'bbox', 'projection', 'timeZone', 'owner', 'visibility', 'isRest', 'isVirtual', 'isMetaOnly',
  'originalFile', 'storage', 'schema', 'primaryKey', 'extensions', 'attachments', 'virtual', 'extras',
  'masterData', 'customMetadata', 'publicationSites', 'requestedPublicationSites', 'status', 'count',
  'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'dataUpdatedAt', 'dataUpdatedBy', 'finalizedAt'
].join(',')

const isPlainObject = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v)

const sanitizeKey = (key: string): string => 'custom_' + String(key).replace(/[^a-zA-Z0-9_-]/g, '_')

const joinStrings = (arr: any): string | undefined => {
  if (!Array.isArray(arr) || !arr.length) return undefined
  const v = arr.filter(Boolean).join(MULTI_SEP)
  return v || undefined
}

const joinTitles = (arr: any): string | undefined => {
  if (!Array.isArray(arr) || !arr.length) return undefined
  const v = arr.map((x: any) => x?.title ?? x?.name ?? x?.id).filter(Boolean).join(MULTI_SEP)
  return v || undefined
}

/**
 * Discovers the custom metadata columns to add: the owner-defined fields (with
 * their titles, when settings are accessible), unioned with any custom keys that
 * actually appear on datasets (defensive). Falls back to the raw key as a title.
 */
export const buildCustomColumns = (datasets: any[], customDefs: Map<string, string>): CustomColumn[] => {
  const cols: CustomColumn[] = []
  const seen = new Set<string>()
  const add = (srcKey: string, title?: string) => {
    if (!srcKey || seen.has(srcKey)) return
    seen.add(srcKey)
    cols.push({ srcKey, key: sanitizeKey(srcKey), title: title || srcKey })
  }
  // owner-defined fields first, in their declared order
  for (const [key, title] of customDefs) add(key, title)
  // then any extra keys present on datasets (object-form only)
  const extra = new Set<string>()
  for (const d of datasets) {
    if (isPlainObject(d.customMetadata)) for (const k of Object.keys(d.customMetadata)) if (!customDefs.has(k)) extra.add(k)
  }
  for (const k of [...extra].sort()) add(k)
  return cols
}

/**
 * Builds a reverse index: dataset id -> number of virtual datasets that include it
 * as a source. Computed once per run from the full dataset list (a cross-dataset
 * aggregation the back-office does not surface).
 */
export const buildVirtualUsageIndex = (datasets: any[]): Map<string, number> => {
  const index = new Map<string, number>()
  for (const d of datasets) {
    for (const childId of (d.virtual?.children ?? [])) {
      index.set(childId, (index.get(childId) ?? 0) + 1)
    }
  }
  return index
}

export type CatalogLineOptions = {
  virtualUsage: Map<string, number>
  siteNames: Map<string, string>
  customColumns: CustomColumn[]
}

/** Builds the account reference (`type:id` or `type:id:department`) used for the owner avatar. */
const accountRef = (owner: any): string | undefined => {
  if (!owner?.type || !owner?.id) return undefined
  return owner.department ? `${owner.type}:${owner.id}:${owner.department}` : `${owner.type}:${owner.id}`
}

/**
 * The "modification date" data-fair surfaces on its portals: the DCAT `modified`
 * day-precision date when set, else the last data update, else the last update.
 * Mirrors data-fair's compute-modified.ts (`modified > dataUpdatedAt > updatedAt`);
 * data-fair stores the result as the internal `_modified` field, which is not
 * exposed by the public API, so we recompute it here.
 */
const computeModified = (d: any): string | undefined => {
  if (d.modified) return new Date(d.modified).toISOString()
  if (d.dataUpdatedAt) return d.dataUpdatedAt
  if (d.updatedAt) return d.updatedAt
  return undefined
}

/**
 * Maps a data-fair dataset to a catalog line keyed by the dataset id.
 */
export const toCatalogLine = (d: any, opts: CatalogLineOptions) => {
  const storageType = d.isVirtual ? 'virtual' : d.isRest ? 'rest' : d.isMetaOnly ? 'metadata' : 'file'
  const bbox = Array.isArray(d.bbox) && d.bbox.length ? d.bbox.join(', ') : undefined
  const projection = d.projection?.title || d.projection?.code || undefined
  const sites = [...new Set<string>(d.publicationSites ?? [])]
  const portals = sites.map((s: string) => opts.siteNames.get(s) ?? s)
  const nbBulkSearchs = Array.isArray(d.masterData?.bulkSearchs) ? d.masterData.bulkSearchs.length : 0
  const nbSingleSearchs = Array.isArray(d.masterData?.singleSearchs) ? d.masterData.singleSearchs.length : 0

  const line: Record<string, any> = {
    _id: d.id,
    // — Général —
    storageType,
    page: d.page,
    id: d.id,
    slug: d.slug,
    title: d.title,
    summary: d.summary,
    description: d.description,
    image: d.image,
    keywords: joinStrings(d.keywords),
    topics: joinTitles(d.topics),

    // — Métadonnées —
    license: d.license?.title,
    conformsTo: d.conformsTo?.title,
    conformsToVersion: d.conformsTo?.version,
    conformsToUrl: d.conformsTo?.url,
    origin: d.origin,
    creator: d.creator,
    frequency: d.frequency || undefined,
    spatial: d.spatial,
    temporalStart: d.temporal?.start,
    temporalEnd: d.temporal?.end,
    modified: d.modified || undefined,
    relatedDatasets: joinTitles(d.relatedDatasets),

    // — Métadonnées calculées —
    bbox,
    projection,
    timeZone: d.timeZone,

    // — Propriété & visibilité —
    owner: accountRef(d.owner),
    visibility: d.visibility ?? (d.public ? 'public' : 'private'),
    published: Array.isArray(d.publicationSites) && d.publicationSites.length > 0,

    // — Fichier —
    fileName: d.originalFile?.name,
    fileFormat: d.originalFile?.mimetype,

    // — Structure & stockage —
    count: typeof d.count === 'number' ? d.count : undefined,
    nbColumns: Array.isArray(d.schema) ? d.schema.filter((p: any) => !p['x-calculated']).length : undefined,
    primaryKey: joinStrings(d.primaryKey),
    storageSize: d.storage?.size,
    indexedSize: d.storage?.indexed?.size,

    // — Relations & enrichissements —
    nbExtensions: Array.isArray(d.extensions) ? d.extensions.length : 0,
    nbAttachments: Array.isArray(d.attachments) ? d.attachments.length : 0,
    nbChildren: d.virtual?.children?.length ?? undefined,
    nbUsedInVirtual: opts.virtualUsage.get(d.id) ?? 0,
    nbApplications: Array.isArray(d.extras?.applications) ? d.extras.applications.length : 0,
    nbRelatedDatasets: Array.isArray(d.relatedDatasets) ? d.relatedDatasets.length : 0,

    // — Données de référence (masterData) —
    isMasterData: nbBulkSearchs > 0 || nbSingleSearchs > 0,
    nbBulkSearchs,
    nbSingleSearchs,

    // — Publication —
    publicationPortals: portals.length ? portals.join(MULTI_SEP) : undefined,
    nbPublicationSites: sites.length,
    nbRequestedPublicationSites: Array.isArray(d.requestedPublicationSites) ? d.requestedPublicationSites.length : 0,

    // — État —
    status: d.status,

    // — Audit & dates —
    createdAt: d.createdAt,
    createdBy: d.createdBy?.name,
    updatedAt: d.updatedAt,
    updatedBy: d.updatedBy?.name,
    dataUpdatedAt: d.dataUpdatedAt,
    dataUpdatedBy: d.dataUpdatedBy?.name,
    finalizedAt: d.finalizedAt,
    portalModified: computeModified(d)
  }

  // — Métadonnées personnalisées (dynamiques) —
  const custom = isPlainObject(d.customMetadata) ? d.customMetadata : {}
  for (const c of opts.customColumns) {
    const v = custom[c.srcKey]
    line[c.key] = (v === null || v === undefined || typeof v === 'object') ? undefined : v
  }

  return line
}
