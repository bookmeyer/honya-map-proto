// 設定値（数字はここだけで変える）
export const APP_VER = '0.5.1';
export const STORAGE_KEY = 'honya_map_v3';
export const LEGACY_KEYS = ['honya_map_v2'];

export const RANGE_M = 120;        // 射程（m）
export const SENSE_M = 400;        // 近づく演出が始まる距離（m）
export const TERRITORY_M = 200;    // 印を持つ店のまわりを塗る半径（m）
export const JUMP_MPS = 60;        // これより速く位置が飛んだら「飛んだ」と見なす（m/秒）
export const JUMP_COOLDOWN_MS = 60000;

// 印泥（いんでい）：印を押すたびに1つ使う。時間で回復する
export const INK = { max: 5, rechargeMs: 90 * 60 * 1000 };

export const XP = {
  shuFirst: 300, shuRepeat: 60, sumiFirst: 100, sumiRepeat: 20,
  card: 400, cardInStore: 200,
  rare2: 100, rare3: 500, feat: 500,
  daily: 80, weekly: 200, rally: 1000, streak: 100,
};
export const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(xp, 0) / 150)) + 1;
export const xpForLevel = (lv) => (lv - 1) ** 2 * 150;
export const frameOf = (lv) => (lv >= 8 ? 3 : lv >= 5 ? 2 : lv >= 3 ? 1 : 0);

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
  { id: 't_s1', name: 'はじめの一印', kind: 'stamps', n: 1 }, { id: 't_s3', name: '本屋あるき', kind: 'stamps', n: 3 }, { id: 't_s10', name: '本屋通', kind: 'stamps', n: 10 },
  { id: 't_s20', name: '本屋巡礼者', kind: 'stamps', n: 20 }, { id: 't_s50', name: '本屋のぬし', kind: 'stamps', n: 50 }, { id: 't_s100', name: '全国行脚', kind: 'stamps', n: 100 },
  { id: 't_p2', name: '越境', kind: 'prefs', n: 2 }, { id: 't_p5', name: '五県の旅人', kind: 'prefs', n: 5 }, { id: 't_p10', name: '列島めぐり', kind: 'prefs', n: 10 },
  { id: 't_u3', name: '古書の目利き', kind: 'used', n: 3 }, { id: 't_r3', name: '秘境の本屋さがし', kind: 'rare', n: 3 },
];
export const ACHIEVEMENTS = [
  { id: 'a_first', name: '最初の一歩', desc: '印を1つ手に入れる', kind: 'stamps', n: 1 },
  { id: 'a_card1', name: '本と出会った', desc: 'カードを1枚作る', kind: 'cards', n: 1 },
  { id: 'a_card10', name: '出会いの常連', desc: 'カードを10枚', kind: 'cards', n: 10 },
  { id: 'a_used', name: '古書の香り', desc: '古書店で印を1つ', kind: 'used', n: 1 },
  { id: 'a_rare', name: '秘境へ', desc: '★★★の印を1つ', kind: 'rare', n: 1 },
  { id: 'a_feat', name: '推し店めぐり', desc: '今週の推し店で印を3回', kind: 'feat', n: 3 },
  { id: 'a_repeat', name: '常連', desc: '同じ店で朱印を3回', kind: 'repeat', n: 3 },
  { id: 'a_look', name: '下見', desc: '本屋のページを30店見る', kind: 'look', n: 30 },
  { id: 'a_streak4', name: '四週つづけて', desc: '4週連続で印を手に入れる', kind: 'streak', n: 4 },
  { id: 'a_pref5', name: '五つの県', desc: '5県で印を手に入れる', kind: 'prefs', n: 5 },
  { id: 'a_rally', name: 'ラリー制覇', desc: 'ご当地ラリーを1つ', kind: 'rally', n: 1 },
  { id: 'a_share', name: '見せびらかし', desc: '印をシェアする', kind: 'share', n: 1 },
];
