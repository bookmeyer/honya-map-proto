// くまざわ書店：店舗一覧ページ（1枚・全国）に全店が <table class="table-shop-list"> の行で入っている。
// 行＝店名（<td class="table-shop-list_title">）・〒／住所／建物／電話（<td class="table-shop-list_address">）・取り扱い品目（<td class="table-shop-list_handling">）。
// 同社の屋号（いけだ書店・ACADEMIA・浜書房・球陽堂書房・田園書房）も同じ表に入る。文具だけの店（K's paperie／ケイズパペリエ）と閉店の店は除く。座標は無い
const lib = require('./_lib');
const PREF_HEAD = { 北海道: '北海道', 埼玉: '埼玉県', 千葉: '千葉県', 神奈川: '神奈川県', 東京23区: '東京都', 東京都下: '東京都', 愛知: '愛知県', 福岡: '福岡県', 沖縄: '沖縄県' };
module.exports = {
  id: 'kumazawa',
  name: 'くまざわ書店',
  brand: /くまざわ|クマザワ|熊沢書店|Kumazawa|ACADEMIA|アカデミア|いけだ書店|浜書房|球陽堂|田園書房/i,
  source: 'https://www.kumabook.com/shop/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const list = [];
    // 地域の見出し（<h2 id="北海道">）ごとに区切る。見出しが県名のときは、住所に県が無い行の補いに使う
    const sections = html.split(/<h2 id="([^"]*)"[^>]*>/).slice(1);
    for (let i = 0; i < sections.length; i += 2) {
      const head = lib.strip(sections[i]);
      const rows = lib.all(/<tr>\s*<td class="table-shop-list_title">([\s\S]*?)<\/tr>/g, sections[i + 1] || '', (m) => m[0]);
      for (const r of rows) {
        let name = lib.strip((r.match(/table-shop-list_title">\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
        if (!name || /閉店/.test(name)) continue; // 「【2026年9月6日閉店】…」は除く
        name = name.replace(/【[^】]*】/g, '').replace(/\s+\d{1,2}\/\d{1,2}\S*.*$/, '').replace(/\s+/g, ' ').trim(); // 「7/18グランドオープン」などの注記を外す
        const handling = lib.strip((r.match(/table-shop-list_handling[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '');
        if (handling && !/書籍/.test(handling)) continue; // 文具だけの店は除く
        const addrHtml = ((r.match(/class="table-shop-list_address">([\s\S]*?)<\/td>/) || [])[1] || '').replace(/<a class="btn[\s\S]*?<\/a>/g, '');
        const lines = lib.strip(addrHtml).split('\n').map((s) => s.trim()).filter(Boolean);
        let address = lines.find((s) => lib.prefOfAddress(s) && !/^〒/.test(s)) || (lines[0] && /^〒/.test(lines[0]) ? lines[1] : lines[0]) || '';
        if (/^〒|^\d{2,4}-\d{2,4}-\d{3,4}/.test(address)) address = '';
        if (address && !lib.prefOfAddress(address) && PREF_HEAD[head]) address = PREF_HEAD[head] + address; // 「草加市…」→「埼玉県草加市…」
        const href = (r.match(/<a href="([^"]+)"/) || [])[1] || '';
        list.push({ name, address, url: href ? new URL(href, this.source).href : '' });
      }
    }
    if (list.length < 50) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
