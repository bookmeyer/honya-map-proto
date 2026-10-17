// 音（部品ファイルなしで、その場で合成）。振動は使わない（2026-10-17 ぶっくまさんの指示）
// 材料：マリンバ風の打音（mallet）・鐘（bell）・弦をはじく音（pluck）・低い打音（thump）・小さな「ぽ」（pop）。
// すべて残響（convolver）とコンプレッサーを通すので、安っぽい電子音にならない
import { S } from './state.js?v=0.8.5';

let ctx = null, bus = null;
function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
export function unlock() { const c = ac(); if (!c) return; try { const o = c.createOscillator(); const g = c.createGain(); g.gain.value = 0; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.01); } catch (e) {} }

// 残響の種（短く減衰する雑音）
function impulse(c, sec = 1.6, decay = 3.2) { const n = Math.floor(c.sampleRate * sec); const buf = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return buf; }
function makeBus(c) {
  const out = c.createGain(); out.gain.value = 0.9;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
  out.connect(comp).connect(c.destination);
  const verb = c.createConvolver(); verb.buffer = impulse(c); const wet = c.createGain(); wet.gain.value = 0.28; verb.connect(wet).connect(out);
  return { dry: out, wet: verb };
}
function makeEngine(c) {
  const b = makeBus(c);
  const to = (node, wetAmt = 1) => { node.connect(b.dry); if (wetAmt > 0) { const g = c.createGain(); g.gain.value = wetAmt; node.connect(g).connect(b.wet); } };
  const env = (g, t, a, d, vol) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const noiseBuf = (sec, shape) => { const n = Math.floor(c.sampleRate * sec); const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (shape ? shape(i / n) : 1); return buf; };
  // マリンバ風：基音＋すぐ消える4倍音
  const mallet = (f, t0, dur = 0.5, vol = 0.22) => {
    const t = c.currentTime + t0;
    const g = c.createGain(); env(g, t, 0.004, dur, vol); const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); to(g, 0.8); o.start(t); o.stop(t + dur + 0.05);
    const g2 = c.createGain(); env(g2, t, 0.002, Math.min(0.12, dur), vol * 0.35); const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 4; o2.connect(g2); to(g2, 0.4); o2.start(t); o2.stop(t + 0.2);
  };
  // 鐘：倍音のずれた正弦波を重ねる
  const bell = (f, t0, dur = 1.6, vol = 0.14) => {
    const t = c.currentTime + t0;
    [[1, 1], [2.0, 0.5], [2.76, 0.32], [3.9, 0.18], [5.4, 0.1]].forEach(([r, a], i) => { const g = c.createGain(); env(g, t, 0.003, dur * (1 - i * 0.14), vol * a); const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * r; o.connect(g); to(g, 1); o.start(t); o.stop(t + dur + 0.1); });
  };
  // 弦をはじく音（ハープ風）：少しずれた倍音を重ね、高い倍音ほど早く消す。はじく瞬間の雑音を足す
  const pluck = (f, t0, dur = 0.9, vol = 0.25) => {
    const t = c.currentTime + t0;
    for (let n = 1; n <= 6; n++) { const g = c.createGain(); env(g, t, 0.002, dur * (1 - (n - 1) * 0.13), vol * Math.pow(1 / n, 1.15)); const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * n * (1 + 0.0004 * n * n); o.connect(g); to(g, 0.9); o.start(t); o.stop(t + dur + 0.1); }
    const src = c.createBufferSource(); src.buffer = noiseBuf(0.01, (x) => 1 - x); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(8000, f * 6); bp.Q.value = 0.7; const g2 = c.createGain(); g2.gain.value = vol * 0.5; src.connect(bp).connect(g2); to(g2, 0.3); src.start(t);
  };
  // 低い打音：ピッチが落ちる正弦波＋こもった雑音
  const thump = (t0, vol = 0.5, f0 = 160) => {
    const t = c.currentTime + t0;
    const g = c.createGain(); env(g, t, 0.003, 0.22, vol); const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.35, t + 0.18); o.connect(g); to(g, 0.5); o.start(t); o.stop(t + 0.3);
    const src = c.createBufferSource(); src.buffer = noiseBuf(0.09, (x) => (1 - x) ** 2); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; const g2 = c.createGain(); g2.gain.value = vol * 0.6; src.connect(lp).connect(g2); to(g2, 0.3); src.start(t);
  };
  // 小さな「ぽ」
  const pop = (t0, vol = 0.12, f = 1400) => { const t = c.currentTime + t0; const g = c.createGain(); env(g, t, 0.002, 0.07, vol); const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.07); o.connect(g); to(g, 0.2); o.start(t); o.stop(t + 0.1); };
  const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98 };
  return {
    click() { pop(0, 0.3); },
    tick(strength = 0.5) { mallet(N.A5 + strength * 300, 0, 0.2, 0.12 + strength * 0.14); },
    enter() { mallet(N.C6, 0, 0.5, 0.2); mallet(N.E6, 0.09, 0.5, 0.2); mallet(N.G6, 0.18, 0.8, 0.2); bell(N.C6, 0.3, 1.6, 0.09); },
    stamp() { thump(0, 0.6); mallet(N.C5, 0.1, 0.6, 0.22); mallet(N.E5, 0.14, 0.6, 0.2); mallet(N.G5, 0.18, 0.7, 0.2); mallet(N.C6, 0.24, 0.9, 0.22); bell(N.C6, 0.3, 1.8, 0.09); },
    rare() { [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6, N.E6].forEach((f, i) => mallet(f, 0.06 * i, 0.7, 0.2)); bell(N.C6, 0.45, 2.4, 0.12); bell(N.G6, 0.55, 2.2, 0.07); },
    levelup() { thump(0, 0.4, 120); [N.G4, N.C5, N.E5, N.G5].forEach((f, i) => mallet(f, 0.1 + 0.11 * i, 0.6, 0.22)); mallet(N.C6, 0.6, 1.2, 0.24); bell(N.C6, 0.62, 2.4, 0.12); bell(N.E6, 0.72, 2.0, 0.07); },
    regular() { pluck(N.F4, 0, 1.0, 0.16); pluck(N.A4, 0.08, 1.0, 0.15); pluck(N.C5, 0.16, 1.1, 0.15); pluck(N.F5, 0.24, 1.4, 0.16); bell(N.F5, 0.5, 2.0, 0.07); },
    reveal() { pluck(N.G5, 0, 0.8, 0.15); pluck(N.D6, 0.1, 1.2, 0.15); bell(N.G6, 0.25, 1.8, 0.06); },
    nope() { thump(0, 0.3, 140); thump(0.14, 0.26, 120); },
  };
}
function engine() { const c = ac(); if (!c) return null; if (!bus || bus.c !== c) bus = { c, e: makeEngine(c) }; return bus.e; }
export const NAMES = ['click', 'tick', 'enter', 'stamp', 'rare', 'levelup', 'regular', 'reveal', 'nope'];
export const sfx = {};
for (const n of NAMES) sfx[n] = (...a) => { if (!S.settings.sound) return; const e = engine(); if (!e) return; try { e[n](...a); } catch (err) {} };
export function haptic() {} // 振動はしない（呼び出し側はそのまま残しても鳴らない）

// 確認用：鳴らさずに波形を計算して、大きさと長さを測る（試作の点検で使う）
export async function renderOffline(name, sec = 2.5) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OC) return null;
  const c = new OC(2, Math.floor(44100 * sec), 44100); const e = makeEngine(c); e[name](); const buf = await c.startRendering();
  let peak = 0, sum = 0, last = 0; const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; if (v > 0.01) last = i; }
  return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), lastSec: +(last / 44100).toFixed(2) };
}
