// 音（部品ファイルなしで、その場で合成）と振動
import { S } from './state.js?v=0.5.2';

let ctx = null;
function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
export function unlock() { const c = ac(); if (!c) return; try { const o = c.createOscillator(); const g = c.createGain(); g.gain.value = 0; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.01); } catch (e) {} }
function tone(freq, t0, dur, type = 'sine', vol = 0.18, slide = 0) {
  const c = ac(); if (!c || !S.settings.sound) return;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + t0 + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + t0); g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g).connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.02);
}
function noise(t0, dur, vol = 0.2) {
  const c = ac(); if (!c || !S.settings.sound) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource(); src.buffer = buf; const g = c.createGain(); g.gain.value = vol; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  src.connect(f).connect(g).connect(c.destination); src.start(c.currentTime + t0);
}
export const sfx = {
  click() { tone(880, 0, 0.05, 'triangle', 0.08); },
  tick(strength = 0.5) { tone(520 + strength * 300, 0, 0.05, 'sine', 0.05 + strength * 0.08); },
  enter() { tone(660, 0, 0.09, 'triangle', 0.14); tone(990, 0.1, 0.12, 'triangle', 0.14); tone(1320, 0.22, 0.22, 'triangle', 0.12); },
  stamp() { noise(0, 0.12, 0.35); tone(110, 0, 0.18, 'sine', 0.3, -60); tone(1760, 0.12, 0.16, 'sine', 0.08); },
  rare() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.05 * i, 0.3, 'triangle', 0.12)); },
  levelup() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.09 * i, 0.22, 'square', 0.07)); tone(1047, 0.4, 0.5, 'triangle', 0.12); },
  gacha() { for (let i = 0; i < 6; i++) tone(300 + Math.random() * 200, 0.15 * i, 0.06, 'square', 0.05); },
  reveal() { tone(784, 0, 0.1, 'triangle', 0.12); tone(1175, 0.12, 0.3, 'triangle', 0.12); },
  nope() { tone(220, 0, 0.12, 'sawtooth', 0.08, -60); },
};
export function haptic(pattern) { if (!S.settings.haptic) return; try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }
