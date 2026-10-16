// 文真堂書店：店舗一覧ページ（/shoplist/）に全店が1ページで入っている（地区ごとの <section> の中に
//   <div class="shop-detail"><h4>文真堂書店　小出店</h4> … <dl class="shop-spec"><dt>住所</dt><dd>〒371-0037 群馬県前橋市…</dd></dl>）。座標は無い。
// 同社の書店ブランド Bookman's Academy も入れる（brand にも足してある）。アクセア（印刷・コピーの店）は書店ではないので除く。
const lib = require('./_lib');
module.exports = {
  id: 'bunshindo',
  name: '文真堂書店',
  brand: /文真堂|Bookman[’']?s\s*Academy|ブックマンズアカデミー/i,
  source: 'https://www.bunshindo.co.jp/shoplist/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const list = [];
    for (const m of lib.all(/<div class="shop-detail">\s*<h4>([\s\S]*?)<\/h4>([\s\S]*?)<\/dl>/g, html)) {
      const name = lib.strip(m[1]).replace(/\s+/g, ' ').trim();
      if (!name || /閉店/.test(name)) continue;
      if (/^アクセア/.test(name)) continue; // 印刷・コピーの店
      const address = lib.strip((m[2].match(/<dt>\s*住所\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/) || [])[1] || '').replace(/〒\s*\d{3}-?\d{4}/g, '').replace(/\s+/g, ' ').trim();
      list.push({ name, address, url: this.source });
    }
    if (list.length < 10) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
