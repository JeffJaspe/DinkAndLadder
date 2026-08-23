/**
 * Escapes the wildcards Postgres' LIKE/ILIKE treats as operators, so a search
 * term is matched literally.
 *
 * Without this, `%` typed into a search box matches everything and `_` matches
 * any single character — so searching "a_b" quietly returned "axb", and a lone
 * "%" returned the entire table regardless of the caller's intent. Not a
 * security hole on its own (PostgREST still parameterises the value), but it
 * makes search results wrong and lets a caller sidestep the filter.
 *
 * The backslash is escaped first, otherwise escaping the others would double-
 * escape a backslash the user actually typed. Pairs with the default
 * `ESCAPE '\'` that Postgres applies to LIKE patterns.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
