/**
 * app.js
 * Point d'entrée. Machine à états + coordination globale.
 *
 * @typedef {{ appid: number, name: string, priceCents: number|null,
 *   originalPriceCents: number|null, formattedPrice: string|null,
 *   formattedOriginalPrice: string|null, discountPct: number,
 *   imageUrl: string, storeUrl: string, tier: string }} Game
 *
 * @typedef {{
 *   view: 'home'|'loading'|'dashboard'|'empty',
 *   steamId: string|null,
 *   wishlist: { bronze: Game[], silver: Game[], gold: Game[] },
 *   pool:     { bronze: Game[], silver: Game[], gold: Game[] },
 *   history:  import('./history.js').DrawnGame[],
 *   muted:    boolean,
 *   loadingProgress: { current: number, total: number },
 *   cacheAgeMs: number|null,
 * }} AppState
 */

import { loadWishlist }           from './steam-api.js';
import { drawFromPool }           from './lootbox-engine.js';
import { getState, setState, subscribe } from './state.js';
import { getHistory, addToHistory, clearHistory } from './history.js';
import { getCachedWishlist, setCachedWishlist, clearCachedWishlist, getCacheAgeMs } from './cache.js';
import * as ui from './ui.js';
import { playAnimation }          from './animation.js';

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIBER — réagit à tout changement d'état
// ═══════════════════════════════════════════════════════════════════════════

subscribe((state) => {
  ui.showView(state.view);
  ui.updateMuteBtn(state.muted);

  if (state.view === 'loading') {
    ui.updateLoadingProgress(
      state.loadingProgress.current,
      state.loadingProgress.total,
    );
  }

  if (state.view === 'dashboard') {
    ui.updateDashboard(state);
    ui.updateCacheAge(state.cacheAgeMs);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INITIALISATION
// ═══════════════════════════════════════════════════════════════════════════

// Restaurer l'état mute depuis localStorage
const savedMuted = localStorage.getItem('lootbox_muted') === 'true';
setState({ view: 'home', muted: savedMuted });

// ═══════════════════════════════════════════════════════════════════════════
// HOME — chargement de la wishlist
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById('loadForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const steamId = document.getElementById('steamId').value.trim();
  if (!steamId) return;

  // Validation format Steam ID 64-bit (17 chiffres commençant par 7656)
  if (!/^\d{17}$/.test(steamId) || !steamId.startsWith('7656')) {
    ui.setHomeError('Steam ID invalide. Saisissez un ID 64-bit (17 chiffres commençant par 7656).');
    return;
  }

  ui.setHomeError('');

  // ── Cache hit : aller directement au dashboard sans passer par loading ──
  const cached = getCachedWishlist(steamId);
  if (cached) {
    const { wishlist } = cached;
    const history  = getHistory(steamId);
    const drawnIds = new Set(history.map(g => g.appid));
    const pool     = { bronze: [], silver: [], gold: [] };
    for (const tier of ['bronze', 'silver', 'gold']) {
      for (const g of wishlist[tier]) {
        if (!drawnIds.has(g.appid)) pool[tier].push(g);
      }
    }
    const allEmpty = Object.values(pool).every(p => p.length === 0);
    setState({
      view: allEmpty ? 'empty' : 'dashboard',
      steamId,
      wishlist,
      pool,
      history,
      cacheAgeMs: getCacheAgeMs(steamId),
    });
    return;
  }

  // ── Cache miss : fetch normal ───────────────────────────────────────────
  setState({
    view:            'loading',
    steamId,
    loadingProgress: { current: 0, total: 0 },
  });

  try {
    const wishlist = await loadWishlist(steamId, ({ loaded, total }) => {
      setState({ loadingProgress: { current: loaded, total } });
    });

    setCachedWishlist(steamId, wishlist);

    const history = getHistory(steamId);

    // Le pool est une copie shallow des tableaux wishlist,
    // filtrée en un seul parcours pour retirer les jeux déjà dans l'historique
    const drawnIds = new Set(history.map(g => g.appid));
    const pool = { bronze: [], silver: [], gold: [] };
    for (const tier of ['bronze', 'silver', 'gold']) {
      for (const g of wishlist[tier]) {
        if (!drawnIds.has(g.appid)) pool[tier].push(g);
      }
    }

    const allEmpty = Object.values(pool).every(p => p.length === 0);

    setState({
      view: allEmpty ? 'empty' : 'dashboard',
      wishlist,
      pool,
      history,
      cacheAgeMs: 0,
    });

  } catch (err) {
    setState({ view: 'home' });
    ui.setHomeError(err.message);
    console.error(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — boutons de tirage
// ═══════════════════════════════════════════════════════════════════════════

document.querySelectorAll('[data-draw-tier]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const tier  = btn.dataset.drawTier;
    const state = getState();

    const game = drawFromPool(state.pool[tier]);
    if (!game) return; // sécurité (le bouton devrait déjà être désactivé)

    // Bloquer les boutons pendant l'animation
    document.querySelectorAll('[data-draw-tier]').forEach(b => { b.disabled = true; });

    await playAnimation(game);

    // Réactiver explicitement avant setState pour éviter tout état bloqué
    // (updateDashboard re-désactivera les boutons de tiers vides si view==='dashboard')
    document.querySelectorAll('[data-draw-tier]').forEach(b => { b.disabled = false; });

    const newHistory = addToHistory(state.steamId, game);
    const allEmpty   = Object.values(state.pool).every(p => p.length === 0);

    setState({
      view:    allEmpty ? 'empty' : 'dashboard',
      pool:    state.pool,   // muté en place par drawFromPool
      history: newHistory,
    });

    if (!allEmpty) {
      ui.renderDrawnGame(game);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RESET POOL (partagé entre dashboard et vue empty)
// ═══════════════════════════════════════════════════════════════════════════

function doReset() {
  const { wishlist, steamId } = getState();
  clearHistory(steamId);
  // Ne pas toucher le cache wishlist — seuls les tirages sont réinitialisés
  const pool = {
    bronze: [...wishlist.bronze],
    silver: [...wishlist.silver],
    gold:   [...wishlist.gold],
  };
  const drawResult = document.getElementById('draw-result');
  if (drawResult) drawResult.hidden = true;
  setState({ view: 'dashboard', pool, history: [] });
}

document.getElementById('resetPoolBtn').addEventListener('click', doReset);
document.getElementById('emptyResetBtn').addEventListener('click', doReset);

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — actualiser la wishlist (force le re-fetch et vide le cache)
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById('refreshWishlistBtn').addEventListener('click', async () => {
  const { steamId } = getState();
  if (!steamId) return;

  clearCachedWishlist(steamId);
  setState({ view: 'loading', loadingProgress: { current: 0, total: 0 } });

  try {
    const wishlist = await loadWishlist(steamId, ({ loaded, total }) => {
      setState({ loadingProgress: { current: loaded, total } });
    });

    setCachedWishlist(steamId, wishlist);

    const history  = getHistory(steamId);
    const drawnIds = new Set(history.map(g => g.appid));
    const pool     = { bronze: [], silver: [], gold: [] };
    for (const tier of ['bronze', 'silver', 'gold']) {
      for (const g of wishlist[tier]) {
        if (!drawnIds.has(g.appid)) pool[tier].push(g);
      }
    }
    const allEmpty = Object.values(pool).every(p => p.length === 0);
    setState({ view: allEmpty ? 'empty' : 'dashboard', wishlist, pool, history, cacheAgeMs: 0 });

  } catch (err) {
    setState({ view: 'dashboard' });
    console.error(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — nouvelle wishlist
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById('newWishlistBtn').addEventListener('click', () => {
  setState({
    view:     'home',
    steamId:  null,
    wishlist: { bronze: [], silver: [], gold: [] },
    pool:     { bronze: [], silver: [], gold: [] },
    history:  [],
  });
  // Réinitialiser le champ
  const input = document.getElementById('steamId');
  if (input) input.value = '';
  ui.setHomeError('');
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTE
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById('muteBtn').addEventListener('click', () => {
  const newMuted = !getState().muted;
  localStorage.setItem('lootbox_muted', String(newMuted));
  setState({ muted: newMuted });
});
