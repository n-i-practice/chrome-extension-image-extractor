// ストア撮影用の独自図形とデモページを生成する。拡張の配布ビルドには含めない。
const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;
const drawings = [
  ['terraces.svg', 1200, 900, '#f4d7bc', '<path d="M0 720L1200 350V900H0Z" fill="#ac593f"/><path d="M0 530L1200 160V360L0 730Z" fill="#cf8561"/><circle cx="930" cy="160" r="80" fill="#fff0c9"/>'],
  ['waves.svg', 1000, 1000, '#103f68', '<path d="M0 450Q250 200 500 450T1000 450V1000H0" fill="#287f9e"/><path d="M0 650Q250 400 500 650T1000 650V1000H0" fill="#64b5bd"/><path d="M0 850Q250 600 500 850T1000 850V1000H0" fill="#c0e4d9"/>'],
  ['leaf.svg', 800, 1100, '#ececd8', '<path d="M400 950Q20 300 650 120Q850 650 400 950" fill="#326954"/><path d="M400 950L650 120M450 780L260 510M500 590L720 420" fill="none" stroke="#b8d1a7" stroke-width="16"/>'],
  ['sunrise.svg', 1400, 900, '#ebc8c0', '<circle cx="700" cy="420" r="230" fill="#f9e0a7"/><path d="M0 640L400 400L800 720L1150 440L1400 610V900H0" fill="#8d7187"/><path d="M0 800L400 640L900 800L1400 650V900H0" fill="#445971"/>'],
  ['orbit.svg', 1000, 1000, '#172d53', '<circle cx="500" cy="500" r="180" fill="#f4bd58"/><ellipse cx="500" cy="500" rx="400" ry="140" transform="rotate(-30 500 500)" fill="none" stroke="#8bcaca" stroke-width="35"/>'],
  ['transparent.svg', 900, 900, 'none', '<circle cx="350" cy="350" r="230" fill="#1475e3"/><circle cx="560" cy="550" r="230" fill="#ffca35" fill-opacity=".8"/>'],
  ['small.svg', 240, 240, '#e2eaf4', '<circle cx="120" cy="120" r="70" fill="#286bdd"/>'],
];
for (const [name, width, height, bg, art] of drawings) {
  fs.writeFileSync(path.join(dir, name), `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${bg}"/>${art}</svg>`);
}
const files = ['alpine-lake.jpg', ...drawings.map(d => d[0])];
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Image Extractor demo gallery</title>
<style>body{font:16px system-ui;margin:40px;background:#f2f4f8;color:#17304c}main{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}figure{margin:0;background:white;padding:16px;border-radius:12px}img{width:100%;height:240px;object-fit:contain}figcaption{padding-top:12px}</style>
<h1>Image Extractor demo gallery</h1><p>Original demonstration artwork for store screenshots. Open the extension after all images load.</p><main>
${files.map((file, i) => `<figure><img src="${file}" alt="Demo image ${i + 1}"><figcaption>${file}</figcaption></figure>`).join('\n')}
</main></html>`);
console.log('Demo gallery created:', files.length, 'images');
