import config from '#config'
import { strict as assert } from 'node:assert'
import { it, describe } from 'node:test'
import testUtils from '@data-fair/lib-processing-dev/tests-utils.js'
import * as datasetsListPlugin from '../index.ts'

import processingConfigSchema from '../processing-config-schema.json' with { type: 'json' }

describe('Datasets list processing', () => {
  // Each plugin should expose a processing config schema
  it('should expose a processing config schema for users', async () => {
    assert.equal(processingConfigSchema.type, 'object')
  })

  it('should build the catalog dataset and switch to update mode', async function () {
    const context = testUtils.context({
      processingConfig: {
        datasetMode: 'create',
        datasetTitle: 'Catalogue des jeux de données (test)',
        includeMetaOnly: true,
        computeStorageSize: true,
        deleteStale: true
      }
    }, config, false)

    await datasetsListPlugin.run(context)
    assert.equal(context.processingConfig.datasetMode, 'update')
    assert.ok(context.processingConfig.dataset?.id, 'the catalog dataset reference should be stored in the config')
  })

  // Disable by default: updates an existing dataset.
  // To enable it, set datasetId in config/local-test.mjs
  it('Update an existing dataset', {
    skip: config.datasetId ? false : 'disabled by default — set datasetId in config/local-test.mjs to update id'
  }, async function () {
    const context = testUtils.context({
      processingConfig: {
        datasetMode: 'update',
        dataset: { id: config.datasetId, title: 'Catalogue des jeux de données' },
        includeMetaOnly: true,
        computeStorageSize: true,
        deleteStale: true
      }
    }, config, false)

    await datasetsListPlugin.run(context)
    assert.equal(context.processingConfig.datasetMode, 'update')
    assert.equal(context.processingConfig.dataset?.id, config.datasetId)
  })
})
