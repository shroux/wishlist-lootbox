/**
 * lootbox-engine.js
 * Classification en tiers et logique de tirage.
 * Module pur — aucun accès au DOM, aucun effet de bord.
 */

/**
 * @typedef {{ appid: number, name: string, priceCents: number|null,
 *             originalPriceCents: number|null, formattedPrice: string|null,
 *             formattedOriginalPrice: string|null, discountPct: number,
 *             imageUrl: string, storeUrl: string, tier: string }} Game
 */

/**
 * Retourne le tier d'un jeu selon son prix en centimes.
 * @param {number|null} priceCents
 * @returns {'bronze'|'silver'|'gold'}
 */
export function classifyTier(priceCents) {
  if (priceCents == null || priceCents === 0) return 'bronze';
  if (priceCents < 1000) return 'bronze';   // < 10 €
  if (priceCents <= 2500) return 'silver';  // 10 € – 25 €
  return 'gold';                             // > 25 €
}

/**
 * Répartit un tableau de Game en 3 tiers.
 * @param {Game[]} games
 * @returns {{ bronze: Game[], silver: Game[], gold: Game[] }}
 */
export function partitionByTier(games) {
  const result = { bronze: [], silver: [], gold: [] };
  for (const game of games) {
    result[game.tier].push(game);
  }
  return result;
}

/**
 * Tire un jeu aléatoire dans un tier et le retire du pool.
 * Mute le tableau passé en argument.
 * @param {Game[]} pool
 * @returns {Game|null}
 */
export function drawFromPool(pool) {
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  const [game] = pool.splice(idx, 1);
  return game;
}
