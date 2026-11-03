// 地図（MapLibre）。店はピンの絵で表示し、固まり（クラスタ）でまとめ、状態は feature-state で軽く更新する
import { MAP_SKINS, STYLE_DARK, STYLE_LIGHT, TERRITORY_M, RANGE_M } from './config.js?v=0.17.2';
import { emit, circlePoly } from './util.js?v=0.17.2';
import { POS } from './position.js?v=0.17.2';

export const M = { map: null, ready: false, theme: 'light' };
let storesGeo = { type: 'FeatureCollection', features: [] };
let territoryGeo = { type: 'FeatureCollection', features: [] };
let meGeo = { type: 'FeatureCollection', features: [] };
let bound = false;
const HIT_LAYERS = ['stores', 'stores-stamped', 'stores-near', 'stores-pick', 'clusters', 'reads']; // 押せるもの（地図の下地より先に受ける）
let readsGeo = { type: 'FeatureCollection', features: [] }; // 読んだ場所（v0.15.0）
const stateCache = new Map(); // id → 最後に送った状態
let handlers = {};
// ---- ピンの絵（canvasで描く。種類：plain ふつう／used 古書店／rare 秘境／stamped 押した／near 射程内／lib 図書館） ----
// v0.9 ポップ・ラリー：白いふち＋墨の輪郭の「シール」。本屋＝朱／古書店＝茶／秘境＝墨に檸檬の星／図書館＝空／押した店＝若草にチェック／射程内＝朱に檸檬の光の輪
const PIN = { plain: ['#FF6A48', '#FFFFFF'], used: ['#B9794A', '#FFFFFF'], rare: ['#1B1B1B', '#FFD447'], stamped: ['#4FC07A', '#FFFFFF'], near: ['#FF6A48', '#FFFFFF'], lib: ['#2F9BFF', '#FFFFFF'] };
const EDGE = '#1B1B1B';
function starPath(g, cx, cy, R, r) { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r : R; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); }
export function pinCanvas(kind, s = 2) {
  const halo = kind === 'near'; const W = halo ? 64 : 44, H = halo ? 72 : 56; const ox = halo ? 10 : 0, oy = halo ? 16 : 0;
  const c = document.createElement('canvas'); c.width = W * s; c.height = H * s; const g = c.getContext('2d'); g.scale(s, s);
  const [fill, glyph] = PIN[kind] || PIN.plain; g.lineJoin = 'round'; g.lineCap = 'round';
  if (halo) { // 檸檬の光の輪（16の角）。動かない
    g.beginPath(); for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 8; const rr = i % 2 ? 22 : 28; const x = 32 + Math.cos(a) * rr, y = 37 + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath();
    g.fillStyle = '#FFD447'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = EDGE; g.stroke();
  }
  const path = () => { g.beginPath(); g.moveTo(22 + ox, 53 + oy); g.bezierCurveTo(16 + ox, 42 + oy, 6 + ox, 33 + oy, 6 + ox, 21 + oy); g.arc(22 + ox, 21 + oy, 16, Math.PI, 0); g.bezierCurveTo(38 + ox, 33 + oy, 28 + ox, 42 + oy, 22 + ox, 53 + oy); g.closePath(); };
  path(); g.lineWidth = 5; g.strokeStyle = '#FFFFFF'; g.stroke(); // シールの白いふち
  path(); g.fillStyle = fill; g.fill(); g.lineWidth = 1.8; g.strokeStyle = EDGE; g.stroke();
  const cx = 22 + ox, cy = 21 + oy;
  if (kind === 'stamped') { g.strokeStyle = glyph; g.lineWidth = 3.2; g.beginPath(); g.moveTo(cx - 6.5, cy + 0.5); g.lineTo(cx - 1.5, cy + 5.5); g.lineTo(cx + 7, cy - 4.5); g.stroke(); }
  else if (kind === 'rare') { g.fillStyle = glyph; g.beginPath(); starPath(g, cx, cy + 0.5, 8, 3.6); g.fill(); }
  else if (kind === 'lib') { g.fillStyle = glyph; g.beginPath(); g.moveTo(cx - 8, cy - 2); g.lineTo(cx, cy - 7.5); g.lineTo(cx + 8, cy - 2); g.lineTo(cx + 8, cy - 0.5); g.lineTo(cx - 8, cy - 0.5); g.closePath(); g.fill(); g.fillRect(cx - 7, cy + 1, 2.6, 6.5); g.fillRect(cx - 1.3, cy + 1, 2.6, 6.5); g.fillRect(cx + 4.4, cy + 1, 2.6, 6.5); g.fillRect(cx - 8, cy + 8, 16, 1.6); }
  else { g.fillStyle = glyph; bookPath(g, cx, cy); g.fill(); } // 開いた本（v0.14.5：2つの四角だと一時停止の印に見えたので、ページが外へ反った形に）
  return c;
}
// 開いた本の形：真ん中の背に少しすきま、上のふちは背から外へ反り上がり、下のふちは背で下がる
function bookPath(g, cx, cy) {
  g.beginPath();
  for (const s of [-1, 1]) { g.moveTo(cx + s * 0.9, cy - 3.6); g.quadraticCurveTo(cx + s * 4.6, cy - 7, cx + s * 8.6, cy - 5.6); g.lineTo(cx + s * 8.6, cy + 5.4); g.quadraticCurveTo(cx + s * 4.6, cy + 4, cx + s * 0.9, cy + 7); g.closePath(); }
}
const pinImage = (kind) => { const c = pinCanvas(kind); return c.getContext('2d').getImageData(0, 0, c.width, c.height); };
export const pinDataURL = (kind, s = 3) => pinCanvas(kind, s).toDataURL();
function markImage() { // 行きたい（檸檬のハート）
  const W = 26, s = 2; const c = document.createElement('canvas'); c.width = W * s; c.height = W * s; const g = c.getContext('2d'); g.scale(s, s);
  const heart = () => { g.beginPath(); g.moveTo(13, 22); g.bezierCurveTo(5, 16, 3, 12, 3, 9); g.bezierCurveTo(3, 5.5, 6, 3.5, 8.5, 3.5); g.bezierCurveTo(10.5, 3.5, 12.2, 4.6, 13, 6.2); g.bezierCurveTo(13.8, 4.6, 15.5, 3.5, 17.5, 3.5); g.bezierCurveTo(20, 3.5, 23, 5.5, 23, 9); g.bezierCurveTo(23, 12, 21, 16, 13, 22); g.closePath(); };
  g.lineJoin = 'round'; heart(); g.lineWidth = 4; g.strokeStyle = '#FFFFFF'; g.stroke(); heart(); g.fillStyle = '#FFD447'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = EDGE; g.stroke();
  return g.getImageData(0, 0, W * s, W * s);
}
function pickMarkImage() { // 書店員さんの1冊の店（白い丸に朱の開いた本。v0.11）
  const W = 26, s = 2; const c = document.createElement('canvas'); c.width = W * s; c.height = W * s; const g = c.getContext('2d'); g.scale(s, s);
  g.beginPath(); g.arc(13, 13, 10.5, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = EDGE; g.stroke();
  const page = (x) => { g.beginPath(); g.moveTo(x, 9); g.quadraticCurveTo(x + 3.4, 7.2, x + 6.8, 9); g.lineTo(x + 6.8, 17.4); g.quadraticCurveTo(x + 3.4, 15.6, x, 17.4); g.closePath(); g.fillStyle = '#FF6A48'; g.fill(); g.lineWidth = 1.2; g.lineJoin = 'round'; g.strokeStyle = EDGE; g.stroke(); };
  page(6.2); page(13);
  return g.getImageData(0, 0, W * s, W * s);
}
function readMarkImage() { // 読んだ場所（桃の丸に白い開いた本。図書館のピン＝空と見分けるため桃。v0.15.0）
  const W = 26, s = 2; const c = document.createElement('canvas'); c.width = W * s; c.height = W * s; const g = c.getContext('2d'); g.scale(s, s);
  g.beginPath(); g.arc(13, 13, 10.5, 0, Math.PI * 2); g.fillStyle = '#FF7AB6'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = EDGE; g.stroke();
  g.save(); g.translate(13, 12.6); g.scale(0.66, 0.66); bookPath(g, 0, 0); g.fillStyle = '#FFFFFF'; g.fill(); g.restore();
  return g.getImageData(0, 0, W * s, W * s);
}
const fs = (k, def = 0) => ['coalesce', ['feature-state', k], def];
// イベントの対象の店の輪の色（開催中のイベントの枠の色）
let evRingColor = '#FFD447';
export function setEventRingColor(c) { if (!c || c === evRingColor) return; evRingColor = c; if (M.ready && M.map.getLayer('event-ring')) M.map.setPaintProperty('event-ring', 'circle-color', c); }
// ---- 自分のアイコン（現在地に出す。写真は端末の中だけ） ----
let avatar = null; // { blue: ImageData, purple: ImageData }
const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
function ringImage(im, color) {
  const W = 60, s = 2; const c = document.createElement('canvas'); c.width = W * s; c.height = W * s; const g = c.getContext('2d'); g.scale(s, s);
  g.save(); g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 6; g.shadowOffsetY = 2; g.beginPath(); g.arc(30, 30, 25, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(30, 30, 22, 0, Math.PI * 2); g.clip(); g.drawImage(im, 8, 8, 44, 44); g.restore();
  g.lineWidth = 3.5; g.strokeStyle = color; g.beginPath(); g.arc(30, 30, 24, 0, Math.PI * 2); g.stroke();
  return g.getImageData(0, 0, W * s, W * s);
}
function avatarLayer(map) {
  if (!avatar) return;
  for (const k of ['blue', 'purple']) { const name = 'me-avatar-' + k; if (map.hasImage(name)) map.updateImage(name, avatar[k]); else map.addImage(name, avatar[k], { pixelRatio: 2 }); }
  if (!map.getLayer('me-avatar')) map.addLayer({ id: 'me-avatar', type: 'symbol', source: 'me', filter: ['==', ['get', 'k'], 'me'], layout: { 'icon-image': ['case', ['==', ['get', 'fake'], 1], 'me-avatar-purple', 'me-avatar-blue'], 'icon-size': 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  else map.setLayoutProperty('me-avatar', 'visibility', 'visible');
}
export async function setAvatar(dataUrl) {
  if (!dataUrl) { avatar = null; if (M.ready && M.map.getLayer('me-avatar')) M.map.setLayoutProperty('me-avatar', 'visibility', 'none'); return; }
  try { const im = await loadImg(dataUrl); avatar = { blue: ringImage(im, '#2F9BFF'), purple: ringImage(im, '#A86CFF') }; } catch (e) { avatar = null; return; }
  if (M.ready) avatarLayer(M.map);
}
function addLayers() {
  const map = M.map;
  for (const k of Object.keys(PIN)) if (!map.hasImage('pin-' + k)) map.addImage('pin-' + k, pinImage(k), { pixelRatio: 2 });
  if (!map.hasImage('mark-want')) map.addImage('mark-want', markImage(), { pixelRatio: 2 });
  if (!map.hasImage('mark-pick')) map.addImage('mark-pick', pickMarkImage(), { pixelRatio: 2 });
  if (!map.hasImage('mark-read')) map.addImage('mark-read', readMarkImage(), { pixelRatio: 2 });
  map.addSource('territory', { type: 'geojson', data: territoryGeo });
  map.addLayer({ id: 'territory-fill', type: 'fill', source: 'territory', paint: { 'fill-color': '#4FC07A', 'fill-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'rank'], 1], 1, 0.14, 5, 0.3] } });
  map.addLayer({ id: 'territory-line', type: 'line', source: 'territory', paint: { 'line-color': '#4FC07A', 'line-opacity': 0.8, 'line-width': 1.5, 'line-dasharray': [2, 1.5] } });
  // 読んだ場所（店のピンより下）：移動しながら読んだときの点線と、はじめた所の印
  map.addSource('reads', { type: 'geojson', data: readsGeo });
  map.addLayer({ id: 'reads-line', type: 'line', source: 'reads', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#FF7AB6', 'line-width': 3, 'line-dasharray': [0.1, 2.2], 'line-opacity': 0.9 } });
  map.addLayer({ id: 'reads', type: 'symbol', source: 'reads', filter: ['==', ['geometry-type'], 'Point'], layout: { 'icon-image': 'mark-read', 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 15, 0.95], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  map.addSource('me', { type: 'geojson', data: meGeo });
  map.addLayer({ id: 'me-acc', type: 'fill', source: 'me', filter: ['==', ['get', 'k'], 'acc'], paint: { 'fill-color': '#2F9BFF', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'me-range', type: 'line', source: 'me', filter: ['==', ['get', 'k'], 'range'], paint: { 'line-color': '#2F9BFF', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.85 } });
  map.addSource('stores', { type: 'geojson', data: storesGeo, promoteId: 'id', cluster: true, clusterMaxZoom: 9, clusterRadius: 44 });
  map.addLayer({ id: 'clusters', type: 'circle', source: 'stores', filter: ['has', 'point_count'], paint: {
    'circle-color': ['step', ['get', 'point_count'], '#FFD447', 20, '#FF6A48', 100, '#E04E2E'],
    'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 100, 24, 400, 30],
    'circle-opacity': 1, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#1B1B1B' } });
  map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'stores', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#1B1B1B' } });
  const unc = ['!', ['has', 'point_count']];
  map.addLayer({ id: 'event-ring', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 11, 12, 16, 15, 24], 'circle-color': evRingColor, 'circle-opacity': ['*', 0.28, fs('ev')], 'circle-stroke-color': '#1B1B1B', 'circle-stroke-width': 2, 'circle-stroke-opacity': ['*', 0.85, fs('ev')] } });
  map.addLayer({ id: 'feat-ring', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 15, 15, 22], 'circle-color': '#A86CFF', 'circle-opacity': ['*', 0.12, fs('feat')], 'circle-stroke-color': '#A86CFF', 'circle-stroke-width': 2, 'circle-stroke-opacity': ['*', 0.9, fs('feat')] } });
  map.addLayer({ id: 'stores-halo', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 12, 12, 15, 18], 'circle-color': '#FF6A48', 'circle-opacity': ['*', 0.16, ['min', 1, fs('st')]] } });
  map.addLayer({ id: 'near-pulse', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': 16, 'circle-color': '#FFD447', 'circle-opacity': ['*', 0.3, fs('near')] } });
  const sz = ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 0.66, 15, 0.9];
  const sym = (image, size) => ({ 'icon-image': image, 'icon-size': size, 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true });
  // 下から順：ふつうのピン（押した・射程内は透明に）→ 押したピン → 射程内のピン → 行きたい☆
  map.addLayer({ id: 'stores', type: 'symbol', source: 'stores', filter: unc, layout: sym(['case', ['==', ['get', 'l'], 1], 'pin-lib', ['==', ['get', 'r'], 3], 'pin-rare', ['==', ['get', 'u'], 1], 'pin-used', 'pin-plain'], sz), paint: { 'icon-opacity': ['case', ['any', ['==', fs('stamp'), 1], ['==', fs('near'), 1]], 0, ['==', fs('st'), 0], 0.92, 1] } });
  map.addLayer({ id: 'stores-stamped', type: 'symbol', source: 'stores', filter: unc, layout: sym('pin-stamped', sz), paint: { 'icon-opacity': ['case', ['all', ['==', fs('stamp'), 1], ['!=', fs('near'), 1]], 1, 0] } });
  map.addLayer({ id: 'stores-near', type: 'symbol', source: 'stores', filter: unc, layout: sym('pin-near', ['interpolate', ['linear'], ['zoom'], 8, 0.6, 12, 0.8, 15, 1.05]), paint: { 'icon-opacity': fs('near') } });
  map.addLayer({ id: 'stores-want', type: 'symbol', source: 'stores', filter: unc, layout: { 'icon-image': 'mark-want', 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 15, 0.8], 'icon-anchor': 'bottom-left', 'icon-offset': [10, -34], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': fs('want') } });
  map.addLayer({ id: 'stores-pick', type: 'symbol', source: 'stores', filter: ['all', unc, ['==', ['get', 'pk'], 1]], layout: { 'icon-image': 'mark-pick', 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 15, 0.8], 'icon-anchor': 'bottom-right', 'icon-offset': [-10, -34], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  map.addLayer({ id: 'me-dot', type: 'circle', source: 'me', filter: ['==', ['get', 'k'], 'me'], paint: { 'circle-radius': 9, 'circle-color': ['case', ['==', ['get', 'fake'], 1], '#A86CFF', '#FFFFFF'], 'circle-stroke-width': 2.5, 'circle-stroke-color': '#1B1B1B' } });
  avatarLayer(map); // 自分のアイコンがあれば、現在地の点の上に
  if (!bound) { bound = true; // 押したときの受け口は1回だけ（v0.16.0：明・暗を切りかえるたびに増えていた）
  for (const id of ['stores', 'stores-stamped', 'stores-near', 'stores-pick']) {
    map.on('click', id, (e) => { if (e.originalEvent._hit) return; const f = e.features && e.features[0]; if (f) { e.originalEvent._hit = true; handlers.onStoreClick && handlers.onStoreClick(f.properties.id); } });
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  }
  map.on('click', 'clusters', (e) => { const f = e.features && e.features[0]; if (!f) return; e.originalEvent._hit = true; map.getSource('stores').getClusterExpansionZoom(f.properties.cluster_id, (err, z) => { if (!err) map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.5, 16) }); }); });
  map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
  // 読んだ場所の印を押したとき（店のピンと重なったら店を先に。だから店のあとに登録する）
  map.on('click', 'reads', (e) => { if (e.originalEvent._hit) return; const f = e.features && e.features[0]; if (!f) return; e.originalEvent._hit = true; handlers.onReadClick && handlers.onReadClick(f.properties); });
  }
  // 保存していた状態を入れ直す（スタイルを替えたときも）
  for (const [id, st] of stateCache) map.setFeatureState({ source: 'stores', id }, st);
}
// 地図にもともと出ている店・お寺などの印は消す（本屋・図書館のピンと紛れるため）。駅とバス停の印は残す
function hideBasePoi() { for (const id of ['poi_r1', 'poi_r7', 'poi_r20']) { try { if (M.map.getLayer(id)) M.map.setLayoutProperty(id, 'visibility', 'none'); } catch (e) {} } }
// 地図の下地を「ポップ」に合わせる（明るいときだけ）：ふつうはクリームの地・白い細い道・檸檬の大通り・空色の水・若草の公園。着せ替え（v0.15.2）で色を選べる（MAP_SKINS）
let mapSkin = MAP_SKINS.cream;
export function setMapSkin(name) { mapSkin = Object.hasOwn(MAP_SKINS, name || '') ? MAP_SKINS[name] : MAP_SKINS.cream; if (M.ready) tintBase(); }
function tintBase() {
  if (M.theme !== 'light') return; const map = M.map, c = mapSkin; const set = (id, prop, v) => { try { if (map.getLayer(id)) map.setPaintProperty(id, prop, v); } catch (e) {} };
  set('background', 'background-color', c.bg); set('landuse_residential', 'fill-color', c.res); set('building', 'fill-color', c.bld); set('building-3d', 'fill-extrusion-color', c.bld);
  for (const id of ['landuse_pitch', 'landuse_track', 'landuse_cemetery']) set(id, 'fill-color', c.pitch); set('landuse_hospital', 'fill-color', c.hosp); set('landuse_school', 'fill-color', c.school);
  set('park', 'fill-color', c.green); set('park_outline', 'line-color', c.green); set('landcover_wood', 'fill-color', c.wood); set('landcover_grass', 'fill-color', c.green); set('landcover_sand', 'fill-color', c.sand);
  set('water', 'fill-color', c.water); for (const id of ['waterway_river', 'waterway_other', 'waterway_tunnel']) set(id, 'line-color', c.water);
  for (const p of ['road', 'bridge', 'tunnel']) {
    for (const k of ['minor', 'service_track', 'street', 'path_pedestrian']) set(`${p}_${k}`, 'line-color', c.minor);
    for (const k of ['minor_casing', 'service_track_casing', 'street_casing', 'path_pedestrian_casing']) set(`${p}_${k}`, 'line-color', c.minorC);
    for (const k of ['secondary_tertiary', 'trunk_primary', 'link', 'motorway_link']) set(`${p}_${k}`, 'line-color', c.major);
    for (const k of ['secondary_tertiary_casing', 'trunk_primary_casing', 'link_casing', 'motorway_link_casing']) set(`${p}_${k}`, 'line-color', c.majorC);
    set(`${p}_motorway`, 'line-color', c.mw); set(`${p}_motorway_casing`, 'line-color', c.mwC);
    for (const k of ['major_rail', 'major_rail_hatching', 'transit_rail', 'transit_rail_hatching']) set(`${p}_${k}`, 'line-color', c.rail);
  }
  for (const id of ['highway-name-minor', 'highway-name-major', 'highway-name-path']) set(id, 'text-color', c.text);
}
function safeAddLayers() { try { hideBasePoi(); tintBase(); addLayers(); } catch (e) { console.error('layers', e); window.__mapErr = String(e && e.message || e); } }
export function initMap({ center, zoom, theme = 'light', onStoreClick, onMapClick, onDrag }) {
  handlers = { onStoreClick, onMapClick, onDrag }; M.theme = theme;
  const map = new maplibregl.Map({ container: 'map', style: theme === 'dark' ? STYLE_DARK : STYLE_LIGHT, center, zoom, attributionControl: false, preserveDrawingBuffer: true, maxZoom: 18 });
  M.map = map;
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  map.on('load', () => { safeAddLayers(); M.ready = true; emit('map-ready'); });
  map.on('click', (e) => { const ls = HIT_LAYERS.filter((id) => map.getLayer(id)); if (ls.length && map.queryRenderedFeatures(e.point, { layers: ls }).length) return; handlers.onMapClick && handlers.onMapClick(e.lngLat); }); // ピンなどの上を押したときは、地図のほうの動きをしない（v0.16.0：お試し歩きでピンを押すと、そこへ移っていた）
  map.on('dragstart', () => { handlers.onDrag && handlers.onDrag(); });
  map.on('error', (e) => { console.warn('map', e && e.error && e.error.message); });
  return map;
}
export function setTheme(theme) {
  if (!M.map || theme === M.theme) return; M.theme = theme; M.ready = false;
  M.map.once('style.load', () => { safeAddLayers(); M.ready = true; emit('map-ready'); resize(); });
  M.map.setStyle(theme === 'dark' ? STYLE_DARK : STYLE_LIGHT, { diff: false }); // 差分更新だと 'style.load' が来ず、自作の層が戻らない
}
export function setStores(stores) {
  storesGeo = { type: 'FeatureCollection', features: stores.map((s) => ({ type: 'Feature', id: s.i, geometry: { type: 'Point', coordinates: [s.lo, s.la] }, properties: { id: s.i, r: s.k == null ? (s.demo ? 3 : 2) : (s.k === 0 ? 3 : s.k <= 6 ? 2 : 1), u: s.u ? 1 : 0, l: s.t === 'l' ? 1 : 0, custom: s.custom ? 1 : 0, demo: s.demo ? 1 : 0, pk: s.rec ? 1 : 0 } })) };
  if (M.ready) M.map.getSource('stores').setData(storesGeo);
}
export function setStates(next) { // Map<id, {stamp, near, feat, want, st, ev}>
  for (const [id, st] of next) {
    const prev = stateCache.get(id);
    if (prev && prev.stamp === st.stamp && prev.near === st.near && prev.feat === st.feat && prev.want === st.want && prev.st === st.st && prev.ev === st.ev) continue;
    stateCache.set(id, st); if (M.ready) M.map.setFeatureState({ source: 'stores', id }, st);
  }
}
// 押した店のまわりを塗る。常連度が高い店ほど広く・濃く（s.rad と s.rank）
let terrKey = '';
export function setTerritory(stores) { const key = stores.map((s) => `${s.i}:${s.rank || 1}`).join(','); if (key === terrKey) return; terrKey = key; /* 変わっていなければ描き直さない（v0.16.0） */ territoryGeo = { type: 'FeatureCollection', features: stores.map((s) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(s.lo, s.la, s.rad || TERRITORY_M) }, properties: { rank: s.rank || 1 } })) }; if (M.ready) M.map.getSource('territory').setData(territoryGeo); }
// 読んだ場所（v0.15.0）：spots＝[{ id, p0:[lat,lon], p1, label }]
export function setReads(spots) {
  readsGeo = { type: 'FeatureCollection', features: spots.flatMap((r) => [{ type: 'Feature', geometry: { type: 'Point', coordinates: [r.p0[1], r.p0[0]] }, properties: { id: r.id, label: r.label } }, ...(r.p1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[r.p0[1], r.p0[0]], [r.p1[1], r.p1[0]]] }, properties: { id: r.id } }] : [])]) };
  if (M.ready && M.map.getSource('reads')) M.map.getSource('reads').setData(readsGeo);
}
export function setMe(POS) {
  meGeo = POS.lat == null ? { type: 'FeatureCollection', features: [] } : { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(POS.lon, POS.lat, Math.min(POS.acc || 0, 500)) }, properties: { k: 'acc' } },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(POS.lon, POS.lat, RANGE_M) }, properties: { k: 'range' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [POS.lon, POS.lat] }, properties: { k: 'me', fake: POS.fake ? 1 : 0 } }] };
  if (M.ready) M.map.getSource('me').setData(meGeo);
}
// 射程内の光の輪は動かさない（v0.13.1）。前は毎コマ setPaintProperty で feature-state の式を変えていて、そのたびに店のタイルが作り直しになり、
// iPhone と同じ WebKit では作り直しが終わらずピンが出なかった（電池にもよくない）。光はいまの 'near-pulse' と 'stores-near' の止まった輪だけ
export function flyTo(lon, lat, zoom, opts = {}) { if (!M.map) return; M.map.flyTo(Object.assign({ center: [lon, lat], zoom: Math.max(M.map.getZoom(), zoom), speed: 1.2 }, opts)); }
export function jumpTo(lon, lat, zoom) { if (M.map) M.map.jumpTo({ center: [lon, lat], zoom }); }
export function easeTo(lon, lat) { if (M.map) M.map.easeTo({ center: [lon, lat], duration: 600 }); }
export function center() { return M.map ? M.map.getCenter() : { lat: 35.68, lng: 139.77 }; }
// シェア画像の地図（v0.15.3）：自分の位置・顔写真・読んだ場所を隠し、店のまわりを写してから元に戻す（前は今の画面をそのまま使い、家のまわりや現在地が写ることがあった）
const PRIVATE_LAYERS = ['me-acc', 'me-range', 'me-dot', 'me-avatar', 'reads', 'reads-line'];
export async function snapshotAt(lon, lat, zoom = 15) {
  if (!M.ready) return null; const map = M.map; const cam = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  const vis = PRIVATE_LAYERS.filter((id) => map.getLayer(id)).map((id) => [id, map.getLayoutProperty(id, 'visibility') || 'visible']);
  try {
    vis.forEach(([id]) => map.setLayoutProperty(id, 'visibility', 'none')); map.jumpTo({ center: [lon, lat], zoom, bearing: 0, pitch: 0 });
    await new Promise((res) => { let done = false; const fin = () => { if (!done) { done = true; res(); } }; map.once('idle', fin); setTimeout(fin, 2500); });
    const src = map.getCanvas(); const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c;
  } catch (e) { return null; } finally { vis.forEach(([id, v]) => { try { map.setLayoutProperty(id, 'visibility', v); } catch (e) {} }); map.jumpTo(cam); }
}
export function resize() { if (!M.map) return; const r = () => { try { M.map.resize(); } catch (e) {} }; r(); setTimeout(r, 60); setTimeout(r, 400); }
