/**
 * utils.js
 * Utilitaires partagés — pas d'accès au DOM, pas d'effets de bord.
 */

/**
 * Échappe les caractères HTML dangereux dans une chaîne.
 * @param {string} str
 * @returns {string}
 */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
