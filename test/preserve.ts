import { strict as assert } from 'node:assert'
import { it, describe } from 'node:test'
import { extraColumns, mergeSchema, mergeLine } from '../lib/preserve.ts'

describe('extraColumns', () => {
  it('should detect a column added by hand on the live catalog', () => {
    const live = [
      { key: 'title', type: 'string' },
      { key: 'iaComment', type: 'string', title: 'Commentaire IA' }
    ]
    const generated = [{ key: 'title', type: 'string' }]

    const extras = extraColumns(live, generated, [])

    assert.deepEqual(extras.map(c => c.key), ['iaComment'])
  })

  it('should ignore the columns data-fair computes itself', () => {
    const live = [
      { key: '_id', type: 'string' },
      { key: '_updatedAt', type: 'string', 'x-calculated': true },
      { key: 'iaComment', type: 'string' }
    ]

    const extras = extraColumns(live, [], [])

    assert.deepEqual(extras.map(c => c.key), ['iaComment'])
  })

  it('should never preserve a retired column, so it can actually be dropped', () => {
    const live = [
      { key: 'createdBy', type: 'string' },
      { key: 'iaComment', type: 'string' }
    ]

    const extras = extraColumns(live, [], ['createdBy'])

    assert.deepEqual(extras.map(c => c.key), ['iaComment'])
  })
})

describe('mergeSchema', () => {
  it('should append the preserved columns after the generated ones', () => {
    const generated = [{ key: 'title' }, { key: 'summary' }]
    const extras = [{ key: 'iaComment' }]

    const merged = mergeSchema(generated, extras)

    assert.deepEqual(merged.map(c => c.key), ['title', 'summary', 'iaComment'])
  })
})

describe('mergeLine', () => {
  it('should reinject a preserved value into a freshly built line', () => {
    const line = { _id: 'abc', title: 'Un jeu' }
    const extras = [{ key: 'iaComment' }]

    const merged = mergeLine(line, { iaComment: 'à conserver' }, extras)

    assert.equal(merged.iaComment, 'à conserver')
    assert.equal(merged.title, 'Un jeu')
  })

  it('should rejoin a preserved multi-valued value with its own separator', () => {
    const line = { _id: 'abc' }
    const extras = [{ key: 'iaTags', separator: ' | ' }]

    const merged = mergeLine(line, { iaTags: ['un', 'deux'] }, extras)

    assert.equal(merged.iaTags, 'un | deux')
  })

  it('should leave the line untouched when nothing was preserved for it', () => {
    const line = { _id: 'abc', title: 'Un jeu' }

    const merged = mergeLine(line, undefined, [{ key: 'iaComment' }])

    assert.deepEqual(merged, { _id: 'abc', title: 'Un jeu' })
  })
})
