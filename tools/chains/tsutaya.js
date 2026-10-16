// TSUTAYA／蔦屋書店（CCC）：公式の店舗検索 /store/search/result は条件なしで全店（2026-10 時点 605件）を10件ずつ出す。
// 一括の JSON・sitemap は見当たらない（tsutaya.tsite.jp の sitemap は記事だけ）。1ページの件数は変えられない。
// そこで「販売：本」（u=6_1）と「中古販売：本」（u=22_1）の条件で絞った結果だけを読む＝本を売っている店だけ（レンタル・ゲーム専門などは入らない）。
// 取得は 2026-10 時点で 53＋2＝約55回。各行＝店名（<a class="store_name">）＋「都道府県&nbsp;市区町村以下」。座標は一覧に無い。
// 他チェーンの複合店（フタバ図書TSUTAYA・明屋書店・精文館・WonderGOO・平和書店・宮脇書店）は別の部品で扱うので、ここでも一覧から外し、
// 地図データ側も exclude で外す。
const lib = require('./_lib');
const BASE = 'https://store-tsutaya.tsite.jp/store/search/result';
const FILTERS = ['u=' + encodeURIComponent('6_1'), 'u=' + encodeURIComponent('22_1')]; // 販売：本／中古販売：本
const PER_PAGE = 10;
module.exports = {
  id: 'tsutaya',
  name: 'TSUTAYA／蔦屋書店',
  brand: /TSUTAYA|ツタヤ|蔦屋|Tsutaya/i,
  exclude: /フタバ図書|明屋|精文館|WonderGOO|平和書店|宮脇/,
  source: 'https://store-tsutaya.tsite.jp/store/search/result?u=6_1',
  complete: true,
  excluded: [], // 他チェーンの複合店・TSUTAYA の名前が付かない提携書店として外した店（報告用）
  async fetch() {
    const list = [];
    this.excluded = [];
    for (const f of FILTERS) {
      let pages = 1;
      for (let p = 1; p <= pages; p++) {
        const url = `${BASE}?${f}${p > 1 ? '&p=' + p : ''}`;
        const html = await lib.get(url);
        if (p === 1) {
          const m = html.match(/検索結果（(\d+)件）/);
          if (!m) throw new Error(`検索結果の件数が見当たらない（${url}）。ページの作りが変わったかもしれない`);
          pages = Math.ceil(+m[1] / PER_PAGE);
          if (pages > 120) throw new Error(`ページ数が多すぎる（${pages}）。条件の指定が効いていないかもしれない`);
        }
        const rows = lib.all(/<dt class="store_info">([\s\S]*?)<\/dt>/g, html, (m) => m[1]);
        for (const r of rows) {
          const a = r.match(/<a href="([^"]+)" class="store_name">([\s\S]*?)<\/a>([\s\S]*)$/);
          if (!a) continue;
          const name = lib.strip(a[2]).replace(/\s+/g, ' ').trim();
          if (!name || /閉店/.test(name)) continue;
          if (this.exclude.test(name)) { this.excluded.push(name); continue; }
          // TSUTAYA の名前が付かない提携書店（谷島屋・リブロ・明文堂書店・BOOK COMPASS・オリオン書房 など）も一覧に入っている。
          // 地図側は brand（TSUTAYA／蔦屋）で拾うので、ここでも名前に TSUTAYA／蔦屋 が無い店は外す（谷島屋・リブロなどは別の部品）
          if (!this.brand.test(name)) { this.excluded.push(`${name}（提携書店）`); continue; }
          const address = lib.strip(a[3]).replace(/\s+/g, ' ').trim().replace(/^(北海道|東京都|京都府|大阪府|\S{2,3}県) /, '$1');
          list.push({ name, address, url: new URL(a[1], url).href });
        }
      }
    }
    if (list.length < 250) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
