// 窓口（v0.37.0・サーバー 1.14.0）：書店・図書館の参加の申し込みと、お問い合わせ・ご要望
// 11/24 ぶっくまさん「参加希望の書店さんをアプリから募集したい」「その他問い合わせ、要望窓口を入れたい（ユーザーやメディア）」「すべておすすめのとおりで」
// アプリ（設定・店のページ）と、アプリの外のページ（join.html・contact.html）の両方で使う。DOM の部品はここだけで閉じる
// 送るもの：種類・店・お立場・名前（任意）・メール・内容。不具合のときだけアプリの版とスマホの種類（外せる）。端末の番号は「送った記録を消してほしい」のときだけ
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const q = (s, el) => el.querySelector(s);
const qa = (s, el) => [...el.querySelectorAll(s)];

export const CONTACT_KINDS = [
  ['q', '使い方の質問'], ['bug', '不具合'], ['idea', 'こんな機能がほしい'], ['media', '取材・メディア'],
  ['shop', 'お店の方から（のせないでほしい、など）'], ['delete', '送った記録を消してほしい'], ['other', 'そのほか'],
];
const NEED_MAIL = ['media', 'shop', 'delete'];
const ROLES = [['staff', '店長・店員'], ['hq', '本部・チェーンの担当'], ['lib', '図書館の方'], ['other', 'そのほか']];
const WANTS = [['x', 'Xの #本めぐり を自動で表示'], ['pick', '書店員さんの1冊'], ['fair', 'いまのフェア'], ['shelf', '売場の写真']]; // X を先頭に（v0.37.5。11/24 ぶっくまさん「Xの投稿を自動表示をうりにしたい」）
const ERR = {
  limit: 'きょうは、これ以上送れません。あしたまた送ってください',
  email: 'メールアドレスの形を確かめてください',
  join: 'お店・お立場・お約束のチェックを確かめてください',
  x: 'Xのアカウントは「@」のあとの英数字（例：@meguri_books）か、x.com のアドレスで入れてください',
  addr: '地図にないお店は、住所も入れてください',
  media: '会社名と媒体名を入れてください',
  body: '内容を書いてください',
  net: '送れませんでした。電波のよいところで、もう一度押してください',
};
const THANKS = {
  join: 'お申し込みを受け付けました。運営から、お店の受付ページのURLをメールでお送りします（数日かかることがあります）。届かないときは、迷惑メールのフォルダもご覧ください。',
  idea: 'ありがとうございます。返事はしませんが、届いたものはすべて読んで、これからの本めぐりづくりに使います。',
  media: 'お問い合わせを受け付けました。運営から、メールでお返事します。',
  shop: 'お問い合わせを受け付けました。運営から、メールでお返事します。',
  delete: '受け付けました。消したら、メールでお知らせします。',
  other: 'お問い合わせを受け付けました。メールを書いていただいた方には、運営からお返事します。',
};

/** スマホの種類とブラウザ（不具合のときだけ。チェックを外すと送らない） */
export function envText() {
  const u = navigator.userAgent || '';
  const os = /iPhone/.test(u) ? 'iPhone' : /iPad|Macintosh.*Mobile/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : 'そのほか';
  const br = /Line\//i.test(u) ? 'LINEの中' : /Instagram/i.test(u) ? 'Instagramの中' : /FBAN|FBAV/.test(u) ? 'Facebookの中' : /\bX\/|Twitter/i.test(u) ? 'Xの中' : /EdgA?\//.test(u) ? 'Edge' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /FxiOS|Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'そのほか';
  const pwa = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone ? '・ホーム画面' : '';
  return `${os}・${br}${pwa}`;
}

const hp = '<div class="ib-hp" aria-hidden="true"><label>この欄は空のままにしてください<input type="text" name="hp" tabindex="-1" autocomplete="off"></label></div>';
const storePicker = (o, label, required) => `<div class="field ib-store"><label>${label}${required ? '' : '（任意）'}</label>
  <div class="ib-chosen"${o.store ? '' : ' hidden'}><b class="ib-chosen-n">${o.store ? esc(o.store.n) : ''}</b> <button type="button" class="btn ghost small ib-change">別のお店にする</button></div>
  <div class="ib-find"${o.store ? ' hidden' : ''}><input type="search" class="ib-q" maxlength="40" placeholder="お店の名前でさがす（例：○○書店 駅前店）" enterkeyhint="search" autocomplete="off"><div class="ib-list" role="list"></div>
  ${required ? '<label class="chk"><input type="checkbox" class="ib-nomap"> 地図にないお店です</label><div class="ib-new" hidden><input type="text" class="ib-nn" maxlength="80" placeholder="お店の名前"><input type="text" class="ib-na" maxlength="120" placeholder="住所（例：東京都千代田区神田神保町1-1）" style="margin-top:6px"></div>' : ''}</div></div>`;

/** 参加の申し込み */
export function joinHTML(o = {}) {
  const pw = o.store && o.store.lib ? '図書館' : 'お店';
  return `<form class="ib-form" novalidate>
  <div class="ib-sell"><b>Xに「#本めぐり」をつけて投稿するだけ。</b><span>${pw}のXの投稿が、本めぐりの${pw}のページに自動で並びます。新しい作業はいりません。ふだんの投稿にタグをひとつ足すだけです。</span></div>
  <p class="muted small">ほかに「書店員さんの1冊」「いまのフェア」「売場の写真」ものせられます。<b>費用はかかりません。</b>お申し込みのあと、運営から受付ページのURLをメールでお送りします。</p>
  ${storePicker(o, 'お店・図書館', true)}
  <div class="field"><label>お立場</label>${ROLES.map(([k, t], i) => `<label class="chk"><input type="radio" name="role" value="${k}"${(o.store && o.store.lib ? k === 'lib' : i === 0) ? ' checked' : ''}> ${t}</label>`).join('')}</div>
  <div class="field"><label>ご連絡先のメール</label><input type="email" name="email" maxlength="120" autocomplete="email" inputmode="email" placeholder="受付ページのURLをお送りします"></div>
  <div class="field"><label>お名前（任意・ニックネームでも）</label><input type="text" name="name" maxlength="40" autocomplete="name"></div>
  <div class="field ib-x"><label>${pw}のXのアカウント（任意）</label><input type="text" name="x" maxlength="100" placeholder="@meguri_books または https://x.com/…" autocomplete="off" spellcheck="false" autocapitalize="off">
    <label class="chk"><input type="checkbox" name="xon"> <span>「#本めぐり」をつけた${pw}の投稿を、本めぐりの${pw}のページに載せてよい<br><span class="muted small">載るのは、このアカウントの投稿だけです。Xの画面のまま（埋め込み）で、投稿から4週間出ます。あとから止められます</span></span></label></div>
  <div class="field"><label>やってみたいこと（任意・いくつでも）</label>${WANTS.map(([k, t]) => `<label class="chk"><input type="checkbox" name="wants" value="${k}"> ${t}</label>`).join('')}</div>
  <div class="field"><label>ひとこと（任意・200字まで）</label><textarea name="body" maxlength="200" rows="3"></textarea></div>
  <label class="chk"><input type="checkbox" name="agree"> <span><a href="terms.html" target="_blank" rel="noopener">利用規約</a>の「お店の方への約束」を読みました</span></label>
  ${hp}
  <div class="ib-err muted small" role="alert"></div>
  <div class="actions"><button type="submit" class="btn primary ib-send">申し込む</button>${o.cancel ? '<button type="button" class="btn ghost ib-cancel">やめる</button>' : ''}</div>
  <p class="muted small">いただいたお名前とメールアドレスは、参加の手続きと、本めぐりや本をつなぐ株式会社の企画で続けてご一緒するときのご連絡に使います（<a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>）。</p>
</form>`;
}

/** お問い合わせ・ご要望 */
export function contactHTML(o = {}) {
  const k0 = CONTACT_KINDS.some(([k]) => k === o.kind) ? o.kind : 'q';
  return `<form class="ib-form" novalidate>
  <div class="field"><label>どんなことですか</label><select name="kind">${CONTACT_KINDS.map(([k, t]) => `<option value="${k}"${k === k0 ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
  <div class="ib-k ib-k-idea muted small" hidden>返事はしませんが、届いたものはすべて読んでいます。お名前もメールもなしで送れます。</div>
  <div class="ib-k ib-k-media" hidden>
    <div class="field"><label>会社名</label><input type="text" name="org" maxlength="80" autocomplete="organization"></div>
    <div class="field"><label>媒体名（番組・雑誌・サイトなど）</label><input type="text" name="media" maxlength="80"></div>
    <div class="field"><label>締め切り（任意）</label><input type="text" name="deadline" maxlength="40" placeholder="例：12月10日"></div>
  </div>
  <div class="ib-k ib-k-shop" hidden>${storePicker(o, 'どのお店のことですか', false)}</div>
  <div class="ib-k ib-k-delete" hidden><div class="field"><label>端末の番号</label><input type="text" name="device" maxlength="36" value="${esc(o.device || '')}" placeholder="設定の「端末の番号」（例：1a2b3c4d-…）" autocomplete="off" spellcheck="false"><div class="muted small">本めぐりの設定のいちばん下に出ている番号です。この番号の記録を消します。</div></div></div>
  <div class="ib-k ib-k-bug" hidden><div class="muted small">どの画面で、何をしたら、どうなったかを、文で教えてください。スクリーンショット（画面の写真）は送れません。</div><label class="chk"><input type="checkbox" name="env" checked> <span>アプリの版とスマホの種類を一緒に送る<br><span class="muted small">${o.ver ? 'v' + esc(o.ver) + '・' : ''}${esc(envText())}</span></span></label></div>
  <div class="field"><label>内容（1,000字まで）</label><textarea name="body" maxlength="1000" rows="5"></textarea></div>
  <div class="field"><label>お名前（任意）</label><input type="text" name="name" maxlength="40" autocomplete="name"></div>
  <div class="field"><label class="ib-mail-l">メール</label><input type="email" name="email" maxlength="120" autocomplete="email" inputmode="email"></div>
  ${hp}
  <div class="ib-err muted small" role="alert"></div>
  <div class="actions"><button type="submit" class="btn primary ib-send">送る</button>${o.cancel ? '<button type="button" class="btn ghost ib-cancel">やめる</button>' : ''}</div>
  <p class="muted small">いただいたお名前とメールアドレスは、お返事にだけ使います（<a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>）。</p>
</form>`;
}

function bindStore(f, o) {
  const box = q('.ib-store', f); if (!box) return () => null;
  let chosen = o.store ? { i: o.store.i, n: o.store.n } : null;
  const list = q('.ib-list', box), input = q('.ib-q', box), nomap = q('.ib-nomap', box), nw = q('.ib-new', box);
  const show = () => { q('.ib-chosen', box).hidden = !chosen; q('.ib-find', box).hidden = !!chosen; if (chosen) q('.ib-chosen-n', box).textContent = chosen.n; };
  q('.ib-change', box).onclick = () => { chosen = null; show(); input.value = ''; list.innerHTML = ''; input.focus(); };
  let t = 0;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => {
    const w = input.value.trim(); if (w.length < 2 || !o.search) { list.innerHTML = ''; return; }
    const hits = (await o.search(w)).slice(0, 8);
    list.innerHTML = hits.length ? hits.map((s, k) => `<button type="button" class="ib-hit" data-k="${k}" role="listitem"><b>${esc(s.n)}</b><span class="muted small">${esc(s.a || '')}</span></button>`).join('') : '<div class="muted small">見つかりません。名前を短くするか、「地図にないお店です」を選んでください</div>';
    qa('.ib-hit', list).forEach((b) => { b.onclick = () => { const s = hits[+b.dataset.k]; chosen = { i: s.i, n: s.n }; if (nomap) { nomap.checked = false; nw.hidden = true; } show(); }; });
  }, 200); });
  if (nomap) nomap.onchange = () => { nw.hidden = !nomap.checked; if (nomap.checked) { list.innerHTML = ''; input.value = ''; } };
  return () => chosen ? { store: chosen.i, store_name: chosen.n } : nomap && nomap.checked ? { store: '', store_name: q('.ib-nn', box).value.trim(), store_addr: q('.ib-na', box).value.trim() } : null;
}

/** フォームを動かす。o：{ api, ver, store:{i,n,lib}, search(q)→Promise<[{i,n,a}]>, device, kind, cancel, onDone(kind), onCancel } */
export function mountInbox(root, mode, o = {}) {
  root.innerHTML = mode === 'join' ? joinHTML(o) : contactHTML(o);
  const f = q('form', root), err = q('.ib-err', f), btn = q('.ib-send', f);
  const storeOf = bindStore(f, o);
  const kindSel = q('select[name=kind]', f);
  const syncKind = () => { if (!kindSel) return; const k = kindSel.value; qa('.ib-k', f).forEach((d) => { d.hidden = !d.classList.contains('ib-k-' + k); }); q('.ib-mail-l', f).textContent = NEED_MAIL.includes(k) ? 'メール（お返事に使います）' : k === 'idea' ? 'メール（任意）' : 'メール（任意・お返事が要るときは入れてください）'; };
  if (kindSel) { kindSel.onchange = syncKind; syncKind(); }
  const cancel = q('.ib-cancel', f); if (cancel) cancel.onclick = () => o.onCancel && o.onCancel();
  const fail = (k) => { err.textContent = ERR[k] || ERR.net; err.classList.add('on'); err.scrollIntoView({ block: 'nearest' }); };
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = ''; err.classList.remove('on');
    const v = (n) => { const el = f.elements[n]; return el ? String(el.value || '').trim() : ''; };
    const email = v('email'); const body = { hp: v('hp'), name: v('name'), email, ver: '' }; // 版は、不具合で「一緒に送る」を選んだときだけ
    if (email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(email)) return fail('email');
    if (mode === 'join') {
      const s = storeOf(); if (!s || !s.store_name) return fail('join'); if (!s.store && !s.store_addr) return fail('addr');
      if (!email) return fail('email'); if (!f.elements.agree.checked) return fail('join');
      const xr = v('x'); if (xr && !/^(@?[A-Za-z0-9_]{1,15}|https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/@?[A-Za-z0-9_]{1,15}([/?].*)?)$/.test(xr)) return fail('x');
      Object.assign(body, s, { kind: 'join', role: (q('input[name=role]:checked', f) || {}).value || 'staff', wants: qa('input[name=wants]:checked', f).map((x) => x.value), body: v('body'), agree: true });
      if (xr) Object.assign(body, { x: xr, xon: f.elements.xon.checked });
    } else {
      const k = kindSel.value; Object.assign(body, { kind: k, body: v('body') });
      if (!body.body) return fail('body'); if (NEED_MAIL.includes(k) && !email) return fail('email');
      if (k === 'media') { Object.assign(body, { org: v('org'), media: v('media'), deadline: v('deadline') }); if (!body.org || !body.media) return fail('media'); }
      if (k === 'shop') Object.assign(body, storeOf() || {});
      if (k === 'delete') body.device = v('device');
      if (k === 'bug' && f.elements.env.checked) { body.env = envText(); body.ver = o.ver || ''; }
    }
    btn.disabled = true; btn.textContent = '送っています…';
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(new URL('inbox.php', o.api).toString(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), cache: 'no-store', signal: ctl.signal }); clearTimeout(tm);
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { btn.disabled = false; btn.textContent = mode === 'join' ? '申し込む' : '送る'; return fail(j.error); }
      const k = mode === 'join' ? 'join' : body.kind;
      root.innerHTML = `<div class="ib-done"><b>${k === 'idea' ? '届きました' : '受け付けました'}</b><p>${THANKS[k] || THANKS.other}</p></div>`;
      if (o.onDone) o.onDone(k);
    } catch (e2) { btn.disabled = false; btn.textContent = mode === 'join' ? '申し込む' : '送る'; fail('net'); }
  };
  return f;
}
