// 宮脇書店：店舗一覧の親ページ（/store/）は店名とリンクだけ。住所は地域ページ8枚
// （hokkaido_tohoku／kanto／shinetsu_tokai／kinki／chugoku／shikoku＝四国（香川県以外）／kagawa／kyushu_okinawa）に
// <ul class="store-list"><li><dl><dt><a>店名</a></dt><dd class="info">…<li class="address">〒…<br/>住所</li> の形で入っている。座標は無い。
// 店名は支店名だけ（「札幌元町店」）なので「宮脇書店 」を前に足す。半角カナ（ｲｵﾅ…）は全角に直す。
// 「卸センター」（本社の卸部門・営業時間なし）は店ではないので除く。グループ会社（明林堂書店・新丸三書店）は別サイトなので含まない
const lib = require('./_lib');
const REGIONS = ['hokkaido_tohoku', 'kanto', 'shinetsu_tokai', 'kinki', 'chugoku', 'shikoku', 'kagawa', 'kyushu_okinawa'];
module.exports = {
  id: 'miyawaki',
  name: '宮脇書店',
  brand: /宮脇書店|宮脇/,
  source: 'https://www.miyawakishoten.com/store/',
  complete: true,
  async fetch() {
    const list = [];
    for (const region of REGIONS) {
      const url = this.source + region + '/';
      const html = await lib.get(url);
      const items = lib.all(/<li>\s*<dl>\s*<dt><a href="([^"]+)">([\s\S]*?)<\/a><\/dt>([\s\S]*?)<\/dl>/g, html, (m) => ({ href: m[1], name: m[2], rest: m[3] }));
      if (!items.length) throw new Error(`${region} のページに店舗が見当たらない`);
      for (const it of items) {
        let branch = lib.strip(it.name).replace(/[｡-ﾟ]+/g, (s) => s.normalize('NFKC')).replace(/\s+/g, ' ').trim();
        if (!branch || /閉店/.test(branch)) continue;
        if (/^卸センター$/.test(branch)) continue; // 本社の卸部門（店ではない）
        const lines = lib.strip((it.rest.match(/class="address"[^>]*>([\s\S]*?)<\/li>/) || [])[1] || '').split('\n').map((s) => s.trim()).filter(Boolean);
        const address = lines.find((s) => lib.prefOfAddress(s) && !/^〒/.test(s)) || '';
        list.push({ name: /宮脇/.test(branch) ? branch : `宮脇書店 ${branch}`, address, url: new URL(it.href, url).href });
      }
    }
    if (list.length < 50) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
