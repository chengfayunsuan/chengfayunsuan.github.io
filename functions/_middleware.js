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

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

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
