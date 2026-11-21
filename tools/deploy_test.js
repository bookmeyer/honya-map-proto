// テスト版を作る道具（v0.33.1〜。11/21 ぶっくまさん「本番リリースしたので、テスト環境が必要だと思うんです」→ A：bookmeyer.github.io/meguri-test/）
//   node tools/deploy_test.js          … テスト版を ../試作_地図アプリ_テスト版 に作るだけ（送らない）
//   node tools/deploy_test.js --push   … 作って、テスト用の置き場所（GitHub の bookmeyer/meguri-test）に送る
// 手元のいまの中身（まだ本番に出していない直しもふくむ）を写して、テスト用に書きかえる：
//   ・記録の送り先を、テスト用のサーバー（tsunagubooks.com/meguri-test/）に。本番の送り先が残っていたら、止める
//   ・画面のいちばん上に「テスト版」の帯。検索に出さない（noindex・robots.txt で全部おことわり）
//   ・ホーム画面に置いたときの名前を「本めぐりテスト」に（本番のアイコンと見分ける）
//   ・本番のドメインの印（CNAME）・サイトマップ・GitHub の自動の作業（.github）は写さない
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC = path.join(__dirname, '..');
const DST = path.join(SRC, '..', '試作_地図アプリ_テスト版');
const TEST_API = 'https://tsunagubooks.com/meguri-test/api/';
const PROD_API = 'https://tsunagubooks.com/meguri/api/';
const PUSH = process.argv.includes('--push');

const KEEP = (f) => /^(index|howto|privacy|terms)\.html$/.test(f) || /^(sw\.js|manifest\.webmanifest|ogp\.png|icon-[a-z0-9-]+\.png|apple-touch-icon\.png)$/.test(f) || /^(css|js|data)\//.test(f);
const files = execSync('git ls-files', { cwd: SRC, encoding: 'utf8' }).split('\n').filter(Boolean).filter(KEEP);
// まだ git に入っていない新しい部品（js/*.js など）も写す
for (const d of ['js', 'css']) for (const f of fs.readdirSync(path.join(SRC, d))) { const r = `${d}/${f}`; if (!files.includes(r) && fs.statSync(path.join(SRC, r)).isFile()) files.push(r); }

const BAND = '<div id="test-band" style="position:fixed;left:0;right:0;top:0;z-index:9999;background:#C1121F;color:#fff;font:700 11px/1.7 sans-serif;text-align:center;pointer-events:none;padding-top:env(safe-area-inset-top)">テスト版（本番ではありません・記録はテスト用のサーバーへ）</div>';
const noindex = (s) => s.replace(/<head>/i, '<head>\n<meta name="robots" content="noindex, nofollow">').replace(/^.*<link rel="canonical"[^>]*>\s*\n/m, '');
const TRANSFORM = {
  'js/config.js': (s) => { if (!s.includes(`'${PROD_API}'`)) throw new Error('config.js に本番の送り先が見つかりません（書きかえ方を見直してください）'); return s.replace(`'${PROD_API}'`, `'${TEST_API}'`); },
  'index.html': (s) => noindex(s).replace(/(<body[^>]*>)/i, `$1\n${BAND}`),
  'howto.html': noindex, 'privacy.html': noindex, 'terms.html': noindex,
  'manifest.webmanifest': (s) => s.replace(/"name":\s*"[^"]*"/, '"name": "本めぐりテスト"').replace(/"short_name":\s*"[^"]*"/, '"short_name": "テスト版"'),
};

fs.mkdirSync(DST, { recursive: true });
// 前のテスト版にあって、今回ないファイルは消す（.git と、ここで作るファイルは残す）
const made = new Set([...files, 'robots.txt', 'README.md', '.nojekyll']);
const walk = (d, base = '') => { for (const n of fs.readdirSync(d)) { if (!base && n === '.git') continue; const p = path.join(d, n), r = base ? `${base}/${n}` : n; if (fs.statSync(p).isDirectory()) walk(p, r); else if (!made.has(r)) { fs.unlinkSync(p); console.log('消した', r); } } };
walk(DST);
for (const f of files) {
  const from = path.join(SRC, f), to = path.join(DST, f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (TRANSFORM[f]) fs.writeFileSync(to, TRANSFORM[f](fs.readFileSync(from, 'utf8'))); else fs.copyFileSync(from, to);
}
fs.writeFileSync(path.join(DST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(DST, 'README.md'), '# 本めぐり テスト版\n\n本番（https://meguri.tsunagubooks.com/）に出す前に確かめるための、テスト版です。記録はテスト用のサーバーに送ります。\nこの中身は `tools/deploy_test.js` で作っています。ここを直接直さないでください。\n');
fs.writeFileSync(path.join(DST, '.nojekyll'), '');

// 本番の送り先が残っていないか（残っていたら送らない）
const bad = [];
const scan = (d, base = '') => { for (const n of fs.readdirSync(d)) { if (n === '.git') continue; const p = path.join(d, n), r = base ? `${base}/${n}` : n; if (fs.statSync(p).isDirectory()) scan(p, r); else if (/\.(js|html|json|webmanifest)$/.test(n) && !/^data\//.test(r) && fs.readFileSync(p, 'utf8').includes(PROD_API)) bad.push(r); } };
scan(DST);
if (bad.length) { console.error('止めました：テスト版に本番の送り先が残っています →', bad.join(', ')); process.exit(1); }
const ver = (fs.readFileSync(path.join(DST, 'js/config.js'), 'utf8').match(/APP_VER = '([^']*)'/) || [])[1];
console.log(`テスト版 v${ver} を作りました（${files.length}ファイル）→ ${DST}`);

if (PUSH) {
  if (!fs.existsSync(path.join(DST, '.git'))) { console.error('テスト用の置き場所（git）がまだありません。手順書の「テスト版の置き場所を作る」を先に'); process.exit(1); }
  const run = (c) => execSync(c, { cwd: DST, stdio: 'inherit' });
  run('git add -A');
  try { execSync('git diff --cached --quiet', { cwd: DST }); console.log('変わったところがないので、送りません'); process.exit(0); } catch (e) { /* 変わったところがある */ }
  run(`git commit -q -m "テスト版 v${ver}"`);
  run('git push -q origin main');
  console.log('送りました：https://bookmeyer.github.io/meguri-test/ （1〜2分で変わります）');
}
