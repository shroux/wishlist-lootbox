/**
 * state.js
 * Singleton d'état global + système de subscription léger.
 * Aucun accès au DOM, aucun effet de bord.
 */

/** @type {import('./app.js').AppState} */
const _state = {
  view:            'home',
  steamId:         null,
  wishlist:        { bronze: [], silver: [], gold: [] },
  pool:            { bronze: [], silver: [], gold: [] },
  history:         [],
  muted:           false,
  loadingProgress: { current: 0, total: 0 },
};

/** @type {Array<(state: import('./app.js').AppState) => void>} */
const _subscribers = [];

/**
 * Retourne une copie shallow de l'état courant.
 * @returns {import('./app.js').AppState}
 */
export function getState() {
  return _state;
}

/**
 * Fusionne un patch dans l'état, puis notifie tous les subscribers.
 * @param {Partial<import('./app.js').AppState>} patch
 */
export function setState(patch) {
  Object.assign(_state, patch);
  _subscribers.forEach(fn => fn(_state));
}

/**
 * Enregistre une fonction appelée à chaque setState.
 * @param {(state: import('./app.js').AppState) => void} fn
 */
export function subscribe(fn) {
  _subscribers.push(fn);
}
