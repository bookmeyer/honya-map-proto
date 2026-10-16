// ヴィレッジヴァンガード：店舗一覧ページ（/shop-list/）が「現在地から探す」で読み込む JSON
// （/common/js/shop_data.json）に全店が入っている（名前・住所・座標・店ページのリンク）。取得は1回
// 一覧には「ヴィレッジヴァンガード」のほか、系列の「newstyle」「ヴィンテージヴァンガード」「…アウトレット」も含まれる（tags に印をつける）
const lib = require('./_lib');
module.exports = {
  id: 'villagevanguard',
  name: 'ヴィレッジヴァンガード',
  brand: /ヴィレッジヴァンガード|Village Vanguard|ヴィンテージヴァンガード/i,
  source: 'https://www.village-v.co.jp/shop-list/',
  complete: true,
  async fetch() {
    const data = await lib.json('https://www.village-v.co.jp/common/js/shop_data.json');
    if (!Array.isArray(data)) throw new Error('JSONの形が変わった（配列ではない）');
    const list = [];
    for (const s of data) {
      const name = lib.strip(s.name || '').replace(/\s+/g, ' ').trim();
      if (!name || /閉店/.test(name)) continue;
      // 住所は「〒158-0094　東京都…」の形なので、郵便番号を外して都道府県から始める
      const address = lib.strip(s.address || '').replace(/〒\s*\d{3}-?\d{4}/g, '').replace(/[\s　]+/g, ' ').trim();
      const lat = +s.lat, lon = +s.lng;
      const tags = [];
      if (/^newstyle/i.test(name)) tags.push('newstyle');
      if (/ヴィンテージヴァンガード/.test(name)) tags.push('ヴィンテージヴァンガード');
      if (/アウトレット|OUTLET/i.test(name)) tags.push('アウトレット');
      if (s.taxfree) tags.push('免税');
      const o = { name, address, url: s.link ? new URL(s.link, 'https://www.village-v.co.jp/').href : '', tags };
      if (isFinite(lat) && isFinite(lon) && lat > 20 && lat < 46 && lon > 122 && lon < 154) { o.lat = lat; o.lon = lon; }
      list.push(o);
    }
    if (list.length < 100) throw new Error(`店舗が少なすぎる（${list.length}件）。JSONの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
