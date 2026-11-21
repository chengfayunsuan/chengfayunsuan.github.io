/* ============================================================
   Chengfa · 账户入口
   界面交互、前端校验、接口调用
   三块内容：登录 / 注册、忘记密码（邮箱验证码重置）
   ============================================================ */
(function () {
  'use strict';

  var form = document.getElementById('authForm');
  if (!form) return;

  /* /en/ 下的页面共用这一份脚本，文案在这里分岔。
     不能指望 i18n-en.js —— 它只在加载时扫一遍 DOM，切页签后写入的字它管不到。 */
  var EN = /^\/en(\/|$)/.test(location.pathname);
  function T(zh, en) { return EN ? en : zh; }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,20}$/;

  /* ---------- 已登录就不再停在入口页，直接进账户 ---------- */

  var revealAuth = function () {
    document.documentElement.classList.remove('auth-checking');
  };

  fetch('/api/auth/me', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (data && data.ok && data.user) {
        /* 资料先写缓存，落地页可秒显 */
        if (window.CF && CF.cache) CF.cache.set(data.user);
        /* 已登录但账户受限，直接送去工单页 */
        location.replace(data.user.status && data.user.status !== 'active'
          ? (window.CF && CF.goto ? CF.goto('/support') : '/support')
          : nextPath());
        return;
      }
      revealAuth();
    })
    .catch(revealAuth);

  /* 接口卡住时也要把表单放出来，不能留空白 */
  setTimeout(revealAuth, 1600);

  var tabsEl = document.querySelector('.auth__tabs');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.auth__tab'));
  var titleEl = document.getElementById('authTitle');
  var descEl = document.getElementById('authDesc');
  var submitEl = document.getElementById('authSubmit');
  var noteEl = document.getElementById('authNote');
  var agreeEl = document.getElementById('agree');
  var pwEl = document.getElementById('password');
  var emailEl = document.getElementById('email');
  var emailErr = document.getElementById('emailErr');
  var pwErr = document.getElementById('pwErr');
  var agreeErr = document.getElementById('agreeErr');
  var userRow = document.getElementById('userRow');
  var emailRow = document.getElementById('emailRow');
  var userHint = document.getElementById('userHint');
  var usernameEl = document.getElementById('username');
  var userErr = document.getElementById('userErr');
  var pwHint = document.getElementById('pwHint');

  var MODES = {
    login: {
      title: T('登录', 'Sign in'),
      desc: T('使用用户名与密码进入账户，忘了用户名就填注册邮箱。',
              'Sign in with your username and password. Your registered email works too.'),
      submit: T('登录', 'Sign in'),
      note: T('登录状态保持 30 天。在公共设备上使用后请退出。',
              'Sessions last 30 days. Sign out after using a shared device.'),
      pwAuto: 'current-password',
      pwPh: T('你的密码', 'Your password')
    },
    signup: {
      title: T('注册', 'Sign up'),
      desc: T('创建账户后可浏览全部公开问卷，参与市场调研并累积积分。',
              'Create an account to browse surveys, join studies and earn points.'),
      submit: T('创建账户', 'Create account'),
      note: T('注册不收取任何费用，无需绑定银行卡。',
              'Signing up is free. No bank card required.'),
      pwAuto: 'new-password',
      pwPh: T('至少 8 位，含字母与数字', 'At least 8 characters, letters and numbers')
    }
  };

  var mode = 'login';

  /* ---------- 模式切换 ---------- */

  /* 从 /login?next=/ledger 回来时跳回原页面；只接受站内路径，避免被拿去当跳板。
     英文页上的登录入口（/en/login）跳回时也要回到 en 侧，统一过 CF.goto。 */
  function nextPath() {
    var raw = new URLSearchParams(location.search).get('next') || '';
    if (raw.charAt(0) !== '/' || raw.charAt(1) === '/' || raw.charAt(1) === '\\') return window.CF && CF.goto ? CF.goto('/home') : '/home';
    if (raw.indexOf('/login') === 0 || raw.indexOf('/en/login') === 0) return window.CF && CF.goto ? CF.goto('/home') : '/home';
    return window.CF && CF.goto ? CF.goto(raw) : raw;
  }

  function setMode(next) {
    mode = next === 'signup' ? 'signup' : 'login';
    var cfg = MODES[mode];

    titleEl.textContent = cfg.title;
    descEl.textContent = cfg.desc;
    submitEl.innerHTML = cfg.submit + ' <span aria-hidden="true">→</span>';
    noteEl.textContent = cfg.note;
    pwEl.setAttribute('autocomplete', cfg.pwAuto);
    if (cfg.pwPh) pwEl.setAttribute('placeholder', cfg.pwPh);
    /* 登录用用户名；注册才需要邮箱 */
    userRow.hidden = false;
    emailRow.hidden = mode !== 'signup';
    emailEl.required = mode === 'signup';
    usernameEl.setAttribute('autocomplete', mode === 'signup' ? 'nickname' : 'username');
    if (userHint) userHint.hidden = mode === 'signup';
    if (pwHint) pwHint.hidden = mode === 'signup';

    tabs.forEach(function (tab) {
      var on = tab.getAttribute('data-mode') === mode;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    clearErrors();
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      setMode(tab.getAttribute('data-mode'));
    });
  });

  /* ---------- 校验 ---------- */

  function clearErrors() {
    [[emailEl, emailErr], [pwEl, pwErr], [agreeEl, agreeErr], [usernameEl, userErr]].forEach(function (pair) {
      pair[0].removeAttribute('aria-invalid');
      pair[1].hidden = true;
      pair[1].textContent = '';
    });
  }

  function fail(input, errEl, message) {
    input.setAttribute('aria-invalid', 'true');
    errEl.textContent = message;
    errEl.hidden = false;
  }

  function validate() {
    clearErrors();
    var ok = true;
    var email = emailEl.value.trim();
    var pw = pwEl.value;
    var account = usernameEl.value.trim();

    if (!account) {
      fail(usernameEl, userErr, mode === 'signup'
        ? T('请填写用户名。', 'Enter a username.')
        : T('请填写用户名，或填注册邮箱。', 'Enter your username, or your registered email.'));
      ok = false;
    } else if (mode === 'signup') {
      if (!NAME_RE.test(account)) {
        fail(usernameEl, userErr, T('用户名限 2 至 20 字，可用中文、字母、数字、下划线与连字符。',
          'Username must be 2-20 characters: letters, numbers, underscore or hyphen.'));
        ok = false;
      } else if (/^\d+$/.test(account)) {
        fail(usernameEl, userErr, T('用户名不能全部为数字。', 'Username cannot be all digits.'));
        ok = false;
      }
    } else if (account.indexOf('@') >= 0) {
      /* 登录时允许直接填注册邮箱 */
      if (!EMAIL_RE.test(account)) {
        fail(usernameEl, userErr, T('邮箱格式不正确，请检查后重试。', 'That email does not look right.'));
        ok = false;
      }
    } else if (!NAME_RE.test(account)) {
      fail(usernameEl, userErr, T('用户名限 2 至 20 字，可用中文、字母、数字、下划线与连字符。',
        'Username must be 2-20 characters: letters, numbers, underscore or hyphen.'));
      ok = false;
    }

    if (mode === 'signup') {
      if (!email) {
        fail(emailEl, emailErr, T('请填写邮箱地址。', 'Enter your email address.'));
        ok = false;
      } else if (!EMAIL_RE.test(email)) {
        fail(emailEl, emailErr, T('邮箱格式不正确，请检查后重试。', 'That email does not look right.'));
        ok = false;
      }
    }

    if (!pw) {
      fail(pwEl, pwErr, T('请填写密码。', 'Enter your password.'));
      ok = false;
    } else if (pw.length < 8) {
      fail(pwEl, pwErr, T('密码长度不足 8 位。', 'Password must be at least 8 characters.'));
      ok = false;
    } else if (mode === 'signup' && !(/[A-Za-z]/.test(pw) && /\d/.test(pw))) {
      fail(pwEl, pwErr, T('密码需同时包含字母与数字。', 'Password needs both letters and numbers.'));
      ok = false;
    }

    if (!agreeEl.checked) {
      fail(agreeEl, agreeErr, T('请先阅读并同意用户协议与隐私说明。',
        'Please read and accept the Terms and Privacy Policy first.'));
      ok = false;
    }

    return ok;
  }

  [emailEl, pwEl, usernameEl].forEach(function (el) {
    el.addEventListener('input', function () {
      if (el.getAttribute('aria-invalid') !== 'true') return;
      el.removeAttribute('aria-invalid');
      (el === emailEl ? emailErr : el === pwEl ? pwErr : userErr).hidden = true;
    });
  });

  /* ---------- 提交 ---------- */

  var ERRORS = EN ? {
    invalid_email: 'That email does not look right.',
    invalid_password: 'Password must be 8-72 characters.',
    weak_password: 'Password needs both letters and numbers.',
    invalid_username: 'Username must be 2-20 characters: letters, numbers, underscore or hyphen.',
    username_taken: 'That username is taken. Try another.',
    email_taken: 'That email is already registered. Please sign in.',
    invalid_credentials: 'Wrong username or password.',
    too_many_attempts: 'Too many attempts. Try again in 20 minutes.',
    bad_request: 'Malformed request. Refresh the page and retry.',
    unauthorized: 'Your session expired. Please sign in again.',
    db_unbound: 'The database is not ready yet.',
    server_error: 'Server error. Try again later.',
    turnstile_failed: 'Human check failed. Please verify again.',
    verify_unavailable: 'Human check is unavailable. Please contact support.',
    verify_unconfigured: 'Human check is not configured yet. Please contact support.',
    too_soon: 'Just sent one. Please wait a moment.',
    too_many: 'That is 3 emails today. Try again tomorrow.',
    mail_unconfigured: 'Email sending is not configured yet.',
    mail_failed: 'The email did not go out. Try again later.',
    no_code: 'Send a code first.',
    wrong_code: 'Wrong code. Check the email.',
    expired: 'That code expired. Send a new one.',
    too_many_tries: 'Too many wrong codes. Send a new one.',
    bad_code: 'The code is 6 digits. Check the email.'
  } : {
    invalid_email: '邮箱格式不正确，请检查后重试。',
    invalid_password: '密码长度需在 8 至 72 位之间。',
    weak_password: '密码需同时包含字母与数字。',
    invalid_username: '用户名限 2 至 20 字，可用中文、字母、数字、下划线与连字符。',
    username_taken: '该用户名已被使用，请换一个。',
    email_taken: '该邮箱已注册，请直接登录。',
    invalid_credentials: '用户名或密码不正确。',
    too_many_attempts: '尝试次数过多，请二十分钟后再试。',
    bad_request: '请求格式有误，请刷新页面后重试。',
    unauthorized: '登录状态已失效，请重新登录。',
    db_unbound: '服务端数据库尚未就绪。',
    server_error: '服务器出错，请稍后重试。',
    turnstile_failed: '人机验证未通过，请重新验证后再试。',
    verify_unavailable: '人机验证服务暂时不可用，请联系站长。',
    verify_unconfigured: '人机验证服务尚未配置完成，请联系站长。',
    too_soon: '刚发过一封，稍等一下再发。',
    too_many: '今天 3 封已经发完了，明天再来。',
    mail_unconfigured: '站长还没配发信服务，暂时发不出邮件。',
    mail_failed: '邮件没发出去，稍后再试。',
    no_code: '先发一条验证码。',
    wrong_code: '验证码不对，检查一下邮件。',
    expired: '验证码过期了，重新发一条。',
    too_many_tries: '试太多次了，重新发一条。',
    bad_code: '验证码是 6 位数字，检查一下邮件。'
  };

  /* ---------- 人机验证 ---------- */

  /* 这一页有两个验证条：登录/注册一个，忘记密码一个，各自渲染各自的。
     token 一定按 widgetId 取 —— 两个 widget 会往表单里注入同名的隐藏域，
     混着读会把 A 条的 token 拿去提交 B 条。 */
  var VERIFY_TEXT = {
    idle: [T('点击完成人机验证', 'Tap to complete the human check'), 'VERIFY'],
    checking: [T('正在校验请求来源…', 'Checking your request…'), 'CHECKING'],
    action: [T('请在下方确认你是真人', 'Confirm you are human below'), 'ACTION'],
    ok: [T('已验证，可以提交', 'Verified, ready to submit'), 'HUMAN OK'],
    error: [T('验证未通过，点此重试', 'Check failed, tap to retry'), 'RETRY'],
    expired: [T('验证已超时，点此重试', 'Check timed out, tap to retry'), 'RETRY']
  };

  function makeVerify(cfg) {
    var box = document.getElementById(cfg.box);
    var text = document.getElementById(cfg.text);
    var tag = document.getElementById(cfg.tag);
    var slot = document.getElementById(cfg.slot);
    if (!box || !slot) return null;

    var widget = null;
    var mounted = false;

    function setState(state) {
      box.setAttribute('data-state', state);
      var t = VERIFY_TEXT[state];
      if (t && text) text.textContent = t[0];
      if (t && tag) tag.textContent = t[1];
    }

    function token() {
      if (widget === null || !window.turnstile || typeof window.turnstile.getResponse !== 'function') return '';
      try { return window.turnstile.getResponse(widget) || ''; } catch (e) { return ''; }
    }

    function mount() {
      if (mounted || !window.turnstile) return;
      mounted = true;
      widget = window.turnstile.render(slot, {
        sitekey: window.CF_SITEKEY,
        language: cfg.lang || 'zh-cn',
        theme: 'light',
        size: 'flexible',
        appearance: 'interaction-only',
        execution: 'execute',
        callback: function () { setState('ok'); },
        'error-callback': function () { setState('error'); },
        'expired-callback': function () { setState('expired'); },
        'timeout-callback': function () { setState('expired'); },
        /* 真需要人工点时，把官方控件在条内展开，不能藏着不让人点 */
        'before-interactive-callback': function () { setState('action'); },
        'after-interactive-callback': function () {
          if (!token()) setState('checking');
        }
      });
    }

    /* 等 api.js 就绪再渲染；被网络挡掉就给出可点的失败态 */
    function ensure() {
      if (window.turnstile) return mount();
      var tries = 0;
      (function wait() {
        if (window.turnstile) return mount();
        if (++tries > 100) return setState('error');
        setTimeout(wait, 100);
      })();
    }

    function run() {
      if (!window.turnstile || widget === null) { setState('error'); return; }
      setState('checking');
      try { window.turnstile.execute(widget); } catch (e) { setState('error'); }
    }

    /* token 一次性，用掉必须换新的；again=true 时自动再跑一次，省得用户重点 */
    function reset(again) {
      if (window.turnstile && widget !== null) {
        try { window.turnstile.reset(widget); } catch (e) {}
      }
      setState('idle');
      if (again) setTimeout(run, 60);
    }

    box.addEventListener('click', function () {
      var st = box.getAttribute('data-state');
      if (st === 'checking' || st === 'ok' || st === 'action') return;
      run();
    });

    return { token: token, reset: reset, ensure: ensure, focus: function () { box.focus(); } };
  }

  var vLogin = makeVerify({ box: 'verifyBox', text: 'verifyText', tag: 'verifyTag', slot: 'tsSlot' });
  var vReset = makeVerify({ box: 'verifyBox2', text: 'verifyText2', tag: 'verifyTag2', slot: 'tsSlot2' });
  if (vLogin) vLogin.ensure();

  /* 点同意条款里的链接时，别把复选框一起切换了 */
  Array.prototype.forEach.call(document.querySelectorAll('.check__t a'), function (a) {
    a.addEventListener('click', function (ev) { ev.stopPropagation(); });
  });

  var busy = false;

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (busy) return;

    if (!validate()) {
      var bad = form.querySelector('[aria-invalid="true"]');
      if (bad) bad.focus();
      return;
    }

    /* 还没点验证条就没 token，直接拦下，别白发一次请求 */
    var tsToken = vLogin ? vLogin.token() : '';
    if (!tsToken) {
      noteEl.textContent = T('请先点击上方「点击完成人机验证」。', 'Complete the human check above first.');
      noteEl.classList.add('is-error');
      if (vLogin) vLogin.focus();
      return;
    }

    busy = true;
    var prev = submitEl.innerHTML;
    submitEl.disabled = true;
    submitEl.textContent = T('处理中…', 'Working…');
    noteEl.classList.remove('is-error');

    try {
      var payload = mode === 'signup'
        ? { username: usernameEl.value.trim(), email: emailEl.value.trim(), password: pwEl.value, turnstileToken: tsToken }
        : { username: usernameEl.value.trim(), password: pwEl.value, turnstileToken: tsToken };

      var res = await fetch(mode === 'signup' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });

      if (res.ok && data.ok) {
        /* 登录/注册返回的资料先写缓存，落地页可立即秒显 */
        if (data.user && window.CF && CF.cache) CF.cache.set(data.user);

        /* 被封禁或冻结的号也能进来，但只能做工单与看消息 */
        if (data.restricted) {
          noteEl.classList.remove('is-error');
          noteEl.textContent = T('账户当前受限，正在进入客服页…', 'Account restricted. Opening support…');
          location.replace(window.CF && CF.goto ? CF.goto('/support') : '/support');
          return;
        }

        noteEl.textContent = (mode === 'signup'
          ? T('账户已创建', 'Account created')
          : T('登录成功', 'Signed in')) + T('，正在进入…', ', redirecting…');
        location.href = nextPath();
        return;
      }

      noteEl.textContent = ERRORS[data.error] || T('操作失败，请稍后重试。', 'Something went wrong. Try again.');
      noteEl.classList.add('is-error');

      /* 服务端是先校验 token 再比对密码，所以只要没成功，token 一定已被消费 */
      if (vLogin) vLogin.reset(true);

      if (data.error === 'invalid_credentials') {
        fail(pwEl, pwErr, T('用户名或密码不正确。', 'Wrong username or password.'));
        pwEl.focus();
      }
    } catch (err) {
      noteEl.textContent = T('网络连接失败，请检查网络后重试。', 'Network error. Check your connection and retry.');
      noteEl.classList.add('is-error');
      if (vLogin) vLogin.reset(true);
    } finally {
      busy = false;
      submitEl.disabled = false;
      submitEl.innerHTML = prev;
    }
  });

  /* ============================================================
     忘记密码：发验证码 → 校验 → 直接设新密码
     后端一个账号一天只放 3 封，三处用途（验证邮箱 / 忘记密码 / 改密码）共用
     ============================================================ */

  var resetForm = document.getElementById('resetForm');
  if (!resetForm) return;

  var rsEmail = document.getElementById('rsEmail');
  var rsEmailErr = document.getElementById('rsEmailErr');
  var rsCode = document.getElementById('rsCode');
  var rsCodeErr = document.getElementById('rsCodeErr');
  var rsCodeHint = document.getElementById('rsCodeHint');
  var rsPw = document.getElementById('rsPw');
  var rsPwErr = document.getElementById('rsPwErr');
  var rsPw2 = document.getElementById('rsPw2');
  var rsSend = document.getElementById('rsSend');
  var rsSubmit = document.getElementById('rsSubmit');
  var rsNote = document.getElementById('rsNote');
  var rsTimer = null;

  var LOGIN_TITLE = {
    title: MODES.login.title,
    desc: MODES.login.desc
  };
  var RESET_TITLE = {
    title: T('重置密码', 'Reset password'),
    desc: T('填注册时用的邮箱，我们把 6 位验证码发过去，验证通过就能设新密码。',
            'Enter the email you registered with. We will send a 6-digit code, then you can set a new password.')
  };

  var RS_NOTE_IDLE = T('重置后所有设备都会退出登录，需要用新密码重新进入。',
    'All devices will be signed out. Sign in again with the new password.');
  var RS_HINT_IDLE = T('10 分钟内有效，一个账号一天最多发 3 封。',
    'Valid for 10 minutes. Up to 3 emails per account per day.');

  function showReset(on) {
    resetForm.hidden = !on;
    form.hidden = on;
    /* .auth__tabs 是 display:flex，光加 hidden 属性压不住，得直接改行内样式 */
    if (tabsEl) tabsEl.style.display = on ? 'none' : '';
    titleEl.textContent = on ? RESET_TITLE.title : LOGIN_TITLE.title;
    descEl.textContent = on ? RESET_TITLE.desc : LOGIN_TITLE.desc;

    if (on) {
      if (vReset) vReset.ensure();
      /* 从登录页带过来的用户名可能就是邮箱，顺手填过去 */
      var guess = usernameEl.value.trim();
      if (!rsEmail.value && guess.indexOf('@') > 0) rsEmail.value = guess;
      setTimeout(function () { (rsEmail.value ? rsCode : rsEmail).focus(); }, 80);
    } else {
      rsEmailErr.hidden = true;
      rsCodeErr.hidden = true;
      rsPwErr.hidden = true;
      rsNote.classList.remove('is-error');
      rsNote.textContent = RS_NOTE_IDLE;
      rsCodeHint.textContent = RS_HINT_IDLE;
      pwEl.focus();
    }
  }

  document.getElementById('forgotLink').addEventListener('click', function () { showReset(true); });
  document.getElementById('rsBack').addEventListener('click', function () { showReset(false); });

  function startCooldown(sec) {
    var left = Math.max(1, Number(sec) || 60);
    clearInterval(rsTimer);
    rsSend.disabled = true;
    rsSend.textContent = T(left + ' 秒后重发', 'Resend in ' + left + 's');
    rsTimer = setInterval(function () {
      left--;
      if (left <= 0) {
        clearInterval(rsTimer);
        rsSend.disabled = false;
        rsSend.textContent = T('重新发送', 'Resend code');
        return;
      }
      rsSend.textContent = T(left + ' 秒后重发', 'Resend in ' + left + 's');
    }, 1000);
  }

  var SEND_IDLE = T('发送验证码', 'Send code');

  rsSend.addEventListener('click', function () {
    var email = rsEmail.value.trim();
    rsEmailErr.hidden = true;
    rsCodeErr.hidden = true;
    rsNote.classList.remove('is-error');

    if (!EMAIL_RE.test(email)) {
      fail(rsEmail, rsEmailErr, T('邮箱格式不正确，请检查后重试。', 'That email does not look right.'));
      rsEmail.focus();
      return;
    }

    var tsTok = vReset ? vReset.token() : '';
    if (!tsTok) {
      rsNote.textContent = T('请先点击下方「点击完成人机验证」。', 'Complete the human check below first.');
      rsNote.classList.add('is-error');
      if (vReset) vReset.focus();
      return;
    }

    rsSend.disabled = true;
    rsSend.textContent = T('发送中', 'Sending…');

    fetch('/api/auth/reset/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, turnstileToken: tsTok })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, body: d }; }); })
      .then(function (r) {
        var d = r.body || {};

        if (r.ok && d.ok) {
          var remain = d.left === undefined ? 2 : d.left;
          rsCodeHint.textContent = T(
            '验证码已发到 ' + (d.email || '你的邮箱') + '，10 分钟内有效。今天还剩 ' + remain + ' 次。',
            'Code sent to ' + (d.email || 'your email') + '. Valid 10 minutes. ' + remain + ' left today.');
          startCooldown(60);
          rsCode.focus();
          return;
        }

        /* token 已经被这次请求消费掉，无论成败都要换一条 */
        if (vReset) vReset.reset(false);

        if (d.error === 'too_soon') {
          rsCodeErr.textContent = T('这个账号刚发过一封，' + (d.wait || 60) + ' 秒后再发。',
            'This account just got one. Wait ' + (d.wait || 60) + 's.');
          startCooldown(d.wait || 60);
        } else if (d.error === 'too_many') {
          rsCodeErr.textContent = T('今天 3 封已经发完了，明天再来。',
            'That is 3 emails today. Try again tomorrow.');
          startCooldown(3600);
        } else if (d.error === 'mail_unconfigured') {
          if (d.devCode) {
            rsCode.value = d.devCode;
            rsCodeErr.textContent = T('发信服务没配（本地调试模式），已把验证码填好。',
              'Mail is not configured (local debug). Code filled in for you.');
          } else {
            rsCodeErr.textContent = T('站长还没配发信服务，暂时发不出邮件。',
              'Email sending is not configured yet.');
          }
          rsSend.disabled = false;
          rsSend.textContent = SEND_IDLE;
        } else {
          rsCodeErr.textContent = ERRORS[d.error] || d.message || T('发送失败，稍后再试。', 'Sending failed. Try again.');
          rsSend.disabled = false;
          rsSend.textContent = SEND_IDLE;
        }
        rsCodeErr.hidden = false;
      })
      .catch(function () {
        rsCodeErr.textContent = T('网络连接失败，请稍后重试。', 'Network error. Try again later.');
        rsCodeErr.hidden = false;
        rsSend.disabled = false;
        rsSend.textContent = SEND_IDLE;
      });
  });

  var rsBusy = false;

  resetForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (rsBusy) return;

    var email = rsEmail.value.trim();
    var code = rsCode.value.replace(/\D/g, '').slice(0, 6);
    var a = rsPw.value;
    var b = rsPw2.value;

    rsEmailErr.hidden = true;
    rsCodeErr.hidden = true;
    rsPwErr.hidden = true;
    rsNote.classList.remove('is-error');

    if (!EMAIL_RE.test(email)) {
      fail(rsEmail, rsEmailErr, T('邮箱格式不正确，请检查后重试。', 'That email does not look right.'));
      rsEmail.focus();
      return;
    }
    if (code.length !== 6) {
      fail(rsCode, rsCodeErr, T('验证码是 6 位数字，检查一下邮件。', 'The code is 6 digits. Check the email.'));
      rsCode.focus();
      return;
    }
    if (a.length < 8 || a.length > 72) {
      fail(rsPw, rsPwErr, T('新密码需 8 至 72 位。', 'New password must be 8-72 characters.'));
      rsPw.focus();
      return;
    }
    if (!/[A-Za-z]/.test(a) || !/\d/.test(a)) {
      fail(rsPw, rsPwErr, T('新密码要同时包含字母和数字。', 'New password needs both letters and numbers.'));
      rsPw.focus();
      return;
    }
    if (a !== b) {
      fail(rsPw2, rsPwErr, T('两次输入的新密码不一致。', 'The two passwords do not match.'));
      rsPw2.focus();
      return;
    }

    rsBusy = true;
    var prev = rsSubmit.innerHTML;
    rsSubmit.disabled = true;
    rsSubmit.textContent = T('提交中…', 'Submitting…');

    fetch('/api/auth/reset/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, code: code, password: a })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, body: d }; }); })
      .then(function (r) {
        var d = r.body || {};

        if (r.ok && d.ok) {
          rsNote.textContent = T('密码已重置，正在返回登录…', 'Password reset. Back to sign in…');
          rsNote.classList.remove('is-error');
          rsCode.value = '';
          rsPw.value = '';
          rsPw2.value = '';
          setTimeout(function () { showReset(false); }, 1400);
          return;
        }

        if (d.error === 'wrong_code') {
          var left = d.left;
          rsCodeErr.textContent = left === undefined
            ? T('验证码不对，检查一下邮件。', 'Wrong code. Check the email.')
            : T('验证码不对，还能试 ' + left + ' 次。', 'Wrong code. ' + left + ' attempts left.');
        } else if (d.error === 'expired' || d.error === 'too_many_tries' || d.error === 'no_code') {
          rsCodeErr.textContent = ERRORS[d.error] || d.message || T('验证码失效了，重新发一条。', 'Code no longer valid. Send a new one.');
        } else {
          rsCodeErr.textContent = ERRORS[d.error] || d.message || T('重置失败，稍后再试。', 'Reset failed. Try again.');
        }
        rsCodeErr.hidden = false;
      })
      .catch(function () {
        rsNote.textContent = T('网络连接失败，请检查网络后重试。', 'Network error. Check your connection and retry.');
        rsNote.classList.add('is-error');
      })
      .then(function () {
        rsBusy = false;
        rsSubmit.disabled = false;
        rsSubmit.innerHTML = prev;
      });
  });

  setMode('login');

  /* 带 ?reset=1 进来直接展开重置面板，方便从邮件或帮助页跳转 */
  if (/[?&]reset=1\b/.test(location.search)) showReset(true);
})();
