// ブックファースト：店舗一覧ページ（/shop/）に、ブランドごと（<p class="lf_tit">ブックファースト／アバンティブックセンター／アミーゴ書店／その他</p>）に
//   店名（<a href="店ページ.html"><span class="lf_txt">新宿店</span></a>）が並ぶ。3ブランドとも同じ会社（株式会社ブックファースト）の書店なので全部入れる（brand にも足してある）。
// 住所は一覧にも店ページにも無い（店ページの「場所」はビル名だけ）。店ページに Google マップの埋め込み（…!2d<経度>!3d<緯度>…）があるので、座標をそこから取る。
//   店ページの見出し（<span class="lf_shop_tit">ブックファースト 新宿店</span>）が公式の店名。店ページは 50 枚ほど（1 回の確認で 50 回ほど取る）。
const lib = require('./_lib');
module.exports = {
  id: 'book1st',
  name: 'ブックファースト',
  brand: /ブックファースト|Book ?1st|アバンティ\s*ブックセンター|アミーゴ書店/i,
  source: 'https://www.book1st.net/shop/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const body = html.slice(Math.max(0, html.indexOf('lf_sec_body')));
    const list = [];
    let brand = '';
    for (const m of lib.all(/<p[^>]*class="lf_tit[^"]*"[^>]*>([\s\S]*?)<\/p>|<a href="([^"]*\/shop\/[^"]+\.html)">\s*<span class="lf_txt[^"]*">([\s\S]*?)<\/span>/g, body)) {
      if (m[1] !== undefined) { brand = lib.strip(m[1]).replace(/\s+/g, ' ').trim(); continue; }
      const branch = lib.strip(m[3]).replace(/\s+/g, ' ').trim();
      if (!branch || /閉店/.test(branch)) continue;
      const url = new URL(m[2], this.source).href;
      const item = { name: `${brand && brand !== 'その他' ? brand : 'ブックファースト'} ${branch}`, address: '', url };
      try {
        const page = await lib.get(url);
        const tit = lib.strip((page.match(/class="lf_shop_tit">([\s\S]*?)<\/span>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
        if (tit) item.name = tit;
        const g = page.match(/google\.com\/maps\/embed\?pb=[^"']*?!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
        if (g) { item.lon = +g[1]; item.lat = +g[2]; }
      } catch (e) { /* 店ページが取れなくても、一覧の名前だけで入れる */ }
      list.push(item);
    }
    if (list.length < 20) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
