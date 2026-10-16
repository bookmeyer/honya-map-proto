// 八重洲ブックセンター：「アクセス／店舗」に全店（10店ほど）。一覧は都道府県ごとの <li>
//   <li class="title"><span class="place">東京都</span></li>
//   <li><span class="place"><a href="…/access/gransta-yaesu/">グランスタ八重洲店</a></span><span class="station">JR東日本 東京駅 グランスタ八重洲Ｂ１Ｆ</span><span class="status">電話</span></li>
// 一覧の「所在地」は施設名だけなので、各店の詳細ページ（10回ほど）から
//   <th>所在地</th><td>〒100-0005 東京都千代田区丸の内1-9-1 …</td>  と
//   center: new google.maps.LatLng(35.6798702,139.7675145, 20)   … その店の座標（ページごとにその店の位置になっている）
// を取る。詳細が取れなかった店も、一覧の分（名前・県）は残す
const lib = require('./_lib');
const ZIP_RE = /〒\s*\d{3}[-‐‑‒–—－]?\d{4}/g;
module.exports = {
  id: 'yaesu',
  name: '八重洲ブックセンター',
  brand: /八重洲ブックセンター/,
  source: 'https://www.yaesu-book.co.jp/access/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const lis = lib.all(/<li([^>]*)>([\s\S]*?)<\/li>/g, html, (m) => ({ attrs: m[1], inner: m[2] }));
    const stores = [];
    let pref = '';
    for (const li of lis) {
      if (/class="title"/.test(li.attrs)) {
        const p = lib.strip((li.inner.match(/<span class="place">([\s\S]*?)<\/span>/) || [])[1] || '');
        if (lib.prefOfAddress(p)) pref = p;
        continue;
      }
      const a = li.inner.match(/<span class="place">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!a) continue;
      const branch = lib.strip(a[2]).replace(/\s+/g, ' ').trim();
      if (!branch || /閉店/.test(branch)) continue;
      const note = lib.strip((li.inner.match(/<span class="station">([\s\S]*?)<\/span>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
      stores.push({ name: `八重洲ブックセンター ${branch}`, address: '', pref, note, url: new URL(a[1], this.source).href });
    }
    if (stores.length < 3) throw new Error(`店舗が少なすぎる（${stores.length}件）。ページの作りが変わったかもしれない`);
    for (const s of stores) {
      try {
        const d = await lib.get(s.url);
        const addr = (d.match(/<th>\s*所在地\s*<\/th>\s*<td>([\s\S]*?)<\/td>/) || [])[1];
        if (addr) s.address = lib.strip(addr).replace(ZIP_RE, '').replace(/\s+/g, ' ').trim();
        const c = d.match(/center:\s*new google\.maps\.LatLng\(\s*([\d.]+)\s*,\s*([\d.]+)/);
        if (c) { s.lat = +c[1]; s.lon = +c[2]; }
      } catch (e) { /* 詳細ページが取れなくても一覧の分は残す */ }
      if (s.address && !/^(北海道|東京都|京都府|大阪府|.{2,3}県)/.test(s.address)) s.address = s.pref + s.address;
      delete s.pref;
    }
    return lib.uniq(stores);
  },
};
