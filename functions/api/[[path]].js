/**
 * 乘法 · 账户接口
 *
 * POST  /api/auth/register   注册
 * POST  /api/auth/login      登录
 * POST  /api/auth/logout     退出
 * GET   /api/auth/me         当前会话与完整资料
 * PATCH /api/user/profile    修改用户名与简介
 *
 * 依赖 D1 绑定 DB，表结构见 db/schema.sql
 *
 * 法币以「万分之一 fc」为整数单位存储，接口层统一输出 4 位小数字符串。
 */

const COOKIE_NAME = 'cf_session';
const SESSION_DAYS = 30;
const PBKDF2_ITER = 4000;
const FC_SCALE = 10000;

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET,POST,PATCH,OPTIONS' } });
  }

  if (!env.DB) {
    return json({ ok: false, error: 'db_unbound' }, 500);
  }

  try {
    if (path === 'auth/register' && request.method === 'POST') return await register(request, env, url);
    if (path === 'auth/login' && request.method === 'POST') return await login(request, env, url);
    if (path === 'auth/logout' && request.method === 'POST') return await logout(request, env, url);
    if (path === 'auth/me' && request.method === 'GET') return await me(request, env);
    if (path === 'user/profile' && request.method === 'PATCH') return await updateProfile(request, env);
    if (path === 'ledger' && request.method === 'GET') return await ledger(request, env, url);
    if (path === 'ladder' && request.method === 'GET') return await ladder(request, env, url);
    return json({ ok: false, error: 'not_found' }, 404);
  } catch (err) {
    console.error('api error:', err && err.stack ? err.stack : err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

/* ---------------- 路由实现 ---------------- */

async function register(request, env, url) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const username = String(body.username || '').trim();

  if (!isValidEmail(email)) return json({ ok: false, error: 'invalid_email' }, 400);
  if (password.length < 8 || password.length > 72) return json({ ok: false, error: 'invalid_password' }, 400);
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return json({ ok: false, error: 'weak_password' }, 400);
  if (username && !isValidUsername(username)) return json({ ok: false, error: 'invalid_username' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return json({ ok: false, error: 'email_taken' }, 409);

  if (username) {
    const nameTaken = await env.DB.prepare(
      'SELECT id FROM users WHERE username = ? COLLATE NOCASE'
    ).bind(username).first();
    if (nameTaken) return json({ ok: false, error: 'username_taken' }, 409);
  }

  const salt = randomHex(16);
  const hash = await pbkdf2Hex(password, salt);
  const net = clientNet(request);

  let result;
  try {
    result = await env.DB.prepare(
      `INSERT INTO users (email, pw_hash, pw_salt, pw_algo, pw_iter, reg_ip, reg_net, updated_at)
       VALUES (?, ?, ?, 'pbkdf2-sha256', ?, ?, ?, datetime('now'))`
    ).bind(email, hash, salt, PBKDF2_ITER, net.ip, net.asn).run();
  } catch (err) {
    // 并发注册时唯一索引兜底
    if (String(err && err.message).includes('UNIQUE')) {
      return json({ ok: false, error: 'email_taken' }, 409);
    }
    throw err;
  }

  const uid = result.meta && result.meta.last_row_id;

  // 未填用户名时按 uid 生成默认名，填了就用填的
  await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?')
    .bind(username || '用户' + uid, uid).run();

  const token = await createSession(env, uid, request);

  return json(
    { ok: true, user: await profileOf(env, uid) },
    200,
    { 'Set-Cookie': buildCookie(token, url.protocol === 'https:') }
  );
}

async function login(request, env, url) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  // 同一邮箱 20 分钟内失败达 10 次即拒绝，挡在线爆破
  const fails = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_fails WHERE email = ? AND ts > datetime('now','-20 minutes')"
  ).bind(email).first();

  if (fails && fails.n >= 10) {
    return json({ ok: false, error: 'too_many_attempts' }, 429);
  }

  const user = await env.DB.prepare(
    'SELECT id, email, pw_hash, pw_salt, pw_algo, pw_iter, status, deleted_at FROM users WHERE email = ?'
  ).bind(email).first();

  if (!user || user.status !== 'active' || user.deleted_at) {
    // 该邮箱不存在时也走一次派生，避免通过响应时间判断账号是否存在
    await pbkdf2Hex(password, '00000000000000000000000000000000');
    await recordFail(env, email);
    return json({ ok: false, error: 'invalid_credentials' }, 401);
  }

  const hash = await pbkdf2Hex(password, user.pw_salt, user.pw_iter || PBKDF2_ITER);
  if (!timingSafeEqual(hash, user.pw_hash)) {
    await recordFail(env, email);
    return json({ ok: false, error: 'invalid_credentials' }, 401);
  }

  // 登录成功：清掉该邮箱的失败计数，并顺手清理两天前的旧记录
  await env.DB.prepare('DELETE FROM login_fails WHERE email = ?').bind(email).run();
  await env.DB.prepare("DELETE FROM login_fails WHERE ts < datetime('now','-2 days')").run();

  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?')
    .bind(new Date().toISOString()).run();

  await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?")
    .bind(user.id).run();

  const token = await createSession(env, user.id, request);

  return json(
    { ok: true, user: await profileOf(env, user.id) },
    200,
    { 'Set-Cookie': buildCookie(token, url.protocol === 'https:') }
  );
}

async function logout(request, env) {
  const token = readCookie(request, COOKIE_NAME);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256Hex(token)).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
}

async function me(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  const user = await profileOf(env, session.uid);
  return json({ ok: true, user: Object.assign({}, user, clientInfo(request)) });
}

// 当前请求的来源 IP 与网络，供「登录与网络」区块显示
function clientInfo(request) {
  const raw = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || request.headers.get('X-Real-IP')
    || '';
  const ip = raw.split(',')[0].trim();
  const cf = request.cf || {};
  const parts = [];
  if (cf.country) parts.push(cf.country);
  if (cf.region) parts.push(cf.region);
  if (cf.city) parts.push(cf.city);
  if (cf.asOrganization) parts.push(cf.asOrganization);
  return { ip, net: parts.join(' · ') };
}

async function updateProfile(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const sets = [];
  const binds = [];

  if (body.username !== undefined) {
    const username = String(body.username).trim();
    if (!isValidUsername(username)) return json({ ok: false, error: 'invalid_username' }, 400);

    const taken = await env.DB.prepare(
      'SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?'
    ).bind(username, session.uid).first();
    if (taken) return json({ ok: false, error: 'username_taken' }, 409);

    sets.push('username = ?');
    binds.push(username);
  }

  if (body.bio !== undefined) {
    const bio = String(body.bio).trim();
    if (bio.length > 200) return json({ ok: false, error: 'bio_too_long' }, 400);
    sets.push('bio = ?');
    binds.push(bio);
  }

  if (!sets.length) return json({ ok: false, error: 'nothing_to_update' }, 400);

  sets.push("updated_at = datetime('now')");
  binds.push(session.uid);

  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

  return json({ ok: true, user: await profileOf(env, session.uid) });
}

/* ---------------- 收支明细 ---------------- */

const LEDGER_KINDS = [
  'signup_bonus', 'survey_reward', 'survey_reject',
  'withdraw_lock', 'withdraw_refund', 'withdraw_paid',
  'cdk_redeem', 'admin_adjust', 'penalty'
];

async function ledger(request, env, url) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const kind = (url.searchParams.get('kind') || '').trim();
  const filtered = LEDGER_KINDS.indexOf(kind) >= 0;

  const sum = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS outcome,
            COUNT(*) AS n
       FROM fc_ledger WHERE uid = ?`
  ).bind(session.uid).first();

  const sql = `SELECT delta, balance, kind, memo, ref, created_at
                 FROM fc_ledger
                WHERE uid = ?` + (filtered ? ' AND kind = ?' : '') +
              ' ORDER BY id DESC LIMIT ?';

  const args = filtered ? [session.uid, kind, limit + 1] : [session.uid, limit + 1];
  const rows = await env.DB.prepare(sql).bind(...args).all();

  const list = rows.results || [];
  const hasMore = list.length > limit;

  return json({
    ok: true,
    summary: {
      income: formatFc(sum ? sum.income : 0),
      outcome: formatFc(sum ? sum.outcome : 0),
      count: sum ? sum.n : 0
    },
    hasMore,
    items: list.slice(0, limit).map((row) => ({
      at: toIso(row.created_at),
      kind: row.kind,
      delta: formatFc(row.delta),
      balance: formatFc(row.balance),
      memo: row.memo || '',
      ref: row.ref || ''
    }))
  });
}

/* ---------------- 天梯榜 ---------------- */

async function ladder(request, env, url) {
  const by = (url.searchParams.get('by') || '').trim() === 'fc' ? 'fc' : 'level';
  const order = by === 'fc'
    ? 'fc_units DESC, level DESC, exp DESC, id ASC'
    : 'level DESC, exp DESC, id ASC';

  const rows = await env.DB.prepare(
    `SELECT id, username, role, level, exp, affinity, fc_units
       FROM users
      WHERE deleted_at IS NULL AND status = 'active'
      ORDER BY ` + order + ' LIMIT 50'
  ).all();

  const items = (rows.results || []).map((row, i) => ({
    rank: i + 1,
    uid: row.id,
    username: row.username,
    role: row.role,
    level: row.level || 1,
    exp: row.exp || 0,
    affinity: row.affinity || 0,
    fc: formatFc(row.fc_units)
  }));

  return json({ ok: true, by, items });
}

/* ---------------- 会话 ---------------- */

async function currentSession(request, env) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.expires_at, s.user_id, u.status, u.deleted_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  ).bind(tokenHash).first();

  if (!row) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }

  if (row.status !== 'active' || row.deleted_at) return null;

  return { uid: row.user_id, tokenHash };
}

async function createSession(env, uid, request) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const ua = (request.headers.get('User-Agent') || '').slice(0, 200);
  const ip = clientNet(request).ip;

  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, ua, ip) VALUES (?, ?, ?, ?, ?)'
  ).bind(tokenHash, uid, expires, ua, ip).run();

  return token;
}

async function recordFail(env, email) {
  await env.DB.prepare('INSERT INTO login_fails (email) VALUES (?)').bind(email).run();
}

/* ---------------- 资料输出 ---------------- */

const PROFILE_COLUMNS = `id, username, email, email_verified, role, status,
  fc_units, fc_frozen, affinity, exp, level, bio, avatar,
  last_login_at, created_at`;

async function profileOf(env, uid) {
  const row = await env.DB.prepare(`SELECT ${PROFILE_COLUMNS} FROM users WHERE id = ?`)
    .bind(uid).first();
  if (!row) return null;

  return {
    uid: row.id,
    username: row.username,
    email: row.email,
    emailVerified: !!row.email_verified,
    role: row.role,
    status: row.status,
    fc: formatFc(row.fc_units),
    fcFrozen: formatFc(row.fc_frozen),
    affinity: row.affinity,
    exp: row.exp,
    level: row.level,
    bio: row.bio,
    avatar: row.avatar,
    createdAt: toIso(row.created_at),
    lastLoginAt: toIso(row.last_login_at)
  };
}

// 整数单位转小数字符串，避免浮点误差；小数末尾的 0 不显示
// 0.0000 -> 0，20.0000 -> 20，128.4500 -> 128.45
function formatFc(units) {
  const n = Number(units) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const frac = String(abs % FC_SCALE).padStart(4, '0').replace(/0+$/, '');
  return sign + Math.floor(abs / FC_SCALE) + (frac ? '.' + frac : '');
}

// D1 的 datetime('now') 为 UTC，补上 T 与 Z 供前端解析
function toIso(value) {
  if (!value) return null;
  if (value.includes('T')) return value;
  return value.replace(' ', 'T') + 'Z';
}

/* ---------------- 工具 ---------------- */

function clientNet(request) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const cf = request.cf || {};
  const asn = cf.asn ? 'AS' + cf.asn : '';
  return { ip: ip.slice(0, 45), asn: (asn + ' ' + (cf.country || '')).trim() };
}

function buildCookie(token, secure) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 86400}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
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

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      headers
    )
  });
}

async function readJson(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isValidEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// 2 至 20 字，限中文、字母、数字、下划线与连字符；纯数字也允许
function isValidUsername(name) {
  return /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,20}$/.test(name);
}

function bytesToHex(bytes) {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function randomHex(byteLength) {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(buf));
}

async function pbkdf2Hex(password, saltHex, iterations = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

// 定长比较，避免按字节提前返回
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
