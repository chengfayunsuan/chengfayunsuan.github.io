// 临时预览服务器：把 My-Website 目录当静态站点跑起来
// 支持：目录->index.html、无扩展名->自动补 .html（和 Cloudflare Pages 行为一致）
// 用法：node js/preview-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..'); // 本脚本在 js/ 下，ROOT 指回 My-Website
const PORT = 5500;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function serve(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + filePath);
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function resolveFile(absPath, cb) {
  // 1) 本身就是文件
  if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) return cb(absPath);
  // 2) 目录 -> index.html
  if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
    const idx = path.join(absPath, 'index.html');
    if (fs.existsSync(idx)) return cb(idx);
  }
  // 3) 无 .html 扩展 -> 补 .html
  if (!absPath.endsWith('.html')) {
    const withHtml = absPath + '.html';
    if (fs.existsSync(withHtml)) return cb(withHtml);
  }
  // 4) 都失败
  return cb(null);
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const safe = path.normalize(path.join(ROOT, urlPath));
  if (!safe.startsWith(ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  resolveFile(safe, (filePath) => {
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + urlPath);
    }
    serve(res, filePath);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Preview server running at http://localhost:' + PORT);
});
