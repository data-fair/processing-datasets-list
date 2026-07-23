import { strict as assert } from 'node:assert'
import { it, describe } from 'node:test'
import { buildCatalogSchema, toCatalogLine, LIST_SELECT, RETIRED_KEYS, metadataQuality, QUALITY_POINTS } from '../lib/catalog.ts'

const line = (dataset: any) => toCatalogLine(dataset, { virtualUsage: new Map(), customColumns: [] })

describe('personal data', () => {
  it('should not expose the columns naming a person', () => {
    const keys = buildCatalogSchema().map(c => c.key)
    for (const key of ['createdBy', 'updatedBy', 'dataUpdatedBy']) {
      assert.ok(!keys.includes(key), `${key} should not be a catalog column`)
    }
  })

  it('should not even ask the API for them', () => {
    const selected = LIST_SELECT.split(',')
    for (const key of ['createdBy', 'updatedBy', 'dataUpdatedBy']) {
      assert.ok(!selected.includes(key), `${key} should not be requested`)
    }
  })

  it('should not put a person name on a line even when the API returns one', () => {
    const built = line({ id: 'abc', createdBy: { name: 'Jane Doe' }, updatedBy: { name: 'Jane Doe' }, dataUpdatedBy: { name: 'Jane Doe' } })
    assert.ok(!JSON.stringify(built).includes('Jane Doe'))
  })

  it('should list them as retired so they are never preserved', () => {
    assert.deepEqual([...RETIRED_KEYS].sort(), ['createdBy', 'dataUpdatedBy', 'updatedBy'])
  })
})

describe('multi-valued separator', () => {
  const MULTI_VALUED = ['keywords', 'topics', 'relatedDatasets', 'primaryKey', 'publicationPortals']

  it('should separate multi-valued columns with a semicolon, since values contain commas', () => {
    const schema = buildCatalogSchema()
    for (const key of MULTI_VALUED) {
      assert.equal(schema.find(c => c.key === key)?.separator, '; ', `${key} separator`)
    }
  })

  it('should join multi-valued values with that same separator', () => {
    const built = line({ id: 'abc', keywords: ['Culture, arts et loisirs', 'Territoire'] })
    assert.equal(built.keywords, 'Culture, arts et loisirs; Territoire')
  })

  it('should leave the bounding box alone, it is a display not a multi-valued column', () => {
    const schema = buildCatalogSchema()
    assert.equal(schema.find(c => c.key === 'bbox')?.separator, undefined)
    assert.equal(line({ id: 'abc', bbox: [8.2, 41.2, 9.85, 43.15] }).bbox, '8.2, 41.2, 9.85, 43.15')
  })
})

const complete = {
  title: 'Écoles de Corse',
  description: 'Localisation et effectifs des établissements scolaires du premier degré, avec leur rattachement administratif et leur statut.',
  summary: 'Les écoles publiques et privées de Corse, localisées et rattachées à leur commune.',
  keywords: 'école; éducation; enseignement',
  topics: 'Population & Société',
  license: 'Licence Ouverte 2.0',
  creator: 'Ministère de l\'Éducation nationale',
  origin: 'https://data.education.gouv.fr',
  frequency: 'annual',
  spatial: 'Corse',
  temporalStart: '2023-09-01',
  temporalEnd: '2024-07-05'
}

describe('metadataQuality', () => {
  it('should give 100 to a fully and well documented dataset', () => {
    assert.equal(metadataQuality(complete), 100)
  })

  it('should give 0 to a dataset with nothing but a title', () => {
    assert.equal(metadataQuality({ title: 'Écoles de Corse' }), 0)
  })

  it('should total exactly 20 points, the denominator the score is scaled on', () => {
    assert.equal(Object.values(QUALITY_POINTS).reduce((a, b) => a + b, 0), 20)
  })

  describe('description', () => {
    const score = (description: string) => metadataQuality({ ...complete, description })

    it('should score a description repeating the title as worthless', () => {
      assert.equal(score('Écoles de Corse'), metadataQuality({ ...complete, description: undefined }))
    })

    it('should ignore case and accents when comparing to the title', () => {
      assert.equal(score('ECOLES DE CORSE !'), metadataQuality({ ...complete, description: undefined }))
    })

    it('should heavily penalise a description shorter than 100 characters', () => {
      assert.equal(score('Trop court pour dire quoi que ce soit.'), 100 - 15)
    })

    it('should penalise a description starting with the title', () => {
      assert.equal(score('Écoles de Corse : localisation et effectifs des établissements scolaires du premier degré, avec leur statut.'), 100 - 10)
    })

    it('should measure the length with html tags stripped', () => {
      assert.equal(score('<p>&nbsp;</p><p><strong>Court.</strong></p>'), 100 - 15)
    })
  })

  describe('summary', () => {
    const score = (summary: string) => metadataQuality({ ...complete, summary })

    it('should reward a summary within the 200 characters target', () => {
      assert.equal(score('x'.repeat(200)), 100)
    })

    it('should mildly penalise a summary between 201 and 250 characters', () => {
      assert.equal(score('x'.repeat(250)), Math.round(100 - 3.75))
    })

    it('should heavily penalise a summary beyond the 250 absolute maximum', () => {
      assert.equal(score('x'.repeat(251)), Math.round(100 - 11.25))
    })

    it('should penalise a summary too short to say more than the title', () => {
      assert.equal(score('x'.repeat(49)), Math.round(100 - 7.5))
    })

    it('should score a summary repeating the title as worthless', () => {
      assert.equal(score('Écoles de Corse'), metadataQuality({ ...complete, summary: undefined }))
    })
  })

  describe('keywords', () => {
    const score = (keywords: string) => metadataQuality({ ...complete, keywords })

    it('should reward a handful of keywords', () => {
      assert.equal(score('a; b; c'), 100)
      assert.equal(score('a; b; c; d; e; f; g; h; i'), 100)
    })

    it('should penalise one or two keywords, too few to index anything', () => {
      assert.equal(score('a; b'), 100 - 5)
    })

    it('should penalise ten keywords or more, which dilute the indexing', () => {
      assert.equal(score(Array.from({ length: 10 }, (_, i) => `k${i}`).join('; ')), 100 - 5)
    })
  })

  describe('temporal coverage', () => {
    it('should accept a start alone, an end alone, or both', () => {
      assert.equal(metadataQuality({ ...complete, temporalEnd: undefined }), 100)
      assert.equal(metadataQuality({ ...complete, temporalStart: undefined }), 100)
      assert.equal(metadataQuality({ ...complete, temporalStart: undefined, temporalEnd: undefined }), 100 - 5)
    })
  })
})

describe('metadataScore column', () => {
  it('should be an integer column of the computed metadata group', () => {
    const column = buildCatalogSchema().find(c => c.key === 'metadataScore')
    assert.ok(column, 'the catalog should carry a metadataScore column')
    assert.equal(column.type, 'integer')
    assert.equal(column['x-group'], 'Métadonnées calculées')
  })

  it('should document its own formula, so a reader can explain any score', () => {
    const column = buildCatalogSchema().find(c => c.key === 'metadataScore')
    assert.ok(column)
    for (const expected of ['| Critère | Points | Note |', 'Description | 4', 'Résumé | 3', 'Couverture temporelle | 1']) {
      assert.ok(column.description.includes(expected), `description should document "${expected}"`)
    }
  })

  it('should carry the score of the very line it is built from', () => {
    const built = line({ id: 'abc', title: 'Un jeu' })
    assert.equal(built.metadataScore, 0)
    assert.equal(line({ id: 'abc', ...complete, license: { title: 'Licence Ouverte' }, temporal: { start: '2023-09-01', end: '2024-07-05' }, keywords: ['a', 'b', 'c'], topics: [{ title: 'Population' }] }).metadataScore, 100)
  })
})

describe('metadataQuality, formatting rules', () => {
  const withSummary = (summary: string) => metadataQuality({ ...complete, summary })
  const withDescription = (description: string) => metadataQuality({ ...complete, description })

  it('should penalise a summary carrying html, it must be plain text', () => {
    assert.equal(withSummary('Les écoles de Corse, <strong>publiques et privées</strong>, localisées et rattachées.'), Math.round(100 - 11.25))
  })

  it('should penalise a summary carrying an html entity', () => {
    assert.equal(withSummary('Les &eacute;coles de Corse, publiques et priv&eacute;es, localis&eacute;es et rattach&eacute;es.'), Math.round(100 - 11.25))
  })

  it('should penalise a summary carrying markdown', () => {
    assert.equal(withSummary('Les écoles de Corse, **publiques et privées**, localisées et rattachées à leur commune.'), Math.round(100 - 11.25))
    assert.equal(withSummary('Les écoles de Corse, voir [le référentiel](https://x.fr), localisées et rattachées.'), Math.round(100 - 11.25))
  })

  it('should penalise a summary carrying a bare link', () => {
    assert.equal(withSummary('Les écoles de Corse, localisées et rattachées, source https://data.education.gouv.fr'), Math.round(100 - 11.25))
  })

  it('should not mistake a comparison sign for an html tag', () => {
    assert.equal(withSummary('Les écoles de Corse comptant < 10 élèves par classe, localisées et rattachées.'), 100)
  })

  it('should penalise a description over 3000 characters, which reads as data dumped in prose', () => {
    assert.equal(withDescription('Les établissements scolaires. '.repeat(120)), 100 - 10)
  })
})

describe('metadataQuality, description length steps', () => {
  const score = (description: string) => metadataQuality({ ...complete, description })
  // No whitespace: the note is measured on the stripped text, which collapses and trims spaces,
  // so a padded string would not land exactly on the boundary being tested.
  const prose = (length: number) => 'a'.repeat(length)

  it('should not penalise a description up to 3000 characters', () => {
    assert.equal(score(prose(3000)), 100)
  })

  it('should penalise a description between 3001 and 5000 characters', () => {
    assert.equal(score(prose(3001)), 100 - 10)
    assert.equal(score(prose(5000)), 100 - 10)
  })

  it('should penalise a description beyond 5000 characters as heavily as an empty one', () => {
    assert.equal(score(prose(5001)), 100 - 15)
  })
})
