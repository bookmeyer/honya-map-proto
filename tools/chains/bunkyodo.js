// 文教堂：会社サイトの店舗情報ページ（/page-list-store/）に全店がカードで入っている。
// 1店ごとに <div class="card-header card-prefectural"><h3>都道府県</h3></div> → <div class="card mb-4 store-info-wrap">…（店名・住所・取扱商材）
// 住所に県名が無い店（横浜市…・横須賀市…）があるので、見出しの都道府県を前に足す。取扱商材に「本」が無い店（ホビー専門店など）は除く
const lib = require('./_lib');
const PREF_HEAD = /^(北海道|東京都|京都府|大阪府|[^\s\d]{2,3}県)/;
module.exports = {
  id: 'bunkyodo',
  name: '文教堂',
  brand: /文教堂/,
  source: 'https://www.bunkyodo.co.jp/page-list-store/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const parts = html.split('<div class="card mb-4 store-info-wrap">');
    const list = [];
    for (let i = 1; i < parts.length; i++) {
      const card = parts[i];
      const heads = lib.all(/card-prefectural">\s*<h3>([^<]*)<\/h3>/g, parts[i - 1], (m) => m[1].trim());
      const pref = heads.length ? heads[heads.length - 1] : '';
      let branch = lib.strip((card.match(/<p class="store_name_firstP">([\s\S]*?)<\/p>/) || [])[1] || '').replace(/\n/g, ' ');
      branch = branch.replace(/[（(][^（）()]*(休業|改装|閉店|OPEN|オープン|移転)[^（）()]*[）)]/g, '').trim(); // 「(10月5日より改装のため休業)」のような注記を外す
      if (!branch) continue;
      const text = lib.strip(card);
      if (/閉店/.test(text)) continue; // 閉店のお知らせが付いた店は外す
      const icons = lib.all(/class="handling_icon">([^<]*)</g, card, (m) => m[1].trim());
      if (icons.length && !icons.some((s) => /本/.test(s))) continue; // 本を扱わない店（ホビー専門など）は除く
      let addrHtml = (card.match(/<dt>住所<\/dt>\s*<dd>([\s\S]*?)<\/dd>/) || [])[1] || '';
      addrHtml = addrHtml.replace(/<a[\s\S]*?<\/a>/g, '').split(/<\/?br\s*\/?>/i)[0];
      let address = lib.strip(addrHtml).split('\n')[0].replace(/〒?\s*\d{3}-?\d{4}\s*/, '').trim();
      if (address && pref && !PREF_HEAD.test(address)) address = pref + address;
      const href = (card.match(/href="([^"]*page-detail-store\?id=\d+)"/) || [])[1] || '';
      const name = /文教堂/.test(branch) ? branch : `文教堂 ${branch}`;
      list.push({ name, address, url: href ? new URL(href, this.source).href : '' });
    }
    if (list.length < 20) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
