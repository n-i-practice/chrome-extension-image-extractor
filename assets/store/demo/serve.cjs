// 撮影用ギャラリーだけをループバックで公開する。外部への公開には使用しない。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' };
http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (name !== path.basename(name) || !types[path.extname(name)]) { res.writeHead(404).end(); return; }
  fs.readFile(path.join(root, name), (error, bytes) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-store' }).end(bytes);
  });
}).listen(4175, '127.0.0.1', () => console.log('Demo gallery: http://127.0.0.1:4175/'));
