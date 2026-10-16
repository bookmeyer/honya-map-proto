// 紀伊國屋書店：店舗一覧ページに全店が <li class="store-item … kinokuniya-store" data-lat data-lon data-name> で入っている（座標つき）
const lib = require('./_lib');
module.exports = {
  id: 'kinokuniya',
  name: '紀伊國屋書店',
  brand: /紀伊國屋|紀伊国屋|Kinokuniya/i,
  source: 'https://store.kinokuniya.co.jp/store/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const items = lib.all(/<li class="([^"]*store-item[^"]*)"([^>]*)>([\s\S]*?)<\/li>/g, html, (m) => ({ cls: m[1], attrs: m[2], inner: m[3] }));
    const list = [];
    for (const it of items) {
      if (!/kinokuniya-store/.test(it.cls)) continue; // ホール・フォーラムなどは除く
      const attr = (k) => { const m = it.attrs.match(new RegExp(k + '="([^"]*)"')); return m ? m[1] : ''; };
      const branch = lib.strip(attr('data-name') || (it.inner.match(/class="name">([^<]*)</) || [])[1] || '');
      if (!branch) continue;
      const href = (it.inner.match(/href="([^"]+)"/) || [])[1] || '';
      list.push({ name: `紀伊國屋書店 ${branch}`, address: '', lat: +attr('data-lat') || undefined, lon: +attr('data-lon') || undefined, url: href ? new URL(href, this.source).href : '' });
    }
    if (list.length < 20) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
