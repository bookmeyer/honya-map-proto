// WonderGOO（REXT）：店舗一覧 /shop/ の表に全店（地域・店名・直営）。住所と取扱い商品は各店の詳細ページ
// （/shop/detail/?id=）にしか無いので、WonderGOO の店だけ1店ずつ取る（約40回）
// 詳細ページの Google マップ埋め込み（…!2d経度!3d緯度…）から座標も拾う（店の位置に合わせた地図なので目安になる）
// 一覧には系列のパン屋「HEART BREAD ANTIQUE」や「（携帯電話専門店）WonderGOO 川越店」も載るので外す
const lib = require('./_lib');
module.exports = {
  id: 'wondergoo',
  name: 'WonderGOO',
  brand: /WonderGOO|ワンダーグー/i,
  source: 'https://www.wonder.co.jp/shop/',
  complete: true,
  excluded: [], // 書店ではないとみなして外した店（報告用）
  async fetch() {
    const html = await lib.get(this.source);
    const rows = lib.all(/<tr class="id(\d+)">\s*<td[^>]*>([\s\S]*?)<\/td>\s*<th>\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/th>/g, html,
      (m) => ({ id: m[1], area: lib.strip(m[2]), href: m[3], name: lib.strip(m[4]).replace(/\s+/g, ' ').trim() }));
    if (rows.length < 20) throw new Error(`店舗が少なすぎる（${rows.length}件）。ページの作りが変わったかもしれない`);
    const list = [];
    this.excluded = [];
    for (const r of rows) {
      if (!r.name || /閉店/.test(r.name)) continue;
      if (!this.brand.test(r.name) || /携帯電話専門店/.test(r.name)) { this.excluded.push(r.name); continue; }
      const url = new URL(r.href, this.source).href;
      const o = { name: r.name, address: '', url, tags: [] };
      try {
        const d = await lib.get(url);
        const addr = d.match(/<dt>\s*所在地\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/);
        if (addr) o.address = lib.strip(addr[1]).replace(/〒\s*\d{3}-?\d{4}/g, '').replace(/\s+/g, ' ').trim();
        const items = d.match(/<dt>\s*取扱い商品\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/);
        if (items) o.tags = lib.all(/<li>([\s\S]*?)<\/li>/g, items[1], (x) => lib.strip(x[1]).replace(/\s+/g, ' ').trim()).filter(Boolean);
        const g = d.match(/maps\/embed\?pb=[^"']*?!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
        if (g) { const lon = +g[1], lat = +g[2]; if (lat > 20 && lat < 46 && lon > 122 && lon < 154) { o.lat = lat; o.lon = lon; } }
      } catch (e) { /* 詳細ページが取れなくても、名前だけで一覧に残す */ }
      // 取扱い商品が分かっていて「書籍」が無い店（ゲーム・ホビーだけなど）は書店ではないので外す
      if (o.tags.length && !o.tags.some((t) => /書籍|本|コミック/.test(t))) { this.excluded.push(`${r.name}（${o.tags.join('・')}）`); continue; }
      list.push(o);
    }
    if (list.length < 20) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
