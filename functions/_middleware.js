/**
 * 乘法 · 后台入口守卫
 *
 * 后台页面本身是静态文件，原来靠页面里的 JS 判断角色后跳走，
 * 普通用户直接敲 /admin 会先看到界面骨架再被弹回首页。
 * 这里在边缘先挡一道：不是站长或管理员就根本拿不到这份 HTML。
 *
 * 只拦后台路径，其余请求原样放行。
 */

const ADMIN_ROLES = ['owner', 'admin'];
const COOKIE_NAME = 'cf_session';

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

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = (request.headers.get('User-Agent') || '').slice(0, 160);
  const cf = request.cf || {};
  const country = cf.country || '';

  let ref = '';
  const rawRef = request.headers.get('Referer') || '';
  if (rawRef) {
    try {
      const h = new URL(rawRef).hostname;
      if (h && h !== url.hostname) ref = h.slice(0, 80);
    } catch (e) { /* 来源不合法就不记 */ }
  }

  const path = url.pathname.slice(0, 120);

  const task = (async () => {
    const vid = (await sha256Hex(ip + '|' + ua)).slice(0, 20);
    await env.DB.prepare(
      'INSERT INTO visits (path, vid, country, ref, ua) VALUES (?, ?, ?, ?, ?)'
    ).bind(path, vid, country, ref, ua).run();
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
    if (!token) {
      return Response.redirect(new URL('/login?next=/admin', url).toString(), 302);
    }

    const tokenHash = await sha256Hex(token);
    const row = await env.DB.prepare(
      `SELECT s.expires_at, u.role, u.status, u.deleted_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`
    ).bind(tokenHash).first();

    const expired = !row || new Date(row.expires_at).getTime() < Date.now();

    if (expired || row.deleted_at || row.status !== 'active') {
      return Response.redirect(new URL('/login?next=/admin', url).toString(), 302);
    }

    if (ADMIN_ROLES.indexOf(row.role) < 0) {
      return Response.redirect(new URL('/home', url).toString(), 302);
    }

    return next();
  } catch (err) {
    /* 守卫自身出错不能把人锁在门外，交回页面里的角色判断 */
    console.error('admin guard failed:', err && err.message);
    return next();
  }
}
