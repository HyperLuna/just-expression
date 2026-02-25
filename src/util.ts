import reservedIdentifiers from 'reserved-identifiers'

const IDENTIFIER_REGEX = /^[$_\p{ID_Start}][$\u200C\u200D\p{ID_Continue}]*$/u

export function isIdent(name: string): boolean {
  return IDENTIFIER_REGEX.test(name) && !reservedIdentifiers().has(name)
}
