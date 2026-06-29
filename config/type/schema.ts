export default {
  $id: 'https://github.com/data-fair/processing-datasets-list/config',
  'x-exports': ['types', 'validate'],
  type: 'object',
  title: 'Config',
  additionalProperties: false,
  required: [
    'dataFairUrl',
    'dataFairAPIKey'
  ],
  properties: {
    dataFairUrl: { type: 'string' },
    dataFairAPIKey: { type: 'string' },
    datasetId: { type: 'string' }
  }
}