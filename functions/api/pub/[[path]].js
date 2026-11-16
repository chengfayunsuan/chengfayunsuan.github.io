/* ============================================================
   乘法 · 公开资料接口
   ------------------------------------------------------------
   GET /api/pub/user?uid=1
   GET /api/pub/user?q=乘法
   GET /api/pub/user?q=1

   只返回可以给外人看的一列，其余字段一律不出这个文件：
   邮箱、余额与冻结额、注册 IP 与网络、最近登录、封禁记录、
   工单、问卷商风控、账号偏好，全部留在这张表里不外发。
   封禁或冻结的账户只回身份四项，不回头像以外的东西。
   ============================================================ */

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

const COLS = 'id, username, role, status, level, exp, affinity, bio, created_at, deleted_at';

/* "2026-11-16 08:00:46" 是 UTC 且无时区标记，补成 ISO 再解析 */
function parseTs(s) {
  if (!s) return NaN;
  const t = String(s).replace(' ', 'T');
  const d = new Date(/[Z+]/.test(t) ? t : t + 'Z');
  return d.getTime();
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const seg = (params.path || []).join('/');
  if (seg !== 'user') return json({ ok: false, error: 'not_found' }, 404);

  const url = new URL(request.url);
  const uidRaw = (url.searchParams.get('uid') || '').trim();
  const q = (url.searchParams.get('q') || '').trim();

  let row = null;

  if (uidRaw) {
    const uid = Number(uidRaw);
    if (!Number.isInteger(uid) || uid < 1) return json({ ok: false, error: 'invalid_query' }, 400);
    row = await env.DB.prepare(`SELECT ${COLS} FROM users WHERE id = ?`).bind(uid).first();
  } else if (q) {
    if (q.length > 40) return json({ ok: false, error: 'invalid_query' }, 400);
    if (/^\d+$/.test(q)) {
      row = await env.DB.prepare(`SELECT ${COLS} FROM users WHERE id = ?`).bind(Number(q)).first();
    } else {
      row = await env.DB.prepare(`SELECT ${COLS} FROM users WHERE username = ? COLLATE NOCASE`)
        .bind(q)
        .first();
    }
  } else {
    return json({ ok: false, error: 'empty_query' }, 400);
  }

  if (!row) return json({ ok: false, error: 'not_found' }, 404);
  if (row.deleted_at) return json({ ok: false, error: 'gone' }, 410);

  const base = { uid: row.id, username: row.username, role: row.role, status: row.status };

  /* 封禁与冻结：只回身份，不公开任何动态 */
  if (row.status !== 'active') {
    return json({ ok: true, user: Object.assign(base, { restricted: true }) }, 200);
  }

  const ts = parseTs(row.created_at);
  const days = isNaN(ts) ? 1 : Math.max(1, Math.floor((Date.now() - ts) / 86400000) + 1);
  const d = isNaN(ts) ? null : new Date(ts);
  const joinedMonth = d ? d.getUTCFullYear() + ' 年 ' + (d.getUTCMonth() + 1) + ' 月' : null;

  return json(
    {
      ok: true,
      user: Object.assign(base, {
        level: row.level || 1,
        exp: row.exp || 0,
        affinity: row.affinity || 0,
        bio: row.bio || '',
        joinedMonth,
        joinedDays: days
      })
    },
    200
  );
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
