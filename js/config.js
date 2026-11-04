// 設定値（数字はここだけで変える）

export const APP_VER = '0.22.2';
export const STORAGE_KEY = 'honya_map_v3';
// お試し歩き（地図を押した所にいることにする）：遊ぶ人には出さない（11/3 ぶっくまさん「OFFにしたい」）。作る人が試すときは localStorage の meguri_trial を 1 に
export const TRIAL_ON = (() => { try { return localStorage.getItem('meguri_trial') === '1'; } catch (e) { return false; } })();
// プロフィール（v0.20.0）：v0.20.2 から遊ぶ人にも出す（プライバシーポリシーを載せ、サーバーに profile.php が置かれたため）
export const POLICY_VER = '2026-11-04b'; // 11/4 2回目：参加の記録はいつも送る（オン・オフをなくした） // 11/4 改定：プロフィールをはじめるときに答えていただくように // プライバシーポリシーの版（制定日・変えた日）。privacy.html と合わせる
export const PROFILE_ON = true; // 11/3 深夜：プライバシーポリシーを載せ、サーバーに profile.php が置かれたので、遊ぶ人にも出す（v0.20.2）
// プロフィールの質問。答えはコードで持ち、送る（サーバーの lib/profiles.php の PROFILE_Q と同じ）。max：いくつまで選べるか（なし＝1つ）。pref：都道府県（01〜47）
export const PROFILE_Q = [
  { k: 'gen', t: '世代', o: [['10', '10代'], ['20', '20代'], ['30', '30代'], ['40', '40代'], ['50', '50代'], ['60', '60代'], ['70', '70代以上']] },
  { k: 'sex', t: '性別', o: [['f', '女性'], ['m', '男性'], ['x', 'そのほか'], ['n', '答えない']] }, // 答えない（v0.21.0。必須にしたので選べるように）
  { k: 'buy', t: '1か月に買う本（紙・電子あわせて）', o: [['m0', '1冊より少ない（買わない月もある）'], ['m1', '1冊くらい'], ['m2', '2〜3冊'], ['m4', '4〜5冊'], ['m6', '6〜9冊'], ['m10', '10冊以上']] }, // v0.21.1：1年 → 1か月（数えやすく）。前の1年のコードとは混ぜない
  { k: 'freq', t: '本屋さんに行く回数', o: [['w', '週に1回以上'], ['m2', '月に2〜3回'], ['m1', '月に1回くらい'], ['q', '2〜3か月に1回'], ['r', 'ほとんど行かない']] },
  { k: 'genres', t: 'よく読むジャンル（3つまで）', max: 3, o: [['lit', '小説・文芸'], ['mys', 'ミステリー・SF・ファンタジー'], ['ess', 'エッセイ・ノンフィクション'], ['biz', 'ビジネス・自己啓発'], ['hum', '人文・社会・思想'], ['his', '歴史'], ['sci', '科学・技術'], ['life', '暮らし・料理・趣味'], ['kid', '絵本・児童書'], ['comic', 'マンガ・ライトノベル'], ['poem', '詩歌・短歌・俳句']] },
  { k: 'why', t: '本を選ぶきっかけ（いくつでも）', max: 6, o: [['shelf', '本屋さんの棚・POP'], ['sns', 'SNS'], ['media', '書評・テレビ・ラジオ'], ['friend', '友人・家族のすすめ'], ['award', '賞（本屋大賞・推し本大賞など）'], ['author', '好きな著者']] },
  { k: 'where', t: '本を手に入れるところ（いくつでも）', max: 5, o: [['store', '本屋さん'], ['net', 'ネット書店'], ['ebook', '電子書籍'], ['used', '古本屋さん'], ['lib', '図書館で借りる']] },
  { k: 'pref', t: '住んでいる都道府県', pref: true },
  { k: 'found', t: '本めぐりを知ったきっかけ', o: [['x', 'X'], ['ig', 'Instagram'], ['tt', 'TikTok'], ['store', '本屋さんで'], ['friend', '知り合いから'], ['other', 'そのほか']] },
];
// イベントの設定を読み、参加の記録（店番号・日時・射程内か・お試しか・イベント＋名前のないランダムな端末の番号）を送る先
export const EVENTS_API = 'https://tsunagubooks.com/meguri/api/';
export const LEGACY_KEYS = ['honya_map_v2'];
export const RANGE_M = 120;        // 射程（m）
export const TERRITORY_M = 200;    // スタンプを押した店のまわりを塗る半径（m）
export const JUMP_MPS = 60;        // これより速く位置が飛んだら「飛んだ」と見なす（m/秒）
export const JUMP_COOLDOWN_MS = 60000;
// 歩いた距離：100mで1ページ（歩いて約1分半）。歩数は距離からの目安（ブラウザは端末の歩数計を読めない）
export const WALK = { pageM: 100, stepM: 0.7, minMoveM: 12, maxAccM: 60, walkMaxMps: 2.8, rideMaxMps: 45, gapS: 600, wantNearM: 500 };
// 店と店のあいだ（v0.14）：次の店でスタンプを押したとき、前の店からのまっすぐの距離のうち、まだ数えていない分を歩いたページに足す（同じ日・3kmまで・歩く速さまで）
export const SEG = { maxM: 3000, minM: 100, betweenM: 100 };
// 読書（v0.14.4）：地図の「読書をはじめる」で時間を計りはじめ、「おわる」で止める（本も読みかたも選ばない・ページ数は聞かない）。読んだ時間だけページ（1分で1ページ・1回60ページまで）。時間は1回3時間まで（押したまま忘れたとき）
export const READ = { pgPerMin: 1, maxPg: 60, maxMin: 180 };
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
  rec: { who: '書店員 Aさん（見本）', title: '（見本）ここに書名が入ります', author: '（見本）著者名', say: '（見本）取材でうかがった書店員さんのひとことが、ご本人の言葉のまま入ります。', shelf: '文庫の新刊台（見本）', photo: 'demo' } };
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
// 着せ替え（v0.15.2 ぶっくまさん「テスト的に着せ替えできるようにできる？ 地図の色もいろいろ変えたい」→ v0.15.3「お試しじゃなくて正式な機能でよい」）
// 画面の色＝色の変数を上書き（明るい見た目のときだけ）。sw は選ぶ丸の2色。ピン・スタンプの色は変えない（種類の見分けのため）
export const SKINS = {
  remon: { name: '檸檬（いま）', sw: ['#FFD447', '#FF6A48'], v: {} },
  sora: { name: '空', sw: ['#8CCBFF', '#2F9BFF'], v: { '--shu': '#2F9BFF', '--shu-2': '#1F7AE0', '--shu-soft': '#DCEEFF', '--gold': '#8CCBFF', '--gold-soft': '#E3F2FF', '--gold-ink': '#1F5E99', '--paper': '#F3F8FF', '--paper-2': '#E6F0FC', '--card-2': '#F3F8FF', '--line-2': '#C2D3E6' } },
  wakakusa: { name: '若草', sw: ['#A6E39A', '#2FA866'], v: { '--shu': '#2FA866', '--shu-2': '#1F8A50', '--shu-soft': '#DDF5E5', '--gold': '#A6E39A', '--gold-soft': '#E8F8E2', '--gold-ink': '#2E6B26', '--paper': '#F4FAF0', '--paper-2': '#E6F3DD', '--card-2': '#F4FAF0', '--line-2': '#C3D8B3' } },
  momo: { name: '桃', sw: ['#FFB3CB', '#FF5C8A'], v: { '--shu': '#FF5C8A', '--shu-2': '#E0406E', '--shu-soft': '#FFE0EA', '--gold': '#FFB3CB', '--gold-soft': '#FFE8F0', '--gold-ink': '#8A2F4D', '--paper': '#FFF5F8', '--paper-2': '#FCE6EE', '--card-2': '#FFF5F8', '--line-2': '#E6C3D0' } },
  murasaki: { name: '紫', sw: ['#C7AEFF', '#8F5BFF'], v: { '--shu': '#8F5BFF', '--shu-2': '#7442E0', '--shu-soft': '#EFE4FF', '--gold': '#C7AEFF', '--gold-soft': '#F1EAFF', '--gold-ink': '#4B2A8F', '--paper': '#F8F5FF', '--paper-2': '#ECE6FB', '--card-2': '#F8F5FF', '--line-2': '#D0C4EC' } },
  shu: { name: '朱', sw: ['#FFB38F', '#FF6A48'], v: { '--gold': '#FFB38F', '--gold-soft': '#FFE9DE', '--gold-ink': '#8A3A1C', '--paper': '#FFF6F0', '--paper-2': '#FCE7DC', '--card-2': '#FFF6F0' } },
};
// 地図の色（下地・家・建物・緑・林・砂・水・細い道とふち・大通りとふち・高速とふち・線路・文字・運動場・病院・学校）
export const MAP_SKINS = {
  cream: { name: 'クリーム（いま）', bg: '#FBEFD6', res: '#F6E6C8', bld: '#EFD9B0', green: '#BFE8A8', wood: '#B7E39F', sand: '#F7EAB8', water: '#9FD6F5', minor: '#FFFFFF', minorC: '#E3CFA6', major: '#FFD447', majorC: '#C9A227', mw: '#FFB84D', mwC: '#B8761A', rail: '#7A7369', text: '#5A554D', pitch: '#DDEBC4', hosp: '#FBE3E3', school: '#F3ECC4' },
  white: { name: '白', bg: '#F6F6F3', res: '#EEEEEA', bld: '#E2E0DA', green: '#CDE9C4', wood: '#C3E2B6', sand: '#EFE8CF', water: '#A9D4F2', minor: '#FFFFFF', minorC: '#D9D7D0', major: '#FFE38A', majorC: '#D2B256', mw: '#FFC27A', mwC: '#C48A3A', rail: '#8E8E8E', text: '#5A5A5A', pitch: '#DCEAD2', hosp: '#F8E6E6', school: '#F2EED8' },
  mizu: { name: '水色', bg: '#EAF4FB', res: '#DDEBF5', bld: '#CBDDED', green: '#BFE6C8', wood: '#B3E0BE', sand: '#EEF0D8', water: '#7CC4F0', minor: '#FFFFFF', minorC: '#C1D5E6', major: '#A8D8FF', majorC: '#5B9BD1', mw: '#6FBAFF', mwC: '#2F7FC9', rail: '#6E7B88', text: '#3E5366', pitch: '#D2EADB', hosp: '#F3E3EA', school: '#E6EEDB' },
  wakakusa: { name: '若草', bg: '#EEF6E4', res: '#E2EFD3', bld: '#D2E3BD', green: '#A9DB8C', wood: '#9CD47D', sand: '#F1EDC8', water: '#9FD6F5', minor: '#FFFFFF', minorC: '#C8DAB0', major: '#DDF08F', majorC: '#97B54A', mw: '#B8E065', mwC: '#7FA33A', rail: '#6F7A63', text: '#4E5A44', pitch: '#CFE6B6', hosp: '#F3E6E2', school: '#EAF0CF' },
  sepia: { name: '古地図', bg: '#F1E2C2', res: '#EAD6AE', bld: '#DCC291', green: '#CFD8A0', wood: '#C4D093', sand: '#F0DFAE', water: '#B7D2C8', minor: '#FAF0DA', minorC: '#C8AD7B', major: '#EAC47C', majorC: '#A8803E', mw: '#DBA35C', mwC: '#93652A', rail: '#6B5A45', text: '#5B4630', pitch: '#D9DCA8', hosp: '#EED9C6', school: '#EFE0B4' },
  momo: { name: '桃', bg: '#FCEFF3', res: '#F7E2E9', bld: '#EECFDB', green: '#CDEBC5', wood: '#C1E5B8', sand: '#F8EBD6', water: '#A9D8F5', minor: '#FFFFFF', minorC: '#E6C5D2', major: '#FFC6DC', majorC: '#D97FA6', mw: '#FF9DC4', mwC: '#C2608A', rail: '#7D6872', text: '#6A4E5A', pitch: '#DDEED6', hosp: '#FBE3E8', school: '#F6ECDF' },
};
