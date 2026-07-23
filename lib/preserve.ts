export type SchemaColumn = Record<string, any> & { key: string }

/**
 * Columns of the live catalog that this processing does not produce: annotations
 * added by hand on the dataset. They must survive a run.
 */
export const extraColumns = (liveSchema: SchemaColumn[], generatedSchema: SchemaColumn[], retiredKeys: string[]): SchemaColumn[] => {
  const generatedKeys = new Set(generatedSchema.map(p => p.key))
  const retired = new Set(retiredKeys)
  return liveSchema.filter(p =>
    !generatedKeys.has(p.key) &&
    !retired.has(p.key) &&
    !p['x-calculated'] &&
    p.key !== '_id'
  )
}

/**
 * Generated schema first, preserved columns appended: the order of the generated
 * columns carries the thematic grouping and must not move.
 */
export const mergeSchema = (generatedSchema: SchemaColumn[], extras: SchemaColumn[]): SchemaColumn[] =>
  [...generatedSchema, ...extras]

/**
 * Puts back the preserved values on a freshly built line. `_bulk_lines` replaces
 * the whole line, so a value missing here is a value destroyed.
 */
export const mergeLine = (line: Record<string, any>, preserved: Record<string, any> | undefined, extras: SchemaColumn[]): Record<string, any> => {
  if (!preserved) return line
  for (const col of extras) {
    const value = preserved[col.key]
    if (value === null || value === undefined) continue
    line[col.key] = Array.isArray(value) ? value.join(col.separator ?? ', ') : value
  }
  return line
}
