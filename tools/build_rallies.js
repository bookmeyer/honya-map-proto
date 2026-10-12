// ご当地ラリー（店の集まり）を、店データから作る。使い方: node tools/build_rallies.js data/bookstores.json data/rallies.json
const fs = require('fs');
const [,, inFile, outFile] = process.argv;
const stores = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const dist = (a, b, c, d) => { const R = 6371000, t = Math.PI / 180; const x = (c - a) * t, y = (d - b) * t; const s = Math.sin(x / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const defs = [
  { id: 'jimbocho', name: '神保町 本の街ラリー', la: 35.6958, lo: 139.7577, r: 500, max: 8, title: '神保町の主', desc: '古書店が並ぶ本の街。8店の印を集める' },
  { id: 'shibuya', name: '渋谷 本屋ラリー', la: 35.6595, lo: 139.7005, r: 900, max: 6, title: '渋谷の本好き', desc: '駅のまわりの6店' },
  { id: 'shinjuku', name: '新宿 本屋ラリー', la: 35.6905, lo: 139.7040, r: 800, max: 6, title: '新宿の本好き', desc: '駅のまわりの6店' },
  { id: 'matsuyama', name: '松山 本屋ラリー', la: 33.8395, lo: 132.7657, r: 2500, max: 6, title: '伊予の本好き', desc: '愛媛・松山の6店' },
  { id: 'sapporo', name: '札幌 本屋ラリー', la: 43.0620, lo: 141.3540, r: 2500, max: 6, title: '北の本好き', desc: '札幌の6店' },
  { id: 'osaka', name: '大阪 キタ・ミナミ本屋ラリー', la: 34.6937, lo: 135.5023, r: 2500, max: 6, title: '浪速の本好き', desc: '梅田から難波まで6店' },
];
const out = [];
for (const d of defs) {
  const near = stores.map((s) => ({ s, d: dist(d.la, d.lo, s.la, s.lo) })).filter((x) => x.d <= d.r).sort((a, b) => a.d - b.d).slice(0, d.max);
  if (near.length < 3) { console.log('skip', d.id, near.length); continue; }
  out.push({ id: d.id, name: d.name, desc: d.desc, title: d.title, la: d.la, lo: d.lo, stores: near.map((x) => x.s.i) });
  console.log(d.id, near.map((x) => x.s.n).join(' / '));
}
fs.writeFileSync(outFile, JSON.stringify(out));
console.log('rallies:', out.length);
