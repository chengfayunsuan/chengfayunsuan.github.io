/**
 * Chengfa · 后台入口守卫
 *
 * 后台页面本身是静态文件，原来靠页面里的 JS 判断角色后跳走，
 * 普通用户直接敲 /admin 会先看到界面骨架再被弹回首页。
 * 这里在边缘先挡一道：不是站长或管理员就根本拿不到这份 HTML。
 *
 * 只拦后台路径，其余请求原样放行。
 *
 * 未授权一律返回 404（复用站点 404.html 页面），不给登录跳转、不给任何
 * 「这里有个后台」的提示——外人敲 /admin 看到的就是一个不存在的页面。
 */

const ADMIN_ROLES = ['owner', 'admin'];
const COOKIE_NAME = 'cf_session';

/* 伪 404：拿站点自己的 404.html 当内容，状态码给 404。
   fetch 的是 /404.html，不匹配守卫路径，不会再绕回这里。 */
async function adminNotFound(url) {
  try {
    const r = await fetch(new URL('/404.html', url).toString());
    if (r.ok) {
      return new Response(r.body, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  } catch (e) { /* 取不到就用下面的兜底 */ }
  return new Response('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>404</title></head><body><h1>404</h1></body></html>', {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* 只记「人打开的页面」：静态资源、接口、预渲染都不算。
   博客/爬虫也会进来，用 UA 粗筛一下，明显是脚本的不记。 */
const SKIP_EXT = /\.(css|js|mjs|json|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|map|txt|xml)$/i;
const BOT_UA = /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|curl|wget|python-requests|headless)/i;

function isPageView(request, url) {
  if (request.method !== 'GET') return false;
  if (SKIP_EXT.test(url.pathname)) return false;
  if (/^\/(api|cdn-cgi)\//.test(url.pathname)) return false;
  /* 后台与实验台是站长自己的操作，算进流量只会把前台的数据搅浑 */
  if (/^\/(admin|lab)(\/|$)/.test(url.pathname)) return false;
  const accept = request.headers.get('Accept') || '';
  if (!accept.includes('text/html')) return false;
  const ua = request.headers.get('User-Agent') || '';
  if (BOT_UA.test(ua)) return false;
  return true;
}

/* 记一行访问日志。失败不影响页面返回，所以整段吞掉错误。 */
function logVisit(context, url) {
  const { request, env } = context;
  if (!env || !env.DB) return;

  const ip = (request.headers.get('CF-Connecting-IP') || '').slice(0, 45);
  const ua = (request.headers.get('User-Agent') || '').slice(0, 160);
  const cf = request.cf || {};
  const country = cf.country || '';
  /* 边缘节点能给到什么就记什么，本地 wrangler 下这些基本都是空 */
  const region = (cf.region || '').slice(0, 60);
  const city = (cf.city || '').slice(0, 60);
  const asn = cf.asn ? String(cf.asn).slice(0, 12) : '';
  const org = (cf.asOrganization || '').slice(0, 80);
  const colo = (cf.colo || '').slice(0, 8);

  let ref = '';
  const rawRef = request.headers.get('Referer') || '';
  if (rawRef) {
    try {
      const h = new URL(rawRef).hostname;
      if (h && h !== url.hostname) ref = h.slice(0, 80);
    } catch (e) { /* 来源不合法就不记 */ }
  }

  const path = url.pathname.slice(0, 120);

  /* 这两个只用来判断「是不是真浏览器」，不上报给任何人 */
  const lang = (request.headers.get('Accept-Language') || '').slice(0, 60);
  const fetchMode = (request.headers.get('Sec-Fetch-Mode') || '').slice(0, 16);

  const task = (async () => {
    const vid = (await sha256Hex(ip + '|' + ua)).slice(0, 20);
    await env.DB.prepare(
      `INSERT INTO visits (path, vid, ip, country, region, city, asn, org, colo, ref, ua, lang, fetch)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(path, vid, ip, country, region, city, asn, org, colo, ref, ua, lang, fetchMode).run();
  })().catch(() => {});

  if (context.waitUntil) context.waitUntil(task);
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  /* 顺手记一笔访问，不挡请求 */
  try {
    if (isPageView(request, url)) logVisit(context, url);
  } catch (e) { /* 记录失败不影响页面 */ }

  const guarded = /^\/admin(\/|$)/.test(path) || /^\/pages\/admin/.test(path);
  if (!guarded) return next();

  /* 后台路径下的静态资源不该走到这里，兜底放行 */
  if (/\.(css|js|png|jpg|jpeg|svg|ico|webp|woff2?)$/i.test(path)) return next();

  try {
    const token = readCookie(request, COOKIE_NAME);
    if (!token) return await adminNotFound(url);

    const tokenHash = await sha256Hex(token);
    const row = await env.DB.prepare(
      `SELECT s.expires_at, u.role, u.status, u.deleted_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`
    ).bind(tokenHash).first();

    const expired = !row || new Date(row.expires_at).getTime() < Date.now();

    if (expired || row.deleted_at || row.status !== 'active') {
      return await adminNotFound(url);
    }

    if (ADMIN_ROLES.indexOf(row.role) < 0) {
      return await adminNotFound(url);
    }

    return next();
  } catch (err) {
    /* 守卫自身出错不能把人锁在门外，交回页面里的角色判断 */
    console.error('admin guard failed:', err && err.message);
    return next();
  }
}
