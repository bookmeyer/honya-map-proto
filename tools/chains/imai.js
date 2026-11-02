// 今井書店（鳥取・島根）：店舗案内（/shops/）に全店が <h3>店名</h3> → 住所（〒…）→ 営業時間 の順で入っている（Elementor のつくり）。
// 同じ一覧にあるカフェ（「IAM COFFee 錦町店」）は本屋ではないので除く。座標はページに無い
const lib = require('./_lib');
module.exports = {
  id: 'imai',
  name: '今井書店',
  brand: /今井書店/,
  source: 'https://imaibooks.co.jp/shops/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const list = [];
    for (const part of html.split(/<h3[^>]*>/).slice(1)) {
      const end = part.indexOf('</h3>');
      const branch = lib.strip(part.slice(0, end)).replace(/\s+/g, ' ').trim();
      if (!/店$/.test(branch) || /COFF|カフェ|cafe/i.test(branch)) continue;
      const text = lib.strip(part.slice(end)).replace(/\s+/g, ' ');
      const m = text.match(/〒\s*\d{3}-?\d{4}\s*([^営]+?)\s*(?=営業時間|$)/);
      list.push({ name: /^今井書店/.test(branch) ? branch : `今井書店 ${branch}`, address: m ? m[1].trim() : '', url: this.source });
    }
    if (list.length < 5) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
