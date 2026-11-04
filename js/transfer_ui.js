// 引き継ぎコード（v0.22.0）：機種変更や、iPhone でブラウザからホーム画面のアイコンへ移すときに、記録をコードで引き継ぐ
// ぶっくまさん 11/4「引継ぎコードのほうがよいですね」→「いま作る」
// 記録（「書き出す」と同じ中身）をこの端末で暗号にして（AES-GCM。鍵はコードから作り、サーバーには送らない）、24時間だけサーバーに預ける
// サーバーが知るのは、コードから作った見出し（SHA-256）と暗号だけ＝運営は中身を読めない。受け取ると、サーバーの中身は消える（1回だけ）
import { APP_VER } from './config.js?v=0.22.0';
import { $, esc } from './util.js?v=0.22.0';
import { S, exportJSON, parseImport, replace } from './state.js?v=0.22.0';
import { apiBase } from './events.js?v=0.22.0';
import { rebuild, STORES } from './data.js?v=0.22.0';
import * as MAP from './map.js?v=0.22.0';
import { applyMapStates } from './map_ui.js?v=0.22.0';
import { openModal, closeModal, toast, refreshHud } from './ui.js?v=0.22.0';

const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 見まちがえやすい 0・O・1・I・L は使わない（31字×12＝約59ビット）
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{12}$/;
function newCode() { let s = ''; while (s.length < 12) { for (const x of crypto.getRandomValues(new Uint8Array(16))) if (x < 248 && s.length < 12) s += ABC[x % 31]; } return s; } // 248＝31×8（かたよりなし）
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fmt = (c) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
const enc = new TextEncoder();
async function idOf(code) { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('meguri-transfer-id:' + code))); return [...h].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function keyOf(code) { const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('meguri-transfer-key'), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function seal(code, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(code), enc.encode(text))); const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64(out); }
async function unseal(code, data) { const u = unb64(data); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, await keyOf(code), u.slice(12))); }
async function call(body) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 30000);
  try { const r = await fetch(new URL('transfer.php', apiBase()).toString(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal: ctl.signal }); return { status: r.status, j: await r.json().catch(() => null) }; } finally { clearTimeout(tm); }
}
const why = (e) => (e && e.message === 'limit' ? '今日はこれ以上できません。明日もう一度お試しください' : e && e.message === 'none' ? 'このコードは見つかりませんでした（入れまちがい・24時間すぎた・もう受け取った のどれかです）' : 'つながりませんでした。ネットを確かめて、もう一度お試しください');
// ---- コードを出す（前の端末） ----
export function openGiveCode() {
  openModal(`<h2>引き継ぎコードを出す</h2><p>この端末の記録（スタンプ・本・ページ・プロフィール・アイコンなど）を暗号にして、24時間だけ預けます。新しい端末の本めぐりでコードを入れると、受け取れます。</p>
    <p class="muted small">暗号を解く鍵はコードの中だけにあり、運営には届きません（運営も中身を読めません）。受け取ると、預けた記録はすぐに消えます。この端末の記録は、そのまま残ります。コードは人に見せないでください。</p>
    <div class="actions"><button class="btn primary" id="tc-go">コードを出す</button><button class="btn ghost" id="tc-cancel">やめる</button></div>`);
  $('#tc-cancel').onclick = closeModal;
  $('#tc-go').onclick = async () => {
    const b = $('#tc-go'); b.disabled = true; b.textContent = '準備しています…';
    try {
      const code = newCode(); const r = await call({ op: 'put', id: await idOf(code), data: await seal(code, exportJSON()), ver: APP_VER });
      if (!r.j || !r.j.ok) throw new Error((r.j && r.j.error) || 'net');
      const t = new Date(Date.now() + 86400000);
      $('#modal-box').innerHTML = `<h2>引き継ぎコード</h2><p class="tc-code" id="tc-code">${esc(fmt(code))}</p>
        <p>新しい端末で本めぐりを開き、<b>最初の画面の「前の端末から引き継ぐ」</b>か、<b>設定の「コードで受け取る」</b>に入れてください。</p>
        <p class="muted small">${t.getMonth() + 1}月${t.getDate()}日 ${t.getHours()}時${String(t.getMinutes()).padStart(2, '0')}分まで使えます。1回受け取ると消えます。</p>
        <div class="actions"><button class="btn" id="tc-copy">コードをコピー</button><button class="btn primary" id="tc-close">閉じる</button></div>`;
      $('#tc-close').onclick = closeModal;
      $('#tc-copy').onclick = async () => { try { await navigator.clipboard.writeText(fmt(code)); toast('コードをコピーしました', 'ok'); } catch (e) { toast('コピーできませんでした。書き写してください', 'warn'); } };
    } catch (e) { b.disabled = false; b.textContent = 'コードを出す'; toast(why(e), 'warn'); }
  };
}
// ---- コードで受け取る（新しい端末）。done：受け取ったあと／back：やめたとき ----
export function openTakeCode(done, back) {
  openModal(`<h2>コードで受け取る</h2><p>前の端末で出した引き継ぎコード（12文字）を入れてください。</p>
    <div class="field"><input type="text" id="tc-in" placeholder="例：ABCD-EFGH-JKMN" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" inputmode="text"></div>
    <p class="muted small">受け取ると、この端末の記録は、前の端末の記録に置きかわります。</p>
    <div class="actions"><button class="btn primary" id="tc-take">受け取る</button><button class="btn ghost" id="tc-cancel">やめる</button></div>`);
  $('#tc-cancel').onclick = () => { closeModal(); if (back) back(); };
  $('#tc-take').onclick = async () => {
    const code = norm($('#tc-in').value);
    if (!CODE_RE.test(code)) { toast('コードは12文字です（ハイフンはなくても大丈夫）', 'warn'); return; }
    const b = $('#tc-take'); b.disabled = true; b.textContent = '受け取っています…';
    try {
      const r = await call({ op: 'get', id: await idOf(code) });
      if (r.status === 404) throw new Error('none');
      if (!r.j || !r.j.ok) throw new Error((r.j && r.j.error) || 'net');
      const d = parseImport(await unseal(code, r.j.data));
      replace(d); rebuild(); MAP.setStores(STORES); applyMapStates(); refreshHud(); closeModal();
      toast(`記録を受け取りました（スタンプ${Object.keys(S.stamps).length}）`, 'ok');
      if (done) done();
    } catch (e) { b.disabled = false; b.textContent = '受け取る'; toast(e && e.name === 'OperationError' ? 'コードが合いませんでした' : why(e), 'warn'); }
  };
}
