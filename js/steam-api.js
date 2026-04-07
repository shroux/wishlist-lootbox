/**
 * steam-api.js
 * Chargement de la wishlist Steam via le Cloudflare Worker proxy.
 *
 * Flux :
 *   1. GET /wishlist/:steamId  → { appids: number[] }
 *   2. Découpage en batches de 100
 *   3. GET /items?appids=...   → { items: NormalizedItem[] }
 *   4. Classification par tier via lootbox-engine
 */

import { classifyTier } from './lootbox-engine.js';

export const WORKER_URL = 'https://steam-wishlist-proxy.tual-gilles.workers.dev';

const BATCH_SIZE   = 100;
const BATCH_DELAY  = 200; // ms entre chaque batch pour ne pas saturer l'API
const MAX_GAMES    = 2000; // limite d'import depuis la wishlist

/** @typedef {import('./lootbox-engine.js').Game} Game */

/**
 * @typedef {{ bronze: Game[], silver: Game[], gold: Game[] }} Wishlist
 */

/**
 * Callback de progression appelé après chaque batch.
 * @callback ProgressCallback
 * @param {{ loaded: number, total: number }} progress
 */

/**
 * Charge la wishlist complète pour un Steam ID 64-bit.
 *
 * @param {string} steamId         — Steam ID 64-bit (17 chiffres)
 * @param {ProgressCallback} [onProgress]
 * @returns {Promise<Wishlist>}
 * @throws {Error} message lisible pour l'utilisateur
 */
export async function loadWishlist(steamId, onProgress) {
  // --- Étape 1 : récupérer la liste des appids ---
  const appids = await fetchAppids(steamId);

  // --- Étape 2 : charger les détails par batch (limité à MAX_GAMES) ---
  const games = await fetchAllItems(appids.slice(0, MAX_GAMES), onProgress);

  // --- Étape 3 : répartir en tiers ---
  const wishlist = { bronze: [], silver: [], gold: [] };
  for (const game of games) {
    wishlist[game.tier].push(game);
  }

  return wishlist;
}

// ---------------------------------------------------------------------------
// Fonctions internes
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT = 15_000; // ms

/**
 * @param {string} steamId
 * @returns {Promise<number[]>}
 */
async function fetchAppids(steamId) {
  let res;
  try {
    res = await fetch(
      `${WORKER_URL}/wishlist/${encodeURIComponent(steamId)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
    );
  } catch (err) {
    throw new Error(
      err.name === 'TimeoutError'
        ? 'Le serveur met trop de temps à répondre. Réessayez.'
        : 'Erreur réseau. Vérifiez votre connexion.',
    );
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? `Erreur ${res.status} lors du chargement de la wishlist.`);
  }

  if (!Array.isArray(data.appids) || data.appids.length === 0) {
    throw new Error('La wishlist est vide ou privée.');
  }

  return data.appids;
}

/**
 * Découpe les appids en batches, les charge séquentiellement avec un délai.
 *
 * @param {number[]} appids
 * @param {ProgressCallback} [onProgress]
 * @returns {Promise<Game[]>}
 */
async function fetchAllItems(appids, onProgress) {
  const batches = chunkArray(appids, BATCH_SIZE);
  const allGames = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const items = await fetchItemBatch(batch);
    allGames.push(...items);

    if (onProgress) {
      onProgress({ loaded: Math.min((i + 1) * BATCH_SIZE, appids.length), total: appids.length });
    }

    // Délai entre les batches (sauf après le dernier)
    if (i < batches.length - 1) {
      await sleep(BATCH_DELAY);
    }
  }

  return allGames;
}

/**
 * @param {number[]} appids — max 100 éléments
 * @returns {Promise<Game[]>}
 */
async function fetchItemBatch(appids) {
  const params = new URLSearchParams({ appids: appids.join(','), cc: 'FR', l: 'french' });
  let res;
  try {
    res = await fetch(
      `${WORKER_URL}/items?${params}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
    );
  } catch (err) {
    throw new Error(
      err.name === 'TimeoutError'
        ? 'Le serveur met trop de temps à répondre. Réessayez.'
        : 'Erreur réseau. Vérifiez votre connexion.',
    );
  }
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? `Erreur ${res.status} lors du chargement des détails.`);
  }

  const storeItems = data.items ?? [];

  return storeItems.map(item => ({
    appid:                  item.appid,
    name:                   item.name,
    priceCents:             item.priceCents,
    originalPriceCents:     item.originalPriceCents,
    formattedPrice:         item.formattedPrice,
    formattedOriginalPrice: item.formattedOriginalPrice,
    discountPct:            item.discountPct ?? 0,
    imageUrl:               item.imageUrl,
    storeUrl:               item.storeUrl,
    tier:                   classifyTier(item.priceCents),
  }));
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
