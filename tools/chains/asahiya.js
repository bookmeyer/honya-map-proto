// 旭屋書店（西日本＝旭屋書店、東日本＝東京旭屋書店。同じ表に続けて入っている）
//   <tr><td>大阪府</td><td><a href="…/shop/umeda-tikagai/">梅田地下街店</a>
//       〒530-0057 大阪市北区曽根崎２丁目 梅田地下街５－２
//       TEL : 06-6312-0877<br><a href="…">なんばCITY店</a> 〒… TEL : …</td></tr>
// 閉店した店（イオン洛南店）は HTML コメントで残っているので、先にコメントを消す。
// 屋号を「紀伊國屋書店」に変えた店（池袋店・ららぽーと甲子園店）も旭屋の公式一覧に載っているので、公式表記のまま入れる。
// 大阪の住所は「大阪府」が無いので県の列から足す。座標はページに無い
const lib = require('./_lib');
const ZIP_RE = /〒\s*\d{3}[-‐‑‒–—－]?\d{4}/g;
module.exports = {
  id: 'asahiya',
  name: '旭屋書店',
  brand: /旭屋/,
  source: 'https://www.asahiya.com/shop/',
  complete: true,
  async fetch() {
    const html = (await lib.get(this.source)).replace(/<!--[\s\S]*?-->/g, '');
    const rows = lib.all(/<tr>([\s\S]*?)<\/tr>/g, html, (m) => m[1]);
    const list = [];
    for (const r of rows) {
      const tds = lib.all(/<td[^>]*>([\s\S]*?)<\/td>/g, r, (m) => m[1]);
      if (tds.length < 2) continue;
      const pref = lib.strip(tds[0]);
      if (!lib.prefOfAddress(pref)) continue;
      const stores = lib.all(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=TEL|<a |$)/g, tds[1], (m) => ({ url: m[1], name: lib.strip(m[2]).replace(/\s+/g, ' ').trim(), addr: lib.strip(m[3]) }));
      for (const s of stores) {
        if (!s.name || /閉店/.test(s.name)) continue;
        let address = s.addr.replace(ZIP_RE, '').replace(/\s+/g, ' ').trim();
        if (address && !/^(北海道|東京都|京都府|大阪府|.{2,3}県)/.test(address)) address = pref + address;
        const name = /書店/.test(s.name) ? s.name.replace(/書店(?=\S)/, '書店 ') : `旭屋書店 ${s.name}`;
        list.push({ name, address, url: new URL(s.url, this.source).href });
      }
    }
    if (list.length < 5) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
