// 設定値（数字はここだけで変える）
export const APP_VER = '0.9.3';
export const STORAGE_KEY = 'honya_map_v3';
export const LEGACY_KEYS = ['honya_map_v2'];

export const RANGE_M = 120;        // 射程（m）
export const SENSE_M = 400;        // 近づく演出が始まる距離（m）
export const TERRITORY_M = 200;    // スタンプを押した店のまわりを塗る半径（m）
export const JUMP_MPS = 60;        // これより速く位置が飛んだら「飛んだ」と見なす（m/秒）
export const JUMP_COOLDOWN_MS = 60000;

// 歩いた距離：100mで1ページ（歩いて約1分半）。歩数は距離からの目安（ブラウザは端末の歩数計を読めない）
export const WALK = { pageM: 100, stepM: 0.7, minMoveM: 12, maxAccM: 60, walkMaxMps: 2.8, rideMaxMps: 45, gapS: 600, wantNearM: 500 };
// 常連度：同じ店でスタンプを押した「日数」で上がる（たくさんの店に行けない人の楽しみ）
export const REGULAR = [{ n: 1, name: 'はじめまして' }, { n: 3, name: '顔なじみ' }, { n: 5, name: '常連' }, { n: 10, name: 'ぬし' }, { n: 20, name: '名物客' }, { n: 50, name: '殿堂入り' }];

// 物語のページ：スタンプ・本との出会い・お題などで増える（歩いた道のりも 100m＝1ページで足される）
export const PG = {
  shuFirst: 30, shuRepeat: 6, sumiFirst: 10, sumiRepeat: 2,
  card: 40, cardInStore: 20,
  rare2: 10, rare3: 50, feat: 50,
  daily: 8, weekly: 20, rally: 100, streak: 10,
  regular: [0, 15, 30, 60, 100, 200], // 常連度が上がったとき（段ごと）
};
// 巻：ページがたまると次の巻へ（第2巻＝15ページ、第3巻＝60、第4巻＝135、第5巻＝240 …）
export const volOf = (pages) => Math.floor(Math.sqrt(Math.max(pages, 0) / 15)) + 1;
export const pagesForVol = (v) => (v - 1) ** 2 * 15;
export const frameOf = (v) => (v >= 8 ? 3 : v >= 5 ? 2 : v >= 3 ? 1 : 0);

export const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export const PREFS = [
  ['北海道',43.064,141.347],['青森県',40.824,140.740],['岩手県',39.704,141.153],['宮城県',38.269,140.872],['秋田県',39.719,140.102],
  ['山形県',38.240,140.363],['福島県',37.750,140.468],['茨城県',36.342,140.447],['栃木県',36.566,139.884],['群馬県',36.391,139.061],
  ['埼玉県',35.857,139.649],['千葉県',35.605,140.123],['東京都',35.690,139.692],['神奈川県',35.448,139.643],['新潟県',37.903,139.024],
  ['富山県',36.695,137.211],['石川県',36.595,136.626],['福井県',36.065,136.222],['山梨県',35.664,138.568],['長野県',36.651,138.181],
  ['岐阜県',35.391,136.722],['静岡県',34.977,138.383],['愛知県',35.180,136.907],['三重県',34.730,136.509],['滋賀県',35.005,135.869],
  ['京都府',35.021,135.756],['大阪府',34.686,135.520],['兵庫県',34.691,135.183],['奈良県',34.685,135.833],['和歌山県',34.226,135.168],
  ['鳥取県',35.504,134.238],['島根県',35.472,133.051],['岡山県',34.662,133.934],['広島県',34.397,132.460],['山口県',34.186,131.471],
  ['徳島県',34.066,134.559],['香川県',34.340,134.043],['愛媛県',33.842,132.766],['高知県',33.560,133.531],['福岡県',33.606,130.418],
  ['佐賀県',33.249,130.299],['長崎県',32.745,129.874],['熊本県',32.790,130.742],['大分県',33.238,131.613],['宮崎県',31.911,131.424],
  ['鹿児島県',31.560,130.558],['沖縄県',26.212,127.681],
];

export const DEMO_STORE = { i: 'demo1', n: '【見本】架空の本屋', la: 35.6812, lo: 139.7671, a: '（実在しません。公認店のページの見え方の見本）', p: '東京都', demo: 1, k: 0,
  rec: { who: '書店員 Aさん（見本）', title: '『（見本）手放せない1冊』', say: '（見本）取材でうかがった書店員さんのひとことが、ご本人の言葉のまま入ります。', shelf: '文庫の新刊台（見本）' } };

// 称号（ゆるやかに増える）と実績（細かく増える）
export const TITLES = [
  { id: 't_s1', name: 'はじめの一押し', kind: 'stamps', n: 1 }, { id: 't_s3', name: '本屋あるき', kind: 'stamps', n: 3 }, { id: 't_s10', name: '本屋通', kind: 'stamps', n: 10 },
  { id: 't_s20', name: '本屋巡礼者', kind: 'stamps', n: 20 }, { id: 't_s50', name: '本屋のぬし', kind: 'stamps', n: 50 }, { id: 't_s100', name: '全国行脚', kind: 'stamps', n: 100 },
  { id: 't_p2', name: '越境', kind: 'prefs', n: 2 }, { id: 't_p5', name: '五県の旅人', kind: 'prefs', n: 5 }, { id: 't_p10', name: '列島めぐり', kind: 'prefs', n: 10 },
  { id: 't_u3', name: '古書の目利き', kind: 'used', n: 3 }, { id: 't_r3', name: '秘境の本屋さがし', kind: 'rare', n: 3 },
  { id: 't_g5', name: '行きつけがある', kind: 'regMax', n: 5 }, { id: 't_g20', name: '町の本屋の顔', kind: 'regMax', n: 20 },
];
export const ACHIEVEMENTS = [
  { id: 'a_first', name: '最初の一歩', desc: 'スタンプを1つ押す', kind: 'stamps', n: 1 },
  { id: 'a_card1', name: '本と出会った', desc: 'カードを1枚作る', kind: 'cards', n: 1 },
  { id: 'a_card10', name: '出会いの常連', desc: 'カードを10枚', kind: 'cards', n: 10 },
  { id: 'a_used', name: '古書の香り', desc: '古書店でスタンプを1つ', kind: 'used', n: 1 },
  { id: 'a_lib', name: '図書館通い', desc: '図書館でスタンプを3つ', kind: 'libs', n: 3 },
  { id: 'a_rare', name: '秘境へ', desc: '★★★のスタンプを1つ', kind: 'rare', n: 1 },
  { id: 'a_feat', name: '推し店めぐり', desc: '今週の推し店でスタンプを3回', kind: 'feat', n: 3 },
  { id: 'a_regular', name: '常連', desc: '同じ店でスタンプを5日', kind: 'regMax', n: 5 },
  { id: 'a_nushi', name: 'ぬし', desc: '同じ店でスタンプを10日', kind: 'regMax', n: 10 },
  { id: 'a_reg3', name: '行きつけが三つ', desc: '常連の店を3つ', kind: 'regulars', n: 3 },
  { id: 'a_look', name: '下見', desc: '本屋のページを30店見る', kind: 'look', n: 30 },
  { id: 'a_streak4', name: '四週つづけて', desc: '4週連続でスタンプを押す', kind: 'streak', n: 4 },
  { id: 'a_pref5', name: '五つの県', desc: '5県でスタンプを押す', kind: 'prefs', n: 5 },
  { id: 'a_rally', name: 'ラリー制覇', desc: 'ご当地ラリーを1つ', kind: 'rally', n: 1 },
  { id: 'a_page100', name: '百ページ歩いた', desc: '歩いて100ページ（10km）', kind: 'pages', n: 100 },
  { id: 'a_book1', name: '一冊ぶん歩いた', desc: '歩いて300ページ（30km）', kind: 'pages', n: 300 },
  { id: 'a_share', name: '見せびらかし', desc: 'スタンプをシェアする', kind: 'share', n: 1 },
];
