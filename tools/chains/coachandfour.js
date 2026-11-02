// コーチャンフォー（株式会社リラィアブル：北海道・東京・茨城）：店舗一覧（/shoplist/）に全店が <section> で入っている
//   <h2><a href="https://www.coachandfour-tsukuba.jp/">[コーチャンフォーつくば店 茨城]</a></h2> … <p class="address">〒305-0816 茨城県つくば市学園の森3丁目50-7</p>
// 見出しの「 茨城」「 札幌」などは地域の注記なので外す。北海道の店は住所に道が無いので「北海道」を前に足す。
// 同じ会社の「リラィアブルブックス」（釧路・根室）も同じ一覧にあるので、いっしょに見る。閉店した店は HTML のコメントの中にあるので、先にコメントを外す
const lib = require('./_lib');
module.exports = {
  id: 'coachandfour',
  name: 'コーチャンフォー',
  brand: /コーチャンフォー|リラィアブル/,
  source: 'https://www.coachandfour.ne.jp/shoplist/',
  complete: true,
  async fetch() {
    const html = (await lib.get(this.source)).replace(/<!--[\s\S]*?-->/g, '');
    const list = [];
    for (const sec of html.split('<section').slice(1)) {
      const h = sec.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
      if (!h) continue;
      const name = lib.strip(h[1]).replace(/[[\]［］]/g, '').replace(/\s+/g, ' ').trim().replace(/\s+(東京|茨城|札幌|釧路|旭川|北見|根室)$/, '');
      if (!/店$/.test(name) || /閉店/.test(lib.strip(sec))) continue;
      let address = lib.strip((sec.match(/<p class="address">([\s\S]*?)<\/p>/) || [])[1] || '').replace(/〒\s*\d{3}-?\d{4}/, '').replace(/\s+/g, ' ').trim();
      if (address && !lib.prefOfAddress(address)) address = '北海道' + address;
      const url = (h[1].match(/href="([^"]+)"/) || [])[1] || this.source;
      list.push({ name, address, url });
    }
    if (list.length < 5) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
