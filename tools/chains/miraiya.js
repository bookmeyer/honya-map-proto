// 未来屋書店（イオン系）：店舗一覧は地域ページ7枚（北海道・東北／関東／中部／近畿／中国／四国／九州）。
// 各ページの <table class="shop_all"> の行＝店名（<a>）／〒＋住所＋電話／サービスのアイコン。座標は無い。
// 店名の後ろに全角スペース区切りで注記が付くことがある（「未来屋書店天理　2026年9月30日をもって閉店いたしました。」など）→ 注記は外し、閉店は除く。
// 同社の別屋号（アシーネ・ミライア・Reading and Writing）も同じ表に入る（いずれも書店）
const lib = require('./_lib');
const REGIONS = ['北海道・東北', '関東', '中部', '近畿', '中国', '四国', '九州'];
module.exports = {
  id: 'miraiya',
  name: '未来屋書店',
  brand: /未来屋|Miraiya|ミライア|アシーネ/i,
  source: 'https://www.miraiyashoten.co.jp/store/',
  complete: true,
  async fetch() {
    const list = [];
    for (const region of REGIONS) {
      const url = this.source + encodeURIComponent(region) + '/';
      const html = await lib.get(url);
      const tables = html.match(/<table[^>]*class="shop_all"[\s\S]*?<\/table>/g) || [];
      if (!tables.length) throw new Error(`${region} のページに店舗の表が見当たらない`);
      for (const t of tables) {
        for (const row of lib.all(/<tr[^>]*>([\s\S]*?)<\/tr>/g, t, (m) => m[1])) {
          const tds = lib.all(/<td[^>]*>([\s\S]*?)<\/td>/g, row, (m) => m[1]);
          if (tds.length < 2) continue; // 見出し行
          const raw = lib.strip(tds[0]).replace(/\s*\n\s*/g, '　').trim();
          if (!raw || /閉店/.test(raw)) continue;
          // 全角スペース以降は注記（休業・改装・リニューアルなど）。半角スペースは店名の一部（「未来屋書店 川口」）なので残す
          let name = raw.split('　')[0].replace(/\s+(店舗|\d{1,2}月\d{1,2}日|20\d\d年|リニューアル|休業|移転|改装|オープン).*$/, '').replace(/\s+/g, ' ').trim();
          if (!name) continue;
          const lines = lib.strip(tds[1]).split('\n').map((s) => s.trim()).filter(Boolean);
          const address = lines.find((s) => lib.prefOfAddress(s) && !/^〒/.test(s)) || '';
          const href = (tds[0].match(/href="([^"]+)"/) || [])[1] || '';
          list.push({ name, address, url: href ? new URL(href, url).href : '' });
        }
      }
    }
    if (list.length < 50) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
