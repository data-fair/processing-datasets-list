import type { PrepareFunction } from '@data-fair/lib-common-types/processings.js'
import type { ProcessingConfig } from '#types/processingConfig/index.ts'

/**
 * This processing does not handle any secret value, so prepare is a no-op that
 * simply returns the config and secrets untouched. It is kept to respect the
 * plugin interface and to leave an obvious place for future config validation.
 */
const prepare: PrepareFunction<ProcessingConfig> = async ({ processingConfig, secrets }) => {
  return { processingConfig, secrets }
}

export default prepare
