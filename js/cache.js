/**
 * cache.js
 * Persistance de la wishlist Steam en localStorage.
 * Aucun accès au DOM, aucun fetch.
 *
 * Clé : `lootbox_wishlist_<steamId>`
 * Enveloppe : { v, steamId, cachedAt: ISO, wishlist: {bronze,silver,gold} }
 */

const CACHE_VERSION = 1;
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 heures

/** @param {string} steamId */
const _key = (steamId) => `lootbox_wishlist_${steamId}`;

/**
 * Retourne le snapshot wishlist en cache s'il est valide (version + TTL).
 * Retourne null si absent, version obsolète, ou expiré.
 *
 * @param {string} steamId
 * @returns {{ wishlist: import('./app.js').AppState['wishlist'], cachedAt: string } | null}
 */
export function getCachedWishlist(steamId) {
  try {
    const raw = localStorage.getItem(_key(steamId));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.v !== CACHE_VERSION) return null;
    if (Date.now() - new Date(entry.cachedAt).getTime() > CACHE_TTL_MS) return null;
    return { wishlist: entry.wishlist, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}

/**
 * Persiste le snapshot wishlist. Silencieux en cas de QuotaExceededError.
 *
 * @param {string} steamId
 * @param {import('./app.js').AppState['wishlist']} wishlist
 */
export function setCachedWishlist(steamId, wishlist) {
  try {
    const entry = {
      v:        CACHE_VERSION,
      steamId,
      cachedAt: new Date().toISOString(),
      wishlist,
    };
    localStorage.setItem(_key(steamId), JSON.stringify(entry));
  } catch (err) {
    if (err.name !== 'QuotaExceededError') console.error(err);
  }
}

/**
 * Supprime le cache pour un Steam ID.
 * @param {string} steamId
 */
export function clearCachedWishlist(steamId) {
  localStorage.removeItem(_key(steamId));
}

/**
 * Retourne l'âge du cache en millisecondes, ou null si absent/illisible.
 * @param {string} steamId
 * @returns {number | null}
 */
export function getCacheAgeMs(steamId) {
  try {
    const raw = localStorage.getItem(_key(steamId));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry.cachedAt) return null;
    return Date.now() - new Date(entry.cachedAt).getTime();
  } catch {
    return null;
  }
}
