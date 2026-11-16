/* ============================================================
   乘法 · 关注关系接口
   ------------------------------------------------------------
   POST /api/follow   { uid: 2, act: "follow" | "unfollow" }
   GET  /api/follow?scope=following&uid=2&offset=0
   GET  /api/follow?scope=followers&uid=2&offset=0

   只从 users 与 follows 两张表取数：用户名、UID、角色、等级、关系建立时间。
   邮箱、余额、IP、登录记录、封禁原因一概不出这个文件。
   计数与列表使用同一套过滤条件（账号可用且未注销），两边不会对不上。
   ============================================================ */

const COOKIE_NAME = 'cf_session';
const PAGE_MAX = 50;
const FOLLOW_MAX = 2000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/* 会话校验：只回 user_id，不取用户其他字段 */
async function currentUid(env, request) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?'
  )
    .bind(hash, new Date().toISOString())
    .first();
  return row ? row.user_id : null;
}

/* SQLite 的 datetime('now') 是 UTC 且无时区标记，补成 ISO 再给前端 */
function toIso(s) {
  if (!s) return null;
  const t = String(s).replace(' ', 'T');
  return /[Z+]/.test(t) ? t : t + 'Z';
}

function intParam(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

/* ---------- 计数 ---------- */

async function countFollowers(env, uid) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM follows f
       JOIN users u ON u.id = f.follower_id
      WHERE f.followee_id = ? AND u.deleted_at IS NULL AND u.status = 'active'`
  )
    .bind(uid)
    .first();
  return row ? row.n : 0;
}

async function countFollowing(env, uid) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM follows f
       JOIN users u ON u.id = f.followee_id
      WHERE f.follower_id = ? AND u.deleted_at IS NULL AND u.status = 'active'`
  )
    .bind(uid)
    .first();
  return row ? row.n : 0;
}

/* 两个计数一次取回，供列表页同时显示两个页签的数字 */
async function countsOf(env, uid) {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM follows f JOIN users u ON u.id = f.follower_id
         WHERE f.followee_id = ? AND u.deleted_at IS NULL AND u.status = 'active') AS followers,
       (SELECT COUNT(*) FROM follows f JOIN users u ON u.id = f.followee_id
         WHERE f.follower_id = ? AND u.deleted_at IS NULL AND u.status = 'active') AS following`
  )
    .bind(uid, uid)
    .first();

  return {
    followers: row ? row.followers : 0,
    following: row ? row.following : 0
  };
}

/* ---------- 取关 / 关注 ---------- */

async function onPost(context) {
  const { request, env } = context;

  const me = await currentUid(env, request);
  if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) return json({ ok: false, error: 'bad_request' }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'bad_request' }, 400);

  const uid = Number(body.uid);
  if (!Number.isInteger(uid) || uid < 1) return json({ ok: false, error: 'invalid_uid' }, 400);
  if (uid === me) return json({ ok: false, error: 'self' }, 400);

  const act = body.act === 'unfollow' ? 'unfollow' : 'follow';

  const target = await env.DB.prepare(
    'SELECT id, status, deleted_at FROM users WHERE id = ?'
  )
    .bind(uid)
    .first();
  if (!target || target.deleted_at) return json({ ok: false, error: 'not_found' }, 404);
  if (target.status !== 'active') return json({ ok: false, error: 'restricted' }, 403);

  if (act === 'follow') {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?')
      .bind(me)
      .first();
    if (row && row.n >= FOLLOW_MAX) return json({ ok: false, error: 'too_many' }, 400);

    await env.DB.prepare(
      'INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)'
    )
      .bind(me, uid)
      .run();
  } else {
    await env.DB.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?')
      .bind(me, uid)
      .run();
  }

  const [followers, followees] = await Promise.all([
    countFollowers(env, uid),
    countFollowing(env, uid)
  ]);

  const mine = await countsOf(env, me);

  return json(
    {
      ok: true,
      following: act === 'follow',
      followers,
      followees,
      mine: { followers: mine.followers, following: mine.following }
    },
    200
  );
}

/* ---------- 列表 ---------- */

async function onGet(context) {
  const { request, env, params } = context;

  const seg = (params.path || []).join('/');
  if (seg && seg !== '') return json({ ok: false, error: 'not_found' }, 404);

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') === 'followers' ? 'followers' : 'following';

  const me = await currentUid(env, request);

  const uidRaw = (url.searchParams.get('uid') || '').trim();
  let uid;
  if (uidRaw) {
    uid = Number(uidRaw);
    if (!Number.isInteger(uid) || uid < 1) return json({ ok: false, error: 'invalid_uid' }, 400);
  } else if (me) {
    uid = me;
  } else {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const owner = await env.DB.prepare('SELECT id, status, deleted_at FROM users WHERE id = ?')
    .bind(uid)
    .first();
  if (!owner || owner.deleted_at) return json({ ok: false, error: 'not_found' }, 404);
  if (owner.status !== 'active') return json({ ok: false, error: 'restricted' }, 403);

  const offset = intParam(url.searchParams.get('offset'), 0, 0, 1000);
  const viewer = me || -1;
  const counts = await countsOf(env, uid);

  let rows;
  let total;

  if (scope === 'following') {
    const r = await env.DB.prepare(
      `SELECT u.id AS uid, u.username, u.role, u.level, f.created_at AS at,
              EXISTS (SELECT 1 FROM follows x WHERE x.follower_id = ? AND x.followee_id = u.id) AS following
         FROM follows f
         JOIN users u ON u.id = f.followee_id
        WHERE f.follower_id = ? AND u.deleted_at IS NULL AND u.status = 'active'
        ORDER BY f.created_at DESC, u.id DESC
        LIMIT ? OFFSET ?`
    )
      .bind(viewer, uid, PAGE_MAX, offset)
      .all();
    rows = r.results || [];
    total = await countFollowing(env, uid);
  } else {
    const r = await env.DB.prepare(
      `SELECT u.id AS uid, u.username, u.role, u.level, f.created_at AS at,
              EXISTS (SELECT 1 FROM follows x WHERE x.follower_id = ? AND x.followee_id = u.id) AS following
         FROM follows f
         JOIN users u ON u.id = f.follower_id
        WHERE f.followee_id = ? AND u.deleted_at IS NULL AND u.status = 'active'
        ORDER BY f.created_at DESC, u.id DESC
        LIMIT ? OFFSET ?`
    )
      .bind(viewer, uid, PAGE_MAX, offset)
      .all();
    rows = r.results || [];
    total = await countFollowers(env, uid);
  }

  return json(
    {
      ok: true,
      scope,
      uid,
      total,
      offset,
      counts,
      hasMore: offset + rows.length < total,
      items: rows.map((row) => ({
        uid: row.uid,
        username: row.username,
        role: row.role,
        level: row.level || 1,
        at: toIso(row.at),
        following: !!row.following
      }))
    },
    200
  );
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onGet(context);
  if (context.request.method === 'POST') return onPost(context);
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
