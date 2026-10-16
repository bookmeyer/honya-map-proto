// 戸田書店（TODA BOOKS Group：静岡・群馬・山形・埼玉・新潟）：「全国店舗一覧」の表に全店が出る
//   <tr><td colspan="5" class="keitai">山形県</td></tr>                      … 県の見出し行
//   <tr><td class="sname">三川店（ＭＪ丸善ジュンク堂書店）</td><td class="tel">…</td><td>東田川郡三川町成田新田383-3</td><td class="hon">…</td><td class="btn">…</td></tr>
// 住所に県が無いので見出し行の県を前に足す。店名の括弧（ＭＪ丸善ジュンク堂書店／リブレ／C. B. C）は
// 運営形態の注記なので name からは外して note に入れる。「戸田書店外商部（江尻台店内）」は店ではないので除く。座標はページに無い
const lib = require('./_lib');
module.exports = {
  id: 'toda',
  name: '戸田書店',
  brand: /戸田書店/,
  source: 'https://www.todabooks.co.jp/shop/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const rows = lib.all(/<tr>([\s\S]*?)<\/tr>/g, html, (m) => m[1]);
    const list = [];
    let pref = '';
    for (const r of rows) {
      const k = r.match(/<td[^>]*class="keitai"[^>]*>([\s\S]*?)<\/td>/);
      if (k) { pref = lib.strip(k[1]); continue; }
      const tds = lib.all(/<td([^>]*)>([\s\S]*?)<\/td>/g, r, (m) => ({ attrs: m[1], inner: m[2] }));
      if (tds.length < 3 || !/class="sname"/.test(tds[0].attrs)) continue;
      const raw = lib.strip(tds[0].inner).replace(/\s+/g, ' ').trim();
      if (!raw || /外商|閉店/.test(raw)) continue;
      const note = (raw.match(/[（(]([^）)]*)[）)]\s*$/) || [])[1] || '';
      const branch = raw.replace(/\s*[（(][^）)]*[）)]\s*$/, '').replace(/^戸田書店\s*/, '').trim();
      if (!branch) continue;
      const address = (pref + lib.strip(tds[2].inner).replace(/\s+/g, ' ')).trim();
      const detail = ((tds[4] && tds[4].inner.match(/href="([^"]+)"/)) || [])[1];
      list.push({ name: `戸田書店 ${branch}`, address, url: detail ? new URL(detail, this.source).href : this.source, note });
    }
    if (list.length < 5) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
