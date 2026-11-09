/** "s33.0xxa, 99214 - A4565" -> ["S330XXA", "99214", "A4565"]: split on spaces, commas and dashes (incl. the en/em dashes Outlook
 * and Word type for " - "); dots dropped; upper case; repeats once. Shared by the server lookup and the static Pages demo. */
export const splitCodes = (q: string) => [...new Set(q.toUpperCase().replace(/\./g, '').split(/[\s,‐-―−-]+/).filter(Boolean))];
