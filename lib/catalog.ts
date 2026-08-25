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

/**
 * Separator used for multi-valued (array) string columns. A semicolon rather than a
 * comma: topic labels, keywords and dataset titles routinely contain commas, which a
 * comma separator would split into bogus values.
 */
const MULTI_SEP = '; '

/**
 * Columns this processing used to produce and deliberately dropped. They must never be
 * mistaken for hand-added columns and preserved, or they could not be dropped at all.
 * The three below name a person and are removed for GDPR reasons.
 */
export const RETIRED_KEYS = ['createdBy', 'updatedBy', 'dataUpdatedBy']

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

// Mirrors data-fair's standard vocabulary titles (api/contract/vocabulary.js).
const VOCABULARY_TITLES: Record<string, string> = {
  label: 'Libellé',
  'http://www.w3.org/2000/01/rdf-schema#label': 'Libellé',
  'http://www.bbc.co.uk/ontologies/coreconcepts/label': 'Libellé',
  description: 'Description',
  'http://schema.org/description': 'Description',
  image: 'Image',
  'http://schema.org/image': 'Image',
  tag: 'Étiquette',
  'https://schema.org/DefinedTermSet': 'Étiquette',
  color: 'Couleur',
  'https://schema.org/color': 'Couleur',
  address: 'Adresse',
  'http://schema.org/address': 'Adresse',
  streetNumber: 'Numéro de rue',
  'http://www.ontotext.com/proton/protonext#StreetNumber': 'Numéro de rue',
  streetAddress: 'Rue ou lieu-dit',
  'http://schema.org/streetAddress': 'Rue ou lieu-dit',
  city: 'Commune',
  'http://schema.org/City': 'Commune',
  postalCode: 'Code postal',
  'http://schema.org/postalCode': 'Code postal',
  country: 'Pays',
  'http://schema.org/addressCountry': 'Pays',
  region: 'Région',
  'https://schema.org/addressRegion': 'Région',
  departement: 'Département',
  'http://rdf.insee.fr/def/geo#Departement': 'Département',
  addressId: 'Identifiant d\'adresse',
  'http://www.w3.org/ns/locn#addressId': 'Identifiant d\'adresse',
  codeCommune: 'Code commune',
  'http://rdf.insee.fr/def/geo#codeCommune': 'Code commune',
  codeDepartement: 'Code département',
  'http://rdf.insee.fr/def/geo#codeDepartement': 'Code département',
  codeRegion: 'Code région',
  'http://rdf.insee.fr/def/geo#codeRegion': 'Code région',
  codeEPCI: 'Code EPCI',
  'http://rdf.insee.fr/def/geo#EtablissementPublicDeCooperationIntercommunale': 'Code EPCI',
  codeIRIS: 'Code IRIS',
  'http://rdf.insee.fr/def/geo#codeIRIS': 'Code IRIS',
  'http://rdf.insee.fr/def/geo#IRIS': 'Code IRIS',
  codeGrandQuartier: 'Code grand quartier',
  'http://rdf.insee.fr/def/geo#GrandQuartier': 'Code grand quartier',
  codePays: 'Code pays (COG)',
  'http://rdf.insee.fr/def/geo#codePays': 'Code pays (COG)',
  uniteUrbaine2020: 'Code unité urbaine 2020',
  'http://rdf.insee.fr/def/geo#UniteUrbaine2020': 'Code unité urbaine 2020',
  carreau: 'Code de carreau de 200m',
  'http://rdf.insee.fr/def/geo#Carreau': 'Code de carreau de 200m',
  'id-rnb': 'ID-RNB',
  'https://rnb.gouv.fr/#ID-RNB': 'ID-RNB',
  latitude: 'Latitude',
  'http://schema.org/latitude': 'Latitude',
  'http://www.w3.org/2003/01/geo/wgs84_pos#lat': 'Latitude',
  longitude: 'Longitude',
  'http://schema.org/longitude': 'Longitude',
  'http://www.w3.org/2003/01/geo/wgs84_pos#long': 'Longitude',
  latLon: 'Latitude / Longitude',
  'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long': 'Latitude / Longitude',
  countryCodeISOAlpha2: 'Code pays (ISO, 2 caractères)',
  'http://dbpedia.org/ontology/iso31661Code': 'Code pays (ISO, 2 caractères)',
  'https://www.omg.org/spec/LCC/Countries/CountryRepresentation/Alpha2Code': 'Code pays (ISO, 2 caractères)',
  countryCodeISOAlpha3: 'Code pays (ISO, 3 caractères)',
  'https://www.omg.org/spec/LCC/Countries/CountryRepresentation/Alpha3Code': 'Code pays (ISO, 3 caractères)',
  siret: 'SIRET',
  'http://www.datatourisme.fr/ontology/core/1.0/#siret': 'SIRET',
  siren: 'SIREN',
  'http://dbpedia.org/ontology/siren': 'SIREN',
  codeAPE: 'Code APE',
  'http://www.datatourisme.fr/ontology/core/1.0#apeNaf': 'Code APE',
  cjNiveau3: 'Catégorie juridique (niveau 3)',
  'http://id.insee.fr/concepts/cj/cjNiveauIII': 'Catégorie juridique (niveau 3)',
  idBV: 'Identifiant de bureau de vote',
  'https://www.insee.fr/fr/information/3539086/idBV': 'Identifiant de bureau de vote',
  date: 'Date d\'évènement',
  'http://schema.org/Date': 'Date d\'évènement',
  'http://purl.org/dc/identifierss/date': 'Date d\'évènement',
  codeParcelle: 'Code parcelle',
  'http://dbpedia.org/ontology/codeLandRegistry': 'Code parcelle',
  geometry: 'Géométrie GeoJSON ou WKT',
  'https://purl.org/geojson/vocab#geometry': 'Géométrie GeoJSON ou WKT',
  attachment: 'Document numérique attaché',
  'http://schema.org/DigitalDocument': 'Document numérique attaché',
  webPage: 'Page Web',
  'https://schema.org/WebPage': 'Page Web',
  email: 'Adresse e-mail',
  'https://www.w3.org/2006/vcard/ns#email': 'Adresse e-mail',
  tel: 'N° de téléphone',
  'https://www.w3.org/2006/vcard/ns#tel': 'N° de téléphone',
  coordX: 'Coordonnée X',
  'http://data.ign.fr/def/geometrie#coordX': 'Coordonnée X',
  coordY: 'Coordonnée Y (projection libre)',
  'http://data.ign.fr/def/geometrie#coordY': 'Coordonnée Y (projection libre)',
  geometryProj: 'Géométrie GeoJSON ou WKT (projection libre)',
  'http://data.ign.fr/def/geometrie#Geometry': 'Géométrie GeoJSON ou WKT (projection libre)',
  startDate: 'Date de début',
  'https://schema.org/startDate': 'Date de début',
  endDate: 'Date de fin',
  'https://schema.org/endDate': 'Date de fin',
  dateCreated: 'Date de création',
  'http://schema.org/dateCreated': 'Date de création',
  'http://purl.org/dc/identifierss/created': 'Date de création',
  openingHours: 'Horaires d\'ouverture',
  'https://schema.org/openingHours': 'Horaires d\'ouverture',
  year: 'Année',
  'https://www.w3.org/TR/owl-time/#time:year': 'Année',
  price: 'Prix',
  'https://schema.org/price': 'Prix',
  codeCPV: 'Code CPV',
  'http://data.europa.eu/cpv/cpv': 'Code CPV',
  'http://purl.org/cpv/2008': 'Code CPV',
  qpv: 'Quartier prioritaire (QPV)',
  'https://sig.ville.gouv.fr/qpv': 'Quartier prioritaire (QPV)',
  attendeeCapacity: 'Capacité de participants',
  'https://schema.org/maximumPhysicalAttendeeCapacity': 'Capacité de participants',
  accountRef: 'Référence à un compte',
  'https://github.com/data-fair/lib/account': 'Référence à un compte'
}

/**
 * Points per criterion of the metadata quality score. Expressed as small integers rather
 * than as a percentage: the score is scaled on their sum, so adding or removing a criterion
 * does not force a redistribution over the other ones.
 */
export const QUALITY_POINTS: Record<string, number> = {
  description: 4,
  summary: 3,
  license: 3,
  keywords: 2,
  topics: 2,
  creator: 2,
  origin: 1,
  frequency: 1,
  spatial: 1,
  temporal: 1
}

const QUALITY_TOTAL = Object.values(QUALITY_POINTS).reduce((a, b) => a + b, 0)

/**
 * Length steps of a description, in characters. Beyond these it is dumping data in prose
 * rather than saying what the dataset is, and nobody reads it.
 */
const DESCRIPTION_LONG = 3000
const DESCRIPTION_TOO_LONG = 5000

/** Rendered as markdown by data-fair wherever the column is documented. */
const QUALITY_DOC = `Score de complétude et de qualité des métadonnées, de 0 à 100, recalculé à chaque exécution du traitement à partir des valeurs de cette même ligne.

Dix critères reçoivent une note de 0 à 1, multipliée par leur nombre de points. Le total est ramené sur 100 : \`score = 100 x points obtenus / ${QUALITY_TOTAL}\`. Pour un critère donné, le premier cas qui s'applique l'emporte.

| Critère | Points | Note |
| --- | --- | --- |
| Description | ${QUALITY_POINTS.description} | vide : 0 ; identique au titre : 0 ; moins de 100 caractères : 0,25 ; plus de ${DESCRIPTION_TOO_LONG} caractères : 0,25 ; plus de ${DESCRIPTION_LONG} : 0,5 ; commence par le titre : 0,5 ; sinon : 1 |
| Résumé | ${QUALITY_POINTS.summary} | vide : 0 ; identique au titre : 0 ; contient du HTML, du markdown ou un lien : 0,25 ; moins de 50 caractères : 0,5 ; jusqu'à 200 : 1 ; de 201 à 250 : 0,75 ; au-delà de 250 : 0,25 |
| Licence | ${QUALITY_POINTS.license} | vide : 0 ; sinon : 1 |
| Mots-clés | ${QUALITY_POINTS.keywords} | aucun : 0 ; 1 ou 2 : 0,5 ; de 3 à 9 : 1 ; 10 ou plus : 0,5 |
| Thématiques | ${QUALITY_POINTS.topics} | vide : 0 ; sinon : 1 |
| Créateur | ${QUALITY_POINTS.creator} | vide : 0 ; sinon : 1 |
| Origine | ${QUALITY_POINTS.origin} | vide : 0 ; sinon : 1 |
| Fréquence de mise à jour | ${QUALITY_POINTS.frequency} | vide : 0 ; sinon : 1 |
| Couverture spatiale | ${QUALITY_POINTS.spatial} | vide : 0 ; sinon : 1 |
| Couverture temporelle | ${QUALITY_POINTS.temporal} | début et fin vides : 0 ; sinon : 1 |

La longueur de la description est mesurée balises HTML retirées. Les comparaisons avec le titre ignorent la casse, les accents et la ponctuation. Le score final est arrondi à l'entier.`

const stripTags = (value: any): string =>
  String(value ?? '').replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/** Case, accents and punctuation folded, to compare a text to the dataset title. */
const fold = (value: any): string =>
  stripTags(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

const filled = (value: any): number => (typeof value === 'string' ? value.trim() : value) ? 1 : 0

/**
 * A summary is displayed as raw text: markup shows through, links are not clickable. The tag
 * pattern requires a letter right after the `<` so a comparison sign ("moins de < 10") is not
 * mistaken for html.
 */
const RICH_TEXT = [
  /<[a-zA-Z/][^>]*>/,
  /&[a-zA-Z]+;|&#\d+;/,
  /\[[^\]]*\]\([^)]*\)/,
  /\*\*|__/,
  /(?:^|\n)\s*#{1,6}\s/,
  /https?:\/\//
]

const isRichText = (text: string): boolean => RICH_TEXT.some(rx => rx.test(text))

/**
 * A description is measured on its text, tags stripped: `<p>&nbsp;</p>` is 13 characters of
 * nothing. Repeating the title says nothing the reader does not already see above it.
 */
const descriptionNote = (description: any, title: any): number => {
  const text = stripTags(description)
  if (!text) return 0
  const folded = fold(text)
  const foldedTitle = fold(title)
  if (foldedTitle && folded === foldedTitle) return 0
  if (text.length < 100) return 0.25
  if (text.length > DESCRIPTION_TOO_LONG) return 0.25
  if (text.length > DESCRIPTION_LONG) return 0.5
  if (foldedTitle && folded.startsWith(foldedTitle)) return 0.5
  return 1
}

/**
 * 200 characters is the target, 250 the absolute maximum; below 50 it says no more than the
 * title. It must also be plain text: no html, no markdown, no link.
 */
const summaryNote = (summary: any, title: any): number => {
  const text = String(summary ?? '').trim()
  if (!text) return 0
  const foldedTitle = fold(title)
  if (foldedTitle && fold(text) === foldedTitle) return 0
  if (isRichText(text)) return 0.25
  if (text.length < 50) return 0.5
  if (text.length <= 200) return 1
  if (text.length <= 250) return 0.75
  return 0.25
}

/** Too few keywords index nothing, too many dilute the indexing. */
const keywordsNote = (keywords: any): number => {
  const count = String(keywords ?? '').split(MULTI_SEP.trim()).map(k => k.trim()).filter(Boolean).length
  if (!count) return 0
  if (count <= 2) return 0.5
  if (count <= 9) return 1
  return 0.5
}

/**
 * Metadata quality of a catalog line, from 0 to 100. Computed on the line itself, so the score
 * always describes what the catalog actually shows.
 */
export const metadataQuality = (line: Record<string, any>): number => {
  const notes: Record<string, number> = {
    description: descriptionNote(line.description, line.title),
    summary: summaryNote(line.summary, line.title),
    license: filled(line.license),
    keywords: keywordsNote(line.keywords),
    topics: filled(line.topics),
    creator: filled(line.creator),
    origin: filled(line.origin),
    frequency: filled(line.frequency),
    spatial: filled(line.spatial),
    temporal: filled(line.temporalStart) || filled(line.temporalEnd)
  }
  let points = 0
  for (const [key, note] of Object.entries(notes)) points += note * QUALITY_POINTS[key]
  return Math.round(100 * points / QUALITY_TOTAL)
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
  { key: 'metadataScore', type: 'integer', title: 'Qualité des métadonnées', 'x-group': group.computed, description: QUALITY_DOC },

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
  { key: 'concepts', type: 'string', separator: MULTI_SEP, title: 'Concepts', 'x-group': group.structure, description: 'Concepts sémantiques portés par les colonnes du jeu de données.' },
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
  { key: 'publicationPortals', type: 'string', separator: MULTI_SEP, title: 'Portails de publication', 'x-group': group.publication, description: 'Identifiants (type:id) des sites/portails sur lesquels le jeu est effectivement publié.' },
  { key: 'nbPublicationSites', type: 'integer', title: 'Nombre de sites de publication', 'x-group': group.publication, description: 'Nombre de sites/portails sur lesquels le jeu est effectivement publié.' },
  { key: 'nbRequestedPublicationSites', type: 'integer', title: 'Sites de publication demandés', 'x-group': group.publication, description: 'Nombre de demandes de publication en attente de validation par un administrateur.' },

  // — État —
  { key: 'status', type: 'string', title: 'Statut', 'x-group': group.state, description: 'État courant du jeu dans data-fair (par ex. finalized, indexing, error, draft).' },

  // — Audit & dates —
  { key: 'createdAt', type: 'string', format: 'date-time', title: 'Date de création', 'x-group': group.audit, 'x-refersTo': concept.dateCreated, description: 'Date de création du jeu de données.' },
  { key: 'updatedAt', type: 'string', format: 'date-time', title: 'Date de mise à jour', 'x-group': group.audit, description: 'Date de la dernière modification du jeu (métadonnées ou données).' },
  { key: 'dataUpdatedAt', type: 'string', format: 'date-time', title: 'Date de mises à jour des données', 'x-group': group.audit, description: 'Date de la dernière mise à jour des données elles-mêmes.' },
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
  'createdAt', 'updatedAt', 'dataUpdatedAt', 'finalizedAt'
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
 * Extracts and deduplicates semantic concepts associated with the dataset's columns.
 * Recognizes x-concept (object with title or id, or string) and x-refersTo URIs,
 * mapping standard data-fair vocabulary items to their human-readable French titles.
 */
export const extractConcepts = (schema: any[] | undefined): string | undefined => {
  if (!Array.isArray(schema)) return undefined
  const concepts: string[] = []
  for (const col of schema) {
    if (col['x-calculated']) continue
    let title: string | undefined
    const xc = col['x-concept']
    if (xc) {
      if (typeof xc === 'string' && xc.trim()) {
        const trimmed = xc.trim()
        title = VOCABULARY_TITLES[trimmed] || trimmed
      } else if (typeof xc === 'object') {
        if (typeof xc.title === 'string' && xc.title.trim()) {
          title = xc.title.trim()
        } else if (typeof xc.title === 'object' && xc.title) {
          title = xc.title.fr || xc.title.en || Object.values(xc.title)[0]
        } else if (typeof xc.id === 'string' && xc.id.trim()) {
          const id = xc.id.trim()
          title = VOCABULARY_TITLES[id] || id
        }
      }
    }
    if (!title && col['x-refersTo']) {
      const refersTo = String(col['x-refersTo']).trim()
      title = VOCABULARY_TITLES[refersTo] || refersTo
    }
    if (title && typeof title === 'string' && title.trim()) {
      concepts.push(title.trim())
    }
  }
  return joinStrings([...new Set(concepts)])
}

/**
 * Discovers the custom metadata columns to add from the keys that actually appear
 * on the datasets (object-form `customMetadata` only). The owner-defined titles
 * live in the owner settings, which the processing API key cannot read, so the raw
 * key is used as the column title.
 */
export const buildCustomColumns = (datasets: any[]): CustomColumn[] => {
  const keys = new Set<string>()
  for (const d of datasets) {
    if (isPlainObject(d.customMetadata)) for (const k of Object.keys(d.customMetadata)) keys.add(k)
  }
  return [...keys].sort().map(srcKey => ({ srcKey, key: sanitizeKey(srcKey), title: srcKey }))
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
  // Raw `type:id` identifiers — resolving them to portal names needs the owner
  // settings, which the processing API key cannot read.
  const portals = sites
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
    concepts: extractConcepts(d.schema),
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
    updatedAt: d.updatedAt,
    dataUpdatedAt: d.dataUpdatedAt,
    finalizedAt: d.finalizedAt,
    portalModified: computeModified(d)
  }

  // Computed on the line itself, so the score always describes what the catalog shows.
  line.metadataScore = metadataQuality(line)

  // — Métadonnées personnalisées (dynamiques) —
  const custom = isPlainObject(d.customMetadata) ? d.customMetadata : {}
  for (const c of opts.customColumns) {
    const v = custom[c.srcKey]
    line[c.key] = (v === null || v === undefined || typeof v === 'object') ? undefined : v
  }

  return line
}
