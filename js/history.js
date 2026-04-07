/**
 * history.js
 * CRUD localStorage pour l'historique des tirages.
 * Aucun accès au DOM.
 */

/** @typedef {import('./lootbox-engine.js').Game & { drawnAt: string }} DrawnGame */

const KEY = (steamId) => `lootbox_history_${steamId}`;
const HISTORY_MAX = 500; // cap pour éviter QuotaExceededError

/**
 * Charge l'historique pour un Steam ID.
 * @param {string} steamId
 * @returns {DrawnGame[]}
 */
export function getHistory(steamId) {
  try {
    return JSON.parse(localStorage.getItem(KEY(steamId)) ?? '[]');
  } catch {
    return [];
  }
}

/**
 * Ajoute un tirage en tête de l'historique et persiste.
 * @param {string} steamId
 * @param {import('./lootbox-engine.js').Game} game
 * @returns {DrawnGame[]} Nouvel historique (le plus récent en premier)
 */
export function addToHistory(steamId, game) {
  const history = getHistory(steamId);
  history.unshift({ ...game, drawnAt: new Date().toISOString() });
  // Rotation FIFO : ne garder que les HISTORY_MAX entrées les plus récentes
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  try {
    localStorage.setItem(KEY(steamId), JSON.stringify(history));
  } catch {
    // QuotaExceededError : l'état en mémoire reste correct, seule la persistence échoue
    console.warn('[lootbox] localStorage quota dépassé — historique non sauvegardé.');
  }
  return history;
}

/**
 * Supprime l'historique d'un Steam ID.
 * @param {string} steamId
 */
export function clearHistory(steamId) {
  localStorage.removeItem(KEY(steamId));
}
