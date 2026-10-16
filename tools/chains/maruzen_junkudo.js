// 丸善ジュンク堂書店：公式サイト（Shopify）の店舗一覧ページ /pages/shoplist が、下の JSON の口から全店を読んで画面に出している。
// 1回の取得で全店（名前・住所・座標・営業状態）が取れる。住所の都道府県はローマ字（"Tōkyō" など）なので漢字に直す。
// 一覧には同社の別屋号（EHONS・magmabooks・戸田書店・函館栄好堂・M.LEAGUE OFFICIAL SHOP・台湾の淳久堂）も混ざる → 名前で丸善・ジュンク堂だけに絞る
// （戸田書店は別の部品 toda.js で扱う）。丸善の「(文具専門)」の店とラウンジ（Personal Lounge 丸善の三階）は書店ではないので除く。
const lib = require('./_lib');
const API = 'https://api-shopify-listLocations-ttmpxhtqra-an.a.run.app';
const PREF = { hokkaido: '北海道', aomori: '青森県', iwate: '岩手県', miyagi: '宮城県', akita: '秋田県', yamagata: '山形県', fukushima: '福島県', ibaraki: '茨城県', tochigi: '栃木県', gunma: '群馬県', saitama: '埼玉県', chiba: '千葉県', tokyo: '東京都', kanagawa: '神奈川県', niigata: '新潟県', toyama: '富山県', ishikawa: '石川県', fukui: '福井県', yamanashi: '山梨県', nagano: '長野県', gifu: '岐阜県', shizuoka: '静岡県', aichi: '愛知県', mie: '三重県', shiga: '滋賀県', kyoto: '京都府', osaka: '大阪府', hyogo: '兵庫県', nara: '奈良県', wakayama: '和歌山県', tottori: '鳥取県', shimane: '島根県', okayama: '岡山県', hiroshima: '広島県', yamaguchi: '山口県', tokushima: '徳島県', kagawa: '香川県', ehime: '愛媛県', kochi: '高知県', fukuoka: '福岡県', saga: '佐賀県', nagasaki: '長崎県', kumamoto: '熊本県', oita: '大分県', miyazaki: '宮崎県', kagoshima: '鹿児島県', okinawa: '沖縄県' };
const prefOf = (p) => { const s = String(p || ''); if (lib.prefOfAddress(s)) return lib.prefOfAddress(s); return PREF[s.normalize('NFKD').replace(/[^A-Za-z]/g, '').toLowerCase()] || ''; };
module.exports = {
  id: 'maruzen_junkudo',
  name: '丸善ジュンク堂書店',
  brand: /丸善|ジュンク堂|MARUZEN|Junkudo/i,
  source: 'https://www.maruzenjunkudo.co.jp/pages/shoplist',
  complete: true,
  excluded: [], // 書店ではない・別チェーン・海外とみなして外した店（報告用）
  async fetch() {
    const data = await lib.json(API);
    const edges = (data && data.locations && data.locations.edges) || [];
    if (!edges.length) throw new Error('店舗の JSON が空。口が変わったかもしれない');
    const list = [];
    this.excluded = [];
    for (const { node: n } of edges) {
      const name = String(n.name || '').replace(/\s+/g, ' ').trim();
      const meta = Object.fromEntries(((n.metafields && n.metafields.edges) || []).map((e) => [e.node.key, e.node.value]));
      if (!name) continue;
      if (meta.operating_status === '9' || /閉店/.test(name + (meta.operating_status_text || ''))) continue; // 閉店（画面側も 9 を閉店扱い）
      const a = n.address || {};
      const overseas = a.country && !/japan/i.test(a.country);
      if (!this.brand.test(name) || overseas || /文具専門|Personal Lounge|ラウンジ/i.test(name)) { this.excluded.push(name); continue; }
      const pref = prefOf(a.province);
      const t = (s) => String(s || '').replace(/[\s　]+/g, ' ').trim();
      const address = pref ? (pref + t(a.city) + t(a.address1) + (t(a.address2) ? ' ' + t(a.address2) : '')) : '';
      list.push({ name, address, lat: +meta.latitude || undefined, lon: +meta.longitude || undefined, url: meta.detail_url || '' });
    }
    if (list.length < 50) throw new Error(`店舗が少なすぎる（${list.length}件）。口の作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
