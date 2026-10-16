// フタバ図書：店舗一覧ページ（/store-list）に全店が1ページで入っている
//   （<a href="/h1" id="searchStore"><span>フタバ図書TSUTAYA</span> TERA広島府中店</a> のあとの <div class="shopInfo"><table> に <td id="searchAddress">住所</td> と、売り物のアイコン画像）。座標は無い。
// 閉店した店は HTML コメント（<!-- … -->）で隠されたまま残っているので、コメントを外してから読む。名前に「閉店」が付いたものも除く。
// 同じ一覧に タリーズコーヒー・HYPER FIT 24（ジム）・ローソン・ギガステーション（カードとゲームの店）も並ぶので、
// 名前が「フタバ図書」で始まり、「本」のアイコン（icon-book）がある店だけ入れる。
const lib = require('./_lib');
module.exports = {
  id: 'futaba',
  name: 'フタバ図書',
  brand: /フタバ図書/,
  source: 'https://www.futabatosho.co.jp/store-list',
  complete: true,
  async fetch() {
    const html = (await lib.get(this.source)).replace(/<!--[\s\S]*?-->/g, '');
    const items = lib.all(/<a href="([^"]*)" id="searchStore"[^>]*>([\s\S]*?)<\/a>\s*<div class="shopInfo[^"]*">([\s\S]*?)<\/table>/g, html, (m) => ({
      href: m[1],
      name: lib.strip(m[2]).replace(/\s+/g, ' ').replace(/[\s_＿]+$/g, '').trim(), // 「TERA広島府中店_」の末尾の記号は外す
      info: m[3],
    }));
    const list = [];
    for (const it of items) {
      if (!/^フタバ図書/.test(it.name)) continue; // タリーズ・ジム・ローソンを除く
      if (/閉店/.test(it.name)) continue;
      if (!/icon-book(-new)?-bg/.test(it.info)) continue; // 新刊の本を売らない店（カードだけ等）を除く
      const address = lib.strip((it.info.match(/id="searchAddress">([\s\S]*?)<\/td>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
      let url = '';
      try { url = it.href ? new URL(it.href, this.source).href : ''; } catch (e) { url = ''; }
      list.push({ name: it.name, address, url });
    }
    if (list.length < 8) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
