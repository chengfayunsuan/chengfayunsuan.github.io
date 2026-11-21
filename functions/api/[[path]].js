/**
 * Chengfa · 账户接口
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
    if (path === 'auth/reset/code' && request.method === 'POST') return await resetSendCode(request, env);
    if (path === 'auth/reset/verify' && request.method === 'POST') return await resetPassword(request, env);
    if (path === 'ip/check' && request.method === 'GET') return await ipCheck(request, env);
    if (path === 'user/profile' && request.method === 'PATCH') return await updateProfile(request, env);
    if (path === 'user/email' && request.method === 'POST') return await updateEmail(request, env);
    if (path === 'user/password' && request.method === 'POST') return await updatePassword(request, env);
    if (path === 'user/password/code' && request.method === 'POST') return await passwordSendCode(request, env);
    if (path === 'user/email/code' && request.method === 'POST') return await emailSendCode(request, env);
    if (path === 'user/email/verify' && request.method === 'POST') return await emailVerify(request, env);
    if (path === 'user/bans' && request.method === 'GET') return await userBans(request, env);
    if (path === 'ledger' && request.method === 'GET') return await ledger(request, env, url);
    if (path === 'ladder' && request.method === 'GET') return await ladder(request, env, url);
    if (path === 'ticket' && request.method === 'POST') return await ticketSubmit(request, env);
    if (path === 'ticket' && request.method === 'GET') return await ticketMine(request, env);
    if (path === 'fx' && request.method === 'GET') return await fxRate(env);
    if (path === 'surveys' && request.method === 'GET') return await surveyList(request, env);
    if (path === 'surveys/join' && request.method === 'POST') return await surveyJoin(request, env);
    if (path === 'surveys/paper' && request.method === 'GET') return await surveyPaper(request, env, url);
    if (path === 'surveys/submit' && request.method === 'POST') return await surveySubmit(request, env);
    if (path === 'surveys/poll' && request.method === 'GET') return await surveyPoll(request, env, url);
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
    if (path === 'theoremreach/link' && request.method === 'GET') return await trLink(request, env);
    if (path === 'theoremreach/postback') return await trPostback(request, env, url);
    if (path.indexOf('admin/') === 0) return await adminApi(request, env, url, path);
    return json({ ok: false, error: 'not_found' }, 404);
  } catch (err) {
    console.error('api error:', err && err.stack ? err.stack : err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

/* ---------------- 路由实现 ---------------- */

/* ---------------- 人机验证 ---------------- */

/* 只放行自家域名：生产域 + Pages 预览子域；其余一律拒
   自定义域 chengfa.org 绑上后也要放行，否则新域上注册/登录的 Turnstile 验证会被 hostAllowed 拒掉。
   hostAllowed 用 endsWith('.' + base)，加根域即可同时放行 www 等所有子域。 */
const TURNSTILE_HOSTS = ['chengfa-761.pages.dev', 'chengfa.org'];

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

/* ---------------- 经验与等级 ----------------
   每级固定 100 分，线性结算：第 n 级区间 [(n-1)*100, n*100)。
   所以 LV1 = 0～99，LV0 = -100～-1，LV-1 = -200～-100，允许负等级。
   前端 home.js / space.js 的 levelRange 与这里必须一致。 */
function levelOf(exp) {
  return Math.floor((Number(exp) || 0) / 100) + 1;
}

/* 生成「经验加 delta 并同步结算等级」的 SQL 片段。
   delta 只传内部常量（1 / 3 / -8），不接用户输入。 */
function lvSql(delta) {
  const d = Number(delta) || 0;
  return `exp = exp + (${d}), level = CAST(FLOOR((exp + (${d})) / 100.0) AS INTEGER) + 1`;
}

/* ---------------- 好感度每日结算 ----------------
   每天北京时间 0 点结算前一天：当日赚分最多的人 +1 点好感度。
   「赚分」= fc_ledger 里正向的收益入账（问卷、广告墙等）；
   充值（cdk_redeem）、提现退回、管理员调整不算赚分——那是钱在挪窝。
   Cloudflare Pages 没有定时器，结算挂在 /api/auth/me 上懒触发：
   跨天后第一个访问的人把之前所有没结算的天一口气补齐（含回填历史）。
   并发安全靠 affinity_daily.day 主键：INSERT OR IGNORE 抢到的那次才加好感度。 */

const AFFINITY_SKIP_KINDS = "('withdraw_refund','cdk_redeem','admin_adjust')";

async function settleAffinity(env) {
  // 快路径：昨天已结算就直接返回，整个函数只剩一次轻量读
  const probe = await env.DB.prepare(
    `SELECT (SELECT MAX(day) FROM affinity_daily) done,
            date('now','+8 hours','-1 day') yesterday`
  ).first();
  if (!probe || probe.done === probe.yesterday) return 0;

  // 起点：最早一笔入账所在的北京日；回填历史全靠它
  const first = await env.DB.prepare(
    `SELECT MIN(date(created_at,'+8 hours')) d FROM fc_ledger
      WHERE delta > 0 AND kind NOT IN ${AFFINITY_SKIP_KINDS}`
  ).first();
  const start = first && first.d ? first.d : probe.yesterday;

  const days = [];
  const cur = new Date(start + 'T00:00:00Z');
  const end = new Date(probe.yesterday + 'T00:00:00Z');
  while (cur <= end && days.length < 120) {   // 单次请求最多补 120 天，再多下次接着补
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  let awarded = 0;
  for (const day of days) {
    const win = await env.DB.prepare(
      `SELECT l.uid, SUM(l.delta) s
         FROM fc_ledger l JOIN users u ON u.id = l.uid
        WHERE l.delta > 0
          AND l.kind NOT IN ${AFFINITY_SKIP_KINDS}
          AND date(l.created_at,'+8 hours') = ?
          AND u.status = 'active' AND u.deleted_at IS NULL
        GROUP BY l.uid
        ORDER BY s DESC, l.uid ASC
        LIMIT 1`
    ).bind(day).first();

    // uid=0 的占位行把「无人入账」的日子也钉在表里，避免反复空扫
    const ins = await env.DB.prepare(
      `INSERT OR IGNORE INTO affinity_daily (day, uid, earned, applied_at)
       VALUES (?, ?, ?, datetime('now','+8 hours'))`
    ).bind(day, win ? win.uid : 0, win ? win.s : 0).run();
    if (!(ins.meta && ins.meta.changes > 0)) continue;   // 别人刚结算过这一天

    if (win) {
      await env.DB.prepare(
        `UPDATE users
            SET affinity = affinity + 1,
                updated_at = datetime('now','+8 hours')
          WHERE id = ?`
      ).bind(win.uid).run();
      awarded++;
    }
  }
  return awarded;
}

async function me(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  // 好感度日结：挂在登录态页都必经的 /me 上，放在取资料之前，
  // 这样刚补上的好感度当场就能看到；结算失败不影响本次响应。
  try {
    await settleAffinity(env);
  } catch (e) {
    console.error('affinity settle error:', e && e.message ? e.message : e);
  }

  const user = await profileOf(env, session.uid);

  /* 每日登录 +1 点经验（不是 +1 级）：按北京时间自然日算，同一天只加一次。
     条件写在 WHERE 里，没跨天时这条 UPDATE 影响 0 行，不产生写入。
     冻结/封禁不加；解封当天再进来会补上加一次。 */
  const bump = await env.DB.prepare(
    `UPDATE users
        SET ${lvSql(1)},
            lv_bonus_on = date('now','+8 hours'),
            updated_at = datetime('now','+8 hours')
      WHERE id = ?
        AND status = 'active'
        AND (lv_bonus_on IS NULL OR lv_bonus_on <> date('now','+8 hours'))`
  ).bind(session.uid).run();

  const changed = bump && bump.meta && bump.meta.changes > 0;
  if (changed && user) {
    user.exp = Number(user.exp || 0) + 1;
    user.level = levelOf(user.exp);
  }

  return json({
    ok: true,
    lvUp: changed,
    user: Object.assign({}, user, clientInfo(request))
  });
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

/* ---------------- 代理 / VPN 检测 ----------------
   三层信号，命中任意一层就判为可疑：
   1. cf.asn 落在这份机房名单里。梯子九成跑在 VPS 上，这一条最有效，也不花外部请求。
   2. ipapi.is 免费接口的 is_vpn / is_tor / is_proxy / is_datacenter，补细节。
   3. 结果写进 ip_intel 缓存 24 小时，压住外部调用量。
   外部接口失败不影响主流程：拿不到就只靠 ASN 名单，绝不因为查不到就拦人。 */

const DC_ASN = {
  16509: 'Amazon', 14618: 'Amazon',
  15169: 'Google', 396982: 'Google Cloud',
  8075: 'Microsoft', 8068: 'Microsoft',
  20940: 'Akamai', 16625: 'Akamai',
  14061: 'DigitalOcean', 63949: 'Linode', 20473: 'Vultr',
  16276: 'OVH', 24940: 'Hetzner', 51167: 'Contabo', 12876: 'Scaleway',
  9009: 'M247', 60781: 'LeaseWeb', 43350: 'NForce', 53667: 'FranTech',
  3223: 'Voxility', 200651: 'FlokiNET', 31898: 'Oracle Cloud',
  37963: '阿里云', 45102: '阿里云国际', 132203: '腾讯云', 45090: '腾讯云',
  55990: '华为云', 136907: '华为云', 55960: 'AWS 中国',
  38365: '百度云', 135377: 'UCloud', 55967: '京东云'
};

function ipOf(request) {
  const raw = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || request.headers.get('X-Real-IP')
    || '';
  return raw.split(',')[0].trim();
}

/* ip-api.com 免费层：支持任意 IP 查询，字段里直接带 proxy / hosting。
   免费版只认 http（https 要付费），查的是 IP 归属，不涉及任何用户内容。
   2.5 秒超时，拿不到就当查不到，绝不拿「查不到」当理由拦人。 */
async function ipProbe(ip) {
  const ctl = new AbortController();
  const timer = setTimeout(function () { ctl.abort(); }, 2500);
  const fields = 'status,message,countryCode,as,org,isp,proxy,hosting,mobile';
  const q = encodeURIComponent(ip) + '?fields=' + fields;
  try {
    const res = await fetch('http://ip-api.com/json/' + q, { signal: ctl.signal });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || j.status !== 'success') return null;
    return j;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function asnNum(asField) {
  const m = String(asField || '').match(/\d{2,10}/);
  return m ? m[0] : '';
}

async function ipIntel(request, env) {
  const ip = ipOf(request);
  const cf = request.cf || {};
  const cfAsn = cf.asn ? String(cf.asn) : '';
  const cfOrg = cf.asOrganization || '';

  if (!ip) {
    return { ok: false, proxy: false, dc: false, country: cf.country || '', asn: cfAsn, org: cfOrg, src: 'none' };
  }

  const hit = await env.DB.prepare(
    "SELECT * FROM ip_intel WHERE ip = ? AND checked_at > datetime('now','+8 hours','-1 day')"
  ).bind(ip).first();

  if (hit) {
    return {
      ok: true,
      proxy: !!hit.proxy,
      dc: !!hit.dc,
      country: hit.country || cf.country || '',
      asn: hit.asn || cfAsn,
      org: hit.org || cfOrg,
      src: hit.src || 'cache'
    };
  }

  let asn = cfAsn;
  let org = cfOrg;
  let proxy = 0;
  let dc = 0;
  let src = 'asn';

  if (asn && DC_ASN[asn]) { dc = 1; if (!org) org = DC_ASN[asn]; }

  const ext = await ipProbe(ip);
  if (ext) {
    src = 'ipapi';
    const ea = asnNum(ext.as);
    if (ea) asn = ea;
    if (ext.org) org = ext.org;
    else if (ext.isp) org = ext.isp;
    if (ext.proxy) proxy = 1;
    if (ext.hosting) dc = 1;
    if (asn && DC_ASN[asn]) dc = 1;
  }

  const country = (ext && ext.countryCode) || cf.country || '';

  await env.DB.prepare(
    `INSERT INTO ip_intel (ip, country, asn, org, proxy, dc, src, hits, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now','+8 hours'))
     ON CONFLICT(ip) DO UPDATE SET
       country = excluded.country, asn = excluded.asn, org = excluded.org,
       proxy = excluded.proxy, dc = excluded.dc, src = excluded.src,
       hits = ip_intel.hits + 1, checked_at = excluded.checked_at`
  ).bind(ip, country, asn, org, proxy, dc, src).run();

  return { ok: true, proxy: !!proxy, dc: !!dc, country: country, asn: asn, org: org, src: src };
}

/* 给前端用：只回答「你是不是可疑」，不回传 IP 本身 */
async function ipCheck(request, env) {
  const intel = await ipIntel(request, env);
  return json({
    ok: true,
    suspect: !!(intel.proxy || intel.dc),
    kind: intel.proxy ? 'proxy' : (intel.dc ? 'dc' : ''),
    country: intel.country || '',
    org: intel.org || ''
  });
}

/* 判定为代理/VPN 后还在点问卷：封号。
   站长与管理员豁免，否则自己开梯子就把自己干掉了。 */
async function banForProxy(env, uid, intel) {
  const me = await env.DB.prepare('SELECT id, role, status FROM users WHERE id = ?').bind(uid).first();
  if (!me) return false;
  if (me.role === 'owner' || me.role === 'admin') return false;
  if (me.status === 'banned') return true;

  const why = '系统判定：使用代理 / VPN 网络访问问卷'
    + '（' + (intel.country || '未知地区') + (intel.org ? ' · ' + intel.org : '') + '）';

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET status = 'banned', ${lvSql(-8)}, updated_at = datetime('now','+8 hours') WHERE id = ?`
    ).bind(uid),
    env.DB.prepare(
      `INSERT INTO user_bans (uid, from_status, to_status, reason, by_uid, by_role)
       VALUES (?, ?, 'banned', ?, 0, 'system')`
    ).bind(uid, me.status || 'active', why)
  ]);

  return true;
}

/* 站长 / 管理员权力大于一切：问卷的 IP 判重管不到他们。
   自己测一份卷子要来回走七八遍，被自己的出口 IP 卡住就没法干活了。 */
async function isPrivileged(env, uid) {
  const me = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(uid).first();
  return !!me && (me.role === 'owner' || me.role === 'admin');
}

/* 站长每一轮用一条独立伪 IP 落库：既不跟真实 IP 撞唯一索引，也不占别人的名额。
   前缀带 @，一眼能看出这条不是真访客。 */
function privIp(uid) {
  return '@' + uid + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* 找本轮答卷：优先按 attempt（站长每轮独立一行），否则退回按出口 IP 找。
   拿别人的 attempt 也没用 —— IP 或者站长身份对不上就不用它。 */
async function resolveJoin(env, request, id, uid, attempt) {
  const ip = ipOf(request) || 'unknown';
  if (attempt) {
    const row = await env.DB.prepare(
      'SELECT * FROM survey_joins WHERE id = ? AND survey_id = ?'
    ).bind(attempt, id).first();
    if (row && (row.ip === ip || await isPrivileged(env, uid))) return { join: row, ip: row.ip, priv: true };
  }
  const join = await env.DB.prepare(
    'SELECT * FROM survey_joins WHERE ip = ? AND survey_id = ?'
  ).bind(ip, id).first();
  return { join: join, ip: ip, priv: false };
}

/* ---------------- 风控 ----------------
   光靠 IP 判重挡不住换设备、换号的羊毛党。这一层只管「谁在交」，
   不管「填了什么」—— 答卷内容由问卷商判定，这里不插手。
   每次命中写一条 risk_events，事后能查。 */

const RISK = {
  joinPerIpHour: 30,      /* 同一出口 IP 一小时内最多开 30 份卷 */
  fpUidWarn: 3,           /* 一台设备挂 3 个以上账号，记一笔 */
  ipUidWarn: 5            /* 一个 IP 挂 5 个以上账号，记一笔 */
};

async function riskHit(env, e) {
  try {
    await env.DB.prepare(
      `INSERT INTO risk_events (uid, ip, fp, survey_id, kind, score, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      e.uid || 0, e.ip || '', e.fp || '', e.surveyId || 0,
      e.kind || '', e.score || 0, String(e.detail || '').slice(0, 300)
    ).run();
  } catch (err) {
    console.error('risk hit failed:', err && err.message);
  }
}

/* 一小时内这个 IP 开了多少份卷 */
async function joinsLastHour(env, ip) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM survey_joins
      WHERE ip = ? AND datetime(created_at) > datetime('now','+8 hours','-1 hour')`
  ).bind(ip).first();
  return Number(r && r.n) || 0;
}

/* 这台设备、这个 IP 各自挂了几个账号 —— 只是记账，不直接拦 */
async function accountSpread(env, ip, fp) {
  const out = { ipUids: 0, fpUids: 0 };
  if (ip) {
    const a = await env.DB.prepare(
      'SELECT COUNT(DISTINCT uid) AS n FROM survey_joins WHERE ip = ?'
    ).bind(ip).first();
    out.ipUids = Number(a && a.n) || 0;
  }
  if (fp) {
    const b = await env.DB.prepare(
      'SELECT COUNT(DISTINCT uid) AS n FROM survey_joins WHERE fp = ?'
    ).bind(fp).first();
    out.fpUids = Number(b && b.n) || 0;
  }
  return out;
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

/* ---------------- 邮箱验证码（三处共用） ----------------
   验证邮箱 / 忘记密码 / 更改密码 都走这一套：
   6 位数字，10 分钟过期，60 秒才能重发，一个账号一天最多 3 封，一条码错 5 次作废。
   配额跨这三处合并计算 —— 一个人一天就是 3 封，不分用途。
   发信走 Zoho ZeptoMail / CPaaS（env.ZEPTOMAIL_API_KEY + MAIL_FROM）。
   没配发信服务时：码照样入库，只在本地调试（MAIL_DEBUG=1）时回传，方便把流程跑通。 */

const MAIL_CODE_TTL = 600;      /* 有效期，秒 */
const MAIL_CODE_GAP = 60;       /* 两条之间至少隔这么久 */
const MAIL_CODE_DAY = 3;        /* 一天最多发几封，三处共用 */
const MAIL_CODE_TRIES = 5;      /* 一条码最多试几次 */

function code6() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

function maskMail(m) {
  const s = String(m || '');
  const at = s.indexOf('@');
  if (at < 1) return s;
  return s.slice(0, Math.min(2, at)) + '***' + s.slice(at);
}

/* 发件人：MAIL_FROM 支持两种写法
   - "Chengfa <noreply@chengfa.org>"  → 拆成 address + name
   - "noreply@chengfa.org"           → address，name 用默认
   Zoho 要求 address 必须是已验证域名下的邮箱，没配时给个占位，发不出去会记日志。 */
function parseFrom(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(.*?)<([^<>]+)>\s*$/);
  if (m) return { address: m[2].trim(), name: m[1].trim() || 'Chengfa' };
  if (s.indexOf('@') > 0) return { address: s, name: 'Chengfa' };
  return { address: 'noreply@chengfa.org', name: 'Chengfa' };
}

/* 三种用途各写各的抬头，收到信的人一眼知道这封是干什么的 */
const MAIL_COPY = {
  verify: {
    subject: 'Chengfa · 验证邮箱',
    body: function (code) {
      return '你的验证码是 ' + code + '，10 分钟内有效。\n\n'
        + '在「设置 · 账户与安全」里填进去，就能把这个邮箱标记为已验证。\n'
        + '不是本人操作就忽略这封邮件，你的账户没有任何变化。';
    }
  },
  reset: {
    subject: 'Chengfa · 重置密码',
    body: function (code) {
      return '你的验证码是 ' + code + '，10 分钟内有效。\n\n'
        + '在登录页的「忘记密码」里填进去，就能设置一个新密码。\n'
        + '重置后所有设备上的登录状态都会失效，需要重新登录。\n'
        + '不是你本人提交的，直接忽略这封邮件，原密码照旧可用。';
    }
  },
  password: {
    subject: 'Chengfa · 修改密码',
    body: function (code) {
      return '你的验证码是 ' + code + '，10 分钟内有效。\n\n'
        + '在「设置 · 账户与安全」改密码时填进去，才算本人操作。\n'
        + '不是你本人提交的，说明密码可能已经泄露，请立刻改密码并联系客服。';
    }
  }
};

async function mailSend(env, to, code, purpose) {
  const key = env.ZEPTOMAIL_API_KEY;
  if (!key) return 'mail_unconfigured';

  const copy = MAIL_COPY[purpose] || MAIL_COPY.verify;
  const from = parseFrom(env.MAIL_FROM);
  try {
    /* Zoho ZeptoMail / CPaaS：认证头是 Zoho-enczapikey + token（不是 Bearer）。
       v1.1/email 用 textbody 发明文；htmlbody 是另一条路径，别混。 */
    const res = await fetch('https://api.zeptomail.com/v1.1/email', {
      method: 'POST',
      headers: {
        Authorization: 'Zoho-enczapikey ' + key,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        from: from,
        to: [{ email_address: { address: to, name: '' } }],
        subject: copy.subject + ' ' + code,
        textbody: copy.body(code)
      })
    });
    if (!res.ok) {
      console.error('zeptomail failed:', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return 'mail_failed';
    }
    return '';
  } catch (e) {
    console.error('zeptomail error:', e && e.message);
    return 'mail_failed';
  }
}

/* 这条码是多久以前发的（秒） */
async function codeAgeSeconds(env, at) {
  const r = await env.DB.prepare(
    "SELECT CAST((julianday(datetime('now','+8 hours')) - julianday(?)) * 86400 AS INTEGER) AS s"
  ).bind(at).first();
  return Math.max(0, Number(r && r.s) || 0);
}

/* ---------- 配额 ---------- */

/* 这个账号今天发了几封、上一封距今多久。三处用途共用一份配额。 */
async function mailQuota(env, uid) {
  const last = await env.DB.prepare(
    `SELECT CAST((julianday(datetime('now','+8 hours')) - julianday(sent_at)) * 86400 AS INTEGER) AS age
       FROM mail_log WHERE uid = ? ORDER BY id DESC LIMIT 1`
  ).bind(uid).first();
  const usedRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM mail_log WHERE uid = ? AND date(sent_at) = date(datetime('now','+8 hours'))"
  ).bind(uid).first();

  const used = Number(usedRow && usedRow.n) || 0;
  const age = last ? Math.max(0, Number(last.age) || 0) : 999999;
  return {
    used: used,
    left: Math.max(0, MAIL_CODE_DAY - used),
    wait: age < MAIL_CODE_GAP ? MAIL_CODE_GAP - age : 0
  };
}

function mailLimitFail(out) {
  return json({
    ok: false,
    error: out.error,
    left: out.left || 0,
    wait: out.wait || 0,
    message: out.error === 'too_many'
      ? '今天验证码已经发了 3 封，明天再来'
      : '这个账号刚发过一封，' + (out.wait || 60) + ' 秒后再发'
  }, 429);
}

/* 发信没成功，或者配额到了，统一从这里出去 */
function mailFail(env, out) {
  if (out.error === 'too_soon' || out.error === 'too_many') return mailLimitFail(out);

  const body = {
    ok: false,
    error: out.error,
    message: out.error === 'mail_unconfigured'
      ? '站长还没配发信服务，暂时发不出邮件'
      : '邮件没发出去，稍后再试'
  };
  if (env.MAIL_DEBUG === '1' && out.code) body.devCode = out.code;
  return json(body, out.error === 'mail_unconfigured' ? 503 : 502);
}

/* 发一条码：查配额 → 落库 → 发信。
   发信失败就把这条流水撤掉，不白扣用户的额度。 */
async function mailIssue(env, uid, email, purpose, ip) {
  const q = await mailQuota(env, uid);
  /* 当天额度用完就先说这个 —— 让用户干等 60 秒再来撞同一堵墙没有意义 */
  if (q.left <= 0) return { error: 'too_many', wait: 0, left: 0 };
  if (q.wait > 0) return { error: 'too_soon', wait: q.wait, left: q.left };

  const code = code6();
  await env.DB.prepare(
    `INSERT INTO mail_codes (uid, purpose, email, code, tries, sent_at)
     VALUES (?, ?, ?, ?, 0, datetime('now','+8 hours'))
     ON CONFLICT(uid, purpose) DO UPDATE SET
       email = excluded.email, code = excluded.code, tries = 0, sent_at = excluded.sent_at`
  ).bind(uid, purpose, email, code).run();

  const ins = await env.DB.prepare(
    "INSERT INTO mail_log (uid, email, purpose, ip, sent_at) VALUES (?, ?, ?, ?, datetime('now','+8 hours'))"
  ).bind(uid, email, purpose, String(ip || '').slice(0, 80)).run();

  const err = await mailSend(env, email, code, purpose);
  if (err) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM mail_log WHERE id = ?').bind(ins.meta.last_row_id),
      env.DB.prepare('DELETE FROM mail_codes WHERE uid = ? AND purpose = ? AND code = ?').bind(uid, purpose, code)
    ]);
    return { error: err, code: code };
  }

  return { ok: true, email: maskMail(email), left: q.left - 1 };
}

/* 校验一条码；tries 只在错的时候加，过期和超次不消耗 */
async function mailCheck(env, uid, purpose, code) {
  const row = await env.DB.prepare(
    'SELECT * FROM mail_codes WHERE uid = ? AND purpose = ?'
  ).bind(uid, purpose).first();
  if (!row) return { error: 'no_code', message: '先发一条验证码' };
  if ((Number(row.tries) || 0) >= MAIL_CODE_TRIES) {
    return { error: 'too_many_tries', message: '试太多次了，重新发一条' };
  }
  if (await codeAgeSeconds(env, row.sent_at) > MAIL_CODE_TTL) {
    return { error: 'expired', message: '验证码过期了，重新发一条' };
  }
  if (String(row.code) !== code) {
    await env.DB.prepare('UPDATE mail_codes SET tries = tries + 1 WHERE uid = ? AND purpose = ?')
      .bind(uid, purpose).run();
    return {
      error: 'wrong_code',
      left: Math.max(0, MAIL_CODE_TRIES - ((Number(row.tries) || 0) + 1))
    };
  }
  return { row: row };
}

function codeFail(chk) {
  return json({
    ok: false,
    error: chk.error,
    left: chk.left,
    message: chk.message || '验证码不对'
  }, chk.error === 'too_many_tries' ? 429 : 400);
}

/* ---------- 场景一：验证注册邮箱（已登录） ---------- */

async function emailSendCode(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const me = await env.DB.prepare(
    'SELECT id, email, email_verified FROM users WHERE id = ? AND deleted_at IS NULL'
  ).bind(session.uid).first();
  if (!me || !me.email) return json({ ok: false, error: 'no_email' }, 400);
  if (me.email_verified) return json({ ok: false, error: 'already_verified' }, 400);

  const out = await mailIssue(env, me.id, me.email, 'verify', ipOf(request));
  if (!out.ok) return mailFail(env, out);
  return json(out);
}

async function emailVerify(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const body = await readJson(request);
  const code = String((body && body.code) || '').replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6) return json({ ok: false, error: 'bad_code' }, 400);

  const chk = await mailCheck(env, session.uid, 'verify', code);
  if (chk.error) return codeFail(chk);

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET email_verified = 1, updated_at = datetime('now','+8 hours') WHERE id = ? AND email = ?"
    ).bind(session.uid, chk.row.email),
    env.DB.prepare("DELETE FROM mail_codes WHERE uid = ? AND purpose = 'verify'").bind(session.uid)
  ]);

  return json({ ok: true, verified: true, user: await profileOf(env, session.uid) });
}

/* ---------- 场景二：忘记密码（未登录，靠邮箱找账号） ---------- */

async function resetSendCode(request, env) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  /* 不需要登录的接口，不挡人机验证就成了免费发信机 */
  const ts = await verifyTurnstile(request, env, body.turnstileToken);
  if (ts) return json({ ok: false, error: ts }, 403);

  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return json({ ok: false, error: 'invalid_email' }, 400);
  }

  const user = await env.DB.prepare(
    'SELECT id, email FROM users WHERE email = ? COLLATE NOCASE AND deleted_at IS NULL'
  ).bind(email).first();

  /* 邮箱没注册过也回成功：文案跟真发出去的一模一样，
     别让人拿这个接口批量试哪些邮箱在站里存在 */
  if (!user) return json({ ok: true, sent: false, email: maskMail(email), left: MAIL_CODE_DAY });

  const out = await mailIssue(env, user.id, user.email, 'reset', ipOf(request));
  if (!out.ok) return mailFail(env, out);
  return json({ ok: true, sent: true, email: out.email, left: out.left });
}

async function resetPassword(request, env) {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  const pw = String(body.password || '');
  if (!EMAIL_RE.test(email) || email.length > 120) return json({ ok: false, error: 'invalid_email' }, 400);
  if (code.length !== 6) return json({ ok: false, error: 'bad_code' }, 400);
  const bad = pwProblem(pw);
  if (bad) return json({ ok: false, error: bad }, 400);

  const user = await env.DB.prepare(
    'SELECT id, email FROM users WHERE email = ? COLLATE NOCASE AND deleted_at IS NULL'
  ).bind(email).first();
  /* 不存在就当作码不对，别透出这个邮箱有没有账号 */
  if (!user) return codeFail({ error: 'no_code', message: '验证码不对，重新发一条' });

  const chk = await mailCheck(env, user.id, 'reset', code);
  if (chk.error) return codeFail(chk);

  const salt = randomSaltHex(16);
  const hash = await pbkdf2Hex(pw, salt, PBKDF2_ITER);

  await env.DB.batch([
    /* 走过邮箱验证，顺手把邮箱标成已验证 */
    env.DB.prepare(
      `UPDATE users
          SET pw_hash = ?, pw_salt = ?, pw_iter = ?, email_verified = 1,
              updated_at = datetime('now','+8 hours')
        WHERE id = ?`
    ).bind(hash, salt, PBKDF2_ITER, user.id),
    /* 密码换了，之前所有登录状态一律作废 */
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare("DELETE FROM mail_codes WHERE uid = ? AND purpose = 'reset'").bind(user.id),
    /* 之前登录失败攒下的限流也一并清掉，别让用户刚改完密码又被锁 */
    env.DB.prepare('DELETE FROM login_fails WHERE lower(email) = ?').bind(String(user.email || email).toLowerCase())
  ]);

  return json({ ok: true });
}

/* ---------- 场景三：改密码（已登录，先验邮箱） ---------- */

async function passwordSendCode(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const me = await env.DB.prepare(
    'SELECT id, email FROM users WHERE id = ? AND deleted_at IS NULL'
  ).bind(session.uid).first();
  if (!me || !me.email) return json({ ok: false, error: 'no_email' }, 400);

  const out = await mailIssue(env, me.id, me.email, 'password', ipOf(request));
  if (!out.ok) return mailFail(env, out);
  return json(out);
}

// 改密码：旧密码 + 邮箱验证码双确认，改完把其它设备上的会话全部踢掉
async function updatePassword(request, env) {  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);

  const oldPw = String(body.old || '');
  const newPw = String(body.new || '');
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  if (!oldPw) return json({ ok: false, error: 'password_required' }, 400);
  const bad = pwProblem(newPw);
  if (bad) return json({ ok: false, error: bad }, 400);
  if (oldPw === newPw) return json({ ok: false, error: 'same_password' }, 400);
  if (code.length !== 6) return json({ ok: false, error: 'bad_code' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, email, pw_hash, pw_salt, pw_iter FROM users WHERE id = ? AND deleted_at IS NULL'
  ).bind(session.uid).first();
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

  const hash = await pbkdf2Hex(oldPw, user.pw_salt, user.pw_iter || PBKDF2_ITER);
  if (hash !== user.pw_hash) return json({ ok: false, error: 'wrong_password' }, 403);

  /* 旧密码对了才验码，省得码被白白试掉 */
  const chk = await mailCheck(env, user.id, 'password', code);
  if (chk.error) return codeFail(chk);

  const salt = randomSaltHex(16);
  const next = await pbkdf2Hex(newPw, salt, PBKDF2_ITER);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
          SET pw_hash = ?, pw_salt = ?, pw_iter = ?, email_verified = 1,
              updated_at = datetime('now','+8 hours')
        WHERE id = ?`
    ).bind(next, salt, PBKDF2_ITER, user.id),
    /* 保留当前这条会话，其余下线（sessions 的用户列名是 user_id） */
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(user.id, session.tokenHash),
    env.DB.prepare("DELETE FROM mail_codes WHERE uid = ? AND purpose = 'password'").bind(user.id)
  ]);

  return json({ ok: true });
}

/* ---------------- Moonetix 广告墙 ----------------
 *
 * Moonetix 是 offerwall 联盟（不是问卷商）：用户完成广告主的任务，服务商给发布方
 * 结算美元，我们按自定汇率折成 XB 发给用户。奖励只能来自服务端回调，不能信前端。
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

/* 模拟墙里的任务，仅 demo 模式使用；面额是人话，单位 XB */
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

/* 签名按官方开源 handler（github.com/moonetix/offerwall-postback-handlers）的约定：
   HMAC-SHA256(key = postback secret key, message = tx + ":" + user + ":" + reward + ":" + status)
   只签这四个值，payout / event / offer_id / offer_name 都不参与签名；
   reward 必须用收到的原串，150 和 150.00 算出来的哈希不一样。
   返回 ok / missing / invalid 三态：缺 hash 回 400，错 hash 回 403。 */
async function mtxSignatureOk(c, p) {
  if (!c.live) return 'ok';   // 演示模式不校验，入账口只对站长开放

  const given = String(p.hash || p.signature || p.sig || '').trim().toLowerCase();
  if (!given) return 'missing';
  if (!/^[0-9a-f]{64}$/.test(given)) return 'missing';

  const tid = String(p.tx || p.transaction_id || '');
  const user = String(p.user || p.user_id || '');
  const reward = p.reward == null ? '' : String(p.reward);
  const status = p.status == null ? '' : String(p.status);

  const want = await hmacHex(c.key, tid + ':' + user + ':' + reward + ':' + status);
  return want === given ? 'ok' : 'invalid';
}

/* 入账 / 冲正，两个模式共用。
   也供其它 offerwall / 问卷墙复用：provider 记到 mo_task 上区分来源，
   kind / kindRev 决定流水类型，label 只用于明细里给人看的那句话。 */
async function mtxApply(env, args) {
  const uid = Number(args.uid);
  const tid = String(args.tid);
  const status = Number(args.status);
  const units = Number(args.units);
  const meta = args.meta || {};
  const provider = String(args.provider || 'moonetix');
  const kind = String(args.kind || provider + '_reward');
  const kindRev = String(args.kindRev || provider + '_reverse');
  const label = String(args.label || '广告墙');

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
          `INSERT INTO mo_task (uid, provider, transaction_id, event_id, offer_id, offer_name,
             reward_units, payout_usd, currency, status, ip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
        ).bind(uid, provider, tid, meta.eventId || '', meta.offerId || '', meta.offerName || '',
          units, meta.payout || '', meta.currency || '', meta.ip || ''),
        env.DB.prepare('UPDATE users SET fc_units = ?, updated_at = datetime(\'now\',\'+8 hours\') WHERE id = ?')
          .bind(next, uid),
        env.DB.prepare(
          `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(uid, units, next, kind, tid,
          meta.offerName ? label + ' · ' + meta.offerName : label + '奖励')
      ]);
    } catch (err) {
      /* transaction_id 撞唯一索引 = 同一个回调打了两次，按成功回，别让对方重试 */
      const again = await env.DB.prepare('SELECT id FROM mo_task WHERE transaction_id = ?').bind(tid).first();
      if (again) return { ok: true, duplicated: true };
      throw err;
    }
    return { ok: true, credited: mtxFc(units), balance: mtxFc(next) };
  }

  /* status 2：冲正，把当初发的扣回来；找不到原单就记一条已冲正的占位，
     这样之后迟到的 status 1 不会再发钱（官方 handler 的做法） */
  const row = await env.DB.prepare(
    'SELECT id, uid, reward_units, status FROM mo_task WHERE transaction_id = ?'
  ).bind(tid).first();
  if (!row) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO mo_task (uid, provider, transaction_id, event_id, reward_units, status, reversed_at)
       VALUES (?, ?, ?, 'unknown-reversal', 0, 2, datetime('now','+8 hours'))`
    ).bind(uid, provider, tid).run();
    return { ok: true, unknown: true };
  }
  if (row.status === 2) return { ok: true, duplicated: true };
  if (Number(row.uid) !== uid) return { ok: false, error: 'uid_mismatch' };

  const user = await env.DB.prepare(
    'SELECT id, fc_units FROM users WHERE id = ? AND deleted_at IS NULL'
  ).bind(uid).first();
  if (!user) return { ok: true, no_user: true };

  /* 精确扣回当初发的数，余额不够就扣成负数：账不平比负余额更麻烦 */
  const want = Number(row.reward_units);
  const before = Number(user.fc_units);
  const next = before - want;

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE mo_task SET status = 2, reversed_at = datetime('now','+8 hours') WHERE id = ? AND status = 1"
    ).bind(row.id),
    env.DB.prepare('UPDATE users SET fc_units = ?, updated_at = datetime(\'now\',\'+8 hours\') WHERE id = ?')
      .bind(next, uid),
    env.DB.prepare(
      `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(uid, -want, next, kindRev, tid,
      next < 0 ? label + '冲正（余额不足，已转负 ' + mtxFc(next) + '）' : label + '冲正')
  ]);

  return { ok: true, reversed: mtxFc(want), balance: mtxFc(next) };
}

async function mtxPostback(request, env, url) {
  const c = mtxConf(env);
  const p = await mtxParams(request, url);   /* body 只能读一次，签名和入账共用这一份 */

  if (c.live) {
    const sig = await mtxSignatureOk(c, p);
    if (sig === 'missing') return mtxText('missing hash', 400);
    if (sig === 'invalid') {
      /* 只打键名，不打值，方便对接时排查又不把用户数据写进日志 */
      console.error('mtx postback signature mismatch, keys:', Object.keys(p).join(','));
      return mtxText('invalid hash', 403);
    }
  }

  /* 官方宏名是 user / tx；旧写法 user_id / transaction_id 一起认，方便自测 */
  const uid = Number(p.user || p.user_id || 0);
  const tid = String(p.tx || p.transaction_id || '').trim();
  const status = Number(p.status || 1);
  const reward = Number(p.reward || 0);

  if (!(uid > 0) || !tid) return mtxText('bad parameters', 400);
  if (status !== 1 && status !== 2) return mtxText('bad parameters', 400);
  if (!isFinite(reward) || reward < 0) return mtxText('bad parameters', 400);

  const res = await mtxApply(env, {
    uid: uid,
    tid: tid,
    status: status,
    units: Math.round(reward * FC_SCALE),
    meta: {
      eventId: p.event || p.event_id || '',
      offerId: p.offer_id || '',
      offerName: p.offer_name || (p.offer_id ? '任务 #' + p.offer_id : ''),
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
      currency: 'XB',
      payout: '0',
      ip: request.headers.get('CF-Connecting-IP') || ''
    }
  });

  if (!res.ok) return json({ ok: false, error: res.error || 'error' }, 400);
  return json({ ok: true, tid: tid, reward: offer.reward, balance: res.balance });
}

/* ---------------- TheoremReach 问卷墙 ----------------
 *
 * 和 Moonetix 分工不同：Moonetix 是 offerwall（广告主任务），TheoremReach 是
 * survey router（问卷墙）。用户在它那边答完卷，它服务端回调 Reward Callback URL，
 * 我们只认这个回调入账，前端说完成了不算数。
 *
 * 面板上要填的东西（都是静态地址，不需要宏）：
 *   Reward Callback URL  https://chengfa.org/api/theoremreach/postback
 *   Include Reversals    Enabled（事后被驳回的卷要从同一个口子扣回来）
 *
 * 参数名做了别名兼容，它发哪一种都能接：
 *   user_id / uid / user          本站 uid
 *   reward_amount / amount / reward
 *   txn_id / transaction_id / tx / tid
 *   auth_token                    用于确认这一发确实是它打的
 *   反转：is_reversal / reversal / reversed 取 1 或 true，或者金额给成负数
 *
 * 环境变量：
 *   THEOREMREACH_API_KEY  面板里的 API Key，同时用来校验 auth_token
 *   THEOREMREACH_XB_PER   1 个 reward_amount 折多少 XB，默认 1
 */

const TR_WALL = 'https://theoremreach.com/respondent_entry/direct';

function trConf(env) {
  const apiKey = String(env.THEOREMREACH_API_KEY || '').trim();
  /* 它回来的 auth_token 一般就是 API key；万一面板给的是另一个值，
     配 THEOREMREACH_AUTH_TOKEN 覆盖，不用改代码 */
  const token = String(env.THEOREMREACH_AUTH_TOKEN || '').trim() || apiKey;
  const per = Number(env.THEOREMREACH_XB_PER || 1);
  return { apiKey, token, xbPer: isFinite(per) && per > 0 ? per : 1, live: !!(apiKey && token) };
}

/* 墙链接：user_id 用本站 uid，回调时原样回来 */
async function trLink(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const c = trConf(env);
  if (!c.live) {
    return json({
      ok: true,
      demo: false,
      url: '',
      note: '问卷墙还没配 API key，等接入后在这里放出入口'
    });
  }

  return json({
    ok: true,
    demo: false,
    url: TR_WALL + '?api_key=' + encodeURIComponent(c.apiKey) + '&user_id=' + Number(session.uid)
  });
}

/* 每个回调都留一条原始记录。用户说「答完了没到账」时先查 hook_log：
   是根本没打进来，打进来了被拒，还是入账了 —— 三种情况的处理完全不一样。
   token 类参数只记长度，不记值。 */
function hookParams(p) {
  const o = {};
  Object.keys(p || {}).forEach(function (k) {
    const v = String(p[k]);
    o[k] = /token|key|secret/i.test(k) ? '***' + v.length : v.slice(0, 120);
  });
  return JSON.stringify(o);
}

async function hookLog(env, a) {
  try {
    await env.DB.prepare(
      `INSERT INTO hook_log (provider, method, params, token_len, token_ok, result, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(a.provider, a.method, a.params, a.tokenLen || 0, a.tokenOk ? 1 : 0,
      String(a.result).slice(0, 200), a.ip || '').run();
  } catch (e) {
    /* 表还没建、或写失败，都不能让回调本身挂掉 */
    console.error('hook_log failed:', e && e.message);
  }
}

async function trPostback(request, env, url) {
  const p = await mtxParams(request, url);   /* body 只能读一次，校验和入账共用 */

  let out;
  try {
    out = await trDecide(env, request, p);
  } catch (err) {
    console.error('tr postback crashed:', err && err.message);
    out = { body: 'server_error', status: 500 };
  }

  await hookLog(env, {
    provider: 'theoremreach',
    method: request.method,
    params: hookParams(p),
    tokenLen: out.tokenLen,
    tokenOk: out.tokenOk,
    result: out.status + ' ' + out.body,
    ip: request.headers.get('CF-Connecting-IP') || ''
  });

  return mtxText(out.body, out.status);
}

/* 真正的判定：只看参数，不碰响应对象，方便外面记日志 */
async function trDecide(env, request, p) {
  const c = trConf(env);

  /* 没配 key 就拒。宁可让它重试，也不能让一个不带校验的回调给谁加钱 */
  if (!c.live) return { body: 'not configured', status: 503 };

  const tok = String(p.auth_token || p.authtoken || p.token || '').trim();
  if (tok !== c.token) {
    /* 只打长度和键名，不打值：长度能看出它发的是 Api Key 还是 Secret Key */
    console.error('tr postback bad auth_token, len=' + tok.length +
      ' expectLen=' + c.token.length + ', keys:', Object.keys(p).join(','));
    return { body: 'bad auth_token', status: 403, tokenLen: tok.length, tokenOk: 0 };
  }

  const uid = Number(p.user_id || p.uid || p.user || 0);
  const tid = String(p.txn_id || p.tx || p.transaction_id || p.tid || '').trim();
  const rawAmount = p.reward_amount != null ? p.reward_amount
    : (p.amount != null ? p.amount : (p.reward != null ? p.reward : ''));
  const amount = Number(rawAmount);
  const flag = String(p.is_reversal || p.reversal || p.reversed || '').trim();
  const ok = { tokenLen: tok.length, tokenOk: 1 };

  if (!tid) return { body: 'bad parameters', status: 400, ...ok };
  if (!isFinite(amount)) return { body: 'bad parameters', status: 400, ...ok };

  /* 面板上的 TEST 会拿一个假 user_id 打过来。本站 uid 一定是正整数，
     认不出数字的当测试请求：回 200 让它显示通过，但一分钱都不入账 */
  if (!Number.isInteger(uid) || uid <= 0) return { body: 'ok ignored test', status: 200, ...ok };

  const reversed = /^(1|true|yes|reversed)$/i.test(flag) || amount < 0;
  const units = Math.round(Math.abs(amount) * c.xbPer * FC_SCALE);

  /* 0 元事件（筛选未通过常见）不写账，但仍回 200，否则它会一直重试 */
  if (units <= 0) return { body: 'ok ignored', status: 200, ...ok };

  const res = await mtxApply(env, {
    uid: uid,
    tid: tid,
    status: reversed ? 2 : 1,
    units: units,
    provider: 'theoremreach',
    label: '问卷墙',
    meta: {
      offerId: p.survey_id || p.offer_id || '',
      offerName: p.survey_name || p.offer_name || '',
      payout: p.payout || '',
      currency: 'XB',
      ip: request.headers.get('CF-Connecting-IP') || ''
    }
  });

  if (!res.ok) {
    console.error('tr postback apply failed:', res.error, 'uid=' + uid, 'tid=' + tid);
    return { body: res.error || 'error', status: 400, ...ok };
  }
  return { body: 'ok', status: 200, ...ok };
}

/* 自己的广告墙记录 */
async function mtxTasks(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT transaction_id, offer_name, reward_units, status, created_at, reversed_at
       FROM mo_task WHERE uid = ? AND provider = 'moonetix' ORDER BY id DESC LIMIT 50`
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
            COUNT(*) AS n FROM mo_task WHERE uid = ? AND provider = 'moonetix'`
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
  'moonetix_reward', 'moonetix_reverse',
  'theoremreach_reward', 'theoremreach_reverse'
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
    level: row.level == null ? 1 : row.level,
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
    kind: r.kind || 'link',
    inline: r.kind === 'inline',
    questionCount: r.kind === 'inline' ? paperParse(r.paper).questions.length : 0,
    featured: r.featured === 1,
    status: r.status,
    createdAt: r.created_at
  };
}

async function surveyList(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  /* 「已参与」也按 IP 看：换了 IP 就该重新变成可参与。
     站长自己永远当「没参加过」—— 想测几遍入口都能点进去。 */
  const priv = await isPrivileged(env, session.uid);
  const ip = priv ? ('@never:' + session.uid) : (ipOf(request) || 'unknown');

  const rows = await env.DB.prepare(
    `SELECT s.*, EXISTS(
        SELECT 1 FROM survey_joins j WHERE j.survey_id = s.id AND j.ip = ?
      ) AS joined
       FROM surveys s WHERE s.status = 'open'
      ORDER BY s.featured DESC, (s.featured_at IS NULL), s.featured_at DESC, s.created_at DESC
      LIMIT 100`
  ).bind(ip).all();

  return json({ ok: true, items: (rows.results || []).map(surveyRow) });
}

async function adminSurveyList(env) {
  const rows = await env.DB.prepare(
    `SELECT s.*, (
        SELECT COUNT(*) FROM survey_joins j
         WHERE j.survey_id = s.id AND j.ip NOT LIKE '@%'
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
      it.paper = r.paper || '';
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

  /* 站内作答：题面由后台贴进来，收紧后再存；没题就当外链问卷 */
  const kindWanted = body.kind === 'inline' ? 'inline' : 'link';
  const paper = paperClean(body.paper);
  const kind = kindWanted === 'inline' && paper.questions.length ? 'inline' : 'link';
  const paperJson = kind === 'inline' ? JSON.stringify(paper) : '';

  const args = [
    title,
    String(body.provider || '').trim(),
    priceUnits,
    String(body.grade || '').trim().toUpperCase().slice(0, 4),
    stars,
    String(body.requirement || '').trim(),
    String(body.topic || '').trim(),
    durationMin,
    kind === 'inline' ? '' : String(body.entry || '').trim(),
    status,
    kind,
    paperJson
  ];

  if (body.id) {
    await env.DB.prepare(
      `UPDATE surveys SET title = ?, provider = ?, price_units = ?, grade = ?, stars = ?,
        requirement = ?, topic = ?, duration_min = ?, entry_url = ?, status = ?,
        kind = ?, paper = ?, updated_at = datetime('now','+8 hours')
        WHERE id = ?`
    ).bind(...args, Number(body.id)).run();
    return json({ ok: true, id: Number(body.id), kind: kind, questions: paper.questions.length });
  }

  const res = await env.DB.prepare(
    `INSERT INTO surveys (title, provider, price_units, grade, stars, requirement, topic, duration_min, entry_url, status, kind, paper)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(...args).run();

  return json({ ok: true, id: res.meta && res.meta.last_row_id, kind: kind, questions: paper.questions.length });
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

const WITHDRAW_MIN = 50;                       // 起提金额，单位 fc
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

  /* 兑换码类：下单时只确认码池有货，真正的码在后台审核发货时才取、才给用户 */
  if (item.kind === 'code') {
    const free = await env.DB.prepare(
      "SELECT id FROM cdk_codes WHERE status = 'free' AND item_id = ? LIMIT 1"
    ).bind(item.id).first();
    if (!free) return json({ ok: false, error: 'out_of_stock' }, 400);
  }

  const sn = orderSn('O');
  const next = user.fc_units - price;
  const now = "datetime('now','+8 hours')";

  const stmts = [];
  /* 所有兑换先进入待发货：兑换码经审核发码，订阅人工开通，现金走提现审核 */
  const orderStatus = 'pending';

  stmts.push(
    env.DB.prepare(
      `UPDATE users SET fc_units = ?, ${lvSql(3)}, updated_at = datetime('now','+8 hours') WHERE id = ?`
    ).bind(next, user.id)
  );

  stmts.push(
    env.DB.prepare(
      `INSERT INTO orders (sn, uid, item_id, item_title, price_units, status, code, memo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(sn, user.id, item.id, item.title, price, orderStatus, '', memo)
  );

  stmts.push(
    env.DB.prepare(
      `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(user.id, -price, next, 'cdk_redeem', sn, '兑换 ' + item.title)
  );

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
    code: '',
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
      `UPDATE users SET fc_units = ?, ${lvSql(3)}, updated_at = datetime('now','+8 hours') WHERE id = ?`
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

  /* 代理 / VPN 网络不给进问卷：当场封号，原因写进封禁记录。
     站长与管理员豁免（banForProxy 内部判角色），免得自己开梯子把自己封了。 */
  const intel = await ipIntel(request, env);
  if (intel.ok && (intel.proxy || intel.dc)) {
    const banned = await banForProxy(env, session.uid, intel);
    if (banned) {
      return json({
        ok: false,
        error: 'proxy_banned',
        message: '检测到代理 / VPN 网络，账号已封禁',
        country: intel.country || '',
        org: intel.org || ''
      }, 403);
    }
  }

  const body = await readJson(request);
  const id = Number(body && body.id);
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  const sv = await env.DB.prepare(
    "SELECT id, entry_url, kind, paper FROM surveys WHERE id = ? AND status = 'open'"
  ).bind(id).first();
  if (!sv) return json({ ok: false, error: 'not_found' }, 404);

  /* 站长点入口不落库：真正开卷时 paper 会单独建一条，免得一次点击记两行 */
  if (!(await isPrivileged(env, session.uid))) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO survey_joins (uid, survey_id, ip) VALUES (?, ?, ?)'
    ).bind(session.uid, id, ipOf(request) || 'unknown').run();
  }

  const inline = sv.kind === 'inline' && !!paperParse(sv.paper).questions.length;
  return json({
    ok: true,
    inline: inline,
    entry: inline ? ('/survey?id=' + id) : (sv.entry_url || '')
  });
}

/* ---------------- 站内问卷：发布 → 答题 → 按选项出结局 ----------------
   后台在问卷管理里直接贴一份题面发布，前台 /survey 里答题，提交后由服务端判定。
   六种结局：success 通过 / fail 失败 / speed 超速 / quota 配额满 /
            kick 中途被踢 / reject 事后打回（延迟冲正）。 */

const SURVEY_MIN_SECONDS = 30;     // 没绑结局时，低于这个秒数判超速
const SURVEY_REJECT_DELAY = 30;    // 打回不立刻生效，这么多秒后才冲正
const SURVEY_SCENARIOS = ['success', 'fail', 'speed', 'quota', 'kick', 'reject'];
const SURVEY_MAX_Q = 20;
const SURVEY_MAX_OPT = 12;

/* 题面收得住：题数、选项数、字数都卡上限 */
function paperClean(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const qs = Array.isArray(src.questions) ? src.questions : [];
  const out = [];

  for (let i = 0; i < qs.length && out.length < SURVEY_MAX_Q; i++) {
    const q = qs[i] || {};
    const text = String(q.q || q.title || '').trim().slice(0, 300);
    if (!text) continue;

    const opts = [];
    const list = Array.isArray(q.options) ? q.options : [];
    for (let j = 0; j < list.length && opts.length < SURVEY_MAX_OPT; j++) {
      const o = list[j];
      if (o && typeof o === 'object') {
        const label = String(o.label || '').trim().slice(0, 200);
        if (!label) continue;
        const outcome = SURVEY_SCENARIOS.indexOf(String(o.outcome || '')) >= 0 ? String(o.outcome) : '';
        opts.push(outcome ? { label: label, outcome: outcome } : label);
      } else {
        const label = String(o || '').trim().slice(0, 200);
        if (label) opts.push(label);
      }
    }

    if (opts.length) out.push({ q: text, options: opts });
  }

  return { questions: out };
}

/* 存进库里的题面可能坏掉，解析失败就当没有题 */
function paperParse(txt) {
  if (!txt) return { questions: [] };
  try {
    return paperClean(JSON.parse(txt));
  } catch (e) {
    return { questions: [] };
  }
}

/* 返回给答题页的题面：去掉 outcome，答卷别在前端就能看出哪项会失败 */
function paperPublic(paper) {
  return paper.questions.map(function (q, i) {
    return {
      n: i + 1,
      q: q.q,
      options: q.options.map(function (o) {
        return typeof o === 'object' ? o.label : o;
      })
    };
  });
}

async function userStateOf(env, uid) {
  const u = await env.DB.prepare('SELECT fc_units, exp, level FROM users WHERE id = ?')
    .bind(uid).first();
  if (!u) return null;
  return { fc: formatFc(u.fc_units || 0), exp: u.exp || 0, level: u.level || 0 };
}

/* 开一份卷子：没参与过就建一条（stage=open，作为计时起点） */
async function surveyPaper(request, env, url) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  const sv = await env.DB.prepare(
    "SELECT * FROM surveys WHERE id = ? AND status = 'open'"
  ).bind(id).first();
  if (!sv) return json({ ok: false, error: 'not_found' }, 404);

  const paper = paperParse(sv.paper);
  if (sv.kind !== 'inline' || !paper.questions.length) {
    return json({ ok: false, error: 'not_inline' }, 400);
  }

  /* 按 IP 判重：同一个出口 IP 对同一份问卷只能参与一次，换 IP 才能再来。
     按账号判反而更容易刷 —— 多注册几个号就绕过去了。
     站长 / 管理员例外：每开一次就是新的一条，随便测几遍，不占真实 IP 名额。 */
  const priv = await isPrivileged(env, session.uid);
  let ip = ipOf(request) || 'unknown';
  let attempt = 0;
  const fp = String(url.searchParams.get('fp') || '').slice(0, 40);

  if (!priv) {
    /* 频率：同一个 IP 一小时开太多卷，基本是脚本在刷 */
    const recent = await joinsLastHour(env, ip);
    if (recent >= RISK.joinPerIpHour) {
      await riskHit(env, {
        uid: session.uid, ip, fp, surveyId: id, kind: 'join_rate', score: 40,
        detail: '一小时内开卷 ' + recent + ' 次'
      });
      return json({ ok: false, error: 'risk_limited', message: '开卷太频繁，歇一会儿再来' }, 429);
    }

    /* 设备指纹：换 IP 无所谓，同一台机器对同一份卷只能算一次 */
    if (fp) {
      const dev = await env.DB.prepare(
        `SELECT uid FROM survey_joins
          WHERE survey_id = ? AND fp = ? AND fp <> '' AND uid <> ?
          LIMIT 1`
      ).bind(id, fp, session.uid).first();
      if (dev) {
        await riskHit(env, {
          uid: session.uid, ip, fp, surveyId: id, kind: 'device_reuse', score: 50,
          detail: '这台设备上账号 ' + dev.uid + ' 已经做过这份卷'
        });
        return json({ ok: false, error: 'already_done', reason: 'device', sameIp: false }, 409);
      }
    }
  }

  if (priv) {
    ip = privIp(session.uid);
    const ins = await env.DB.prepare(
      `INSERT INTO survey_joins (uid, survey_id, ip, fp, status, stage, created_at)
       VALUES (?, ?, ?, ?, 'pending', 'open', datetime('now','+8 hours'))`
    ).bind(session.uid, id, ip, fp).run();
    attempt = Number(ins.meta && ins.meta.last_row_id) || 0;
  } else {
    const join = await env.DB.prepare(
      'SELECT * FROM survey_joins WHERE ip = ? AND survey_id = ?'
    ).bind(ip, id).first();

    if (join && (join.stage === 'done' || join.stage === 'pending')) {
      return json({ ok: false, error: 'already_done', status: join.status, sameIp: true }, 409);
    }

    if (!join) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO survey_joins (uid, survey_id, ip, fp, status, stage, created_at)
         VALUES (?, ?, ?, ?, 'pending', 'open', datetime('now','+8 hours'))`
      ).bind(session.uid, id, ip, fp).run();
    } else if (join.stage !== 'open') {
      /* 换 IP 重来时把上一轮的答卷、用时、待冲正时间一起清掉，否则轮询会把上一轮给冲正了。
         还在答（stage=open）的不要动，否则刷新一次就把计时清零了 */
      await env.DB.prepare(
        `UPDATE survey_joins
            SET uid = ?, fp = ?, stage = 'open', status = 'pending', created_at = datetime('now','+8 hours'),
                answers = '', elapsed = 0, due_at = '', reviewed_at = NULL
          WHERE ip = ? AND survey_id = ?`
      ).bind(session.uid, fp, ip, id).run();
    }

    /* 一台设备 / 一个 IP 挂太多账号，先记一笔，人多了再人工看 */
    const spread = await accountSpread(env, ip, fp);
    if (spread.fpUids >= RISK.fpUidWarn || spread.ipUids >= RISK.ipUidWarn) {
      await riskHit(env, {
        uid: session.uid, ip, fp, surveyId: id, kind: 'account_spread', score: 30,
        detail: '同设备 ' + spread.fpUids + ' 个账号 / 同 IP ' + spread.ipUids + ' 个账号'
      });
    }
  }

  const row = attempt
    ? await env.DB.prepare('SELECT id, created_at FROM survey_joins WHERE id = ?').bind(attempt).first()
    : await env.DB.prepare(
        'SELECT id, created_at FROM survey_joins WHERE ip = ? AND survey_id = ?'
      ).bind(ip, id).first();

  return json({
    ok: true,
    survey: {
      id: sv.id,
      title: sv.title,
      provider: sv.provider || '',
      price: formatFc(sv.price_units || 0),
      durationMin: sv.duration_min || 0,
      requirement: sv.requirement || ''
    },
    startedAt: row ? row.created_at : '',
    attempt: row ? Number(row.id) || attempt || 0 : attempt || 0,
    minSeconds: SURVEY_MIN_SECONDS,
    questions: paperPublic(paper)
  });
}

/* 交卷：前端只说「第几题选了第几项」，结局由服务端拿自己的题面反查 */
async function surveySubmit(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();

  const intel = await ipIntel(request, env);
  if (intel.ok && (intel.proxy || intel.dc)) {
    const banned = await banForProxy(env, session.uid, intel);
    if (banned) {
      return json({ ok: false, error: 'proxy_banned', message: '检测到代理 / VPN 网络，账号已封禁' }, 403);
    }
  }

  const body = await readJson(request);
  const id = Number(body && body.id);
  const answers = Array.isArray(body && body.answers) ? body.answers : [];
  const uid = session.uid;
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  const fp = String((body && body.fp) || '').slice(0, 40);

  const sv = await env.DB.prepare('SELECT * FROM surveys WHERE id = ?').bind(id).first();
  if (!sv) return json({ ok: false, error: 'not_found' }, 404);

  const paper = paperParse(sv.paper);
  /* 找本轮那一行：站长每一轮独立成行，靠 attempt 认领；普通用户按出口 IP */
  const found = await resolveJoin(env, request, id, uid, Number(body && body.attempt) || 0);
  const join = found.join;
  const ip = found.ip;
  if (!join) return json({ ok: false, error: 'not_started' }, 400);
  if (join.stage === 'done') return json({ ok: false, error: 'already_done' }, 409);

  const reward = Number(sv.price_units) || 0;

  let outcome = '';
  const picked = [];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i] || {};
    const question = paper.questions[Number(a.q)];
    if (!question) continue;
    const opt = question.options[Number(a.o)];
    if (opt == null) continue;
    picked.push({ q: question.q, i: Number(a.o), a: typeof opt === 'object' ? opt.label : opt });
    if (opt && typeof opt === 'object' && opt.outcome) outcome = opt.outcome;
  }

  /* 用时按开卷时间算，不信前端传的秒数 */
  const took = await env.DB.prepare(
    "SELECT CAST((julianday(datetime('now','+8 hours')) - julianday(?)) * 86400 AS INTEGER) AS s"
  ).bind(join.created_at).first();
  const elapsed = Math.max(1, Number(took && took.s) || 0);

  if (!outcome) outcome = elapsed < SURVEY_MIN_SECONDS ? 'speed' : 'success';

  /* 只认技术特征，不看答得对不对：蜜罐字段被填说明有脚本在自动填表。
     题目怎么答、答案合不合理，是问卷商的事，这里不评判。 */
  const trap = String((body && body.hp) || '').trim();
  if (trap) outcome = 'bot';

  const markJoin = function (status, stage, note) {
    return env.DB.prepare(
      `UPDATE survey_joins SET uid = ?, status = ?, stage = ?, elapsed = ?, answers = ?,
              reviewed_at = datetime('now','+8 hours') WHERE ip = ? AND survey_id = ?`
    ).bind(uid, status, stage, elapsed, JSON.stringify(picked), ip, id);
  };
  const addMoney = function (delta, exp) {
    return env.DB.prepare(
      `UPDATE users SET fc_units = fc_units + (${delta}), ${lvSql(exp)},
              updated_at = datetime('now','+8 hours') WHERE id = ?`
    ).bind(uid);
  };
  const ledger = function (delta, kind, memo) {
    return env.DB.prepare(
      `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo)
       VALUES (?, ?, (SELECT fc_units FROM users WHERE id = ?), ?, ?, ?)`
    ).bind(uid, delta, uid, kind, 'SV-' + id, memo);
  };

  const base = {
    ok: true,
    elapsed: elapsed,
    picked: picked,
    reward: formatFc(reward)
  };
  /* 结算写完了再读用户状态，否则返回的是扣钱之前的余额 */
  const reply = async function (extra) {
    return json(Object.assign(base, extra, { user: await userStateOf(env, uid) }));
  };

  if (outcome === 'bot') {
    await env.DB.batch([markJoin('invalid', 'done')]);
    await riskHit(env, {
      uid, ip, fp, surveyId: id,
      kind: 'bot',
      score: 80,
      detail: '蜜罐字段被填，像是脚本在自动填表'
    });
    return reply({
      result: 'bot',
      reward: '0',
      steps: [
        '提交答卷（用时 ' + elapsed + ' 秒）',
        '蜜罐字段被填，像是脚本在自动填表',
        '答卷作废，不发奖励，不扣经验'
      ]
    });
  }

  if (outcome === 'success') {
    await env.DB.batch([
      markJoin('approved', 'done'),
      addMoney(reward, 1),
      ledger(reward, 'survey_reward', '问卷通过：' + sv.title.slice(0, 40))
    ]);
    return reply({
      result: 'success',
      steps: [
        '提交答卷（用时 ' + elapsed + ' 秒）',
        '问卷商确认有效：通过质检',
        '奖励入账 +' + formatFc(reward) + ' XB，经验 +1'
      ]
    });
  }

  if (outcome === 'speed') {
    await env.DB.batch([markJoin('invalid', 'done')]);
    return reply({
      result: 'speed',
      reward: '0',
      steps: [
        '提交答卷（用时 ' + elapsed + ' 秒）',
        '低于最短作答时长 ' + SURVEY_MIN_SECONDS + ' 秒，服务商判超速',
        '答卷作废，不发奖励，不扣经验'
      ]
    });
  }

  if (outcome === 'kick') {
    await env.DB.batch([markJoin('terminated', 'done')]);
    return reply({
      result: 'kick',
      reward: '0',
      steps: [
        '前 ' + Math.max(0, picked.length - 1) + ' 题正常作答',
        '第 ' + picked.length + ' 题的选项命中排除条件',
        '服务商 terminate：会话被踢出，答卷未提交'
      ]
    });
  }

  if (outcome === 'quota') {
    await env.DB.batch([markJoin('quota_full', 'done')]);
    return reply({
      result: 'quota',
      reward: '0',
      steps: [
        '提交答卷（用时 ' + elapsed + ' 秒）',
        '服务商返回 quota_full：这个配额已收满',
        '答卷被退回，没有奖励也不扣经验'
      ]
    });
  }

  if (outcome === 'fail') {
    await env.DB.batch([markJoin('failed', 'done')]);
    return reply({
      result: 'fail',
      reward: '0',
      steps: [
        '提交答卷（用时 ' + elapsed + ' 秒）',
        '问卷商接口返回 500，答卷没有落库',
        '没有奖励；服务商也没给结算回调'
      ]
    });
  }

  /* reject：先入账，过一会儿才打回。stage 停在 pending，到点由 poll 冲正 */
  const due = await env.DB.prepare(
    "SELECT datetime('now','+8 hours','+" + SURVEY_REJECT_DELAY + " seconds') AS t"
  ).first();

  await env.DB.batch([
    markJoin('approved', 'pending'),
    addMoney(reward, 1),
    ledger(reward, 'survey_reward', '问卷通过（待质检）：' + sv.title.slice(0, 34)),
    env.DB.prepare('UPDATE survey_joins SET due_at = ? WHERE ip = ? AND survey_id = ?')
      .bind(due.t, ip, id)
  ]);

  return reply({
    result: 'reject',
    pending: true,
    delay: SURVEY_REJECT_DELAY,
    reward: '0',
    user: await userStateOf(env, uid),
    steps: [
      '提交答卷（用时 ' + elapsed + ' 秒）',
      '首次结算：+' + formatFc(reward) + ' XB，经验 +1',
      '问卷商说这份要过质检，先入账，' + SURVEY_REJECT_DELAY + ' 秒后再看结果',
      '这 ' + SURVEY_REJECT_DELAY + ' 秒里余额是真的，可以先花'
    ]
  });
}

/* 打回轮询：到点才冲正，没到点报剩余秒数。页面关掉也不丢，下次打开照样结算 */
async function surveyPoll(request, env, url) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);

  const id = Number(url.searchParams.get('id'));
  const uid = session.uid;
  if (!id) return json({ ok: false, error: 'bad_request' }, 400);

  const found = await resolveJoin(
    env, request, id, uid, Number(url.searchParams.get('attempt')) || 0
  );
  const join = found.join;
  const ip = found.ip;
  if (!join) return json({ ok: false, error: 'not_found' }, 404);

  if (join.stage !== 'pending') {
    return json({
      ok: true,
      done: join.stage === 'done',
      result: join.status,
      secondsLeft: 0,
      user: await userStateOf(env, uid)
    });
  }

  const left = await env.DB.prepare(
    "SELECT CAST((julianday(?) - julianday(datetime('now','+8 hours'))) * 86400 AS INTEGER) AS s"
  ).bind(join.due_at).first();
  const secondsLeft = Math.max(0, Number(left && left.s) || 0);

  if (secondsLeft > 0) {
    return json({
      ok: true,
      done: false,
      pending: true,
      secondsLeft: secondsLeft,
      user: await userStateOf(env, uid)
    });
  }

  const sv = await env.DB.prepare('SELECT title, price_units FROM surveys WHERE id = ?').bind(id).first();
  const reward = Number(sv && sv.price_units) || 0;

  /* 钱当初是发给参与那一条记录的人，冲正也扣他，不是扣现在这个会话 */
  const ownerUid = Number(join.uid) || uid;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE survey_joins SET status = 'rejected', stage = 'done',
              reviewed_at = datetime('now','+8 hours') WHERE ip = ? AND survey_id = ?`
    ).bind(ip, id),
    env.DB.prepare(
      `UPDATE users SET fc_units = fc_units - (${reward}), ${lvSql(-8)},
              updated_at = datetime('now','+8 hours') WHERE id = ?`
    ).bind(ownerUid),
    env.DB.prepare(
      `INSERT INTO fc_ledger (uid, delta, balance, kind, ref, memo)
       VALUES (?, ?, (SELECT fc_units FROM users WHERE id = ?), 'survey_reject', ?, ?)`
    ).bind(ownerUid, -reward, ownerUid, 'SV-' + id, '问卷打回冲正：' + String((sv && sv.title) || '').slice(0, 34))
  ]);

  return json({
    ok: true,
    done: true,
    rejected: true,
    result: 'rejected',
    secondsLeft: 0,
    user: await userStateOf(env, ownerUid)
  });
}

/* ---------------- 流量 ---------------- */

/* 中间件每分钟都在写 visits，这里只管读。
   每次打开顺手删掉 90 天前的，免得表无限长。 */
/* 这条记录像不像真人浏览器。只做提示，不过滤、不计入黑名单 */
function visitSigns(ua, lang, mode) {
  const out = [];
  const u = String(ua || '');
  if (!mode && /Chrome|Safari|Firefox|Edg|MicroMessenger/.test(u)) out.push('没有 Sec-Fetch');
  const m = u.match(/MicroMessenger\/(\d+)/);
  if (m && Number(m[1]) < 8) out.push('微信 ' + m[1] + '.x 是 2019 年的版本');
  if (!lang && u) out.push('没有 Accept-Language');
  return out;
}

async function adminTraffic(env, url) {
  const days = Math.min(30, Math.max(7, Number(url.searchParams.get('days')) || 14));
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const per = Math.min(100, Math.max(10, Number(url.searchParams.get('per')) || 30));

  await env.DB.prepare(
    "DELETE FROM visits WHERE at < datetime('now','+8 hours','-90 days')"
  ).run();

  const today = await env.DB.prepare(
    "SELECT COUNT(*) AS pv, COUNT(DISTINCT vid) AS uv FROM visits WHERE at >= date('now','+8 hours')"
  ).first();

  const week = await env.DB.prepare(
    "SELECT COUNT(*) AS pv, COUNT(DISTINCT vid) AS uv FROM visits WHERE at >= datetime('now','+8 hours','-7 days')"
  ).first();

  const series = await env.DB.prepare(
    `SELECT substr(at, 1, 10) AS d, COUNT(*) AS pv, COUNT(DISTINCT vid) AS uv
       FROM visits
      WHERE at >= datetime('now','+8 hours','-` + (days - 1) + ` days')
      GROUP BY d ORDER BY d`
  ).all();

  /* 一个 IP 一行：次数、首次、最近。归属地取该 IP 最近一次记录到的值 */
  const total = await env.DB.prepare(
    "SELECT COUNT(DISTINCT ip) AS n FROM visits WHERE ip <> ''"
  ).first();
  const totalN = Number(total && total.n) || 0;
  const pages = Math.max(1, Math.ceil(totalN / per));
  const cur = Math.min(page, pages);

  const ips = await env.DB.prepare(
    `SELECT ip,
            COUNT(*)      AS pv,
            MIN(at)       AS first_at,
            MAX(at)       AS last_at,
            MAX(country)  AS country,
            MAX(region)   AS region,
            MAX(city)     AS city,
            MAX(asn)      AS asn,
            MAX(org)      AS org,
            MAX(colo)     AS colo,
            MAX(lang)     AS lang,
            MAX(fetch)    AS fetch,
            MAX(ua)       AS ua
       FROM visits
      WHERE ip <> ''
      GROUP BY ip
      ORDER BY last_at DESC
      LIMIT ? OFFSET ?`
  ).bind(per, (cur - 1) * per).all();

  const hours = await env.DB.prepare(
    `SELECT substr(at, 12, 2) AS h, COUNT(*) AS pv
       FROM visits WHERE at >= date('now','+8 hours')
      GROUP BY h ORDER BY h`
  ).all();

  const rows = function (r) { return (r && r.results) || []; };

  return json({
    ok: true,
    days: days,
    today: { pv: Number(today && today.pv) || 0, uv: Number(today && today.uv) || 0 },
    week: { pv: Number(week && week.pv) || 0, uv: Number(week && week.uv) || 0 },
    series: rows(series).map(function (r) {
      return { d: r.d, pv: Number(r.pv) || 0, uv: Number(r.uv) || 0 };
    }),
    hours: rows(hours).map(function (r) {
      return { h: r.h, pv: Number(r.pv) || 0 };
    }),
    pager: { page: cur, per: per, total: totalN, pages: pages },
    ips: rows(ips).map(function (r) {
      return {
        ip: r.ip || '',
        pv: Number(r.pv) || 0,
        first_at: r.first_at || '',
        last_at: r.last_at || '',
        country: r.country || '',
        region: r.region || '',
        city: r.city || '',
        asn: r.asn || '',
        org: r.org || '',
        colo: r.colo || '',
        lang: r.lang || '',
        fetch: r.fetch || '',
        signs: visitSigns(r.ua, r.lang, r.fetch)
      };
    })
  });
}

/* 单个 IP 的访问轨迹：点开某一行时按需拉，不塞进列表里 */
async function adminIpTrack(env, url) {
  const ip = String(url.searchParams.get('ip') || '').trim().slice(0, 60);
  if (!ip) return json({ ok: false, error: 'no_ip' }, 400);

  const rows = await env.DB.prepare(
    `SELECT at, path, ref, ua, lang, fetch FROM visits
      WHERE ip = ? ORDER BY at DESC, id DESC LIMIT 200`
  ).bind(ip).all();

  const total = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM visits WHERE ip = ?'
  ).bind(ip).first();

  const list = (rows && rows.results) || [];

  /* 间隔超过 30 分钟算另一次来访，一眼能看出是连着点的还是隔了半天再来 */
  let prev = '';
  const out = list.map(function (r) {
    const t = r.at || '';
    let gap = 0;
    if (prev) {
      const a = Date.parse(prev.replace(' ', 'T') + 'Z');
      const b = Date.parse(t.replace(' ', 'T') + 'Z');
      if (a && b) gap = Math.round((a - b) / 60000);
    }
    prev = t;
    return {
      at: t,
      path: r.path || '/',
      ref: r.ref || '',
      ua: (r.ua || '').slice(0, 180),
      lang: r.lang || '',
      fetch: r.fetch || '',
      signs: visitSigns(r.ua, r.lang, r.fetch),
      gap: gap
    };
  });

  return json({
    ok: true,
    ip: ip,
    total: Number(total && total.n) || 0,
    items: out
  });
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
    /* 兑换码商品：审核通过这一刻才从码池取码，之前用户看不到码 */
    let code = order.code || '';
    const item = order.item_id
      ? await env.DB.prepare('SELECT kind FROM store_items WHERE id = ?').bind(order.item_id).first()
      : null;

    if (item && item.kind === 'code' && !code) {
      const cdk = await env.DB.prepare(
        "SELECT id, code FROM cdk_codes WHERE status = 'free' AND item_id = ? ORDER BY id ASC LIMIT 1"
      ).bind(order.item_id).first();
      if (!cdk) return json({ ok: false, error: 'out_of_stock' }, 400);
      code = cdk.code;
    }

    const stmts = [
      env.DB.prepare("UPDATE orders SET status = 'paid', code = ? WHERE id = ?").bind(code, id)
    ];

    /* 刚取出的码标记为已用；老订单若已有码则不动 */
    if (code && code !== order.code && item && item.kind === 'code') {
      stmts.push(
        env.DB.prepare(
          "UPDATE cdk_codes SET status = 'used', used_by = ?, used_at = datetime('now','+8 hours') WHERE code = ? AND status = 'free'"
        ).bind(order.uid, code)
      );
    }

    const body = code
      ? '你兑换的「' + order.item_title + '」已审核通过，兑换码：' + code + '，单号 ' + order.sn + '。可到兑换记录查看并复制。'
      : '你兑换的「' + order.item_title + '」已完成发货，单号 ' + order.sn + '。';
    stmts.push(
      env.DB.prepare(
        `INSERT INTO messages (uid, kind, title, body) VALUES (?, 'system', ?, ?)`
      ).bind(order.uid, '兑换已发货', body)
    );

    await env.DB.batch(stmts);
    return json({ ok: true, code: code });
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
    ).bind(order.uid, '兑换已退款', '「' + order.item_title + '」已退款 ' + formatFc(order.price_units) + ' XB，金额已回到可用余额。')
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
  if (path === 'admin/risk' && request.method === 'GET') return await adminRisk(env, url);
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
  if (path === 'admin/traffic' && request.method === 'GET') return await adminTraffic(env, url);
  if (path === 'admin/traffic/track' && request.method === 'GET') return await adminIpTrack(env, url);
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
    level: r.level == null ? 1 : r.level,
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

  /* 状态变更与留痕一起写，避免改了状态却没记录。
     每次进入封禁扣 8 点经验；解封与冻结不动经验。 */
  const lvPart = status === 'banned' ? lvSql(-8) + ', ' : '';

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET status = ?, ${lvPart}updated_at = datetime('now','+8 hours') WHERE id = ?`
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
      by: r.by_role === 'system' ? '系统' : (r.by_role === 'owner' ? '站长' : '管理员'),
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
            w.created_at, w.reviewed_at, u.username,
            (SELECT COUNT(*) FROM risk_events r
              WHERE r.uid = w.uid AND r.at >= datetime('now','+8 hours','-30 days')) AS risk_n,
            (SELECT MAX(r.score) FROM risk_events r
              WHERE r.uid = w.uid AND r.at >= datetime('now','+8 hours','-30 days')) AS risk_max
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
      reviewedAt: toIso(r.reviewed_at),
      /* 复核时先看这一步：近 30 天被风控记过几次、最重几分 */
      riskCount: r.risk_n || 0,
      riskScore: r.risk_max || 0
    }))
  });
}

/* 风控记录：最近命中 + 近 7 天按类型聚合 */
async function adminRisk(env, url) {
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get('limit')) || 50));

  const rows = await env.DB.prepare(
    `SELECT r.id, r.at, r.uid, r.ip, r.fp, r.survey_id, r.kind, r.score, r.detail,
            u.username, s.title
       FROM risk_events r
       LEFT JOIN users u ON u.id = r.uid
       LEFT JOIN surveys s ON s.id = r.survey_id
      ORDER BY r.id DESC LIMIT ?`
  ).bind(limit).all();

  const kinds = await env.DB.prepare(
    `SELECT kind, COUNT(*) AS n, MAX(at) AS last_at
       FROM risk_events WHERE at >= datetime('now','+8 hours','-7 days')
      GROUP BY kind ORDER BY n DESC`
  ).all();

  return json({
    ok: true,
    items: (rows.results || []).map((r) => ({
      id: r.id,
      at: r.at,
      uid: r.uid,
      username: r.username || '',
      ip: r.ip,
      fp: r.fp,
      surveyTitle: r.title || '',
      kind: r.kind,
      score: r.score,
      detail: r.detail
    })),
    kinds: (kinds.results || []).map((r) => ({ kind: r.kind, n: r.n, lastAt: r.last_at }))
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
