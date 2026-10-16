// 古本市場（テイツー）：店舗一覧ページ /shop.html に全店が名前・住所つきで入っている（取得は1回）
// 店名は「古本市場○○店」「ふるいち○○店」「ふるいちトップブックス○○店」「ふるいちトレカパーク○○店」など
// （ふるいち＝同じ会社の総合リユース店で古本も扱う。トップブックス＝新刊書店）。
// 種類は店名のそばの class（furuhonitiba／furuiti／torekapark）で分かるので tags に入れ、
// トレカ（カード）専門の店と BRAND OFF（ブランド品買取）は書店ではないので外す
const lib = require('./_lib');
const CAT = { furuhonitiba: '古本市場', furuiti: 'ふるいち', torekapark: 'トレカパーク' };
module.exports = {
  id: 'furuichi',
  name: '古本市場（ふるいち）',
  brand: /古本市場|ふるいち|トップブックス/,
  source: 'https://www.furu1.net/shop.html',
  complete: true,
  excluded: [], // 書店ではないとみなして外した店（報告用）
  async fetch() {
    const html = await lib.get(this.source);
    const blocks = html.split(/<div class="shop__display__content space">/).slice(1);
    if (blocks.length < 100) throw new Error(`店舗が少なすぎる（${blocks.length}件）。ページの作りが変わったかもしれない`);
    const list = [];
    this.excluded = [];
    for (const b of blocks) {
      const name = lib.strip((b.match(/title__name__text">([\s\S]*?)<\/span>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      if (/閉店/.test(name)) continue;
      const cats = [];
      lib.all(/title__name__category ([^'"]*)['"]/g, b, (m) => { for (const c of m[1].split(/\s+/)) if (c) cats.push(CAT[c] || c); });
      const href = (b.match(/href="(\/shop\/shop\d+\.html)"/) || [])[1] || '';
      const address = lib.strip((b.match(/class="address"[\s\S]*?dd__text">([\s\S]*?)<\/p>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
      const bookish = cats.includes('古本市場') || cats.includes('ふるいち');
      // トレカ専門店（店名がトレカパーク）、ブランド品買取専門、種類の印に古本市場／ふるいちが無い店は外す
      if (/^(ふるいち\s*)?トレカパーク/.test(name) || /買取専門|BRAND\s*OFF/i.test(name) || !bookish) { this.excluded.push(name); continue; }
      list.push({ name, address, url: href ? new URL(href, this.source).href : '', tags: cats });
    }
    if (list.length < 100) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
