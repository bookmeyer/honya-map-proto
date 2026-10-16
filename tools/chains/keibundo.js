// 啓文堂書店（旧・京王書籍販売 → 紀伊國屋書籍販売）：会社サイトの店舗一覧（keibundo.co.jp/storelist.html）に全店が入っている。
// 1店ごとに <script type="application/ld+json">（name・alternateName・address）→ <div class="line-box__inner">（店名・場所・営業時間・住所）の順。
// 公式サイトに「啓文堂書店は、2026年2月をもって全店を紀伊國屋書店へ屋号変更いたしました」とあり、
// JSON-LD の name は「紀伊國屋書店 下高井戸店」、alternateName が「啓文堂書店 下高井戸店」。name は公式表記（紀伊國屋書店 ○○店）にしてある。
// 旧名（啓文堂書店 ○○店）で突き合わせたいときは USE_OLD_NAME を true に。
// ※ www.keibundo.com は別会社（出版社の敬文堂）なので使わない
const lib = require('./_lib');
const USE_OLD_NAME = false;
module.exports = {
  id: 'keibundo',
  name: '啓文堂書店（現・紀伊國屋書店）',
  brand: /啓文堂/,
  source: 'https://www.keibundo.co.jp/storelist.html',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const parts = html.split('<div class="line-box__inner">');
    const list = [];
    for (let i = 1; i < parts.length; i++) {
      const block = parts[i];
      // 直前の JSON-LD（この店のもの）
      let ld = null;
      const lds = lib.all(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, parts[i - 1], (m) => m[1]);
      if (lds.length) { try { ld = JSON.parse(lds[lds.length - 1]); } catch (e) { ld = null; } }
      const nm = block.match(/line-box__item01-02-dd">\s*(?:<a href="([^"]*)"[^>]*>)?([\s\S]*?)<\/a>/) || block.match(/line-box__item01-02-dd">([\s\S]*?)<\/div>/);
      const href = nm && nm.length > 2 ? nm[1] || '' : '';
      const branch = lib.strip(nm ? nm[nm.length - 1] : '').replace(/\n/g, ' ').trim();
      if (!branch) continue;
      if (/閉店/.test(lib.strip(block))) continue;
      let name = '';
      if (ld) {
        const nmLd = USE_OLD_NAME ? ld.alternateName || ld.name : ld.name || ld.alternateName;
        if (nmLd && String(nmLd).includes(branch.replace(/店$/, ''))) name = String(nmLd).replace(/\s+/g, ' ').trim();
      }
      if (!name) name = `${USE_OLD_NAME ? '啓文堂書店' : '紀伊國屋書店'} ${branch}`;
      let address = '';
      if (ld && ld.address && typeof ld.address === 'object') address = [ld.address.addressRegion, ld.address.addressLocality, ld.address.streetAddress].map((s) => String(s || '').trim()).join('');
      if (!address) { const ad = block.match(/>住所<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/); if (ad) address = lib.strip(ad[1]).replace(/〒\s*\d{3}-?\d{4}/g, '').replace(/\n/g, ' ').trim(); }
      list.push({ name, address, url: href ? new URL(href, this.source).href : '' });
    }
    if (list.length < 10) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
