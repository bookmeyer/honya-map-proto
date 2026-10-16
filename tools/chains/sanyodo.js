// 三洋堂書店：店舗一覧ページ（1枚・県ごとの見出し）に全店が <li class="sl-listitem"> で入っている。
// 店名は支店名だけ（「豊川店」）なので「三洋堂書店 」を前に足す。住所は県から。座標は無い（地図はGoogleマイマップの埋め込みだけ）。
// 書店でないもの（ホビープラネット＝ホビー店、三洋堂トレカ館＝トレカ専門店）は除く
const lib = require('./_lib');
module.exports = {
  id: 'sanyodo',
  name: '三洋堂書店',
  brand: /三洋堂/,
  source: 'https://www.sanyodo.co.jp/shop',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const items = lib.all(/<li class="sl-listitem">([\s\S]*?)<\/li>/g, html, (m) => m[1]);
    const list = [];
    for (const it of items) {
      const branch = lib.strip((it.match(/class="sl-shop-name"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
      if (!branch || /閉店/.test(branch)) continue;
      if (/ホビープラネット|トレカ館|駿河屋|パソコン教室/.test(branch)) continue; // 書店でない店
      const address = lib.strip((it.match(/class="sl-shop-address"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '').split('\n')[0].trim();
      const href = (it.match(/<a href="([^"]+)"/) || [])[1] || '';
      list.push({ name: /三洋堂/.test(branch) ? branch : `三洋堂書店 ${branch}`, address, url: href ? new URL(href, this.source).href : '' });
    }
    if (list.length < 20) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
