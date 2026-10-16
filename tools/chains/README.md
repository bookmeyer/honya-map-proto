# チェーン公式店舗一覧の部品（アダプター）

`tools/chain_check.js` が、このフォルダの `*.js`（`_lib.js` 以外）を全部読み込み、各チェーンの公式サイトから店舗一覧を取って、地図データ（`data/bookstores.json`）と突き合わせます。

## 部品の形（CommonJS）

```js
const lib = require('./_lib');
module.exports = {
  id: 'kinokuniya',                       // ファイル名と同じ。英小文字
  name: '紀伊國屋書店',                    // 人が読む名前
  brand: /紀伊國屋|紀伊国屋|Kinokuniya/i, // 地図データの店名のうち、このチェーンとみなすもの
  source: 'https://store.kinokuniya.co.jp/store/',  // 人が確かめに行くURL
  complete: true,                         // 公式一覧が全店をカバーしているなら true（閉店候補を出してよい）
  async fetch() {
    const html = await lib.get(this.source);
    // … 店名と住所を抜き出す …
    return lib.uniq(list);               // [{ name: '紀伊國屋書店 新宿本店', address: '東京都新宿区新宿3-17-7', url: '…' }, …]
  },
};
```

- `name` は公式の表記のまま（チェーン名＋支店名）。`address` は都道府県から（なければ空文字でもよいが、あると位置で突き合わせられる）。
- 取得は `lib.get(url)`（文字コード自動判定・1回ごとに0.7秒待つ）。JSONなら `lib.json(url)`。タグ外しは `lib.strip(html)`。
- 複数ページ・都道府県ごとのページは、順に取ってつなげる。1チェーンで100回以上の取得になるなら、まとめて取れる口がないか先に探す。
- 公式サイトに一覧が無い／JavaScriptでしか出ない／ログインが要る場合は、無理に作らない。`fetch()` で `throw new Error('一覧が取れない：理由')`。

## 確かめ方

```
node tools/chain_check.js --fetch-only --only kinokuniya
```
件数と最初の3件が出ます。件数が公式の店舗数とだいたい合っていること、`name` に支店名、`address` に都道府県が入っていることを見ます。
