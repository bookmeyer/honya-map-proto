// リブロ・よむよむ・オリオン書房・パルコブックセンター（旧リブロプラス）
// 旧サイト www.libro.jp / libroplus.co.jp は証明書が切れていて（Node の fetch も失敗する）、
// 2023年10月に設立された「NICリテールズ」の店舗検索に移っている。
// 店舗検索はブランドで絞り込むと全店が1ページに出る（ページ送りなし）：
//   <p class="prefectures">大阪</p>
//   <div class="shopline"><p class="shopname"><a href="…/shop/1034/">リブロ イオンモール 鶴見店</a></p>
//     <ul><li>〒538-0053<br />大阪府大阪市鶴見区…</li><li>電話</li><li class="icon">…</li></ul></div>
// 座標はページに無い（Google マップへの短縮リンクだけ）。住所は都道府県から入っている。
const lib = require('./_lib');
const BRANDS = [['key_libro', 'リブロ'], ['key_yomuyomu', 'よむよむ'], ['key_orion', 'オリオン書房'], ['key_parco', 'パルコブックセンター']];
// 「大阪」「東京」のような県名の略を正式名に（住所に都道府県が無いときの保険）
const prefFull = (p) => (!p ? '' : /[都道府県]$/.test(p) ? p : p === '東京' ? '東京都' : /^(大阪|京都)$/.test(p) ? p + '府' : p + '県');
const ZIP_RE = /〒\s*\d{3}[-‐‑‒–—－]?\d{4}/g;
module.exports = {
  id: 'libro',
  name: 'リブロ（NICリテールズ）',
  brand: /リブロ|LIBRO|よむよむ|オリオン書房|パルコブックセンター/i,
  source: 'https://www.nic-retails.co.jp/shop/',
  complete: true,
  async fetch() {
    const list = [];
    for (const [key, label] of BRANDS) {
      const html = await lib.get(`${this.source}?brand_key=${key}`);
      let pref = '';
      for (const m of lib.all(/<p class="prefectures">([\s\S]*?)<\/p>|<div class="shopline">([\s\S]*?)<\/div>/g, html)) {
        if (m[1] != null) { pref = prefFull(lib.strip(m[1])); continue; }
        const b = m[2];
        const a = b.match(/<p class="shopname">\s*<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
        if (!a) continue;
        let name = lib.strip(a[2]).replace(/\s+/g, ' ').trim();
        if (!name || /閉店/.test(name)) continue;
        if (!this.brand.test(name)) name = `${label} ${name}`; // ブランド名が無い表記なら前に足す
        const li = b.match(/<li>([\s\S]*?)<\/li>/); // 最初の <li>（class なし）が住所
        let address = li ? lib.strip(li[1]).replace(ZIP_RE, '').replace(/\s+/g, ' ').trim() : '';
        if (address && !/^(北海道|東京都|京都府|大阪府|.{2,3}県)/.test(address)) address = pref + address;
        list.push({ name, address, url: a[1] ? new URL(a[1], this.source).href : '', brand: label });
      }
    }
    if (list.length < 10) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
