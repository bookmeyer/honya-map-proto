// お店の X の投稿（#本めぐり）を、X の公式の埋め込みで見せる（v0.35.0）
// 11/22 ぶっくまさん「#本めぐり の投稿を自動表示させます」「お店のアカウントだけ」
// 11/22 ぶっくまさん「そもそもボタン必要ないのでは？」「OKです」→ v0.35.3：ボタンなし
// 決まりごと
//  - ボタンは置かない。「いま行くと、出会えるもの」の投稿が画面に出たときに、X の部品（widgets.js）を読み込む
//    （店のページを開いてすぐ閉じた人・欄まで見なかった人の分は、X に伝わらない。通信量も少なくて済む）
//  - 「もっと見る」の中は、開いたときに
//  - 設定の「お店の X の投稿を表示しない」（xOff）なら読み込まず、「X で見る」のリンクだけ
//  - dnt（追跡しないで）を付けて頼む
//  - 投稿の写真や文をこちらに取り込まない（X の画面のまま）
//  - 見たことが X に伝わることは、プライバシーポリシー第5条に書く
import { esc } from './util.js?v=0.37.9';
import { S } from './state.js?v=0.37.9';

const WIDGETS = 'https://platform.twitter.com/widgets.js';
let loading = null, io = null;
const ok = (id) => /^\d{1,20}$/.test(String(id || ''));
const urlOf = (id, u) => `https://x.com/${encodeURIComponent(u || 'i')}/status/${encodeURIComponent(id)}`;
const linkHTML = (id, u, pre = '') => `<div class="muted small xlink">${pre}<a href="${esc(urlOf(id, u))}" target="_blank" rel="noopener noreferrer">𝕏 X で見る</a></div>`;

function loadWidgets() {
  if (window.twttr && window.twttr.widgets && window.twttr.widgets.createTweet) return Promise.resolve(window.twttr);
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = WIDGETS; s.async = true; s.charset = 'utf-8';
    s.onload = () => { const t = window.twttr; if (t && t.ready) t.ready(() => res(t)); else if (t && t.widgets) res(t); else rej(new Error('no twttr')); };
    s.onerror = () => { loading = null; rej(new Error('load')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** 投稿の箱（店のページの「いま行くと、出会えるもの」の中）。画面に出たら中身を読む */
export function xBoxHTML(f) {
  if (!ok(f.x)) return '';
  return `<div class="xbox" data-x="${esc(f.x)}" data-xu="${esc(f.xu || '')}"><div class="muted small xwait">X の投稿</div></div>`;
}

async function show(box) {
  const id = box.dataset.x, u = box.dataset.xu; if (!ok(id) || box.dataset.on) return; box.dataset.on = '1';
  box.classList.add('on'); box.innerHTML = '<div class="muted small xwait">X の投稿を読み込んでいます…</div>';
  const fail = () => { if (box.isConnected) box.innerHTML = linkHTML(id, u, 'X の投稿を表示できませんでした。'); };
  try {
    const t = await loadWidgets(); if (!box.isConnected) return;
    const holder = document.createElement('div'); box.innerHTML = ''; box.appendChild(holder);
    const dark = document.documentElement.dataset.theme === 'dark';
    const el = await Promise.race([t.widgets.createTweet(id, holder, { lang: 'ja', dnt: true, conversation: 'none', theme: dark ? 'dark' : 'light', align: 'center' }), new Promise((r) => setTimeout(() => r('late'), 12000))]);
    if (!el || el === 'late') { if (!holder.querySelector('iframe')) fail(); }
  } catch (e) { fail(); }
}

/** 店のページを出したあと（と「もっと見る」を開いたあと）に呼ぶ */
export function mountX(root) {
  const boxes = [...root.querySelectorAll('.xbox[data-x]')].filter((b) => !b.dataset.on && !b.closest('.fair-more[hidden]'));
  if (!boxes.length) return;
  if (S.settings.xOff) { boxes.forEach((b) => { b.dataset.on = '1'; b.classList.add('on'); b.innerHTML = linkHTML(b.dataset.x, b.dataset.xu); }); return; } // 表示しない設定：リンクだけ
  if (!('IntersectionObserver' in window)) { boxes.forEach(show); return; }
  if (!io) io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); show(e.target); } }), { rootMargin: '150px 0px' });
  boxes.forEach((b) => io.observe(b));
}
