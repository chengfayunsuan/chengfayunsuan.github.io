/* ============================================================
   乘法 · 公开资料接口
   ------------------------------------------------------------
   GET /api/pub/user?uid=1
   GET /api/pub/user?q=乘法
   GET /api/pub/user?q=1

   只返回可以给外人看的一列，其余字段一律不出这个文件：
   邮箱、余额与冻结额、注册 IP 与网络、最近登录、封禁记录、
   工单、问卷商风控、账号偏好，全部留在这张表里不外发。

   可以公开的两组动态：
   · social  关注数与粉丝数
   · payouts 已完成的提现笔数、累计金额与每一笔的金额、渠道、时间
     （收款账号 account 与审核备注 review_note 绝不出现）

   封禁或冻结的账户只回身份四项，不回头像以外的东西。
   ============================================================ */

const COOKIE_NAME = 'cf_session';
const FC_SCALE = 10000;
const PAYOUT_SHOWN = 12;

const CHANNELS = {
  alipay: '支付宝',
  wechat: '微信',
  wxpay: '微信',
  bank: '银行卡',
  paypal: 'PayPal',
  payoneer: 'Payoneer',
  wise: 'Wise',
  usdt: 'USDT'
};

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

const COLS =
  'id, username, role, status, level, exp, affinity, fc_units, fc_frozen, bio, created_at, deleted_at';

/* "2026-11-16 08:00:46" 是 UTC 且无时区标记，补成 ISO 再解析 */
function parseTs(s) {
  if (!s) return NaN;
  const t = String(s).replace(' ', 'T');
  const d = new Date(/[Z+]/.test(t) ? t : t + 'Z');
  return d.getTime();
}

function toIso(s) {
  if (!s) return null;
  const t = String(s).replace(' ', 'T');
  return /[Z+]/.test(t) ? t : t + 'Z';
}

// 小数末尾的 0 不显示：0.0000 -> 0，20.0000 -> 20，128.4500 -> 128.45
function fc(units) {
  return (Number(units || 0) / FC_SCALE).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

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

/* ---------- 关注数 ---------- */

async function socialOf(env, uid) {
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

/* ---------- 提现：只取已完成，只取可公开的四列 ---------- */

async function payoutsOf(env, uid) {
  const sum = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total, MAX(reviewed_at) AS last
       FROM withdrawals
      WHERE uid = ? AND status = 'paid'`
  )
    .bind(uid)
    .first();

  const list = await env.DB.prepare(
    `SELECT amount, channel, reviewed_at, created_at
       FROM withdrawals
      WHERE uid = ? AND status = 'paid'
      ORDER BY COALESCE(reviewed_at, created_at) DESC, id DESC
      LIMIT ?`
  )
    .bind(uid, PAYOUT_SHOWN)
    .all();

  const items = (list.results || []).map((row) => {
    const code = String(row.channel || '');
    return {
      amount: fc(row.amount),
      channel: CHANNELS[code] || code || '未记录',
      at: toIso(row.reviewed_at || row.created_at)
    };
  });

  return {
    count: sum ? sum.n : 0,
    total: fc(sum ? sum.total : 0),
    lastAt: sum ? toIso(sum.last) : null,
    items
  };
}

/* ---------- 主体 ---------- */

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

  const viewerUid = await currentUid(env, request);

  const [social, payouts] = await Promise.all([socialOf(env, row.id), payoutsOf(env, row.id)]);

  let following = false;
  if (viewerUid && viewerUid !== row.id) {
    const f = await env.DB.prepare(
      'SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?'
    )
      .bind(viewerUid, row.id)
      .first();
    following = !!f;
  }

  return json(
    {
      ok: true,
      user: Object.assign(base, {
        fc: fc(row.fc_units),
        fcFrozen: fc(row.fc_frozen),
        level: row.level == null ? 1 : row.level,
        exp: row.exp || 0,
        affinity: row.affinity || 0,
        bio: row.bio || '',
        joinedMonth,
        joinedDays: days,
        social,
        payouts,
        viewer: {
          self: viewerUid === row.id,
          signedIn: !!viewerUid,
          following
        }
      })
    },
    200
  );
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
