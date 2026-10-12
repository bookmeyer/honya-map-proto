// シェア用の画像（印・カード・プレイヤーカード）
import { S } from './state.js';
import { stampSVG, rarityOf, rarityText } from './data.js';
import { snapshot } from './map.js';
import { stars, prefOf, fmtDate, todayISO } from './util.js';

const PAPER = '#f6f1e8', INK = '#231f1c', INK2 = '#5f574f', SHU = '#c8381f', LINE = '#ddd4c6';
function svgToImage(svg) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }); }
function wrap(g, text, max) { const lines = []; let cur = ''; for (const ch of String(text)) { if (g.measureText(cur + ch).width > max) { lines.push(cur); cur = ch; } else cur += ch; } if (cur) lines.push(cur); return lines; }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export async function stampImage(st) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  let mapDrawn = false; const mc = snapshot();
  if (mc) { try { const side = Math.min(mc.width, mc.height); g.save(); rrect(g, 60, 60, W - 120, W - 120, 28); g.clip(); g.drawImage(mc, (mc.width - side) / 2, (mc.height - side) / 2, side, side, 60, 60, W - 120, W - 120); g.restore(); mapDrawn = true; } catch (e) { mapDrawn = false; } }
  if (!mapDrawn) { g.fillStyle = '#eee6d8'; rrect(g, 60, 60, W - 120, W - 120, 28); g.fill(); }
  g.strokeStyle = LINE; g.lineWidth = 4; rrect(g, 60, 60, W - 120, W - 120, 28); g.stroke();
  try { const im = await svgToImage(stampSVG(st, true, 360)); g.save(); g.translate(W - 60 - 190, W - 60 - 190); g.rotate(-0.12); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 24; g.drawImage(im, -180, -180, 360, 360); g.restore(); } catch (e) {}
  g.fillStyle = INK; g.textAlign = 'left'; g.font = 'bold 54px "Shippori Mincho", serif';
  wrap(g, st.n, W - 120).slice(0, 2).forEach((l, i) => g.fillText(l, 60, W + 44 + i * 62));
  g.font = '32px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = INK2;
  g.fillText(`${prefOf(st)}　${stars(rarityOf(st))}　${rarityText(st)}`, 60, W + 176);
  g.fillText(`${fmtDate((S.stamps[st.i] || {}).d || todayISO())}　印 ${Object.keys(S.stamps).length}個目`, 60, W + 222);
  g.font = 'bold 28px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = SHU; g.fillText('本屋の地図', 60, H - 64);
  return await new Promise((res) => cv.toBlob(res, 'image/png'));
}
export async function cardImage(c) {
  const W = 720, H = 960, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.strokeStyle = LINE; g.lineWidth = 4; g.strokeRect(24, 24, W - 48, H - 48);
  let coverDrawn = false;
  if (c.cover) { try { const img = await new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = c.cover; }); const ch = 480, cw = Math.round(ch * img.width / img.height); g.drawImage(img, (W - cw) / 2, 60, cw, ch); coverDrawn = true; } catch (e) {} }
  g.fillStyle = INK; g.textAlign = 'center'; let y = coverDrawn ? 600 : 220;
  g.font = 'bold 34px "Shippori Mincho", serif'; wrap(g, c.title, W - 120).slice(0, 2).forEach((l) => { g.fillText(l, W / 2, y); y += 46; });
  g.font = '22px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = INK2; if (c.author) { g.fillText(c.author, W / 2, y); y += 36; }
  y += 10; g.font = 'bold 28px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = INK; g.fillText(c.sn, W / 2, y); y += 40; g.font = '22px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = INK2; g.fillText(fmtDate(c.d), W / 2, y); y += 44;
  if (c.why) { g.font = '24px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = INK; wrap(g, c.why, W - 140).slice(0, 4).forEach((l) => { g.fillText(l, W / 2, y); y += 34; }); }
  g.save(); g.translate(W - 120, H - 120); g.rotate(-0.15); g.strokeStyle = SHU; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.stroke(); g.fillStyle = SHU; g.font = 'bold 30px "Shippori Mincho", serif'; g.fillText('出会', 0, 11); g.restore();
  return await new Promise((res) => cv.toBlob(res, 'image/png'));
}
export async function profileImage({ level, title, st, topStamps }) {
  const W = 1080, H = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.strokeStyle = LINE; g.lineWidth = 6; rrect(g, 40, 40, W - 80, H - 80, 36); g.stroke();
  g.fillStyle = SHU; g.font = 'bold 110px "Shippori Mincho", serif'; g.textAlign = 'left'; g.fillText(`Lv.${level}`, 80, 190);
  g.fillStyle = INK; g.font = 'bold 44px "Zen Kaku Gothic New", sans-serif'; g.fillText(title || '本屋あるき見習い', 80, 260);
  const rows = [['印', st.stamps], ['店', st.stores], ['カード', st.cards], ['県', st.prefs]];
  rows.forEach(([l, n], i) => { const x = 80 + i * 240; g.fillStyle = '#eee6d8'; rrect(g, x, 310, 210, 140, 20); g.fill(); g.fillStyle = SHU; g.font = 'bold 64px "Shippori Mincho", serif'; g.textAlign = 'center'; g.fillText(String(n), x + 105, 395); g.fillStyle = INK2; g.font = '26px "Zen Kaku Gothic New", sans-serif'; g.fillText(l, x + 105, 435); });
  let x = 80; for (const s of topStamps.slice(0, 4)) { try { const im = await svgToImage(stampSVG(s, true, 220)); g.drawImage(im, x, 500, 220, 220); } catch (e) {} x += 240; }
  g.textAlign = 'left'; g.fillStyle = INK2; g.font = '28px "Zen Kaku Gothic New", sans-serif'; g.fillText(`${todayISO()} 時点`, 80, 800);
  g.fillStyle = SHU; g.font = 'bold 30px "Zen Kaku Gothic New", sans-serif'; g.fillText('本屋の地図', 80, H - 80);
  return await new Promise((res) => cv.toBlob(res, 'image/png'));
}
export async function shareBlob(blob, filename, title, text) {
  if (!blob) throw new Error('noblob');
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title, text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; } }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); return 'saved';
}
