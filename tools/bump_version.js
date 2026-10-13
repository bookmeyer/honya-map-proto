// 版を上げる道具：node tools/bump_version.js 0.5.3
// 直すもの：js/config.js の APP_VER、js/*.js の import の ?v=、index.html の ?v=、sw.js の V
// 部品（js/*.js）のURLに版が付くので、ブラウザやサービスワーカーに古い部品が混ざらない
const fs = require('fs');
const path = require('path');

const ver = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(ver || '')) { console.error('使い方: node tools/bump_version.js 0.5.3'); process.exit(1); }
const root = path.join(__dirname, '..');
let n = 0;
const edit = (file, fn) => {
  const p = path.join(root, file); const s = fs.readFileSync(p, 'utf8'); const t = fn(s);
  if (t !== s) { fs.writeFileSync(p, t); console.log('直した', file); n++; }
};
for (const f of fs.readdirSync(path.join(root, 'js')).filter((x) => x.endsWith('.js'))) {
  edit('js/' + f, (s) => s
    .replace(/(from\s+')(\.\/[a-z]+\.js)(\?v=[^']*)?'/g, `$1$2?v=${ver}'`)
    .replace(/(import\s+')(\.\/[a-z]+\.js)(\?v=[^']*)?'/g, `$1$2?v=${ver}'`));
}
edit('js/config.js', (s) => s.replace(/APP_VER = '[^']*'/, `APP_VER = '${ver}'`));
edit('index.html', (s) => s.replace(/\?v=\d+\.\d+\.\d+/g, `?v=${ver}`));
edit('sw.js', (s) => s.replace(/const V = '[^']*'/, `const V = '${ver}'`));
console.log(n ? `版 ${ver} にしました（${n}ファイル）` : `すでに版 ${ver} です`);
