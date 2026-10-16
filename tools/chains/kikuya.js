// 喜久屋書店（キクヤ図書販売・BLグループ）：公式サイトは https://www.blg.co.jp/kikuya/ （kikuya-shoten.co.jp は別会社の海苔屋さんなので注意）。
// トップの「店舗リンク」の地図（iframe k-mapbaseYYMM.html）に今の店が並び、各店は javascript:関数名() → css/k-shoplink.js の
// window.open("shops/<店>/index.html") で店のページへ。店のページの <li id="re"> に「郵便番号 住所（館名）」がある。
// 住所に都道府県が書かれていない店が多い（「神戸市西区…」など）ので、郵便番号の上2けたで都道府県を補う。座標は無い。
// 取得はトップ・地図・JS・店ページ（2026-10 時点 31店）で約34回。古い「リスト式店舗検索」k-shopzip.htm は閉店済みの店が残っているので使わない。
// 地図に残っていても、店のページに「閉店のお知らせ」があれば除く（2026-10 時点：国府店）。
const lib = require('./_lib');
const BASE = 'https://www.blg.co.jp/kikuya/';
// 郵便番号の上2けた → 都道府県（例外の少ない区分。住所に都道府県が無いときだけ使う）
const ZIP2 = (() => {
  const t = { '北海道': ['00', '04', '05', '06', '07', '08', '09'], '秋田県': ['01'], '岩手県': ['02'], '青森県': ['03'], '東京都': ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'], '神奈川県': ['21', '22', '23', '24', '25'], '千葉県': ['26', '27', '28', '29'], '茨城県': ['30', '31'], '栃木県': ['32'], '埼玉県': ['33', '34', '35', '36'], '群馬県': ['37'], '長野県': ['38', '39'], '山梨県': ['40'], '静岡県': ['41', '42', '43'], '愛知県': ['44', '45', '46', '47', '48', '49'], '岐阜県': ['50'], '三重県': ['51'], '滋賀県': ['52'], '大阪府': ['53', '54', '55', '56', '57', '58', '59'], '京都府': ['60', '61', '62'], '奈良県': ['63'], '和歌山県': ['64'], '兵庫県': ['65', '66', '67'], '鳥取県': ['68'], '島根県': ['69'], '岡山県': ['70', '71'], '広島県': ['72', '73'], '山口県': ['74', '75'], '香川県': ['76'], '徳島県': ['77'], '高知県': ['78'], '愛媛県': ['79'], '福岡県': ['80', '81', '82', '83'], '佐賀県': ['84'], '長崎県': ['85'], '熊本県': ['86'], '大分県': ['87'], '宮崎県': ['88'], '鹿児島県': ['89'], '沖縄県': ['90'], '福井県': ['91'], '石川県': ['92'], '富山県': ['93'], '新潟県': ['94', '95'], '福島県': ['96', '97'], '宮城県': ['98'], '山形県': ['99'] };
  const o = {}; for (const [p, ks] of Object.entries(t)) for (const k of ks) o[k] = p; return o;
})();
module.exports = {
  id: 'kikuya',
  name: '喜久屋書店',
  brand: /喜久屋/,
  source: BASE,
  complete: true,
  excluded: [], // 閉店のお知らせが出ていた店（報告用）
  async fetch() {
    this.excluded = [];
    const top = await lib.get(BASE);
    const mapSrc = (top.match(/<iframe[^>]+src="(k-mapbase[^"]*\.html)"/) || [])[1];
    if (!mapSrc) throw new Error('トップに店舗リンクの地図（k-mapbase*.html）が見当たらない。ページの作りが変わったかもしれない');
    const mapHtml = await lib.get(BASE + mapSrc);
    const jsSrc = (mapHtml.match(/<script[^>]+src="([^"]*shoplink[^"]*\.js)"/i) || [])[1] || 'css/k-shoplink.js';
    const js = await lib.get(new URL(jsSrc, BASE + mapSrc).href);
    const fnUrl = {};
    for (const m of lib.all(/function\s+(\w+)\s*\(\)\s*\{\s*window\.open\("([^"]+)"/g, js)) fnUrl[m[1]] = m[2];
    const fns = [...new Set(lib.all(/javascript:(\w+)\(\)/g, mapHtml, (m) => m[1]))];
    if (fns.length < 10) throw new Error(`地図の店が少なすぎる（${fns.length}件）`);
    const list = [];
    for (const fn of fns) {
      if (!fnUrl[fn]) continue;
      const url = new URL(fnUrl[fn], BASE).href;
      let html;
      try { html = await lib.get(url); } catch (e) { continue; } // 店のページが消えている＝閉店の可能性。一覧には載せない
      const title = lib.strip((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/[\s　]+/g, ' ');
      let branch = (title.match(/喜久屋書店\s*(.+店)/) || [])[1];
      if (!branch) branch = ((lib.strip(html).match(/(\S+店)フェアご案内/) || [])[1] || '').replace(/店店$/, '店');
      if (!branch) continue;
      const name = `喜久屋書店 ${branch.trim()}`;
      if (/閉店のお知らせ|閉店いたしま|閉店しま/.test(html)) { this.excluded.push(`${name}（閉店のお知らせ）`); continue; }
      const re = lib.strip((html.match(/<li id="re">([\s\S]*?)<\/li>/i) || [])[1] || '').split('\n')[0].normalize('NFKC').trim();
      const zm = re.match(/(?:〒\s*)?(\d{3})\s*[-‐−–ー]\s*(\d{4})\s*/);
      let address = (zm ? re.slice(re.indexOf(zm[0]) + zm[0].length) : re).replace(/\s+/g, ' ').trim();
      if (address && !lib.prefOfAddress(address.slice(0, 4))) address = zm && ZIP2[zm[1].slice(0, 2)] ? ZIP2[zm[1].slice(0, 2)] + address : '';
      list.push({ name, address, url });
    }
    if (list.length < 10) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
