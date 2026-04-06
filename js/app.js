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
 * }} AppState
 */

import { loadWishlist }           from './steam-api.js';
import { drawFromPool }           from './lootbox-engine.js';
import { getState, setState, subscribe } from './state.js';
import { getHistory, addToHistory, clearHistory } from './history.js';
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

  ui.setHomeError('');
  setState({
    view:            'loading',
    steamId,
    loadingProgress: { current: 0, total: 0 },
  });

  try {
    const wishlist = await loadWishlist(steamId, ({ loaded, total }) => {
      setState({ loadingProgress: { current: loaded, total } });
    });

    const history = getHistory(steamId);

    // Le pool est une copie shallow des tableaux wishlist
    const pool = {
      bronze: [...wishlist.bronze],
      silver: [...wishlist.silver],
      gold:   [...wishlist.gold],
    };

    // Retirer du pool les jeux déjà dans l'historique
    const drawnIds = new Set(history.map(g => g.appid));
    for (const tier of ['bronze', 'silver', 'gold']) {
      pool[tier] = pool[tier].filter(g => !drawnIds.has(g.appid));
    }

    const allEmpty = Object.values(pool).every(p => p.length === 0);

    setState({
      view: allEmpty ? 'empty' : 'dashboard',
      wishlist,
      pool,
      history,
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
// DASHBOARD — reset pool
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById('resetPoolBtn').addEventListener('click', () => {
  const { wishlist, steamId } = getState();

  clearHistory(steamId);

  const pool = {
    bronze: [...wishlist.bronze],
    silver: [...wishlist.silver],
    gold:   [...wishlist.gold],
  };

  // Cacher le résultat précédent
  const drawResult = document.getElementById('draw-result');
  if (drawResult) drawResult.hidden = true;

  setState({ view: 'dashboard', pool, history: [] });
});

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY — reset depuis la vue "pool vide"
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById('emptyResetBtn').addEventListener('click', () => {
  const { wishlist, steamId } = getState();

  clearHistory(steamId);

  const pool = {
    bronze: [...wishlist.bronze],
    silver: [...wishlist.silver],
    gold:   [...wishlist.gold],
  };

  setState({ view: 'dashboard', pool, history: [] });
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
