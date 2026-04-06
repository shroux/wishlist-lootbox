/**
 * ui.js
 * Rendu DOM : toutes les vues et composants.
 * Ce module est le SEUL autorisé à toucher le DOM (avec animation.js).
 */

/** @typedef {import('./lootbox-engine.js').Game} Game */
/** @typedef {import('./history.js').DrawnGame} DrawnGame */

const TIER_LABEL = { bronze: 'Bronze', silver: 'Argent', gold: 'Or' };
const TIER_ICON  = { bronze: '⚙', silver: '✦', gold: '★' };

// ─── Éléments cachés par tier ──────────────────────────────────────────────

const _el = {
  views: {
    home:      () => document.getElementById('view-home'),
    loading:   () => document.getElementById('view-loading'),
    dashboard: () => document.getElementById('view-dashboard'),
    empty:     () => document.getElementById('view-empty'),
  },
  // Loading
  loadingStatus: () => document.getElementById('loadingStatus'),
  progressFill:  () => document.getElementById('progressFill'),
  loadingDetail: () => document.getElementById('loadingDetail'),
  // Home
  homeError: () => document.getElementById('homeError'),
  // Dashboard tier cards
  poolCount:  (tier) => document.getElementById(`pool-count-${tier}`),
  poolSub:    (tier) => document.getElementById(`pool-sub-${tier}`),
  btnCount:   (tier) => document.getElementById(`btn-count-${tier}`),
  drawBtn:    (tier) => document.querySelector(`[data-draw-tier="${tier}"]`),
  // Draw result
  drawResult:     () => document.getElementById('draw-result'),
  drawResultCard: () => document.getElementById('draw-result-card'),
  // History
  historyList:     () => document.getElementById('history-list'),
  historyCounters: () => document.getElementById('history-counters'),
  // Mute
  muteBtn: () => document.getElementById('muteBtn'),
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Affiche la vue nommée, masque les autres.
 * @param {'home'|'loading'|'dashboard'|'empty'} name
 */
export function showView(name) {
  for (const [key, getter] of Object.entries(_el.views)) {
    const el = getter();
    if (el) el.classList.toggle('active', key === name);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Affiche ou efface le message d'erreur de l'écran d'accueil.
 * @param {string} message  — chaîne vide pour effacer
 */
export function setHomeError(message) {
  const el = _el.homeError();
  if (el) el.textContent = message;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Met à jour la barre de progression du loader.
 * @param {number} current
 * @param {number} total
 */
export function updateLoadingProgress(current, total) {
  const fill   = _el.progressFill();
  const status = _el.loadingStatus();
  const detail = _el.loadingDetail();

  if (fill) {
    fill.style.width = total > 0 ? `${Math.round((current / total) * 100)}%` : '0%';
  }
  if (status) {
    status.textContent = total > 0
      ? `Chargement des jeux…`
      : 'Récupération de la wishlist…';
  }
  if (detail) {
    detail.textContent = total > 0 ? `${current} / ${total} jeux` : '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Met à jour l'ensemble du dashboard (compteurs, boutons, historique).
 * @param {import('./app.js').AppState} state
 */
export function updateDashboard(state) {
  const { pool, wishlist, history } = state;

  for (const tier of ['bronze', 'silver', 'gold']) {
    const poolCount  = pool[tier].length;
    const totalCount = wishlist[tier].length;

    // Carte de résumé
    const countEl = _el.poolCount(tier);
    const subEl   = _el.poolSub(tier);
    if (countEl) countEl.textContent = poolCount;
    if (subEl)   subEl.textContent   = `/ ${totalCount} jeux`;

    // Bouton de tirage
    const btn      = _el.drawBtn(tier);
    const cntLabel = _el.btnCount(tier);
    if (btn) {
      btn.disabled = poolCount === 0;
    }
    if (cntLabel) {
      cntLabel.textContent = `${poolCount} jeu${poolCount !== 1 ? 'x' : ''}`;
    }
  }

  renderHistory(history);
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAWN GAME CARD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Affiche la carte du jeu tiré dans la zone de résultat.
 * @param {Game} game
 */
export function renderDrawnGame(game) {
  const section = _el.drawResult();
  const card    = _el.drawResultCard();
  if (!section || !card) return;

  card.className = `result-card tier-${game.tier}`;
  card.innerHTML = _buildResultCardHTML(game);
  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rend la liste de l'historique des tirages.
 * @param {DrawnGame[]} history
 */
export function renderHistory(history) {
  const list     = _el.historyList();
  const counters = _el.historyCounters();
  if (!list) return;

  // Compteurs par tier
  if (counters) {
    if (history.length === 0) {
      counters.textContent = '';
    } else {
      const c = { bronze: 0, silver: 0, gold: 0 };
      for (const g of history) c[g.tier]++;
      counters.textContent =
        `— Bronze\u00a0: ${c.bronze} · Argent\u00a0: ${c.silver} · Or\u00a0: ${c.gold}`;
    }
  }

  if (history.length === 0) {
    list.innerHTML = '<p class="history-empty">Aucun tirage pour l\'instant.</p>';
    return;
  }

  list.innerHTML = history.map(g => _buildHistoryItemHTML(g)).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Met à jour l'icône du bouton mute.
 * @param {boolean} muted
 */
export function updateMuteBtn(muted) {
  const btn = _el.muteBtn();
  if (btn) btn.textContent = muted ? '🔇' : '🔊';
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILDERS INTERNES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Carte "reveal" du jeu tiré — image pleine largeur + contenu dessous.
 * @param {Game} game
 * @returns {string} HTML
 */
function _buildResultCardHTML(game) {
  const label = TIER_LABEL[game.tier];
  const icon  = TIER_ICON[game.tier];
  const price = _formatPrice(game);

  return `
    <div class="result-card-image-wrap">
      <img class="result-card-img" src="${_esc(game.imageUrl)}" alt="${_esc(game.name)}" loading="lazy" />
      <span class="result-card-badge tier-badge-${game.tier}">${icon} ${label}</span>
    </div>
    <div class="result-card-body">
      <div class="result-card-name">${_esc(game.name)}</div>
      <div class="result-card-footer">
        <div class="game-card-price">${price}</div>
        <a class="game-card-link" href="${_esc(game.storeUrl)}" target="_blank" rel="noopener noreferrer">
          Voir sur Steam ↗
        </a>
      </div>
    </div>
  `;
}

/**
 * @param {import('./history.js').DrawnGame} game
 * @returns {string} HTML
 */
function _buildHistoryItemHTML(game) {
  const label = TIER_LABEL[game.tier];
  const price = _formatPrice(game);
  const date  = _formatDate(game.drawnAt);

  return `
    <div class="history-item">
      <img class="history-item-img" src="${_esc(game.imageUrl)}" alt="${_esc(game.name)}" loading="lazy" />
      <div class="history-item-info">
        <div class="history-item-name">${_esc(game.name)}</div>
        <div class="history-item-price">${price}</div>
      </div>
      <div class="history-item-meta">
        <span class="tier-badge tier-badge-${game.tier}">${label}</span>
        <span class="history-item-date">${date}</span>
      </div>
    </div>
  `;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Formatte le prix d'un jeu en HTML.
 * @param {Game} game
 * @returns {string} HTML
 */
function _formatPrice(game) {
  if (!game.formattedPrice) {
    return '<span class="price-free">Gratuit / Prix non disponible</span>';
  }
  if (game.discountPct > 0 && game.formattedOriginalPrice) {
    return `
      <span class="price-original">${_esc(game.formattedOriginalPrice)}</span>
      <span class="price-current">${_esc(game.formattedPrice)}</span>
      <span class="discount-badge">-${game.discountPct}%</span>
    `;
  }
  return `<span>${_esc(game.formattedPrice)}</span>`;
}

/**
 * Formate une date ISO en "dd mmm yyyy, hh:mm".
 * @param {string} isoString
 * @returns {string}
 */
function _formatDate(isoString) {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

/**
 * Échappe les caractères HTML dans une chaîne.
 * @param {string} str
 * @returns {string}
 */
function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
