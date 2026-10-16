// 精文館書店：店舗一覧ページ（/shop/）に全店が1ページで入っている（県ごとの <section> の中に
//   <li><a href="店ページ"><div class="txt"><h4 class="shop_name">精文館書店 <span>豊橋本店</span></h4><p class="shop_add">住所</p></div><ul class="item_ic"><li><img alt="書籍"></li>…</ul></a></li>）。
// /shop/page/2/ というページ送りもあるが中身は同じ（2026-10-15 確認）なので 1 ページだけ取る。
// 同じ一覧に、精文館が運営する 駿河屋・HUMPTY DUMPTY（本を売らない）も並ぶので、「書籍」のアイコンがある店だけ入れる。
// 精文館が運営する TSUTAYA / TSUTAYA BOOKSTORE は本を売るので入れる（brand には合わないので、突き合わせでは「地図にない公式店」に出る）。
const lib = require('./_lib');
module.exports = {
  id: 'seibunkan',
  name: '精文館書店',
  brand: /精文館/,
  source: 'https://www.seibunkan.co.jp/shop/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const items = lib.all(/<li>\s*<a href="([^"]+)">\s*<div class="txt">\s*<h4 class="shop_name[^"]*">([\s\S]*?)<\/h4>\s*<p class="shop_add[^"]*">([\s\S]*?)<\/p>\s*<\/div>\s*<ul class="item_ic">([\s\S]*?)<\/ul>/g, html, (m) => ({
      url: m[1],
      name: lib.strip(m[2]).replace(/\s+/g, ' ').replace(/\s*[(（][^()（）]*FC[^()（）]*[)）]/g, '').trim(), // 「豊橋東店(書籍FC)」の注記は外す
      address: lib.strip(m[3]).replace(/\s+/g, ' ').trim(),
      icons: lib.all(/alt="([^"]*)"/g, m[4], (x) => x[1]),
    }));
    const list = [];
    for (const it of items) {
      if (!it.name || /閉店/.test(it.name)) continue;
      if (!it.icons.includes('書籍')) continue; // 駿河屋・HUMPTY DUMPTY など本を売らない店は除く
      list.push({ name: it.name, address: it.address, url: it.url });
    }
    if (list.length < 20) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
