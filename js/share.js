// シェア用の画像（スタンプ・常連度・カード・プレイヤーカード）
import { S } from './state.js?v=0.9.0';
import { stampSVG, stampInk, rarityOf, rarityText } from './data.js?v=0.9.0';
import { snapshot } from './map.js?v=0.9.0';
import { regularInfo } from './game.js?v=0.9.0';
import { stars, prefOf, fmtDate, todayISO } from './util.js?v=0.9.0';

const PAPER = '#FFF8EA', INK = '#1B1B1B', INK2 = '#5A554D', SHU = '#FF6A48', LINE = '#1B1B1B';
const DISP = '"Mochiy Pop P One","Zen Maru Gothic","Hiragino Sans",sans-serif', BODY = '"Zen Maru Gothic","Hiragino Sans",sans-serif';
function svgToImage(svg) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }); }
function wrap(g, text, max) { const lines = []; let cur = ''; for (const ch of String(text)) { if (g.measureText(cur + ch).width > max) { lines.push(cur); cur = ch; } else cur += ch; } if (cur) lines.push(cur); return lines; }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function footer(g, W, H) { g.textAlign = 'left'; g.fillStyle = SHU; g.font = `28px ${DISP}`; g.fillText('本めぐり', 60, H - 56); g.textAlign = 'right'; g.fillStyle = INK2; g.font = `22px ${BODY}`; g.fillText(`${S.settings.handle ? S.settings.handle + '　' : ''}#本めぐり`, W - 60, H - 56); g.textAlign = 'left'; }

// スタンプ（地図の切り抜き＋スタンプ）。常連度があれば、その帯も
export async function stampImage(st, opts = {}) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const reg = regularInfo(st.i); const ink = stampInk(st);
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  let mapDrawn = false; const mc = snapshot();
  if (mc) { try { const side = Math.min(mc.width, mc.height); g.save(); rrect(g, 60, 60, W - 120, W - 120, 36); g.clip(); g.drawImage(mc, (mc.width - side) / 2, (mc.height - side) / 2, side, side, 60, 60, W - 120, W - 120); g.restore(); mapDrawn = true; } catch (e) { mapDrawn = false; } }
  if (!mapDrawn) { g.fillStyle = '#FBEFD6'; rrect(g, 60, 60, W - 120, W - 120, 36); g.fill(); }
  g.strokeStyle = LINE; g.lineWidth = 4; rrect(g, 60, 60, W - 120, W - 120, 36); g.stroke();
  try { const im = await svgToImage(stampSVG(st, true, 380, { rank: reg.rank })); g.save(); g.translate(W - 60 - 200, W - 60 - 200); g.rotate(-0.1); g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 28; g.shadowOffsetY = 8; g.drawImage(im, -190, -190, 380, 380); g.restore(); } catch (e) {}
  g.fillStyle = INK; g.textAlign = 'left'; g.font = `54px ${DISP}`;
  const lines = wrap(g, st.n, W - 120).slice(0, 2); lines.forEach((l, i) => g.fillText(l, 60, W + 44 + i * 62));
  let y = W + 44 + lines.length * 62 + 14;
  g.font = `30px ${BODY}`; g.fillStyle = INK2; g.fillText(`${prefOf(st)}　${stars(rarityOf(st))}　${rarityText(st)}`, 60, y); y += 46;
  if (opts.regular || reg.rank >= 2) { g.fillStyle = ink.main; rrect(g, 60, y - 34, 520, 54, 27); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke(); g.fillStyle = INK; g.font = `28px ${DISP}`; g.fillText(`常連度：${reg.name}　来店 ${reg.days}日`, 84, y + 4); y += 66; }
  g.fillStyle = INK2; g.font = `30px ${BODY}`; g.fillText(`${fmtDate((S.stamps[st.i] || {}).d || todayISO())}　スタンプ ${Object.keys(S.stamps).length}個目`, 60, y);
  footer(g, W, H);
  return await new Promise((res) => cv.toBlob(res, 'image/png'));
}
// カード（本との出会い）
export async function cardImage(c) {
  const W = 720, H = 960, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.strokeStyle = LINE; g.lineWidth = 4; rrect(g, 24, 24, W - 48, H - 48, 28); g.stroke();
  let coverDrawn = false;
  if (c.cover) { try { const img = await new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = c.cover; }); const ch = 480, cw = Math.round(ch * img.width / img.height); g.save(); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 24; g.shadowOffsetY = 8; g.drawImage(img, (W - cw) / 2, 60, cw, ch); g.restore(); coverDrawn = true; } catch (e) {} }
  g.fillStyle = INK; g.textAlign = 'center'; let y = coverDrawn ? 600 : 220;
  g.font = `34px ${DISP}`; wrap(g, c.title, W - 120).slice(0, 2).forEach((l) => { g.fillText(l, W / 2, y); y += 46; });
  g.font = `22px ${BODY}`; g.fillStyle = INK2; if (c.author) { g.fillText(c.author, W / 2, y); y += 36; }
  y += 10; g.font = `28px ${DISP}`; g.fillStyle = INK; g.fillText(c.sn, W / 2, y); y += 40; g.font = `22px ${BODY}`; g.fillStyle = INK2; g.fillText(fmtDate(c.d), W / 2, y); y += 44;
  if (c.why) { g.font = `24px ${BODY}`; g.fillStyle = INK; wrap(g, c.why, W - 140).slice(0, 4).forEach((l) => { g.fillText(l, W / 2, y); y += 34; }); }
  g.save(); g.translate(W - 120, H - 120); g.rotate(-0.15); g.fillStyle = SHU; rrect(g, -56, -56, 112, 112, 26); g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke(); g.fillStyle = INK; g.font = `34px ${DISP}`; g.fillText('出会', 0, 12); g.restore();
  g.textAlign = 'left'; g.fillStyle = SHU; g.font = `22px ${DISP}`; g.fillText('本めぐり', 48, H - 48);
  return await new Promise((res) => cv.toBlob(res, 'image/png'));
}
// プレイヤーカード
export async function profileImage({ level, title, st, topStamps, avatar, handle }) {
  const W = 1080, H = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.strokeStyle = LINE; g.lineWidth = 6; rrect(g, 40, 40, W - 80, H - 80, 40); g.stroke();
  if (avatar) { try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = avatar; }); g.save(); g.beginPath(); g.arc(W - 180, 190, 96, 0, Math.PI * 2); g.clip(); g.drawImage(im, W - 276, 94, 192, 192); g.restore(); g.lineWidth = 10; g.strokeStyle = '#fff'; g.beginPath(); g.arc(W - 180, 190, 98, 0, Math.PI * 2); g.stroke(); g.lineWidth = 6; g.strokeStyle = SHU; g.beginPath(); g.arc(W - 180, 190, 104, 0, Math.PI * 2); g.stroke(); } catch (e) {} }
  g.fillStyle = SHU; g.font = `110px ${DISP}`; g.textAlign = 'left'; g.fillText(`第${level}巻`, 80, 190);
  g.fillStyle = INK; g.font = `46px ${DISP}`; g.fillText(handle || title || '本屋あるき見習い', 80, 262);
  if (handle) { g.fillStyle = INK2; g.font = `28px ${BODY}`; g.fillText(`称号「${title || '本屋あるき見習い'}」`, 80, 306); }
  const rows = [['スタンプ', st.stamps], ['行きつけ', st.regulars || 0], ['カード', st.cards], ['県', st.prefs]];
  rows.forEach(([l, n], i) => { const x = 80 + i * 240; g.fillStyle = '#FFF3C2'; rrect(g, x, 340, 210, 140, 24); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke(); g.fillStyle = SHU; g.font = `64px ${DISP}`; g.textAlign = 'center'; g.fillText(String(n), x + 105, 425); g.fillStyle = INK2; g.font = `26px ${BODY}`; g.fillText(l, x + 105, 465); });
  let x = 80; for (const s of topStamps.slice(0, 4)) { try { const im = await svgToImage(stampSVG(s, true, 220, { rank: regularInfo(s.i).rank })); g.drawImage(im, x, 520, 220, 220); } catch (e) {} x += 240; }
  g.textAlign = 'left'; g.fillStyle = INK2; g.font = `28px ${BODY}`; g.fillText(`${todayISO()} 時点`, 80, 810);
  footer(g, W, H);
  return await new Promise((res) => cv.toBlob(res, 'image/png'));
}
export async function shareBlob(blob, filename, title, text) {
  if (!blob) throw new Error('noblob');
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title, text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; } }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); return 'saved';
}

// その日の物語（本のページの形）
export async function storyImage(ch, avatar, handle) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  g.strokeStyle = LINE; g.lineWidth = 4; rrect(g, 40, 40, W - 80, H - 80, 36); g.stroke();
  g.textAlign = 'left'; g.fillStyle = SHU; g.font = `28px ${DISP}`; g.fillText(`本めぐり　${handle ? handle + 'の物語' : 'その日の物語'}`, 96, 130);
  if (avatar) { try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = avatar; }); g.save(); g.beginPath(); g.arc(W - 150, 150, 56, 0, Math.PI * 2); g.clip(); g.drawImage(im, W - 206, 94, 112, 112); g.restore(); g.lineWidth = 6; g.strokeStyle = SHU; g.beginPath(); g.arc(W - 150, 150, 59, 0, Math.PI * 2); g.stroke(); } catch (e) {} }
  g.fillStyle = INK; g.font = `64px ${DISP}`; g.fillText(ch.title, 96, 220);
  g.strokeStyle = SHU; g.lineWidth = 4; g.beginPath(); g.moveTo(96, 254); g.lineTo(260, 254); g.stroke();
  let y = 330; const LH = 56, MAXY = H - 300; g.font = `34px ${BODY}`; g.fillStyle = INK;
  const lines = ch.empty ? [{ s: ch.blank }] : ch.lines;
  outer: for (const l of lines) { const parts = wrap(g, '　' + l.s, W - 192); for (const p of parts) { if (y > MAXY) { g.fillText('……', 96, y); break outer; } g.fillText(p, 96, y); y += LH; } y += 10; }
  const boxes = [[`+${ch.earned}`, 'ページ'], [`${ch.km}`, 'km'], [`${(ch.steps || 0).toLocaleString()}`, '歩（目安）'], [`${ch.nStores}`, '訪ねた場所']];
  boxes.forEach(([n, l], i) => { const x = 96 + i * 228; g.fillStyle = '#FFF3C2'; rrect(g, x, H - 250, 204, 120, 22); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke(); g.fillStyle = SHU; g.font = `46px ${DISP}`; g.textAlign = 'center'; g.fillText(n, x + 102, H - 185); g.fillStyle = INK2; g.font = `24px ${BODY}`; g.fillText(l, x + 102, H - 148); });
  footer(g, W, H);
  return await new Promise((res) => cv.toBlob(res, 'image/png'));
}
