/**
 * animation.js
 * Orchestration des 3 phases d'animation lootbox + Canvas particules.
 * Ce module est autorisé à manipuler le DOM (overlay temporaire).
 *
 * Phase 1 — Anticipation (~2 s) : tremblement, particules en orbite, glow
 * Phase 2 — Ouverture    (~0.8 s) : explosion de particules, flash lumineux
 * Phase 3 — Reveal       (~1 s)  : scale-up de la carte + glow persistant
 */

import { playAnticipation, stopAnticipation, playOpen, playReveal } from './audio.js';

// ─── Config par tier ───────────────────────────────────────────────────────

const TIER = {
  bronze: { rgb: '205,127,50',  main: '#cd7f32', label: 'Bronze', icon: '⚙' },
  silver: { rgb: '184,196,208', main: '#b8c4d0', label: 'Argent', icon: '✦' },
  gold:   { rgb: '255,215,0',   main: '#ffd700', label: 'Or',     icon: '★' },
};

const PHASE1_MS = 2000;
const PHASE2_MS = 800;
const MAX_PARTICLES = 150;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Lance l'animation lootbox en overlay plein écran.
 * @param {import('./app.js').Game} game — le jeu tiré
 * @returns {Promise<void>} résout quand l'animation est terminée ou sautée
 */
export function playAnimation(game) {
  return new Promise((resolve) => {
    const tc = TIER[game.tier];

    // ── Construire l'overlay ───────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = `lootbox-overlay lootbox-overlay--${game.tier}`;
    overlay.innerHTML = `
      <canvas class="lootbox-canvas"></canvas>
      <div class="lootbox-flash" aria-hidden="true"></div>
      <div class="lootbox-box lootbox-box--${game.tier}" aria-hidden="true">
        <div class="lootbox-box-lid">
          <div class="lootbox-box-hinge"></div>
        </div>
        <div class="lootbox-box-body">
          <span class="lootbox-box-icon">${tc.icon}</span>
        </div>
      </div>
      <div class="lootbox-reveal" hidden aria-live="polite">
        ${_buildRevealCardHTML(game, tc)}
      </div>
      <button class="lootbox-skip" type="button">Passer →</button>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const canvas  = overlay.querySelector('.lootbox-canvas');
    const flash   = overlay.querySelector('.lootbox-flash');
    const box     = overlay.querySelector('.lootbox-box');
    const reveal  = overlay.querySelector('.lootbox-reveal');
    const skipBtn = overlay.querySelector('.lootbox-skip');
    const ctx     = canvas.getContext('2d');

    // ── Canvas resize ──────────────────────────────────────────────
    function resizeCanvas() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ── Particules ─────────────────────────────────────────────────
    const particles = [];

    function spawnOrbitParticle() {
      if (particles.length >= MAX_PARTICLES) return;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const angle = Math.random() * Math.PI * 2;
      const r = 130 + Math.random() * 90;
      const ox = cx + Math.cos(angle) * r;
      const oy = cy + Math.sin(angle) * r;
      particles.push({
        x: ox, y: oy,
        vx: (cx - ox) * 0.026 + (Math.random() - 0.5) * 0.9,
        vy: (cy - oy) * 0.026 + (Math.random() - 0.5) * 0.9,
        size: 2 + Math.random() * 2.2,
        color: tc.main,
        alpha: 0.5 + Math.random() * 0.5,
        life: 1, decay: 0.006, drag: 0.97, gravity: 0,
      });
    }

    function spawnExplosionParticles() {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const toSpawn = Math.min(90, MAX_PARTICLES - particles.length);
      for (let i = 0; i < toSpawn; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 9;
        const bright = Math.random() > 0.5;
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 2.5 + Math.random() * 5,
          color: bright ? '#fff' : tc.main,
          alpha: 1,
          life: 1, decay: 0.01 + Math.random() * 0.013, drag: 0.92, gravity: 0.09,
        });
      }
    }

    // ── Boucle de rendu ────────────────────────────────────────────
    let raf = null;
    let closed = false;

    function drawParticles() {
      if (closed) return;
      raf = requestAnimationFrame(drawParticles);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x  += p.vx;  p.y  += p.vy;
        p.vx *= p.drag; p.vy *= p.drag;
        p.vy += p.gravity;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life) * p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ── Fermeture ──────────────────────────────────────────────────
    let shakeId;
    let orbitId;

    function close() {
      if (closed) return;
      closed = true;
      stopAnticipation();
      if (raf)     cancelAnimationFrame(raf);
      if (shakeId) clearInterval(shakeId);
      if (orbitId) clearInterval(orbitId);
      window.removeEventListener('resize', resizeCanvas);
      document.body.style.overflow = '';
      overlay.classList.add('lootbox-overlay--exit');
      setTimeout(() => { overlay.remove(); resolve(); }, 350);
    }

    skipBtn.addEventListener('click', close);
    reveal.addEventListener('click', close);

    // ── Phase 1 — Anticipation ─────────────────────────────────────
    playAnticipation();
    const phase1Start = Date.now();

    shakeId = setInterval(() => {
      if (closed) return;
      const t = Math.min((Date.now() - phase1Start) / PHASE1_MS, 1);
      const amt = t * t * 14;
      const sx = (Math.random() - 0.5) * amt;
      const sy = (Math.random() - 0.5) * amt;
      box.style.transform =
        `translate(calc(-50% + ${sx.toFixed(1)}px), calc(-50% + ${sy.toFixed(1)}px))`;
      const gs = Math.round(20 + t * 72);
      const ga = (0.25 + t * 0.55).toFixed(2);
      const ga2 = (parseFloat(ga) * 0.35).toFixed(2);
      box.style.boxShadow =
        `0 0 ${gs}px rgba(${tc.rgb},${ga}), 0 0 ${gs * 2}px rgba(${tc.rgb},${ga2})`;
    }, 50);

    orbitId = setInterval(() => {
      if (closed || particles.length >= 80) return;
      spawnOrbitParticle();
    }, 110);

    // ── Phase 2 — Ouverture ────────────────────────────────────────
    setTimeout(() => {
      clearInterval(shakeId);
      clearInterval(orbitId);
      if (closed) return;

      stopAnticipation();
      playOpen();

      box.style.transform  = '';
      box.style.boxShadow  = '';
      box.classList.add('lootbox-box--explode');

      flash.style.background =
        `radial-gradient(circle at center, rgba(${tc.rgb},0.85) 0%, rgba(${tc.rgb},0) 65%)`;
      flash.classList.add('lootbox-flash--active');

      spawnExplosionParticles();

      // ── Phase 3 — Reveal ────────────────────────────────────────
      setTimeout(() => {
        if (closed) return;
        playReveal(game.tier);
        box.hidden    = true;
        reveal.hidden = false;
        reveal.offsetHeight; // force reflow pour déclencher l'animation CSS
        reveal.classList.add('lootbox-reveal--enter');
      }, PHASE2_MS);

    }, PHASE1_MS);

    // ── Démarrage ─────────────────────────────────────────────────
    raf = requestAnimationFrame(drawParticles);
    // Double rAF : laisser le DOM peindre avant de déclencher la transition opacity
    requestAnimationFrame(() =>
      requestAnimationFrame(() => overlay.classList.add('lootbox-overlay--visible'))
    );
  });
}

// ─── Helpers internes ──────────────────────────────────────────────────────

/**
 * Construit le HTML de la carte de reveal.
 * @param {import('./app.js').Game} game
 * @param {{ rgb: string, label: string, icon: string }} tc
 * @returns {string} HTML
 */
function _buildRevealCardHTML(game, tc) {
  let priceHTML;
  if (!game.formattedPrice) {
    priceHTML = '<span class="price-free">Gratuit / Prix non disponible</span>';
  } else if (game.discountPct > 0 && game.formattedOriginalPrice) {
    priceHTML = `
      <span class="price-original">${_esc(game.formattedOriginalPrice)}</span>
      <span class="price-current">${_esc(game.formattedPrice)}</span>
      <span class="discount-badge">-${game.discountPct}%</span>`;
  } else {
    priceHTML = `<span>${_esc(game.formattedPrice)}</span>`;
  }

  return `
    <div class="lootbox-reveal-card lootbox-reveal-card--${game.tier}">
      <div class="lootbox-reveal-image-wrap">
        <img class="lootbox-reveal-img"
             src="${_esc(game.imageUrl)}"
             alt="${_esc(game.name)}" />
        <span class="lootbox-reveal-badge tier-badge-${game.tier}">${tc.icon} ${tc.label}</span>
      </div>
      <div class="lootbox-reveal-body">
        <div class="lootbox-reveal-name">${_esc(game.name)}</div>
        <div class="lootbox-reveal-footer">
          <div class="game-card-price">${priceHTML}</div>
          <a class="game-card-link"
             href="${_esc(game.storeUrl)}"
             target="_blank"
             rel="noopener noreferrer">Voir sur Steam ↗</a>
        </div>
        <p class="lootbox-reveal-hint">Cliquez pour continuer</p>
      </div>
    </div>`;
}

/**
 * Échappe les caractères HTML dangereux.
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
