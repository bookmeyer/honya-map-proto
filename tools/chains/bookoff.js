// BOOKOFF：都道府県ごとの一覧ページ /shop/pref-list/01.html〜47.html に、その県の全店が
// 名前・住所・取扱商品のアイコンつきで入っている（取得は47回。店舗検索の JSON は外部の検索会社の口なので使わない）
// 一覧には本を扱わない系列店も混ざる（Rehello by BOOKOFF＝衣料、aidect＝宝飾、BINGO＝衣料、Japan TCG Center＝トレカ、
// BOOKOFF FASHION、買取センター など）。「取扱商品（買いたい）」＝店が売っている物に「本」「新刊本」が無い店は外す
const lib = require('./_lib');
// アイコン番号→商品名（ページ内の凡例「アイコン説明」から毎回読み直すが、読めないときの備え）
const ICON = { 'ico-01': '本（書籍・雑誌・コミック）', 'ico-17': '新刊本', 'ico-02': 'CD・DVD・ブルーレイ・ゲーム', 'ico-18': '新品ゲーム', 'ico-09': 'トレカ', 'ico-19': '新品トレカ', 'ico-10': 'おもちゃ', 'ico-20': '一番くじ', 'ico-21': 'アニメグッズ', 'ico-03': '携帯電話', 'ico-04': 'デジタル家電', 'ico-05': '生活家電', 'ico-06': '楽器', 'ico-07': 'ファッション', 'ico-22': '着物', 'ico-08': 'スポーツ用品', 'ico-12': 'ブランド品', 'ico-13': '金・プラチナ・貴金属', 'ico-14': '食器・雑貨', 'ico-11': 'ベビー用品', 'ico-15': '家具', 'ico-16': 'ブックオフオリジナル商品' };
const BOOK_ICONS = ['ico-01', 'ico-17'];
module.exports = {
  id: 'bookoff',
  name: 'BOOKOFF',
  brand: /ブックオフ|BOOKOFF|BOOK OFF|BOOK-OFF/i,
  source: 'https://www.bookoff.co.jp/shop/',
  complete: true,
  excluded: [], // 本を扱わないとみなして外した店（報告用）
  async fetch() {
    const list = [];
    const icon = Object.assign({}, ICON);
    this.excluded = [];
    for (let i = 1; i <= 47; i++) {
      const url = `https://www.bookoff.co.jp/shop/pref-list/${String(i).padStart(2, '0')}.html`;
      const html = await lib.get(url);
      lib.all(/ico-products\/(ico-\d+)\.png"><\/div><div class="txt[^"]*">([^<]*)</g, html, (m) => { icon[m[1]] = lib.strip(m[2]); });
      const items = html.split(/<div class="shop-detail-item">/).slice(1);
      for (const it of items) {
        const m = it.match(/class="shop-detail-item__name" href="([^"]+)">([\s\S]*?)<\/a>/);
        if (!m) continue;
        let name = lib.strip(m[2]).replace(/\s+/g, ' ').trim();
        name = name.replace(/_\d{4}年.*$/, '').trim(); // 「_2026年5月15日(金)グランドオープン！」の宣伝文を外す
        name = name.replace(/\s*\/\s*Rehello by BOOKOFF.*$/i, '').trim(); // 「BOOKOFF ○○店 / Rehello by BOOKOFF ○○店」の併設表記は前半だけ
        if (!name || /閉店/.test(name)) continue;
        const address = lib.strip((it.match(/title--address">[\s\S]*?<\/dt>\s*<dd class="shop-detail-item__detail">([\s\S]*?)<\/dd>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
        const sellBlock = it.match(/取扱商品（買いたい）[\s\S]*?<\/dl>/); // 店が売っている商品
        const sells = sellBlock ? lib.all(/(ico-\d+)\.png/g, sellBlock[0], (x) => x[1]) : [];
        const hasBooks = sells.some((k) => BOOK_ICONS.includes(k));
        const nonBookFormat = /Rehello|aidect|BINGO|TCG Center|BOOKOFF FASHION|買取センター|買取専門|アパレル館|hugall|ハグオール/i.test(name);
        if (nonBookFormat || (sells.length && !hasBooks)) { this.excluded.push(name); continue; }
        const tags = sells.map((k) => icon[k] || k);
        if (!sells.length) tags.push('取扱商品の表示なし');
        list.push({ name, address, url: new URL(m[1], url).href, tags });
      }
    }
    if (list.length < 300) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
