import { strict as assert } from 'node:assert'
import { it, describe } from 'node:test'
import { run } from '../lib/execute.ts'

const LIVE_SCHEMA = [
  { key: '_id', type: 'string' },
  { key: 'title', type: 'string' },
  { key: '_updatedAt', type: 'string', 'x-calculated': true },
  { key: 'createdBy', type: 'string', title: 'Créé par' },
  { key: 'iaComment', type: 'string', title: 'Commentaire IA' }
]

/** Records every call so the test can assert on what was sent, and in which order. */
const fakeContext = (processingConfig: any) => {
  const calls: string[] = []
  const patched: any[] = []
  const posted: any[] = []
  const noop = async () => {}
  return {
    calls,
    patched,
    posted,
    processingId: 'test',
    processingConfig,
    patchConfig: noop,
    log: { step: noop, info: noop, warning: noop, error: noop, task: noop, progress: noop },
    axios: {
      async get (url: string) {
        if (url === 'api/v1/datasets/cat') {
          calls.push('get-catalog')
          return { data: { id: 'cat', title: 'Catalogue', owner: { type: 'organization', id: 'org' }, schema: LIVE_SCHEMA } }
        }
        if (url === 'api/v1/datasets') {
          calls.push('list-datasets')
          return { data: { count: 1, results: [{ id: 'ds1', title: 'Un jeu' }] } }
        }
        if (url === 'api/v1/datasets/cat/lines') {
          calls.push('read-lines')
          return { data: { results: [{ _id: 'ds1', iaComment: 'à conserver', createdBy: 'Jane Doe' }] } }
        }
        throw new Error(`unexpected GET ${url}`)
      },
      async patch (url: string, body: any) {
        calls.push('patch-schema')
        patched.push(body)
        return { data: {} }
      },
      async post (url: string, body: any) {
        calls.push('bulk-lines')
        posted.push(...body)
        return { data: { nbOk: body.length, nbErrors: 0 } }
      }
    }
  }
}

describe('run', () => {
  it('should read the lines before patching the schema, which unsets dropped columns', async () => {
    const context = fakeContext({ datasetMode: 'update', dataset: { id: 'cat' }, preserveExtraColumns: true })

    await run(context as any)

    assert.ok(context.calls.indexOf('read-lines') < context.calls.indexOf('patch-schema'),
      `lines must be read first, got ${context.calls.join(' > ')}`)
  })

  it('should keep the hand-added column in the schema it pushes', async () => {
    const context = fakeContext({ datasetMode: 'update', dataset: { id: 'cat' }, preserveExtraColumns: true })

    await run(context as any)

    const keys = context.patched[0].schema.map((c: any) => c.key)
    assert.ok(keys.includes('iaComment'), 'iaComment should survive')
    assert.ok(!keys.includes('createdBy'), 'a retired column must still be dropped')
    assert.ok(!keys.includes('_updatedAt'), 'data-fair computed columns are not ours to push')
  })

  it('should put the preserved value back on the line it rewrites', async () => {
    const context = fakeContext({ datasetMode: 'update', dataset: { id: 'cat' }, preserveExtraColumns: true })

    await run(context as any)

    const line = context.posted.find(l => l._id === 'ds1')
    assert.equal(line.iaComment, 'à conserver')
    assert.equal(line.createdBy, undefined, 'a retired column must not be written back')
  })

  it('should drop the hand-added column when preservation is disabled', async () => {
    const context = fakeContext({ datasetMode: 'update', dataset: { id: 'cat' }, preserveExtraColumns: false })

    await run(context as any)

    assert.ok(!context.patched[0].schema.map((c: any) => c.key).includes('iaComment'))
    assert.equal(context.posted.find(l => l._id === 'ds1').iaComment, undefined)
  })
})
