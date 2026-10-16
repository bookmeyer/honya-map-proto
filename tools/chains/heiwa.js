// 平和書店（滋賀）：運営は平和堂グループの「株式会社ダイレクト・ショップ」。
// 旧ドメイン heiwashoten.co.jp は名前が解決できない（消えている）。公式の店舗一覧は directshop.jp のブランドページにある。
//   <h2 class="bold smallText">石川県</h2>
//   <div class="storeBtn"><a href="https://directshop.jp/store/10297/">…
//     <h3 class="smallText"><span>平和書店</span> <span>アル・プラザ加賀店</span></h3>
//     <p class="smallText">〒922-0423<br>石川県加賀市作見町ル25-1　アル・プラザ加賀2F</p>…</a></div>
// 住所は都道府県から入っている。座標はページに無い。
// 同社の TSUTAYA ブランドページには「平和書店 TSUTAYA 京都リサーチパーク店」が重複して載るだけなので、こちらだけ読む
const lib = require('./_lib');
const ZIP_RE = /〒\s*\d{3}[-‐‑‒–—－]?\d{4}/g;
module.exports = {
  id: 'heiwa',
  name: '平和書店',
  brand: /平和書店/,
  source: 'https://directshop.jp/brands/heiwashoten/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const blocks = html.split('<div class="storeBtn">').slice(1); // 1ブロック＝1店（次の storeBtn の手前まで）
    const list = [];
    for (const b of blocks) {
      const name = lib.strip((b.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || '').replace(/\s+/g, ' ').replace(/^平和書店(?=\S)/, '平和書店 ').trim();
      if (!/平和書店/.test(name) || /閉店/.test(name)) continue;
      const address = lib.strip((b.match(/<p class="smallText">([\s\S]*?)<\/p>/) || [])[1] || '').replace(ZIP_RE, '').replace(/\s+/g, ' ').trim();
      const url = (b.match(/<a href="([^"]+)"/) || [])[1] || '';
      list.push({ name, address, url });
    }
    if (list.length < 10) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
