// 大垣書店：店舗一覧ページ（/stores）は地図プラグイン（WP Google Maps）で地図に出すだけで、HTML に店の文字が無い。そこで、
//   ① WordPress の REST API で「店舗一覧」ページ（id 3927）の子ページ＝各店のページを取る（店名・URL。いま載っている店の正）
//   ② 地図プラグインの REST API（map_id 1 のマーカー）で住所と座標を取り、①に店ページの URL で結びつける
//      （住所欄が座標だけのマーカーは、説明欄（description）に 〒付きの住所が入っている）
//   ③ マーカーの無い店（新店）は、店のページを 1 枚取って「住所」の段から読む（座標は無し）
// 本社オフィス・外商部・京都文化博物館ミュージアムショップ・グループ会社のブックスタマ（外部サイトへのリンク）は、書店の一覧から外す。
// 住所は「京都市…」のように都道府県が無いものが多いので、頭に足す。
const lib = require('./_lib');
const BASE = 'https://www.books-ogaki.co.jp/';
const CITY_PREF = { 京都市: '京都府', 亀岡市: '京都府', 大津市: '滋賀県', 岐阜市: '岐阜県', 広島市: '広島県', 札幌市: '北海道', 神戸市: '兵庫県', 堺市: '大阪府', 高槻市: '大阪府', 豊中市: '大阪府', 狭山市: '埼玉県', 富士宮市: '静岡県' };
function withPref(a) {
  a = String(a || '').trim();
  if (!a || /^(北海道|東京都|京都府|大阪府|[^\s\d]{2,3}県)/.test(a)) return a;
  for (const c of Object.keys(CITY_PREF)) if (a.startsWith(c)) return CITY_PREF[c] + a;
  return a;
}
const slugOf = (u) => { const m = String(u || '').match(/\/stores\/([^/?#]+)/); return m ? decodeURIComponent(m[1]).toLowerCase() : ''; };
module.exports = {
  id: 'ogaki',
  name: '大垣書店',
  brand: /大垣書店/,
  source: 'https://www.books-ogaki.co.jp/stores',
  complete: true,
  async fetch() {
    // ① 店ページの一覧
    const pages = await lib.json(BASE + 'wp-json/wp/v2/pages?parent=3927&per_page=100&_fields=id,title,link');
    if (!Array.isArray(pages) || pages.length < 10) throw new Error(`店舗ページが少なすぎる（${Array.isArray(pages) ? pages.length : '?'}件）。REST API の作りが変わったかもしれない`);
    // ② 地図のマーカー（住所・座標）
    let markers = [];
    try { const j = await lib.json(BASE + 'wp-json/wpgmza/v1/markers?filter=' + encodeURIComponent('{"map_id":1}')); markers = Array.isArray(j) ? j : (j && Array.isArray(j.markers) ? j.markers : []); } catch (e) { markers = []; }
    const bySlug = new Map();
    for (const mk of markers) { const s = slugOf(mk.link); if (s && !bySlug.has(s)) bySlug.set(s, mk); }
    const list = [];
    for (const p of pages) {
      const title = lib.strip((p.title && p.title.rendered) || '').replace(/\s+/g, ' ').trim();
      const link = String(p.link || '');
      if (!title || !/books-ogaki\.co\.jp\/stores\//.test(link)) continue; // ブックスタマなど外部サイトの店は除く
      if (/閉店|ミュージアムショップ|本社|外商/.test(title)) continue;
      const mk = bySlug.get(slugOf(link));
      let address = '', lat, lon;
      if (mk) {
        lat = +mk.lat; lon = +mk.lng;
        address = String(mk.address || '').trim();
        if (!address || /^[\d.\s,、]+$/.test(address)) address = lib.strip(mk.description || '').replace(/\n/g, ' '); // 住所欄が座標だけのとき
      } else {
        // ③ 店ページから「住所」の段を読む
        try {
          const html = await lib.get(link);
          const m = html.match(/住所\s*(?:<br\s*\/?>)?\s*([\s\S]{0,400}?)<\/p>/);
          if (m) address = lib.strip(m[1]).replace(/\n/g, ' ');
          if (!/〒|[都道府県市区町村]/.test(address)) address = '';
        } catch (e) { address = ''; }
      }
      address = withPref(address.replace(/〒\s*\d{3}-?\d{4}/g, '').replace(/\s+/g, ' ').trim());
      list.push({ name: `大垣書店 ${title}`, address, lat: isFinite(lat) ? lat : undefined, lon: isFinite(lon) ? lon : undefined, url: link });
    }
    if (list.length < 15) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
