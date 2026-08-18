/**
 * Coincidencia de nombres para el buscador de la agenda.
 *
 * Núcleo puro, sin acceso a datos: aquí vive la regla de "qué cuenta como
 * encontrar a una persona", que es donde el buscador viejo fallaba. Al no
 * depender de Supabase se puede probar con `node --test`.
 *
 * La regla: el texto se parte en términos y TODOS deben aparecer, en cualquier
 * orden, sin tildes y sin distinguir mayúsculas. Escribir "Daniela Paez" tiene
 * que encontrar a DANIELA PÁEZ igual que escribir solo "Daniela".
 */

/** Mayúsculas, sin tildes y sin puntuación: 'María-José' → 'MARIA JOSE'. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Términos buscables de un texto escrito por el usuario. */
export function searchTokens(query: string): string[] {
  return normalizeName(query)
    .split(' ')
    .filter((token) => token.length >= 2)
}

/**
 * Puntúa un nombre ya normalizado contra los términos buscados. Devuelve null
 * si algún término no aparece. Un término que arranca palabra puntúa más que
 * uno a mitad de palabra, para que "gom" saque antes a GOMEZ que a ANGOMEZ.
 */
export function scoreName(normalizedName: string, tokens: string[]): number | null {
  if (!normalizedName || tokens.length === 0) return null

  let score = 0
  for (const token of tokens) {
    const position = normalizedName.indexOf(token)
    if (position === -1) return null
    const startsWord = position === 0 || normalizedName[position - 1] === ' '
    score += startsWord ? 2 : 1
  }
  return score
}

/**
 * Clases de caracteres para comparar sin tildes dentro de PostgreSQL. El asunto
 * de un evento de Outlook es texto libre escrito a mano: unas veces lleva
 * tildes y otras no, así que la comparación tiene que tolerar ambas.
 */
const ACCENT_CLASS: Record<string, string> = {
  A: '[aáàäâãAÁÀÄÂÃ]',
  E: '[eéèëêEÉÈËÊ]',
  I: '[iíìïîIÍÌÏÎ]',
  O: '[oóòöôõOÓÒÖÔÕ]',
  U: '[uúùüûUÚÙÜÛ]',
  N: '[nñNÑ]',
  C: '[cçCÇ]',
}

/** Convierte un término normalizado en un regex POSIX tolerante a tildes. */
export function toAccentInsensitivePattern(token: string): string {
  return token
    .split('')
    .map((char) => ACCENT_CLASS[char] ?? char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('')
}
