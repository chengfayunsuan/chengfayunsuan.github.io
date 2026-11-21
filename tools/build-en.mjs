#!/usr/bin/env node
/**
 * 英文站生成器
 *
 * 中文页面只有一份（pages/*.html），英文页面由这个脚本生成到 pages/en/。
 * 字典在 i18n/zh-en.json，键是中文原文、值是英文。
 *
 * 为什么不是「再写一套英文 HTML」：那样每改一次文案要改两处，迟早两边不一样。
 * 现在改中文、跑一次本脚本，英文自动跟上。
 *
 * 用法：
 *   node tools/build-en.mjs            生成 pages/en/ + en.html
 *   node tools/build-en.mjs --list     只打印待翻译的中文（去重），用于补字典
 *
 * 新增页面时把它加进 PAGES 即可。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'en');
const DICT_FILE = path.join(ROOT, 'i18n', 'zh-en.jsonl');

/* 需要出英文版的前台页面。后台（admin*）只有站长自己用，不出英文。 */
const PAGES = [
  'index.html',
  'pages/login.html',
  'pages/hall.html',
  'pages/home.html',
  'pages/earn.html',
  'pages/store.html',
  'pages/ledger.html',
  'pages/ladder.html',
  'pages/messages.html',
  'pages/notices.html',
  'pages/support.html',
  'pages/privacy.html',
  'pages/terms.html',
  'pages/settings.html',
  'pages/survey.html',
  'pages/space.html',
  'pages/mock-wall.html'
];

/* 已经有英文版的路径。英文页里的链接只有命中这里才加 /en，否则指回中文页，避免 404 */
const EN_PATHS = [
  '/', '/login', '/hall', '/home', '/earn', '/store',
  '/ledger', '/ladder', '/messages', '/notices', '/support',
  '/privacy', '/terms', '/settings', '/survey', '/space', '/mock-wall'
];

const CN = /[\u4e00-\u9fa5]/;

/* 文本里的换行和缩进一律压成单空格，字典只需写一行 */
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

/* 字典一行一条：{"zh":"...","en":"..."}，分文件写也方便 */
const dict = {};
if (fs.existsSync(DICT_FILE)) {
  for (const line of fs.readFileSync(DICT_FILE, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t[0] !== '{') continue;
    try {
      const o = JSON.parse(t);
      if (o && o.zh && o.en) {
        dict[norm(o.zh)] = o.en;
        /* 有些文案是「空格 + 量词」这种片段（' 笔'、' 秒'），空格是它的一部分。
           norm 会把首尾空格剪掉，导致运行时按原样匹配不上，所以再存一份原样的。 */
        if (o.zh !== norm(o.zh)) dict[o.zh] = o.en;
      }
    } catch (e) {}
  }
}

/* 生成时把没翻到的中文记下来，最后统一报告，免得悄悄漏一半 */
const missing = new Map();
function noteMissing(s, file) {
  if (!missing.has(s)) missing.set(s, { count: 0, files: new Set() });
  const it = missing.get(s);
  it.count++;
  it.files.add(file);
}

function trKey(raw) {
  const core = norm(raw);
  if (!core) return null;
  if (dict[core]) return dict[core];

  /* 允许字典里写带句末标点的版本，例如「登录。」 */
  const noPunct = core.replace(/[：:，,。.、；;！!？?]+$/g, '');
  if (noPunct && dict[noPunct]) {
    const tail = core.slice(noPunct.length);
    return dict[noPunct] + tail.replace(/。/g, '.').replace(/，/g, ',').replace(/：/g, ':');
  }
  return null;
}

/* 把 <script> / <style> 整块抠出来，免得把代码里的中文和尖括号当文案处理 */
function protect(html) {
  const blocks = [];
  const put = (m) => {
    blocks.push(m);
    return '\u0000' + (blocks.length - 1) + '\u0000';
  };
  html = html.replace(/<script[\s\S]*?<\/script>/gi, put);
  html = html.replace(/<style[\s\S]*?<\/style>/gi, put);
  return {
    html,
    restore: (s) => s.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[Number(i)])
  };
}

function prefixHref(html) {
  return html.replace(/href="(\/[^"]*)"/g, (m, href) => {
    if (/^\/(en|api|css|js|admin|cdn-cgi|favicon)/.test(href)) return m;
    const clean = href.split('?')[0].split('#')[0];
    if (!EN_PATHS.includes(clean)) return m;      /* 没英文版就留在中文页 */
    if (clean === '/') return 'href="/en"';
    return 'href="/en' + href + '"';
  });
}

/* 导航里插一个语言切换。中文页给「EN」，英文页给「中文」 */
function addLangSwitch(html, isEn) {
  const label = isEn ? '中文' : 'EN';
  const href = isEn ? '__ZH_HREF__' : '__EN_HREF__';
  const el = '<a class="hm-nav__lang" href="' + href + '" title="' +
    (isEn ? '切回中文' : 'Switch to English') + '">' + label + '</a>';

  if (html.includes('<div class="hm-nav">')) {
    return html.replace('<div class="hm-nav">', '<div class="hm-nav">\n      ' + el);
  }
  /* 没有 nav 的页面（比如落地页）就不加 */
  return html;
}

function convert(file, isEn) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const p = protect(src);
  let html = p.html;

  /* 1. 文本节点 */
  html = html.replace(/>([^<>]+)</g, (m, txt) => {
    if (!CN.test(txt)) return m;
    const lead = txt.match(/^\s*/)[0];
    const tail = txt.match(/\s*$/)[0];
    const core = txt.trim();
    const en = trKey(core);
    if (en == null) { noteMissing(core, file); return m; }
    return '>' + lead + en + tail + '<';
  });

  /* 2. 会显示给人看的属性 */
  html = html.replace(/(placeholder|title|aria-label|alt)="([^"]*)"/g, (m, attr, val) => {
    if (!CN.test(val)) return m;
    const en = trKey(val);
    if (en == null) { noteMissing(val, file); return m; }
    return attr + '="' + en + '"';
  });

  /* 3. <title> 与 meta description 单独处理（它们在 head 里，也可能带中文） */
  html = html.replace(/<title>([^<]*)<\/title>/, (m, t) => {
    if (!CN.test(t)) return m;
    const en = trKey(t);
    if (en == null) { noteMissing(t, file); return m; }
    return '<title>' + en + '</title>';
  });
  html = html.replace(/(<meta name="description" content=")([^"]*)(")/, (m, a, val, b) => {
    if (!CN.test(val)) return m;
    const en = trKey(val);
    if (en == null) { noteMissing(val, file); return m; }
    return a + en + b;
  });

  html = p.restore(html);

  /* 4. 语言标记、链接前缀、切换按钮（源文件里那条 EN 按钮要去掉，只留「中文」） */
  html = html.replace(/[ \t]*<a class="hm-nav__lang"[\s\S]*?<\/a>\n?/g, '');
  html = html.replace('<html lang="zh-CN"', '<html lang="en"');
  html = prefixHref(html);
  html = addLangSwitch(html, isEn);

  /* 落地页的导航结构不一样（.nav__cta），单独把那颗按钮换成「中文」 */
  if (isEn) {
    html = html.replace(
      /<a class="nav__lang"[^>]*>EN<\/a>/,
      '<a class="nav__lang" href="/" title="切回中文">中文</a>'
    );
  }

  /* 末尾挂运行时翻译，补 JS 拼出来的文案 */
  html = html.replace('</body>', '<script src="/en/dict.js?v=2"></script>\n<script src="/js/i18n-en.js?v=5" defer></script>\n</body>');

  return html;
}

/* ---------- 主流程 ---------- */

if (process.argv.includes('--list')) {
  const all = new Map();
  for (const f of PAGES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const p = protect(src);
    const add = (s) => {
      const t = s.trim();
      if (!t || !CN.test(t)) return;
      if (!all.has(t)) all.set(t, new Set());
      all.get(t).add(f);
    };
    let m;
    const re = />([^<>]+)</g;
    while ((m = re.exec(p.html))) add(m[1]);
    const re2 = /(?:placeholder|title|aria-label|alt|content)="([^"]*)"/g;
    while ((m = re2.exec(p.html))) add(m[1]);
    const re3 = /<title>([^<]*)<\/title>/g;
    while ((m = re3.exec(p.html))) add(m[1]);
  }
  const arr = [...all.entries()].sort((a, b) => b[1].size - a[1].size || b[0].length - a[0].length);
  console.log('待翻译条目（去重）：' + arr.length);
  for (const [s, files] of arr) {
    const done = dict[s.trim()] ? '✓' : ' ';
    console.log(done + ' | ' + s + '   ← ' + [...files].join(','));
  }
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

/* 中文页先插一个「EN」按钮，地址留占位符，最后统一回填 */
function ensureZhSwitch(file) {
  const p = path.join(ROOT, file);
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('hm-nav__lang')) return;
  if (!html.includes('<div class="hm-nav">')) return;
  const el = '<a class="hm-nav__lang" href="__EN_HREF__" title="Switch to English">EN</a>';
  html = html.replace('<div class="hm-nav">', '<div class="hm-nav">\n      ' + el);
  fs.writeFileSync(p, html);
}

let converted = 0;
for (const f of PAGES) {
  ensureZhSwitch(f);
  const html = convert(f, true);
  const dest = path.join(OUT_DIR, path.basename(f));
  fs.writeFileSync(dest, html);
  converted++;
}

/* 英文页里的语言切换链接：/en/hall -> /hall */
function zhHrefFor(file) {
  if (file === 'index.html') return '/';
  const name = path.basename(file, '.html');
  return '/' + name;
}

/* 回填中文链接 */
for (const f of PAGES) {
  const out = path.join(OUT_DIR, path.basename(f));
  let html = fs.readFileSync(out, 'utf8');
  const zh = zhHrefFor(f);
  html = html.split('__ZH_HREF__').join(zh);
  fs.writeFileSync(out, html);
}

/* 中文页也要能跳到英文页：给源码里的切换按钮填 /en 地址 */
for (const f of PAGES) {
  const zhFile = path.join(ROOT, f);
  let html = fs.readFileSync(zhFile, 'utf8');
  if (!html.includes('__EN_HREF__')) continue;
  const name = path.basename(f, '.html');
  const en = name === 'index' ? '/en' : '/en/' + name;
  html = html.split('__EN_HREF__').join(en);
  fs.writeFileSync(zhFile, html);
}

fs.writeFileSync(path.join(OUT_DIR, 'dict.js'), 'window.__EN_DICT=' + JSON.stringify(dict) + ';\n');
console.log('已生成英文页：' + converted + ' 个 → en/');

if (missing.size) {
  const list = [...missing.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log('\n还有 ' + list.length + ' 条没翻到（按出现次数）：');
  list.slice(0, 40).forEach(([s, it]) => {
    console.log('  ' + String(it.count).padStart(3) + '× ' + s.slice(0, 60) + '   [' + [...it.files].slice(0, 3).join(',') + ']');
  });
  if (list.length > 40) console.log('  … 其余 ' + (list.length - 40) + ' 条');
}
