# 本屋の地図（試作） v0.2 位置ゲー版

本屋をめぐる位置ゲームの、動くサンプルです。駅メモ型（店に着いて「印」を集める・制覇）とポケモンGO型（現在地が動き、近づくと反応する）を合わせています。ブラウザだけで動く静的なPWAで、サーバーもログインもありません。

## 遊び方
1. 地図の「◎」で現在地を追い始める（https で開いたときだけ）。歩くと青い点が動きます
2. 店から **120m** 以内に入ると「射程内」。ピンが金色に光り、振動と「あと○m」のレーダーが出ます
3. 店のページで **「印をもらう」**。その店だけの印（4,179種類・レア度 ★〜★★★）が手に入り、経験値が入ります。店のまわりが朱に塗られます
4. 買った本の裏のバーコードを読むと **カード** が1枚（表紙と書誌は openBD）
5. **図鑑**に印・カード・帳・都道府県がたまり、**ミッション**（今週のお題）と**ご当地ラリー**（神保町・渋谷・新宿・松山・札幌・大阪）で称号

家で試すとき：地図の「👣 お試し歩き」をオンにすると、地図を押した場所に自分がいることになります。「⤴」で本屋の近くへワープ。

## 持たないもの（設計どおり）
読了・評価・レビュー・いいね・フォロー／景品／通知（アプリを閉じている間は反応しません）／ログイン（記録は端末の中だけ）

## 動かし方
- パソコン：このフォルダで `python -m http.server 8765` → http://localhost:8765/
- スマホ：このフォルダの中身をそのまま https の置き場（Xserver のサブドメインなど）に置く。カメラ・位置・ホーム画面追加は https が必要
- GitHub Pages に置く場合：リポジトリの直下に置き、Settings → Pages → Branch main / (root)

## ファイル
| ファイル | 役目 |
|---|---|
| `index.html` `style.css` `app.js` | 画面と動き（ビルド不要） |
| `manifest.webmanifest` `sw.js` `icon-*.png` | ホーム画面に追加するための部品 |
| `data/bookstores.json` | 店のデータ（OpenStreetMap。`tools/build_data.js` で作る） |
| `data/rallies.json` | ご当地ラリーの組（`tools/build_rallies.js` で作る） |
| `tools/overpass_query.txt` `tools/build_data.js` `tools/build_rallies.js` `tools/make_icons.js` | データとアイコンを作る道具 |

店のデータを作り直すとき（curl と node）：
```
curl -A "honya-map/0.2" --data-urlencode "data@tools/overpass_query.txt" -o data/bookstores_raw.json https://overpass-api.de/api/interpreter
node tools/build_data.js data/bookstores_raw.json data/bookstores.json
node tools/build_rallies.js data/bookstores.json data/rallies.json
```

## 使っている外部のもの（すべて無料・鍵なし）
- 地図：MapLibre GL JS（jsDelivr）＋ OpenFreeMap のタイル
- 本の情報：openBD。書影は参照表示だけで、保存しません
- バーコード：ブラウザ標準の BarcodeDetector（Android Chrome）。無い端末は ZXing（jsDelivr）
- 店の位置：OpenStreetMap（ODbL）

## 試作で「まだ」のこと
- 記録はサーバーに送りません（ランキング・みんなの出会い・店に返す数字は本番で）
- 都道府県は、住所の情報がない店は近い県庁所在地に寄せた目安
- 印の見た目は店ごとに自動で作っています（本番では公認店にちゃんとした印を）
- 閉店・位置ずれの直し、公認店の管理画面は本番で
- iPhone のホーム画面版は位置の許可が出ないことがあります（その場合は Safari で開く）
