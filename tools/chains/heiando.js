// 平安堂（長野県）：店舗案内（/storelist）に全店が <h2>店名</h2> → 住所・TEL・営業時間・取扱商品 の表（<dl class="list"><dt class="title">住所</dt><dt|dd class="content">…）で入っている。
// 同じ会社がフランチャイズで出している別の店（ブルーシール・シャトレーゼ・ゲオなど）も同じ一覧にあるので、取扱商品に「書籍」がある店だけを平安堂の書店とする。
// 住所に県が無い店があるので「長野県」を前に足す。座標はページに無い
const lib = require('./_lib');
module.exports = {
  id: 'heiando',
  name: '平安堂',
  brand: /平安堂/,
  source: 'https://www.heiando.co.jp/storelist',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const list = [];
    for (const part of html.split(/<h2[^>]*>/).slice(1)) {
      const branch = lib.strip(part.slice(0, part.indexOf('</h2>'))).replace(/\s+/g, ' ').trim();
      if (!/店$/.test(branch) || /外商/.test(branch)) continue;
      const field = (label) => { const m = part.match(new RegExp(`<dt class="title">\\s*${label}\\s*</dt>\\s*<d[dt] class="content">([\\s\\S]*?)</d[dt]>`)); return m ? lib.strip(m[1]).replace(/\s+/g, ' ').trim() : ''; };
      const goods = field('取扱商品');
      if (goods ? !/書籍/.test(goods) : /ブルーシール|シャトレーゼ|ゲオ|GEO/i.test(branch)) continue; // 本を扱わない店は除く
      let address = field('住所').replace(/〒\s*\d{3}-?\d{4}/, '').trim();
      if (address && !lib.prefOfAddress(address)) address = '長野県' + address;
      list.push({ name: /^平安堂/.test(branch) ? branch : `平安堂 ${branch}`, address, url: this.source });
    }
    if (list.length < 5) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
