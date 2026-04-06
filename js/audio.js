/**
 * audio.js
 * Sons synthétisés via Web Audio API — aucun fichier externe, libres de droits.
 * AudioContext créé uniquement après interaction utilisateur (politique autoplay).
 *
 * API publique :
 *   playAnticipation()   – son de montée en tension (phase 1)
 *   stopAnticipation()   – coupe proprement l'anticipation
 *   playOpen()           – impact/explosion (phase 2)
 *   playReveal(tier)     – ding de reveal, différent par tier (phase 3)
 */

import { getState } from './state.js';

/** @type {AudioContext|null} */
let _ctx = null;

/** Nœuds du son d'anticipation en cours */
let _anticipation = null;

// ─── Helpers internes ──────────────────────────────────────────────────────

function _getCtx() {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}

async function _resume() {
  const ctx = _getCtx();
  if (ctx.state === 'suspended') await ctx.resume();
  return ctx;
}

function _isMuted() {
  return getState().muted;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Son d'anticipation : oscillateur en montée + vibrato progressif.
 * Dure ~1.9 s pour coïncider avec la fin de la phase 1.
 */
export async function playAnticipation() {
  if (_isMuted()) return;
  const ctx = await _resume();
  const now = ctx.currentTime;
  const dur = 1.9;

  // Gain maître : fondu progressif
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(0.13, now + dur * 0.6);
  masterGain.gain.linearRampToValueAtTime(0.20, now + dur);
  masterGain.connect(ctx.destination);

  // Oscillateur principal triangle (plus doux que sawtooth, harmoniques paires)
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.linearRampToValueAtTime(380, now + dur);

  // Filtre passe-bas : démarre déjà ouvert pour éviter les graves étouffés
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.linearRampToValueAtTime(2400, now + dur);
  filter.Q.value = 1.5;

  osc.connect(filter);
  filter.connect(masterGain);
  osc.start(now);

  // LFO vibrato (fréquence et amplitude croissantes)
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(4, now);
  lfo.frequency.linearRampToValueAtTime(12, now + dur);

  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(1, now);
  lfoGain.gain.linearRampToValueAtTime(10, now + dur);

  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  lfo.start(now);

  _anticipation = { osc, lfo, masterGain };
}

/**
 * Coupe proprement le son d'anticipation (fondu de 60 ms).
 */
export function stopAnticipation() {
  if (!_anticipation || !_ctx) return;
  const { osc, lfo, masterGain } = _anticipation;
  const now = _ctx.currentTime;

  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.linearRampToValueAtTime(0, now + 0.06);

  try { osc.stop(now + 0.08); } catch (_) {}
  try { lfo.stop(now + 0.08); } catch (_) {}

  _anticipation = null;
}

/**
 * Son d'ouverture : impact basse fréquence + souffle de bruit bandpassé.
 */
export async function playOpen() {
  if (_isMuted()) return;
  const ctx = await _resume();
  const now = ctx.currentTime;

  // Impact grave (sub-boom)
  const boom = ctx.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(110, now);
  boom.frequency.exponentialRampToValueAtTime(28, now + 0.35);

  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(0.45, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  boom.connect(boomGain);
  boomGain.connect(ctx.destination);
  boom.start(now);
  boom.stop(now + 0.45);

  // Souffle de bruit (woosh)
  const bufLen = Math.ceil(ctx.sampleRate * 0.28);
  const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const noiseFilt = ctx.createBiquadFilter();
  noiseFilt.type = 'bandpass';
  noiseFilt.frequency.value = 900;
  noiseFilt.Q.value = 0.6;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.22, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

  noise.connect(noiseFilt);
  noiseFilt.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
}

/**
 * Son de reveal — qualité croissante Bronze → Argent → Or.
 * @param {'bronze'|'silver'|'gold'} tier
 */
export async function playReveal(tier) {
  if (_isMuted()) return;
  const ctx = await _resume();
  const now = ctx.currentTime;

  /** @type {Record<string, { freqs: number[], decay: number, vol: number }>} */
  const CONFIGS = {
    bronze: { freqs: [392],             decay: 0.45, vol: 0.22 },
    silver: { freqs: [523, 784],        decay: 0.65, vol: 0.16 },
    gold:   { freqs: [880, 1320, 1760], decay: 1.00, vol: 0.12 },
  };

  const cfg = CONFIGS[tier] ?? CONFIGS.bronze;
  const volPerOsc = cfg.vol / cfg.freqs.length;

  for (const freq of cfg.freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const g = ctx.createGain();
    g.gain.setValueAtTime(volPerOsc, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + cfg.decay);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + cfg.decay + 0.05);
  }

  // Étincelle haute fréquence pour or uniquement
  if (tier === 'gold') {
    const sparkle = ctx.createOscillator();
    sparkle.type = 'triangle';
    sparkle.frequency.setValueAtTime(4400, now);
    sparkle.frequency.exponentialRampToValueAtTime(2200, now + 0.35);

    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.07, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    sparkle.connect(sg);
    sg.connect(ctx.destination);
    sparkle.start(now);
    sparkle.stop(now + 0.38);
  }
}
