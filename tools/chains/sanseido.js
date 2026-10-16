// 三省堂書店：店舗情報ページ（/shop/）に全店が <table class="shoplist"> の行で入っている（支店名・住所・電話）。
// 閉店のお知らせは、その店の行の次に <tr><td colspan="3">…閉店…</td></tr> として入るので、直前の店を外す
const lib = require('./_lib');
module.exports = {
  id: 'sanseido',
  name: '三省堂書店',
  brand: /三省堂/,
  source: 'https://www.books-sanseido.co.jp/shop/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const list = [];
    const tables = lib.all(/<table class="shoplist">([\s\S]*?)<\/table>/g, html, (m) => m[1]);
    for (const t of tables) {
      const rows = lib.all(/<tr>([\s\S]*?)<\/tr>/g, t, (m) => m[1]);
      for (const r of rows) {
        const th = r.match(/<th>([\s\S]*?)<\/th>/);
        if (!th) {
          // 店の行ではない（お知らせ）。「閉店」の文字があれば直前の店を外す
          if (/閉店/.test(lib.strip(r)) && list.length) list.pop();
          continue;
        }
        const a = th[1].match(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
        const branch = lib.strip(a ? a[2] : th[1]).replace(/\n.*$/s, '').trim(); // 「特設サイト」などの付属リンクは外す
        if (!branch) continue;
        const td = r.match(/<td>([\s\S]*?)<\/td>/);
        const address = td ? lib.strip(td[1]).replace(/\n/g, ' ').trim() : '';
        list.push({ name: `三省堂書店 ${branch}`, address, url: a && a[1] ? new URL(a[1], this.source).href : '' });
      }
    }
    if (list.length < 10) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
