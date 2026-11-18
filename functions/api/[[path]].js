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
    if (path === 'user/email' && request.method === 'POST') return await updateEmail(request, env);
    if (path === 'user/password' && request.method === 'POST') return await updatePassword(request, env);
    if (path === 'user/bans' && request.method === 'GET') return await userBans(request, env);
    if (path === 'ledger' && request.method === 'GET') return await ledger(request, env, url);
    if (path === 'ladder' && request.method === 'GET') return await ladder(request, env, url);
    if (path === 'ticket' && request.method === 'POST') return await ticketSubmit(request, env);
    if (path === 'ticket' && request.method === 'GET') return await ticketMine(request, env);
    if (path === 'fx' && request.method === 'GET') return await fxRate(env);
    if (path === 'surveys' && request.method === 'GET') return await surveyList(request, env);
    if (path === 'surveys/join' && request.method === 'POST') return await surveyJoin(request, env);
    if (path === 'store' && request.method === 'GET') return await storeList(request, env);
    if (path === 'store/redeem' && request.method === 'POST') return await storeRedeem(request, env);
    if (path === 'orders' && request.method === 'GET') return await orderList(request, env);
    if (path === 'withdraw' && request.method === 'GET') return await withdrawMine(request, env);
    if (path === 'withdraw' && request.method === 'POST') return await withdrawApply(request, env);
    if (path === 'cdk/redeem' && request.method === 'POST') return await cdkRedeem(request, env);
    if (path === 'messages' && request.method === 'GET') return await messageList(request, env);
    if (path === 'announcements' && request.method === 'GET') return await noticeList(env);
    if (path === 'messages/read' && request.method === 'POST') return await messageRead(request, env);
    if (path === 'moonetix/link' && request.method === 'GET') return await mtxLink(request, env);
    if (path === 'moonetix/tasks' && request.method === 'GET') return await mtxTasks(request, env);
    if (path === 'moonetix/postback') return await mtxPostback(request, env, url);
    if (path === 'moonetix/mock/complete' && request.method === 'POST') return await mtxMockComplete(request, env);
    if (path.indexOf('admin/') === 0) return await adminApi(request, env, url, path);
    return json({ ok: false, error: 'not_found' }, 404);
  } catch (err) {
    console.error('api error:', err && err.stack ? err.stack : err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

/* ---------------- 路由实现 ---------------- */

/* ---------------- 人机验证 ---------------- */

/* 只放行自家域名：生产域 + Pages 预览子域；其余一律拒 */
const TURNSTILE_HOSTS = ['chengfa-761.pages.dev'];

function hostAllowed(host) {
  if (!host) return false;
  const h = String(host).toLowerCase();
  return TURNSTILE_HOSTS.some(function (base) {
    return h === base || h.endsWith('.' + base);
  });
}

/* 返回空串表示通过，否则返回错误码 */
async function verifyTurnstile(request, env, token) {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return 'verify_unconfigured';
  if (typeof token !== 'string' || !token || token.length > 2048) return 'turnstile_failed';

  let data;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP') || undefined,
        idempotency_key: crypto.randomUUID()
      })
    });
    data = await res.json();
  } catch (err) {
    console.error('turnstile verify failed:', err && err.message);
    return 'verify_unavailable';
  }

  if (!data || data.success !== true) {
    const codes = (data && data['error-codes']) || [];
    console.error('turnstile rejected:', codes.join(',') || 'no-codes');

    /* 秘钥本身有问题属于服务端配置，别让用户以为是自己的错 */
    if (codes.indexOf('invalid-input-secret') >= 0 || codes.indexOf('missing-input-secret') >= 0) {
      return 'verify_unavailable';
    }
    return 'turnstile_failed';
  }

  /* 测试钥匙固定返回 example.com，本地开发跳过域名校验 */
  const isTest = !!(data.metadata && data.metadata.result_with_testing_key);
  if (!isTest && !hostAllowed(data.hostname)) {
    console.error('turnstile hostname rejected:', data.hostname, 'expected:', TURNSTILE_HOSTS.join(','));
    return 'turnstile_failed';
  }

  return '';
}

async function register(request, env, url) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  // 先过机器验证，再碰密码和数据库
  const tsErr = await verifyTurnstile(request, env, body.turnstileToken);
  if (tsErr) return json({ ok: false, error: tsErr }, tsErr === 'verify_unavailable' ? 503 : 400);

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
       VALUES (?, ?, ?, 'pbkdf2-sha256', ?, ?, ?, datetime('now','+8 hours'))`
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

  // 先过机器验证，再查失败计数和密码
  const tsErr = await verifyTurnstile(request, env, body.turnstileToken);
  if (tsErr) return json({ ok: false, error: tsErr }, tsErr === 'verify_unavailable' ? 503 : 400);

  // 登录标识是用户名；老用户习惯填邮箱，也一并认
  const account = String(body.username || body.email || body.account || '').trim();
  const password = String(body.password || '');
  if (!account || account.length > 254) return json({ ok: false, error: 'invalid_credentials' }, 401);

  const accountKey = account.toLowerCase();

  // 同一账号 20 分钟内失败达 10 次即拒绝，挡在线爆破
  const fails = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_fails WHERE lower(email) = ? AND ts > datetime('now','+8 hours','-20 minutes')"
  ).bind(accountKey).first();

  if (fails && fails.n >= 10) {
    return json({ ok: false, error: 'too_many_attempts' }, 429);
  }

  const byEmail = accountKey.indexOf('@') > 0;
  const user = byEmail
    ? await env.DB.prepare(
        `SELECT id, email, username, pw_hash, pw_salt, pw_algo, pw_iter, status, deleted_at
           FROM users WHERE email = ?`
      ).bind(accountKey).first()
    : await env.DB.prepare(
        `SELECT id, email, username, pw_hash, pw_salt, pw_algo, pw_iter, status, deleted_at
           FROM users WHERE username = ? COLLATE NOCASE`
      ).bind(account).first();

  // 已注销的号彻底不放；密码错与账号不存在走同一条路，别让人试出谁注册过
  if (!user || user.deleted_at) {
    await pbkdf2Hex(password, '00000000000000000000000000000000');
    await recordFail(env, accountKey);
    return json({ ok: false, error: 'invalid_credentials' }, 401);
  }

  const hash = await pbkdf2Hex(password, user.pw_salt, user.pw_iter || PBKDF2_ITER);
  if (!timingSafeEqual(hash, user.pw_hash)) {
    await recordFail(env, accountKey);
    return json({ ok: false, error: 'invalid_credentials' }, 401);
  }

  /* 密码对了就发会话：封禁与冻结的账号也能进来，
     但只能在工单、消息这类页面上活动，钱和问卷接口另行拦住 */
  await env.DB.prepare('DELETE FROM login_fails WHERE lower(email) = ?').bind(accountKey).run();
  await env.DB.prepare("DELETE FROM login_fails WHERE ts < datetime('now','+8 hours','-2 days')").run();

  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?')
    .bind(new Date().toISOString()).run();

  await env.DB.prepare("UPDATE users SET last_login_at = datetime('now','+8 hours') WHERE id = ?")
    .bind(user.id).run();

  const token = await createSession(env, user.id, request);

  return json(
    { ok: true, restricted: user.status !== 'active', user: await profileOf(env, user.id) },
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
  if (!isActive(session)) return locked();

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

  sets.push("updated_at = datetime('now','+8 hours')");
  binds.push(session.uid);

  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

  return json({ ok: true, user: await profileOf(env, session.uid) });
}

/* ---------------- 账户安全：改邮箱 / 改密码 ---------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomSaltHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < buf.length; i++) out += buf[i].toString(16).padStart(2, '0');
  return out;
}

/* 密码规则与注册一致：8-72 位，且字母数字都要有 */
function pwProblem(pw) {
  if (pw.length < 8 || pw.length > 72) return 'invalid_password';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'weak_password';
  return '';
}

// 改邮箱：要当前密码确认，换绑后视为未验证
async function updateEmail(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!EMAIL_RE.test(email) || email.length > 120) return json({ ok: false, error: 'invalid_email' }, 400);
  if (!password) return json({ ok: false, error: 'password_required' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, email, pw_hash, pw_salt, pw_iter FROM users WHERE id = ? AND deleted_at IS NULL'
  ).bind(session.uid).first();
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

  const hash = await pbkdf2Hex(password, user.pw_salt, user.pw_iter || PBKDF2_ITER);
  if (hash !== user.pw_hash) return json({ ok: false, error: 'wrong_password' }, 403);

  if (email === String(user.email || '').toLowerCase()) return json({ ok: false, error: 'same_email' }, 400);

  const taken = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ? AND deleted_at IS NULL'
  ).bind(email, user.id).first();
  if (taken) return json({ ok: false, error: 'email_taken' }, 409);

  await env.DB.prepare(
    "UPDATE users SET email = ?, email_verified = 0, updated_at = datetime('now','+8 hours') WHERE id = ?"
  ).bind(email, user.id).run();

  return json({ ok: true, user: await profileOf(env, user.id) });
}

// 改密码：要旧密码，改完把其它设备上的会话全部踢掉
async function updatePassword(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const oldPw = String(body.old || '');
  const newPw = String(body.new || '');
  if (!oldPw) return json({ ok: false, error: 'password_required' }, 400);
  const bad = pwProblem(newPw);
  if (bad) return json({ ok: false, error: bad }, 400);
  if (oldPw === newPw) return json({ ok: false, error: 'same_password' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, pw_hash, pw_salt, pw_iter FROM users WHERE id = ? AND deleted_at IS NULL'
  ).bind(session.uid).first();
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

  const hash = await pbkdf2Hex(oldPw, user.pw_salt, user.pw_iter || PBKDF2_ITER);
  if (hash !== user.pw_hash) return json({ ok: false, error: 'wrong_password' }, 403);

  const salt = randomSaltHex(16);
  const next = await pbkdf2Hex(newPw, salt, PBKDF2_ITER);

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iter = ?, updated_at = datetime('now','+8 hours') WHERE id = ?"
    ).bind(next, salt, PBKDF2_ITER, user.id),
    /* 保留当前这条会话，其余下线（sessions 的用户列名是 user_id） */
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(user.id, session.tokenHash)
  ]);

  return json({ ok: true });
}

/* ---------------- Moonetix 广告墙 ----------------
 *
 * Moonetix 是 offerwall 联盟（不是问卷商）：用户完成广告主的任务，服务商给发布方
 * 结算美元，我们按自定汇率折成 CFB 发给用户。奖励只能来自服务端回调，不能信前端。
 *
 * 两种模式：
 *   live —— 配齐 MOONETIX_APP_ID / MOONETIX_LINK_SALT / MOONETIX_POSTBACK_KEY，
 *           墙链接按官方规则签名，回调按签名校验
 *   demo —— 三者缺任一项即进入，改用站内模拟墙（/mock-wall），
 *           回调由本站自己造一条走同一套入账逻辑，先把链路跑通
 *
 * 密钥只在服务端读，永不下发浏览器。
 */

const MTX_WALL = 'https://wall.moonetix.com/';

/* 模拟墙里的任务，仅 demo 模式使用；面额是人话，单位 CFB */
const MTX_DEMO_OFFERS = [
  { id: 'demo-video', name: '看完 30 秒产品视频', reward: 1.5 },
  { id: 'demo-install', name: '安装并打开一款应用', reward: 4 },
  { id: 'demo-signup', name: '注册试用账号并完成引导', reward: 8 },
  { id: 'demo-level', name: '把游戏玩到第 5 关', reward: 12 }
];

function mtxConf(env) {
  const appId = String(env.MOONETIX_APP_ID || '').trim();
  const salt = String(env.MOONETIX_LINK_SALT || '').trim();
  const key = String(env.MOONETIX_POSTBACK_KEY || '').trim();
  const live = !!(appId && salt && key);
  return { appId, salt, key, live, demo: !live };
}

function mtxText(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  let out = '';
  const buf = new Uint8Array(sig);
  for (let i = 0; i < buf.length; i++) out += buf[i].toString(16).padStart(2, '0');
  return out;
}

function mtxFc(units) {
  const s = (Number(units) / FC_SCALE).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return s === '' ? '0' : s;
}

/* 生成墙链接：user_id 用本站 uid，hash 是 user_id 的 HMAC-SHA256（小写 hex） */
async function mtxLink(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const c = mtxConf(env);
  const uid = Number(session.uid);

  if (!c.live) {
    /* 演示模式只有站长/管理员能进模拟墙，否则普通用户看到墙却点不动，不如直接说还没开放 */
    const admin = await requireAdmin(request, env);
    return json({
      ok: true,
      demo: true,
      canTest: !!admin,
      url: admin ? '/mock-wall?uid=' + uid : '',
      offers: admin ? MTX_DEMO_OFFERS : [],
      note: admin
        ? '未配置 Moonetix 密钥，当前是站内模拟墙'
        : '广告墙尚未开放，等接入服务商后在这里放出入口'
    });
  }

  const hash = await hmacHex(c.salt, String(uid));
  return json({
    ok: true,
    demo: false,
    url: MTX_WALL + encodeURIComponent(c.appId) +
      '?user_id=' + uid + '&hash=' + hash
  });
}

/* 回调参数：GET 查询串与 POST 表单/JSON 都收 */
async function mtxParams(request, url) {
  const p = {};
  url.searchParams.forEach(function (v, k) { p[k] = v; });
  if (request.method !== 'POST') return p;

  const ct = String(request.headers.get('content-type') || '');
  try {
    if (ct.indexOf('application/json') >= 0) {
      const b = await request.json();
      Object.keys(b || {}).forEach(function (k) { p[k] = String(b[k]); });
    } else {
      const form = await request.formData();
      form.forEach(function (v, k) { p[k] = String(v); });
    }
  } catch (e) {}
  return p;
}

/* 签名：除签名字段外所有参数按名字升序拼 k=v&k=v，用 postback key 做 HMAC-SHA256
   注意·正式接入时按官网 postbacks 页核对一遍签名串的拼法，改这里即可 */
async function mtxSignatureOk(c, p) {
  if (!c.live) return true;   // 演示模式不校验，入账口只对站长开放

  const given = String(p.signature || p.sig || p.hash || '').trim().toLowerCase();
  if (!given) return false;

  const skip = { signature: 1, sig: 1, hash: 1 };
  const keys = Object.keys(p).filter(function (k) { return !skip[k]; }).sort();
  const raw = keys.map(function (k) { return k + '=' + p[k]; }).join('&');
  const want = await hmacHex(c.key, raw);
  return want === given;
}

/* 入账 / 冲正，两个模式共用 */
async function mtxApply(env, args) {
  const uid = Number(args.uid);
  const tid = String(args.tid);
  const status = Number(args.status);
  const units = Number(args.units);
  const meta = args.meta || {};

  if (status === 1) {
    const seen = await env.DB.prepare('SELECT id FROM mo_task WHERE transaction_id = ?').bind(tid).first();
    if (seen) return { ok: true, duplicated: true };

    const user = await env.DB.prepare(
      'SELECT id, fc_units FROM users WHERE id = ? AND deleted_at IS NULL'
    ).bind(uid).first();
    if (!user) return { ok: false, error: 'no_user' };

    const next = Number(user.fc_units) + units;
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO mo_task (uid, transaction_id, event_id, offer_id, offer_name,
             reward_units, payout_usd, currency, status, ip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
        ).bind(uid, tid, meta.eventId || '', meta.offerId || '', meta.offerName || '',
          units, meta.payout || '', meta.currency || '', meta.ip || ''),
        env.DB.prepare('UPDATE users SET fc_units = ?, updated_at = datetime(\'now\',\'+8 hours\') WHERE id = ?')
          .bind(next, uid),
        env.DB.prepare(
          `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(uid, units, next, 'moonetix_reward', tid,
          meta.offerName ? '广告墙 · ' + meta.offerName : '广告墙奖励')
      ]);
    } catch (err) {
      /* transaction_id 撞唯一索引 = 同一个回调打了两次，按成功回，别让对方重试 */
      const again = await env.DB.prepare('SELECT id FROM mo_task WHERE transaction_id = ?').bind(tid).first();
      if (again) return { ok: true, duplicated: true };
      throw err;
    }
    return { ok: true, credited: mtxFc(units), balance: mtxFc(next) };
  }

  /* status 2：冲正，把当初发的扣回来；找不到原单就当场认了，避免对方一直重试 */
  const row = await env.DB.prepare(
    'SELECT id, uid, reward_units, status FROM mo_task WHERE transaction_id = ?'
  ).bind(tid).first();
  if (!row) return { ok: true, unknown: true };
  if (row.status === 2) return { ok: true, duplicated: true };
  if (Number(row.uid) !== uid) return { ok: false, error: 'uid_mismatch' };

  const user = await env.DB.prepare(
    'SELECT id, fc_units FROM users WHERE id = ? AND deleted_at IS NULL'
  ).bind(uid).first();
  if (!user) return { ok: true, no_user: true };

  const want = Number(row.reward_units);
  const deduct = Math.min(want, Math.max(0, Number(user.fc_units)));
  const next = Number(user.fc_units) - deduct;

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE mo_task SET status = 2, reversed_at = datetime('now','+8 hours') WHERE id = ? AND status = 1"
    ).bind(row.id),
    env.DB.prepare('UPDATE users SET fc_units = ?, updated_at = datetime(\'now\',\'+8 hours\') WHERE id = ?')
      .bind(next, uid),
    env.DB.prepare(
      `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(uid, -deduct, next, 'moonetix_reverse', tid,
      deduct < want ? '广告墙冲正（余额不足，实际扣 ' + mtxFc(deduct) + '）' : '广告墙冲正')
  ]);

  return { ok: true, reversed: mtxFc(deduct), balance: mtxFc(next) };
}

async function mtxPostback(request, env, url) {
  const c = mtxConf(env);
  const p = await mtxParams(request, url);   /* body 只能读一次，签名和入账共用这一份 */

  if (c.live && !(await mtxSignatureOk(c, p))) {
    /* 只打键名，不打值，方便对接时排查又不把用户数据写进日志 */
    console.error('mtx postback signature mismatch, keys:', Object.keys(p).join(','));
    return mtxText('bad signature', 401);
  }

  const uid = Number(p.user_id || 0);
  const tid = String(p.transaction_id || '').trim();
  const status = Number(p.status || 1);
  const reward = Number(p.reward || 0);

  if (!(uid > 0) || !tid) return mtxText('bad request', 400);
  if (status !== 1 && status !== 2) return mtxText('bad status', 400);
  if (!isFinite(reward) || reward < 0) return mtxText('bad reward', 400);

  const res = await mtxApply(env, {
    uid: uid,
    tid: tid,
    status: status,
    units: Math.round(reward * FC_SCALE),
    meta: {
      eventId: p.event_id || '',
      offerId: p.offer_id || '',
      offerName: p.offer_name || '',
      payout: p.payout || '',
      currency: p.currency || '',
      ip: request.headers.get('CF-Connecting-IP') || ''
    }
  });

  if (!res.ok) return mtxText(res.error || 'error', 400);
  return mtxText('ok', 200);
}

/* 本站模拟墙点「完成」时调用，只在 demo 模式、且只有站长/管理员能用 */
async function mtxMockComplete(request, env) {
  const c = mtxConf(env);
  if (!c.demo) return json({ ok: false, error: 'live_mode' }, 400);

  const admin = await requireAdmin(request, env);
  if (!admin) return json({ ok: false, error: 'forbidden' }, 403);

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const offerId = String(body.offerId || '').trim();
  const offer = MTX_DEMO_OFFERS.filter(function (o) { return o.id === offerId; })[0];
  if (!offer) return json({ ok: false, error: 'unknown_offer' }, 400);

  const uid = Number(body.uid) > 0 ? Number(body.uid) : Number(admin.uid);
  const tid = 'demo-' + uid + '-' + Date.now().toString(36);

  const res = await mtxApply(env, {
    uid: uid,
    tid: tid,
    status: 1,
    units: Math.round(offer.reward * FC_SCALE),
    meta: {
      offerId: offer.id,
      offerName: offer.name,
      currency: 'CFB',
      payout: '0',
      ip: request.headers.get('CF-Connecting-IP') || ''
    }
  });

  if (!res.ok) return json({ ok: false, error: res.error || 'error' }, 400);
  return json({ ok: true, tid: tid, reward: offer.reward, balance: res.balance });
}

/* 自己的广告墙记录 */
async function mtxTasks(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT transaction_id, offer_name, reward_units, status, created_at, reversed_at
       FROM mo_task WHERE uid = ? ORDER BY id DESC LIMIT 50`
  ).bind(session.uid).all();

  const items = (rows.results || []).map(function (r) {
    return {
      tid: r.transaction_id,
      name: r.offer_name || '广告任务',
      reward: mtxFc(r.reward_units),
      status: Number(r.status),
      at: toIso(r.created_at),
      reversedAt: r.reversed_at ? toIso(r.reversed_at) : null
    };
  });

  const sum = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN status = 1 THEN reward_units ELSE 0 END), 0) AS live,
            COUNT(*) AS n FROM mo_task WHERE uid = ?`
  ).bind(session.uid).first();

  return json({
    ok: true,
    items: items,
    summary: { total: mtxFc(sum ? sum.live : 0), count: sum ? sum.n : 0 }
  });
}

/* ---------------- 收支明细 ---------------- */

const LEDGER_KINDS = [
  'signup_bonus', 'survey_reward', 'survey_reject',
  'withdraw_lock', 'withdraw_refund', 'withdraw_paid',
  'cdk_redeem', 'admin_adjust', 'penalty',
  'moonetix_reward', 'moonetix_reverse'
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

  /* 注销的号彻底失效；封禁与冻结仍然保留会话，
     只是受限操作由各接口用 isActive 单独拦 */
  if (row.deleted_at) return null;

  return { uid: row.user_id, tokenHash, status: row.status };
}

/* 受限账号（冻结 / 封禁）能登录、能发工单，但不能动钱、不能接新问卷 */
function isActive(session) {
  return !!session && session.status === 'active';
}

function locked() {
  return json({ ok: false, error: 'account_locked' }, 403);
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

/* ---------------- 后台接口（仅站长与管理员） ---------------- */

const ADMIN_ROLES = ['owner', 'admin'];
const USER_STATUSES = ['active', 'frozen', 'banned'];
const USER_ROLES = ['owner', 'admin', 'premium', 'user'];

async function requireAdmin(request, env) {
  const session = await currentSession(request, env);
  if (!session) return null;
  const row = await env.DB.prepare('SELECT role, status FROM users WHERE id = ?')
    .bind(session.uid).first();
  if (!row || row.status !== 'active' || ADMIN_ROLES.indexOf(row.role) < 0) return null;
  return { uid: session.uid, role: row.role };
}

/* ---------------- 汇率 ---------------- */

const FX_FALLBACK = 7.0;
const FX_TTL_MS = 60 * 60 * 1000; // 1 小时

// 1 USD = ? CNY。缓存写在 D1，过期才拉外部接口。
async function fxRate(env) {
  let rate = FX_FALLBACK;
  let updated = '';
  let stale = true;

  try {
    const row = await env.DB.prepare('SELECT usd_cny, updated_at FROM fx_rate WHERE id = 1').first();
    if (row && Number(row.usd_cny) > 0) {
      rate = Number(row.usd_cny);
      updated = row.updated_at;
      const t = Date.parse(String(updated).replace(' ', 'T') + 'Z');
      stale = !isFinite(t) || (Date.now() - t) > FX_TTL_MS;
    }
  } catch (e) {}

  if (stale) {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD', {
        headers: { Accept: 'application/json' },
        cf: { cacheTtl: 1800 }
      });
      if (res.ok) {
        const data = await res.json();
        const v = Number(data && data.rates && data.rates.CNY);
        if (v > 0 && v < 100) {
          rate = v;
          try {
            await env.DB.prepare(
              `INSERT INTO fx_rate (id, usd_cny, updated_at) VALUES (1, ?, datetime('now','+8 hours'))
               ON CONFLICT(id) DO UPDATE SET usd_cny = excluded.usd_cny, updated_at = datetime('now','+8 hours')`
            ).bind(v).run();
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  return json({ ok: true, usdCny: rate, updatedAt: updated });
}

/* ---------------- 工单 ---------------- */

const TICKET_TYPES = ['account', 'balance', 'survey', 'report', 'other'];

// 取提交人 uid：只认会话。
// 封禁/冻结账号现在也能登录并持有会话，所以不再需要「无会话时读前端 uid」的兜底；
// 那个兜底会让任何人拿别人的 uid 冒名提工单。无会话即匿名工单（uid 0）。
async function ticketActor(request, env) {
  const session = await currentSession(request, env);
  return session && session.uid ? Number(session.uid) : 0;
}

// 提交工单
async function ticketSubmit(request, env) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const type = String(body.type || '').trim();
  const detail = String(body.detail || '').trim();
  if (TICKET_TYPES.indexOf(type) < 0) return json({ ok: false, error: 'invalid_type' }, 400);
  if (detail.length < 5 || detail.length > 2000) return json({ ok: false, error: 'invalid_detail' }, 400);

  const uid = await ticketActor(request, env);

  /* 用户名由服务端按 uid 查真实资料，不信任前端自报 */
  let username = '';
  if (uid > 0) {
    const row = await env.DB.prepare('SELECT username FROM users WHERE id = ? AND deleted_at IS NULL')
      .bind(uid).first();
    username = row && row.username ? row.username : '';
  }

  await env.DB.prepare(
    'INSERT INTO tickets (uid, username, type, detail, status, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\',\'+8 hours\'))'
  ).bind(uid, username, type, detail, 'open').run();

  return json({ ok: true });
}

// 我的工单
async function ticketMine(request, env) {
  const session = await currentSession(request, env);
  if (!session || !session.uid) return json({ ok: false, error: 'unauthorized' }, 401);
  const rows = await env.DB.prepare(
    'SELECT id, type, detail, status, reply, created_at, reviewed_at FROM tickets WHERE uid = ? ORDER BY id DESC LIMIT 100'
  ).bind(session.uid).all();
  return json({ ok: true, items: rows.results || [] });
}

// 后台：工单列表
async function adminTickets(env, url) {
  const status = String(url.searchParams.get('status') || 'all');
  let sql = `SELECT t.id, t.uid, t.username, t.type, t.detail, t.status, t.reply, t.created_at, t.reviewed_at,
    u.role AS userRole, u.status AS userStatus, u.fc_units, u.fc_frozen, u.level
    FROM tickets t LEFT JOIN users u ON u.id = t.uid`;
  const args = [];
  if (status === 'open' || status === 'closed') {
    sql += ' WHERE t.status = ?';
    args.push(status);
  }
  sql += ' ORDER BY t.id DESC LIMIT 200';
  const stmt = env.DB.prepare(sql);
  const rows = await (args.length ? stmt.bind.apply(stmt, args) : stmt).all();
  const items = (rows.results || []).map(function (r) {
    return Object.assign({}, r, {
      userFc: r.fc_units == null ? '' : formatFc(r.fc_units),
      userFrozen: r.fc_frozen == null ? '' : formatFc(r.fc_frozen)
    });
  });
  return json({ ok: true, items: items });
}

// 后台：标记处理 / 重开
async function adminTicketDecide(request, env, admin) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);
  const id = Number(body.id);
  const action = String(body.action || '');
  if (!(id > 0) || (action !== 'closed' && action !== 'open')) {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  const reply = String(body.reply || '').trim().slice(0, 1000);
  const reviewedAt = action === 'closed' ? "datetime('now','+8 hours')" : 'NULL';
  await env.DB.prepare(
    `UPDATE tickets SET status = ?, reply = ?, reviewed_at = ${reviewedAt} WHERE id = ?`
  ).bind(action, reply, id).run();
  return json({ ok: true });
}

/* ---------------- 问卷大厅 ---------------- */

const SURVEY_COLS = 'id, title, provider, price_units, grade, stars, requirement, topic, duration_min, entry_url, featured, status, created_at';

function surveyRow(r) {
  return {
    id: r.id,
    joined: r.joined === 1 || r.joined === true,
    title: r.title,
    provider: r.provider,
    price: formatFc(r.price_units),
    grade: r.grade,
    stars: r.stars,
    requirement: r.requirement,
    topic: r.topic,
    durationMin: r.duration_min,
    entry: r.entry_url,
    featured: r.featured === 1,
    status: r.status,
    createdAt: r.created_at
  };
}

async function surveyList(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT s.*, EXISTS(
        SELECT 1 FROM survey_joins j WHERE j.survey_id = s.id AND j.uid = ?
      ) AS joined
       FROM surveys s WHERE s.status = 'open'
      ORDER BY s.featured DESC, (s.featured_at IS NULL), s.featured_at DESC, s.created_at DESC
      LIMIT 100`
  ).bind(session.uid).all();

  return json({ ok: true, items: (rows.results || []).map(surveyRow) });
}

async function adminSurveyList(env) {
  const rows = await env.DB.prepare(
    `SELECT s.*, (
        SELECT COUNT(*) FROM survey_joins j WHERE j.survey_id = s.id
      ) AS joined_count
       FROM surveys s
      ORDER BY s.featured DESC, s.featured_at DESC, s.created_at DESC
      LIMIT 200`
  ).all();

  return json({
    ok: true,
    items: (rows.results || []).map(function (r) {
      const it = surveyRow(r);
      it.joinedCount = r.joined_count || 0;
      return it;
    })
  });
}

async function adminSurveySave(request, env) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const title = String(body.title || '').trim();
  if (!title) return json({ ok: false, error: 'missing_title' }, 400);

  const price = Number(body.price);
  const priceUnits = Number.isFinite(price) && price >= 0 ? Math.round(price * FC_SCALE) : 0;

  const starsRaw = Number(body.stars);
  const stars = Number.isFinite(starsRaw) ? Math.max(0, Math.min(5, Math.round(starsRaw))) : 0;

  const durRaw = Number(body.durationMin);
  const durationMin = Number.isFinite(durRaw) && durRaw > 0 ? Math.round(durRaw) : 0;

  const status = ['open', 'paused', 'closed'].indexOf(body.status) >= 0 ? body.status : 'open';

  const args = [
    title,
    String(body.provider || '').trim(),
    priceUnits,
    String(body.grade || '').trim().toUpperCase().slice(0, 4),
    stars,
    String(body.requirement || '').trim(),
    String(body.topic || '').trim(),
    durationMin,
    String(body.entry || '').trim(),
    status
  ];

  if (body.id) {
    await env.DB.prepare(
      `UPDATE surveys SET title = ?, provider = ?, price_units = ?, grade = ?, stars = ?,
        requirement = ?, topic = ?, duration_min = ?, entry_url = ?, status = ?, updated_at = datetime('now','+8 hours')
        WHERE id = ?`
    ).bind(...args, Number(body.id)).run();
    return json({ ok: true, id: Number(body.id) });
  }

  const res = await env.DB.prepare(
    `INSERT INTO surveys (title, provider, price_units, grade, stars, requirement, topic, duration_min, entry_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(...args).run();

  return json({ ok: true, id: res.meta && res.meta.last_row_id });
}

async function adminSurveyFeature(request, env) {
  const body = await readJson(request);
  const id = Number(body && body.id);
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  if (body.featured) {
    await env.DB.prepare(
      "UPDATE surveys SET featured = 1, featured_at = datetime('now','+8 hours'), updated_at = datetime('now','+8 hours') WHERE id = ?"
    ).bind(id).run();
  } else {
    await env.DB.prepare(
      "UPDATE surveys SET featured = 0, featured_at = NULL, updated_at = datetime('now','+8 hours') WHERE id = ?"
    ).bind(id).run();
  }

  return json({ ok: true });
}

async function adminSurveyDelete(request, env) {
  const body = await readJson(request);
  const id = Number(body && body.id);
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  await env.DB.prepare('DELETE FROM surveys WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

/* ---------------- 兑换中心 / 提现 ---------------- */

const WITHDRAW_MIN = 10;                       // 起提金额，单位 fc
const WITHDRAW_CHANNELS = ['alipay', 'wechat', 'paypal', 'payoneer'];
const CHANNEL_TEXT = {
  alipay: '支付宝', wechat: '微信', paypal: 'PayPal', payoneer: 'Payoneer'
};
const ITEM_KINDS = ['code', 'cash', 'sub'];

function orderSn(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

function itemRow(r) {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    kind: r.kind,
    price: formatFc(r.price_units),
    stock: r.stock,
    soldOut: r.stock === 0,
    note: r.note,
    deliver: r.deliver,
    status: r.status
  };
}

async function storeList(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    "SELECT * FROM store_items WHERE status = 'on' ORDER BY sort ASC, id ASC LIMIT 100"
  ).all();

  const me = await env.DB.prepare('SELECT fc_units, fc_frozen FROM users WHERE id = ?')
    .bind(session.uid).first();

  return json({
    ok: true,
    items: (rows.results || []).map(itemRow),
    wallet: {
      fc: formatFc(me ? me.fc_units : 0),
      fcFrozen: formatFc(me ? me.fc_frozen : 0)
    }
  });
}

async function storeRedeem(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const itemId = Number(body.itemId);
  if (!itemId) return json({ ok: false, error: 'bad_request' }, 400);

  const item = await env.DB.prepare('SELECT * FROM store_items WHERE id = ?').bind(itemId).first();
  if (!item || item.status !== 'on') return json({ ok: false, error: 'item_off' }, 404);
  if (item.stock === 0) return json({ ok: false, error: 'out_of_stock' }, 400);

  const user = await env.DB.prepare('SELECT id, fc_units, fc_frozen, status FROM users WHERE id = ?')
    .bind(session.uid).first();
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
  if (user.status !== 'active') return json({ ok: false, error: 'account_locked' }, 403);

  const price = item.price_units;
  if (user.fc_units < price) return json({ ok: false, error: 'insufficient_balance' }, 400);

  /* 现金档必须有收款账号；订阅档记录用户备注 */
  const account = String(body.account || '').trim().slice(0, 80);
  const memo = String(body.memo || '').trim().slice(0, 120);
  if (item.kind === 'cash' && account.length < 4) {
    return json({ ok: false, error: 'account_required' }, 400);
  }

  /* 兑换码类：先锁一个未使用的码，没有就是缺货 */
  let cdk = null;
  if (item.kind === 'code') {
    cdk = await env.DB.prepare(
      "SELECT id, code FROM cdk_codes WHERE status = 'free' AND item_id = ? ORDER BY id ASC LIMIT 1"
    ).bind(item.id).first();
    if (!cdk) return json({ ok: false, error: 'out_of_stock' }, 400);
  }

  const sn = orderSn('O');
  const next = user.fc_units - price;
  const now = "datetime('now','+8 hours')";

  const stmts = [];
  const orderStatus = item.kind === 'sub' ? 'pending' : 'paid';

  stmts.push(
    env.DB.prepare(
      `UPDATE users SET fc_units = ?, updated_at = datetime('now','+8 hours') WHERE id = ?`
    ).bind(next, user.id)
  );

  stmts.push(
    env.DB.prepare(
      `INSERT INTO orders (sn, uid, item_id, item_title, price_units, status, code, memo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(sn, user.id, item.id, item.title, price, orderStatus, cdk ? cdk.code : '', memo)
  );

  stmts.push(
    env.DB.prepare(
      `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(user.id, -price, next, 'cdk_redeem', sn, '兑换 ' + item.title)
  );

  if (cdk) {
    stmts.push(
      env.DB.prepare(
        `UPDATE cdk_codes SET status = 'used', used_by = ?, used_at = datetime('now','+8 hours')
          WHERE id = ? AND status = 'free'`
      ).bind(user.id, cdk.id)
    );
  }

  if (item.stock > 0) {
    stmts.push(
      env.DB.prepare(
        `UPDATE store_items SET stock = stock - 1, updated_at = datetime('now','+8 hours')
          WHERE id = ? AND stock > 0`
      ).bind(item.id)
    );
  }

  /* 现金档：等同于提交一笔提现，钱进冻结等审核 */
  if (item.kind === 'cash') {
    stmts.push(
      env.DB.prepare(
        `UPDATE users SET fc_frozen = fc_frozen + ? WHERE id = ?`
      ).bind(price, user.id)
    );
    stmts.push(
      env.DB.prepare(
        `INSERT INTO withdrawals (uid, amount, channel, account, status, review_note)
         VALUES (?, ?, ?, ?, 'pending', ?)`
      ).bind(user.id, price, 'alipay', account, '兑换中心生成 · 单号 ' + sn)
    );
  }

  await env.DB.batch(stmts);

  return json({
    ok: true,
    sn: sn,
    status: orderStatus,
    code: cdk ? cdk.code : '',
    price: formatFc(price),
    balance: formatFc(next)
  });
}

async function orderList(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT id, sn, item_title, price_units, status, code, memo, created_at
       FROM orders WHERE uid = ? ORDER BY id DESC LIMIT 50`
  ).bind(session.uid).all();

  return json({
    ok: true,
    items: (rows.results || []).map(function (r) {
      return {
        id: r.id,
        sn: r.sn,
        title: r.item_title,
        price: formatFc(r.price_units),
        status: r.status,
        code: r.code,
        memo: r.memo,
        at: toIso(r.created_at)
      };
    })
  });
}

/* ---------------- 提现 ---------------- */

async function withdrawMine(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT id, amount, channel, account, status, review_note, created_at, reviewed_at
       FROM withdrawals WHERE uid = ? ORDER BY id DESC LIMIT 30`
  ).bind(session.uid).all();

  return json({
    ok: true,
    items: (rows.results || []).map(function (r) {
      return {
        id: r.id,
        amount: formatFc(r.amount),
        channel: r.channel,
        channelText: CHANNEL_TEXT[r.channel] || r.channel,
        account: r.account,
        status: r.status,
        note: r.review_note,
        at: toIso(r.created_at),
        reviewedAt: toIso(r.reviewed_at)
      };
    }),
    min: WITHDRAW_MIN
  });
}

async function withdrawApply(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const amount = Number(body.amount);
  const channel = String(body.channel || 'alipay');
  const account = String(body.account || '').trim().slice(0, 80);

  if (!isFinite(amount) || amount <= 0) return json({ ok: false, error: 'bad_amount' }, 400);
  if (WITHDRAW_CHANNELS.indexOf(channel) < 0) return json({ ok: false, error: 'bad_channel' }, 400);
  if (account.length < 4) return json({ ok: false, error: 'account_required' }, 400);

  const units = Math.round(amount * FC_SCALE);
  if (units < WITHDRAW_MIN * FC_SCALE) return json({ ok: false, error: 'below_min' }, 400);

  const user = await env.DB.prepare('SELECT id, fc_units, fc_frozen, status FROM users WHERE id = ?')
    .bind(session.uid).first();
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
  if (user.status !== 'active') return json({ ok: false, error: 'account_locked' }, 403);

  const pending = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM withdrawals WHERE uid = ? AND status = 'pending'"
  ).bind(user.id).first();
  if (pending && pending.n > 0) return json({ ok: false, error: 'has_pending' }, 400);

  if (user.fc_units < units) return json({ ok: false, error: 'insufficient_balance' }, 400);

  const next = user.fc_units - units;
  const ref = orderSn('W');

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET fc_units = ?, fc_frozen = fc_frozen + ?, updated_at = datetime('now','+8 hours') WHERE id = ?`
    ).bind(next, units, user.id),
    env.DB.prepare(
      `INSERT INTO withdrawals (uid, amount, channel, account, status) VALUES (?, ?, ?, ?, 'pending')`
    ).bind(user.id, units, channel, account),
    env.DB.prepare(
      `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, 'withdraw_lock', ?, ?)`
    ).bind(user.id, -units, next, ref, '提现申请 · ' + (CHANNEL_TEXT[channel] || channel))
  ]);

  return json({ ok: true, balance: formatFc(next), ref: ref });
}

/* ---------------- 兑换码 ---------------- */

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

async function cdkRedeem(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const body = await readJson(request);
  const code = normalizeCode(body && body.code);
  if (code.length < 4 || code.length > 64) return json({ ok: false, error: 'bad_code' }, 400);

  const row = await env.DB.prepare(
    "SELECT id, value_units, status FROM cdk_codes WHERE code = ?"
  ).bind(code).first();
  if (!row) return json({ ok: false, error: 'code_not_found' }, 404);
  if (row.status !== 'free') return json({ ok: false, error: 'code_used' }, 400);

  /* 商品码不能在这里兑换，要按商品下单才发码 */
  if (!row.value_units || row.value_units <= 0) return json({ ok: false, error: 'code_item_only' }, 400);

  const user = await env.DB.prepare('SELECT id, fc_units, status FROM users WHERE id = ?')
    .bind(session.uid).first();
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
  if (user.status !== 'active') return json({ ok: false, error: 'account_locked' }, 403);

  const next = user.fc_units + row.value_units;

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE cdk_codes SET status = 'used', used_by = ?, used_at = datetime('now','+8 hours') WHERE id = ? AND status = 'free'"
    ).bind(user.id, row.id),
    env.DB.prepare(
      `UPDATE users SET fc_units = ?, updated_at = datetime('now','+8 hours') WHERE id = ?`
    ).bind(next, user.id),
    env.DB.prepare(
      `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, 'cdk_redeem', ?, ?)`
    ).bind(user.id, row.value_units, next, code, '兑换码充值')
  ]);

  return json({ ok: true, amount: formatFc(row.value_units), balance: formatFc(next) });
}

/* ---------------- 站内消息 ---------------- */

async function messageList(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT id, kind, title, body, read_at, created_at
       FROM messages WHERE uid = ? ORDER BY id DESC LIMIT 80`
  ).bind(session.uid).all();

  const unread = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM messages WHERE uid = ? AND read_at IS NULL'
  ).bind(session.uid).first();

  return json({
    ok: true,
    unread: unread ? unread.n : 0,
    items: (rows.results || []).map(function (r) {
      return {
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        read: !!r.read_at,
        at: toIso(r.created_at)
      };
    })
  });
}

async function messageRead(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = await readJson(request) || {};
  if (body.all) {
    await env.DB.prepare(
      "UPDATE messages SET read_at = datetime('now','+8 hours') WHERE uid = ? AND read_at IS NULL"
    ).bind(session.uid).run();
    return json({ ok: true });
  }

  const id = Number(body.id);
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  await env.DB.prepare(
    "UPDATE messages SET read_at = datetime('now','+8 hours') WHERE id = ? AND uid = ? AND read_at IS NULL"
  ).bind(id, session.uid).run();

  return json({ ok: true });
}

/* ---------------- 问卷参与 ---------------- */

async function surveyJoin(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const body = await readJson(request);
  const id = Number(body && body.id);
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  const sv = await env.DB.prepare("SELECT id, entry_url FROM surveys WHERE id = ? AND status = 'open'")
    .bind(id).first();
  if (!sv) return json({ ok: false, error: 'not_found' }, 404);

  await env.DB.prepare(
    'INSERT OR IGNORE INTO survey_joins (uid, survey_id) VALUES (?, ?)'
  ).bind(session.uid, id).run();

  return json({ ok: true, entry: sv.entry_url || '' });
}

/* ---------------- 后台：商品 / 兑换码 / 订单 / 消息 ---------------- */

async function adminItemList(env) {
  const rows = await env.DB.prepare(
    'SELECT * FROM store_items ORDER BY sort ASC, id ASC LIMIT 200'
  ).all();

  const sold = await env.DB.prepare(
    `SELECT item_id, COUNT(*) AS n FROM orders GROUP BY item_id`
  ).all();

  const soldMap = {};
  (sold.results || []).forEach(function (r) { soldMap[r.item_id] = r.n; });

  const free = await env.DB.prepare(
    "SELECT item_id, COUNT(*) AS n FROM cdk_codes WHERE status = 'free' GROUP BY item_id"
  ).all();

  const freeMap = {};
  (free.results || []).forEach(function (r) { freeMap[r.item_id] = r.n; });

  return json({
    ok: true,
    items: (rows.results || []).map(function (r) {
      const it = itemRow(r);
      it.note = r.note;
      it.deliver = r.deliver;
      it.sort = r.sort;
      it.rawPrice = r.price_units;
      it.sold = soldMap[r.id] || 0;
      it.freeCodes = freeMap[r.id] || 0;
      return it;
    })
  });
}

async function adminItemSave(request, env) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const title = String(body.title || '').trim().slice(0, 60);
  if (!title) return json({ ok: false, error: 'missing_title' }, 400);

  const kind = ITEM_KINDS.indexOf(body.kind) >= 0 ? body.kind : 'code';
  const price = Number(body.price);
  if (!isFinite(price) || price <= 0) return json({ ok: false, error: 'bad_price' }, 400);

  const stockRaw = Number(body.stock);
  const stock = isFinite(stockRaw) ? Math.round(stockRaw) : -1;
  const sortRaw = Number(body.sort);
  const sort = isFinite(sortRaw) ? Math.round(sortRaw) : 0;
  const status = body.status === 'off' ? 'off' : 'on';

  const args = [
    title,
    String(body.subtitle || '').trim().slice(0, 40),
    kind,
    Math.round(price * FC_SCALE),
    stock < -1 ? -1 : stock,
    String(body.note || '').trim().slice(0, 300),
    String(body.deliver || '').trim().slice(0, 300),
    status,
    sort
  ];

  if (body.id) {
    await env.DB.prepare(
      `UPDATE store_items SET title = ?, subtitle = ?, kind = ?, price_units = ?, stock = ?,
        note = ?, deliver = ?, status = ?, sort = ?, updated_at = datetime('now','+8 hours') WHERE id = ?`
    ).bind(...args, Number(body.id)).run();
    return json({ ok: true, id: Number(body.id) });
  }

  const res = await env.DB.prepare(
    `INSERT INTO store_items (title, subtitle, kind, price_units, stock, note, deliver, status, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(...args).run();

  return json({ ok: true, id: res.meta && res.meta.last_row_id });
}

async function adminItemDelete(request, env) {
  const body = await readJson(request);
  const id = Number(body && body.id);
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE item_id = ?').bind(id).first();
  if (used && used.n > 0) return json({ ok: false, error: 'has_orders' }, 400);

  await env.DB.prepare('DELETE FROM cdk_codes WHERE item_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM store_items WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += chars[buf[i] % chars.length];
  }
  return 'CF-' + out;
}

async function adminCdkList(env, url) {
  const itemId = Number(url.searchParams.get('itemId') || 0);
  const status = String(url.searchParams.get('status') || '');

  let sql = 'SELECT * FROM cdk_codes WHERE 1 = 1';
  const args = [];
  if (itemId) { sql += ' AND item_id = ?'; args.push(itemId); }
  if (status && ['free', 'used', 'void'].indexOf(status) >= 0) { sql += ' AND status = ?'; args.push(status); }
  sql += ' ORDER BY id DESC LIMIT 200';

  const rows = await env.DB.prepare(sql).bind(...args).all();

  const stats = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM cdk_codes GROUP BY status`
  ).all();

  const map = { free: 0, used: 0, void: 0 };
  (stats.results || []).forEach(function (r) { map[r.status] = r.n; });

  return json({
    ok: true,
    stats: map,
    items: (rows.results || []).map(function (r) {
      return {
        id: r.id,
        code: r.code,
        itemId: r.item_id,
        value: r.value_units ? formatFc(r.value_units) : '',
        status: r.status,
        usedBy: r.used_by,
        usedAt: toIso(r.used_at),
        batch: r.batch,
        at: toIso(r.created_at)
      };
    })
  });
}

async function adminCdkGenerate(request, env) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const itemId = Number(body.itemId) || 0;
  const value = Number(body.value) || 0;
  const batch = String(body.batch || '').trim().slice(0, 30) || ('B' + Date.now().toString(36).toUpperCase());

  const raw = String(body.codes || '').trim();
  let list = [];

  if (raw) {
    list = raw.split(/[\s,;]+/).map(function (x) { return normalizeCode(x); }).filter(Boolean);
  } else {
    const count = Math.max(1, Math.min(200, Number(body.count) || 1));
    for (let i = 0; i < count; i++) list.push(randomCode());
  }

  list = list.filter(function (v, i, a) { return a.indexOf(v) === i; });
  if (!list.length) return json({ ok: false, error: 'no_codes' }, 400);
  if (list.length > 500) return json({ ok: false, error: 'too_many' }, 400);

  /* 商品码必须有归属商品；通用充值码必须有面额 */
  if (!itemId && value <= 0) return json({ ok: false, error: 'need_value' }, 400);

  const valueUnits = Math.round(value * FC_SCALE);

  const stmts = list.map(function (code) {
    return env.DB.prepare(
      `INSERT OR IGNORE INTO cdk_codes (code, item_id, value_units, batch)
       VALUES (?, ?, ?, ?)`
    ).bind(code, itemId || null, valueUnits, batch);
  });

  const results = await env.DB.batch(stmts);
  /* 重复的码被 INSERT OR IGNORE 跳过，返回实际写入条数，避免「生成了 N 条」但列表没变 */
  const added = results.reduce(function (n, r) {
    return n + ((r && r.meta && r.meta.changes) || 0);
  }, 0);

  return json({ ok: true, batch: batch, count: list.length, added: added });
}

async function adminCdkVoid(request, env) {
  const body = await readJson(request);
  const id = Number(body && body.id);
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  await env.DB.prepare(
    "UPDATE cdk_codes SET status = 'void' WHERE id = ? AND status = 'free'"
  ).bind(id).run();

  return json({ ok: true });
}

async function adminOrderList(env, url) {
  const status = String(url.searchParams.get('status') || '');
  let sql = `SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.id = o.uid WHERE 1 = 1`;
  const args = [];
  if (status && ['paid', 'pending', 'refunded'].indexOf(status) >= 0) {
    sql += ' AND o.status = ?';
    args.push(status);
  }
  sql += ' ORDER BY o.id DESC LIMIT 120';

  const rows = await env.DB.prepare(sql).bind(...args).all();

  return json({
    ok: true,
    items: (rows.results || []).map(function (r) {
      return {
        id: r.id,
        sn: r.sn,
        uid: r.uid,
        username: r.username || ('UID ' + r.uid),
        title: r.item_title,
        price: formatFc(r.price_units),
        status: r.status,
        code: r.code,
        memo: r.memo,
        at: toIso(r.created_at)
      };
    })
  });
}

async function adminOrderDecide(request, env) {
  const body = await readJson(request);
  const id = Number(body && body.id);
  const action = String((body && body.action) || '');
  if (!id || ['paid', 'refunded'].indexOf(action) < 0) {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) return json({ ok: false, error: 'not_found' }, 404);
  if (order.status === action) return json({ ok: true });

  if (action === 'paid') {
    await env.DB.prepare(
      "UPDATE orders SET status = 'paid' WHERE id = ?"
    ).bind(id).run();

    await env.DB.prepare(
      `INSERT INTO messages (uid, kind, title, body) VALUES (?, 'system', ?, ?)`
    ).bind(order.uid, '兑换已发货', '你兑换的「' + order.item_title + '」已完成发货，单号 ' + order.sn + '。').run();

    return json({ ok: true });
  }

  /* 退款：钱退回可用余额，写流水；码若已发则作废 */
  const user = await env.DB.prepare('SELECT id, fc_units FROM users WHERE id = ?').bind(order.uid).first();
  if (!user) return json({ ok: false, error: 'user_not_found' }, 404);

  const next = user.fc_units + order.price_units;

  const stmts = [
    env.DB.prepare(
      `UPDATE users SET fc_units = ?, updated_at = datetime('now','+8 hours') WHERE id = ?`
    ).bind(next, user.id),
    env.DB.prepare(
      `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, 'admin_adjust', ?, ?)`
    ).bind(user.id, order.price_units, next, order.sn, '兑换退款 · ' + order.item_title),
    env.DB.prepare(
      "UPDATE orders SET status = 'refunded' WHERE id = ?"
    ).bind(id),
    env.DB.prepare(
      `INSERT INTO messages (uid, kind, title, body) VALUES (?, 'system', ?, ?)`
    ).bind(order.uid, '兑换已退款', '「' + order.item_title + '」已退款 ' + formatFc(order.price_units) + ' CFB，金额已回到可用余额。')
  ];

  if (order.code) {
    stmts.push(
      env.DB.prepare(
        "UPDATE cdk_codes SET status = 'void', used_by = NULL, used_at = NULL WHERE code = ?"
      ).bind(order.code)
    );
  }

  await env.DB.batch(stmts);
  return json({ ok: true });
}

async function adminMessageSend(request, env) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const title = String(body.title || '').trim().slice(0, 60);
  const text = String(body.body || '').trim().slice(0, 1000);
  if (!title) return json({ ok: false, error: 'missing_title' }, 400);

  const kind = ['system', 'admin', 'reward'].indexOf(body.kind) >= 0 ? body.kind : 'system';

  if (body.all) {
    /* 全员公告按用户逐条写入，各自标记已读才成立 */
    const users = await env.DB.prepare(
      "SELECT id FROM users WHERE status <> 'banned' AND deleted_at IS NULL"
    ).all();
    const list = users.results || [];
    if (!list.length) return json({ ok: true, count: 0 });

    /* 同一个批次号，后台聚合成一条「提醒所有人」 */
    const batch = 'A' + Date.now().toString(36).toUpperCase();

    const stmts = list.map(function (u) {
      return env.DB.prepare(
        'INSERT INTO messages (uid, kind, title, body, batch) VALUES (?, ?, ?, ?, ?)'
      ).bind(u.id, kind, title, text, batch);
    });
    await env.DB.batch(stmts);

    return json({ ok: true, count: list.length, mode: 'all', batch: batch });
  }

  const uid = Number(body.uid);
  if (!uid) return json({ ok: false, error: 'bad_request' }, 400);

  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(uid).first();
  if (!user) return json({ ok: false, error: 'user_not_found' }, 404);

  await env.DB.prepare(
    'INSERT INTO messages (uid, kind, title, body) VALUES (?, ?, ?, ?)'
  ).bind(uid, kind, title, text).run();

  return json({ ok: true, count: 1, mode: 'single' });
}

async function adminMessageList(env, url) {
  const rows = await env.DB.prepare(
    `SELECT m.*, u.username FROM messages m LEFT JOIN users u ON u.id = m.uid
      ORDER BY m.id DESC LIMIT 200`
  ).all();

  return json({
    ok: true,
    items: (rows.results || []).map(function (r) {
      return {
        id: r.id,
        uid: r.uid,
        username: r.username || ('UID ' + r.uid),
        kind: r.kind,
        title: r.title,
        body: r.body,
        batch: r.batch || '',
        read: !!r.read_at,
        at: toIso(r.created_at)
      };
    })
  });
}

/* ---------------- 行政公告 ---------------- */

const NOTICE_LEVELS = ['info', 'warn', 'critical'];

function noticeRow(r) {
  return {
    id: r.id,
    title: r.title || '',
    body: r.body || '',
    level: r.level || 'info',
    status: r.status || 'draft',
    pinned: r.pinned === 1,
    at: toIso(r.published_at || r.created_at),
    updatedAt: toIso(r.updated_at)
  };
}

/* 公开：任何人（含未登录访客）都能看已发布的公告 */
async function noticeList(env) {
  const rows = await env.DB.prepare(
    `SELECT * FROM announcements WHERE status = 'published'
      ORDER BY pinned DESC, published_at DESC, id DESC LIMIT 30`
  ).all();

  return json({ ok: true, items: (rows.results || []).map(noticeRow) });
}

/* 后台：草稿和已发布全都要 */
async function adminNoticeList(env) {
  const rows = await env.DB.prepare(
    'SELECT * FROM announcements ORDER BY pinned DESC, id DESC LIMIT 100'
  ).all();

  return json({ ok: true, items: (rows.results || []).map(noticeRow) });
}

async function adminNoticeSave(request, env) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const text = String(body.body || '').trim();
  if (!text) return json({ ok: false, error: 'empty_body' }, 400);
  if (text.length > 2000) return json({ ok: false, error: 'too_long' }, 400);

  const title = String(body.title || '').trim().slice(0, 60);
  const level = NOTICE_LEVELS.indexOf(body.level) >= 0 ? body.level : 'info';
  const status = body.status === 'published' ? 'published' : 'draft';
  const pinned = body.pinned ? 1 : 0;

  if (body.id) {
    const id = Number(body.id);
    const old = await env.DB.prepare('SELECT published_at FROM announcements WHERE id = ?').bind(id).first();
    if (!old) return json({ ok: false, error: 'not_found' }, 404);

    const publishedAt = status === 'published'
      ? (old.published_at || new Date().toISOString())
      : old.published_at;

    await env.DB.prepare(
      `UPDATE announcements SET title = ?, body = ?, level = ?, status = ?, pinned = ?,
        published_at = ?, updated_at = datetime('now','+8 hours') WHERE id = ?`
    ).bind(title, text, level, status, pinned, publishedAt, id).run();

    return json({ ok: true, id: id });
  }

  const res = await env.DB.prepare(
    `INSERT INTO announcements (title, body, level, status, pinned, published_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    title, text, level, status, pinned,
    status === 'published' ? new Date().toISOString() : null
  ).run();

  return json({ ok: true, id: res.meta && res.meta.last_row_id });
}

async function adminNoticeDelete(request, env) {
  const body = await readJson(request);
  const id = Number(body && body.id);
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// 后台：广告墙任务流水与汇总
async function adminMtxList(env, url) {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 80));

  const rows = await env.DB.prepare(
    `SELECT t.id, t.uid, t.transaction_id, t.offer_name, t.reward_units, t.status,
            t.created_at, t.reversed_at, u.username
       FROM mo_task t LEFT JOIN users u ON u.id = t.uid
      ORDER BY t.id DESC LIMIT ?`
  ).bind(limit).all();

  const sum = await env.DB.prepare(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN status = 1 THEN reward_units ELSE 0 END), 0) AS live,
            COALESCE(SUM(CASE WHEN status = 2 THEN reward_units ELSE 0 END), 0) AS rev,
            COUNT(DISTINCT uid) AS users
       FROM mo_task`
  ).first();

  const items = (rows.results || []).map(function (r) {
    return {
      id: r.id, uid: r.uid, username: r.username || '',
      tid: r.transaction_id, name: r.offer_name || '广告任务',
      reward: mtxFc(r.reward_units), status: Number(r.status),
      at: toIso(r.created_at), reversedAt: r.reversed_at ? toIso(r.reversed_at) : null
    };
  });

  return json({
    ok: true,
    items: items,
    summary: {
      count: sum ? sum.n : 0,
      users: sum ? sum.users : 0,
      live: mtxFc(sum ? sum.live : 0),
      reversed: mtxFc(sum ? sum.rev : 0)
    }
  });
}

async function adminApi(request, env, url, path) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ ok: false, error: 'forbidden' }, 403);

  if (path === 'admin/overview' && request.method === 'GET') return await adminOverview(env);
  if (path === 'admin/users' && request.method === 'GET') return await adminUsers(request, env, url);
  if (path === 'admin/users/adjust' && request.method === 'POST') return await adminAdjust(request, env, admin);
  if (path === 'admin/users/status' && request.method === 'POST') return await adminStatus(request, env, admin);
  if (path === 'admin/users/role' && request.method === 'POST') return await adminRole(request, env, admin);
  if (path === 'admin/withdrawals' && request.method === 'GET') return await adminWithdrawals(request, env, url);
  if (path === 'admin/withdrawals/decide' && request.method === 'POST') return await adminWithdrawDecide(request, env, admin);
  if (path === 'admin/tickets' && request.method === 'GET') return await adminTickets(env, url);
  if (path === 'admin/tickets/decide' && request.method === 'POST') return await adminTicketDecide(request, env, admin);
  if (path === 'admin/surveys' && request.method === 'GET') return await adminSurveyList(env);
  if (path === 'admin/surveys/save' && request.method === 'POST') return await adminSurveySave(request, env);
  if (path === 'admin/surveys/feature' && request.method === 'POST') return await adminSurveyFeature(request, env);
  if (path === 'admin/surveys/delete' && request.method === 'POST') return await adminSurveyDelete(request, env);
  if (path === 'admin/items' && request.method === 'GET') return await adminItemList(env);
  if (path === 'admin/items/save' && request.method === 'POST') return await adminItemSave(request, env);
  if (path === 'admin/items/delete' && request.method === 'POST') return await adminItemDelete(request, env);
  if (path === 'admin/cdk' && request.method === 'GET') return await adminCdkList(env, url);
  if (path === 'admin/cdk/generate' && request.method === 'POST') return await adminCdkGenerate(request, env);
  if (path === 'admin/cdk/void' && request.method === 'POST') return await adminCdkVoid(request, env);
  if (path === 'admin/orders' && request.method === 'GET') return await adminOrderList(env, url);
  if (path === 'admin/orders/decide' && request.method === 'POST') return await adminOrderDecide(request, env);
  if (path === 'admin/messages/send' && request.method === 'POST') return await adminMessageSend(request, env);
  if (path === 'admin/messages' && request.method === 'GET') return await adminMessageList(env, url);
  if (path === 'admin/announcements' && request.method === 'GET') return await adminNoticeList(env);
  if (path === 'admin/announcements/save' && request.method === 'POST') return await adminNoticeSave(request, env);
  if (path === 'admin/announcements/delete' && request.method === 'POST') return await adminNoticeDelete(request, env);
  if (path === 'admin/moonetix' && request.method === 'GET') return await adminMtxList(env, url);
  return json({ ok: false, error: 'not_found' }, 404);
}

async function adminOverview(env) {
  const users = await env.DB.prepare(
    `SELECT COUNT(*) AS n,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'frozen' THEN 1 ELSE 0 END) AS frozen,
            SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS banned,
            SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS today
       FROM users WHERE deleted_at IS NULL`
  ).first();

  const money = await env.DB.prepare(
    `SELECT COALESCE(SUM(fc_units), 0) AS units, COALESCE(SUM(fc_frozen), 0) AS frozen
       FROM users WHERE deleted_at IS NULL`
  ).first();

  const wd = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amount
       FROM withdrawals WHERE status = 'pending'`
  ).first();

  const recent = await env.DB.prepare(
    `SELECT l.delta, l.kind, l.memo, l.created_at, u.username, u.id AS uid
       FROM fc_ledger l LEFT JOIN users u ON u.id = l.uid
      ORDER BY l.id DESC LIMIT 12`
  ).all();

  return json({
    ok: true,
    users: {
      total: users ? users.n : 0,
      active: users ? (users.active || 0) : 0,
      frozen: users ? (users.frozen || 0) : 0,
      banned: users ? (users.banned || 0) : 0,
      today: users ? (users.today || 0) : 0
    },
    money: {
      available: formatFc(money ? money.units : 0),
      frozen: formatFc(money ? money.frozen : 0)
    },
    withdrawals: { pending: wd ? wd.n : 0, amount: formatFc(wd ? wd.amount : 0) },
    recent: (recent.results || []).map((r) => ({
      at: toIso(r.created_at),
      uid: r.uid,
      username: r.username || '已注销',
      kind: r.kind,
      delta: formatFc(r.delta),
      memo: r.memo || ''
    }))
  });
}

const ADMIN_USER_COLS = 'id, username, email, role, status, fc_units, fc_frozen, level, created_at';

function adminUserRow(r) {
  return {
    uid: r.id,
    username: r.username,
    email: r.email,
    role: r.role,
    status: r.status,
    fc: formatFc(r.fc_units),
    fcFrozen: formatFc(r.fc_frozen),
    level: r.level || 1,
    createdAt: toIso(r.created_at)
  };
}

async function adminUsers(request, env, url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 64);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));

  let rows;
  if (!q) {
    rows = await env.DB.prepare(
      `SELECT ${ADMIN_USER_COLS} FROM users WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ?`
    ).bind(limit).all();
  } else if (/^\d+$/.test(q)) {
    rows = await env.DB.prepare(
      `SELECT ${ADMIN_USER_COLS} FROM users WHERE deleted_at IS NULL AND id = ?`
    ).bind(Number(q)).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT ${ADMIN_USER_COLS} FROM users
        WHERE deleted_at IS NULL AND (username LIKE ? OR email LIKE ?)
        ORDER BY id DESC LIMIT ?`
    ).bind('%' + q + '%', '%' + q + '%', limit).all();
  }

  return json({ ok: true, items: (rows.results || []).map(adminUserRow) });
}

async function adminTarget(env, uid) {
  return await env.DB.prepare(
    'SELECT id, role, status, fc_units, fc_frozen FROM users WHERE id = ? AND deleted_at IS NULL'
  ).bind(uid).first();
}

/* 站长账户只有站长能动 */
function canTouch(admin, target) {
  return !(target.role === 'owner' && admin.role !== 'owner');
}

async function adminAdjust(request, env, admin) {
  const body = await readJson(request);
  const uid = Number(body && body.uid);
  const delta = Number(body && body.delta);
  const memo = String((body && body.memo) || '').trim().slice(0, 120);
  if (!uid || !isFinite(delta) || delta === 0) return json({ ok: false, error: 'bad_request' }, 400);

  const target = await adminTarget(env, uid);
  if (!target) return json({ ok: false, error: 'user_not_found' }, 404);
  if (!canTouch(admin, target)) return json({ ok: false, error: 'forbidden' }, 403);
  if (target.status === 'banned') return json({ ok: false, error: 'user_banned' }, 400);

  const deltaUnits = Math.round(delta * FC_SCALE);
  const next = target.fc_units + deltaUnits;
  if (next < 0) return json({ ok: false, error: 'insufficient_balance' }, 400);

  const ref = 'A' + Date.now().toString(36).toUpperCase();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET fc_units = ?, updated_at = datetime('now','+8 hours') WHERE id = ?"
    ).bind(next, uid),
    env.DB.prepare(
      'INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(uid, deltaUnits, next, 'admin_adjust', ref, memo || '后台人工调整')
  ]);

  return json({ ok: true, fc: formatFc(next), ref });
}

async function adminStatus(request, env, admin) {
  const body = await readJson(request);
  const uid = Number(body && body.uid);
  const status = String((body && body.status) || '');
  const reason = String((body && body.reason) || '').trim().slice(0, 200);
  if (!uid || USER_STATUSES.indexOf(status) < 0) return json({ ok: false, error: 'bad_request' }, 400);

  const target = await adminTarget(env, uid);
  if (!target) return json({ ok: false, error: 'user_not_found' }, 404);
  if (!canTouch(admin, target)) return json({ ok: false, error: 'forbidden' }, 403);
  if (target.id === admin.uid) return json({ ok: false, error: 'self' }, 400);
  if (target.role === 'owner' && status !== 'active') return json({ ok: false, error: 'owner_lock' }, 400);
  if (target.status === status) return json({ ok: true });

  /* 状态变更与留痕一起写，避免改了状态却没记录 */
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET status = ?, updated_at = datetime('now','+8 hours') WHERE id = ?"
    ).bind(status, uid),
    env.DB.prepare(
      `INSERT INTO user_bans (uid, from_status, to_status, reason, by_uid, by_role)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(uid, target.status || '', status, reason, admin.uid || 0, admin.role || '')
  ]);

  return json({ ok: true });
}

/* 本人能看到自己的状态变更记录，供设置页「封禁记录」使用 */
async function userBans(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT from_status, to_status, reason, by_role, created_at
       FROM user_bans WHERE uid = ? ORDER BY id DESC LIMIT 50`
  ).bind(session.uid).all();

  const items = (rows.results || []).map(function (r) {
    return {
      from: r.from_status || '',
      to: r.to_status || '',
      reason: r.reason || '',
      by: r.by_role === 'owner' ? '站长' : '管理员',
      at: r.created_at || ''
    };
  });

  const banned = items.filter(function (x) { return x.to === 'banned'; }).length;
  return json({ ok: true, count: banned, total: items.length, items: items });
}

async function adminRole(request, env, admin) {
  if (admin.role !== 'owner') return json({ ok: false, error: 'owner_only' }, 403);

  const body = await readJson(request);
  const uid = Number(body && body.uid);
  const role = String((body && body.role) || '');
  if (!uid || USER_ROLES.indexOf(role) < 0) return json({ ok: false, error: 'bad_request' }, 400);

  const target = await adminTarget(env, uid);
  if (!target) return json({ ok: false, error: 'user_not_found' }, 404);
  if (target.id === admin.uid) return json({ ok: false, error: 'self' }, 400);
  if (target.role === role) return json({ ok: true });

  await env.DB.prepare(
    "UPDATE users SET role = ?, updated_at = datetime('now','+8 hours') WHERE id = ?"
  ).bind(role, uid).run();

  return json({ ok: true });
}

async function adminWithdrawals(request, env, url) {
  const status = (url.searchParams.get('status') || 'pending').trim();
  const filtered = ['pending', 'approved', 'paid', 'rejected'].indexOf(status) >= 0;

  const rows = await env.DB.prepare(
    `SELECT w.id, w.uid, w.amount, w.channel, w.account, w.status,
            w.created_at, w.reviewed_at, u.username
       FROM withdrawals w LEFT JOIN users u ON u.id = w.uid
      ${filtered ? 'WHERE w.status = ?' : ''}
      ORDER BY w.id DESC LIMIT 100`
  ).bind(...(filtered ? [status] : [])).all();

  const pending = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM withdrawals WHERE status = 'pending'"
  ).first();

  return json({
    ok: true,
    pending: pending ? pending.n : 0,
    items: (rows.results || []).map((r) => ({
      id: r.id,
      uid: r.uid,
      username: r.username || '',
      amount: formatFc(r.amount),
      channel: r.channel,
      account: r.account,
      status: r.status,
      createdAt: toIso(r.created_at),
      reviewedAt: toIso(r.reviewed_at)
    }))
  });
}

async function adminWithdrawDecide(request, env, admin) {
  const body = await readJson(request);
  const id = String((body && body.id) || '').trim();
  const action = String((body && body.action) || '');
  const note = String((body && body.note) || '').trim().slice(0, 120);
  if (!id || (action !== 'paid' && action !== 'rejected')) {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const wd = await env.DB.prepare('SELECT * FROM withdrawals WHERE id = ?').bind(id).first();
  if (!wd) return json({ ok: false, error: 'not_found' }, 404);
  if (wd.status !== 'pending') return json({ ok: false, error: 'already_reviewed' }, 400);

  const user = await env.DB.prepare('SELECT id, fc_units, fc_frozen FROM users WHERE id = ?')
    .bind(wd.uid).first();
  if (!user) return json({ ok: false, error: 'user_not_found' }, 404);
  if (user.fc_frozen < wd.amount) return json({ ok: false, error: 'frozen_mismatch' }, 400);

  const frozen = user.fc_frozen - wd.amount;

  if (action === 'paid') {
    /* 打款：冻结直接划走，可用余额不变，流水记负 */
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE users SET fc_frozen = ?, updated_at = datetime('now','+8 hours') WHERE id = ?"
      ).bind(frozen, user.id),
      env.DB.prepare(
        'INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(user.id, -wd.amount, user.fc_units, 'withdraw_paid', id, note || '提现打款'),
      env.DB.prepare(
        "UPDATE withdrawals SET status = 'paid', reviewed_by = ?, review_note = ?, reviewed_at = datetime('now','+8 hours') WHERE id = ?"
      ).bind(admin.uid, note, id)
    ]);
  } else {
    /* 驳回：冻结退回可用余额，流水记正 */
    const back = user.fc_units + wd.amount;
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE users SET fc_frozen = ?, fc_units = ?, updated_at = datetime('now','+8 hours') WHERE id = ?"
      ).bind(frozen, back, user.id),
      env.DB.prepare(
        'INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(user.id, wd.amount, back, 'withdraw_refund', id, note || '提现驳回退回'),
      env.DB.prepare(
        "UPDATE withdrawals SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_at = datetime('now','+8 hours') WHERE id = ?"
      ).bind(admin.uid, note, id)
    ]);
  }

  return json({ ok: true });
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

// D1 的 datetime('now','+8 hours') 为 UTC，补上 T 与 Z 供前端解析
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
