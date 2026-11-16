/**
 * 乘法 · 账户接口
 *
 * POST /api/auth/register   注册
 * POST /api/auth/login      登录
 * POST /api/auth/logout     退出
 * GET  /api/auth/me         当前会话
 *
 * 依赖 D1 绑定 DB，表结构见 db/schema.sql
 */

const COOKIE_NAME = 'cf_session';
const SESSION_DAYS = 30;
const PBKDF2_ITER = 120000;

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET,POST,OPTIONS' } });
  }

  if (!env.DB) {
    return json({ ok: false, error: 'db_unbound' }, 500);
  }

  try {
    if (path === 'auth/register' && request.method === 'POST') return await register(request, env, url);
    if (path === 'auth/login' && request.method === 'POST') return await login(request, env, url);
    if (path === 'auth/logout' && request.method === 'POST') return await logout(request, env, url);
    if (path === 'auth/me' && request.method === 'GET') return await me(request, env);
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

  if (!isValidEmail(email)) return json({ ok: false, error: 'invalid_email' }, 400);
  if (password.length < 8 || password.length > 72) return json({ ok: false, error: 'invalid_password' }, 400);
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return json({ ok: false, error: 'weak_password' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return json({ ok: false, error: 'email_taken' }, 409);

  const salt = randomHex(16);
  const hash = await pbkdf2Hex(password, salt);

  let result;
  try {
    result = await env.DB.prepare(
      'INSERT INTO users (email, pw_hash, pw_salt) VALUES (?, ?, ?)'
    ).bind(email, hash, salt).run();
  } catch (err) {
    // 并发注册时唯一索引兜底
    if (String(err && err.message).includes('UNIQUE')) {
      return json({ ok: false, error: 'email_taken' }, 409);
    }
    throw err;
  }

  const userId = result.meta && result.meta.last_row_id;
  const token = await createSession(env, userId, request);

  return json(
    { ok: true, user: { id: userId, email, points: 0 } },
    200,
    { 'Set-Cookie': buildCookie(token, url.protocol === 'https:') }
  );
}

async function login(request, env, url) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const user = await env.DB.prepare(
    'SELECT id, email, pw_hash, pw_salt, points, status FROM users WHERE email = ?'
  ).bind(email).first();

  if (!user || user.status !== 'active') {
    // 该邮箱不存在时也走一次哈希，避免通过响应时间判断账号是否存在
    await pbkdf2Hex(password, '00000000000000000000000000000000');
    return json({ ok: false, error: 'invalid_credentials' }, 401);
  }

  const hash = await pbkdf2Hex(password, user.pw_salt);
  if (!timingSafeEqual(hash, user.pw_hash)) {
    return json({ ok: false, error: 'invalid_credentials' }, 401);
  }

  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?')
    .bind(new Date().toISOString()).run();

  const token = await createSession(env, user.id, request);

  return json(
    { ok: true, user: { id: user.id, email: user.email, points: user.points } },
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
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401);

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.expires_at, u.id, u.email, u.points
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND u.status = 'active'`
  ).bind(tokenHash).first();

  if (!row) return json({ ok: false, error: 'unauthorized' }, 401);

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return json({ ok: false, error: 'expired' }, 401);
  }

  return json({ ok: true, user: { id: row.id, email: row.email, points: row.points } });
}

/* ---------------- 会话 ---------------- */

async function createSession(env, userId, request) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const ua = (request.headers.get('User-Agent') || '').slice(0, 200);

  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, ua) VALUES (?, ?, ?, ?)'
  ).bind(tokenHash, userId, expires, ua).run();

  return token;
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

/* ---------------- 工具 ---------------- */

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

async function pbkdf2Hex(password, saltHex) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: PBKDF2_ITER, hash: 'SHA-256' },
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
