// 谷島屋（静岡）：店舗一覧ページに全店（焼津谷島屋を含む）が1ページで出る。ページ送りなし
//   <h5><a href="/shop/main.php?mode=detail&article=1" title="浜松本店">浜松本店</a> <span class="catetitle">[<a …>浜松エリア</a>]</span></h5>
//   <p class="catch"><strong>〒430-0926 浜松市中央区砂山町6-1メイワン8階</strong></p>
// 住所の多くは「静岡県」が省かれているので前に足す。座標はページに無い
// （詳細ページの Google マップ埋め込みの中心は店から1km以上ずれていて使えない）。
// 病院・大学の売店（聖隷浜松病院売店など）も公式一覧にあるので、そのまま入れている。
const lib = require('./_lib');
const ZIP_RE = /〒\s*\d{3}[-‐‑‒–—－]?\d{4}/g;
module.exports = {
  id: 'yajimaya',
  name: '谷島屋',
  brand: /谷島屋/,
  source: 'https://www.yajimaya.co.jp/shop/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const items = lib.all(/<h5>\s*<a href="([^"]*mode=detail[^"]*)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/h5>\s*<p class="catch">\s*<strong>([\s\S]*?)<\/strong>/g, html,
      (m) => ({ href: m[1].replace(/&amp;/g, '&'), name: lib.strip(m[2]), area: lib.strip(m[3]).replace(/[\[\]]/g, '').trim(), addr: lib.strip(m[4]) }));
    const list = [];
    for (const it of items) {
      if (!it.name || /閉店/.test(it.name)) continue;
      let address = it.addr.replace(ZIP_RE, '').replace(/\s+/g, ' ').trim();
      if (address && !/^(北海道|東京都|京都府|大阪府|.{2,3}県)/.test(address)) address = '静岡県' + address;
      // 「焼津谷島屋登呂田店」のようにチェーン名が入っているものは、そのまま（区切りの空白だけ入れる）
      const name = /谷島屋/.test(it.name) ? it.name.replace(/谷島屋(?=\S)/, '谷島屋 ') : `谷島屋 ${it.name}`;
      list.push({ name, address, url: new URL(it.href, this.source).href, area: it.area });
    }
    if (list.length < 10) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
