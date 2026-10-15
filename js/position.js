// 現在地：本物（端末の位置）と、お試し歩き（地図を押した場所）
// 位置はこの端末の中で距離を出すためだけに使う。保存するのは最後の場所（丸めた値）だけ
import { JUMP_MPS, JUMP_COOLDOWN_MS } from './config.js?v=0.6.1';
import { S, save } from './state.js?v=0.6.1';
import { dist, emit } from './util.js?v=0.6.1';

export const POS = { lat: null, lon: null, acc: null, heading: null, fake: false, watchId: null, at: 0, follow: false, jumpUntil: 0, lastErr: null };

export function setPos(lat, lon, acc, fake, heading = null) {
  const prev = POS.lat != null ? { lat: POS.lat, lon: POS.lon, at: POS.at } : null;
  if (!fake && prev && POS.at) { const dt = (Date.now() - prev.at) / 1000; const d = dist(prev.lat, prev.lon, lat, lon); if (dt > 0.5 && d / dt > JUMP_MPS && d > 300) POS.jumpUntil = Date.now() + JUMP_COOLDOWN_MS; }
  POS.lat = lat; POS.lon = lon; POS.acc = acc; POS.fake = fake; POS.heading = heading; POS.at = Date.now();
  S.lastPos = { lat: +lat.toFixed(4), lon: +lon.toFixed(4) }; save();
  emit('pos', POS);
}
export const hasPos = () => POS.lat != null;
export const jumped = () => Date.now() < POS.jumpUntil;

export function startWatch({ onFirst, onError } = {}) {
  if (!navigator.geolocation) { onError && onError({ code: 0, message: 'nogeo' }); return false; }
  if (POS.fake) setTrial(false);
  POS.follow = true;
  if (POS.watchId != null) { emit('follow'); return true; }
  let first = true;
  POS.watchId = navigator.geolocation.watchPosition((p) => {
    setPos(p.coords.latitude, p.coords.longitude, p.coords.accuracy, false, Number.isFinite(p.coords.heading) ? p.coords.heading : null);
    if (first) { first = false; onFirst && onFirst(POS); }
  }, (err) => { POS.watchId = null; POS.follow = false; POS.lastErr = err; onError && onError(err); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  return true;
}
export function stopWatch() { if (POS.watchId != null) { try { navigator.geolocation.clearWatch(POS.watchId); } catch (e) {} POS.watchId = null; } POS.follow = false; }
export function setTrial(on) {
  if (on) { stopWatch(); POS.fake = true; }
  else { POS.fake = false; POS.lat = null; POS.lon = null; POS.acc = null; emit('pos', POS); }
  emit('trial', on);
}
export function setFollow(on) { POS.follow = on; emit('follow', on); }
