/* ============================================================
   乘法 · 账户入口
   界面交互、前端校验、接口调用
   ============================================================ */
(function () {
  'use strict';

  var form = document.getElementById('authForm');
  if (!form) return;

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
        location.replace(nextPath());
        return;
      }
      revealAuth();
    })
    .catch(revealAuth);

  /* 接口卡住时也要把表单放出来，不能留空白 */
  setTimeout(revealAuth, 1600);

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
  var usernameEl = document.getElementById('username');
  var userErr = document.getElementById('userErr');

  var MODES = {
    login: {
      title: '登录',
      desc: '使用注册时填写的邮箱与密码进入账户。',
      submit: '登录',
      note: '登录状态保持 30 天。在公共设备上使用后请退出。',
      pwAuto: 'current-password'
    },
    signup: {
      title: '注册',
      desc: '创建账户后可浏览全部公开问卷，参与市场调研并累积积分。',
      submit: '创建账户',
      note: '注册不收取任何费用，无需绑定银行卡。',
      pwAuto: 'new-password'
    }
  };

  var mode = 'login';

  /* ---------- 模式切换 ---------- */

  /* 从 /login?next=/ledger 回来时跳回原页面；只接受站内路径，避免被拿去当跳板 */
  function nextPath() {
    var raw = new URLSearchParams(location.search).get('next') || '';
    if (raw.charAt(0) !== '/' || raw.charAt(1) === '/' || raw.charAt(1) === '\\') return '/home';
    if (raw.indexOf('/login') === 0) return '/home';
    return raw;
  }

  function setMode(next) {
    mode = next === 'signup' ? 'signup' : 'login';
    var cfg = MODES[mode];

    titleEl.textContent = cfg.title;
    descEl.textContent = cfg.desc;
    submitEl.innerHTML = cfg.submit + ' <span aria-hidden="true">→</span>';
    noteEl.textContent = cfg.note;
    pwEl.setAttribute('autocomplete', cfg.pwAuto);
    userRow.hidden = mode !== 'signup';

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

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,20}$/;

  function validate() {
    clearErrors();
    var ok = true;
    var email = emailEl.value.trim();
    var pw = pwEl.value;

    if (mode === 'signup') {
      var name = usernameEl.value.trim();
      if (!name) {
        fail(usernameEl, userErr, '请填写用户名。');
        ok = false;
      } else if (!NAME_RE.test(name)) {
        fail(usernameEl, userErr, '用户名限 2 至 20 字，可用中文、字母、数字、下划线与连字符。');
        ok = false;
      } else if (/^\d+$/.test(name)) {
        fail(usernameEl, userErr, '用户名不能全部为数字。');
        ok = false;
      }
    }

    if (!email) {
      fail(emailEl, emailErr, '请填写邮箱地址。');
      ok = false;
    } else if (!EMAIL_RE.test(email)) {
      fail(emailEl, emailErr, '邮箱格式不正确，请检查后重试。');
      ok = false;
    }

    if (!pw) {
      fail(pwEl, pwErr, '请填写密码。');
      ok = false;
    } else if (pw.length < 8) {
      fail(pwEl, pwErr, '密码长度不足 8 位。');
      ok = false;
    } else if (mode === 'signup' && !(/[A-Za-z]/.test(pw) && /\d/.test(pw))) {
      fail(pwEl, pwErr, '密码需同时包含字母与数字。');
      ok = false;
    }

    if (!agreeEl.checked) {
      fail(agreeEl, agreeErr, '请先阅读并同意用户协议与隐私说明。');
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

  var ERRORS = {
    invalid_email: '邮箱格式不正确，请检查后重试。',
    invalid_password: '密码长度需在 8 至 72 位之间。',
    weak_password: '密码需同时包含字母与数字。',
    invalid_username: '用户名限 2 至 20 字，可用中文、字母、数字、下划线与连字符。',
    username_taken: '该用户名已被使用，请换一个。',
    email_taken: '该邮箱已注册，请直接登录。',
    invalid_credentials: '邮箱或密码不正确。',
    too_many_attempts: '尝试次数过多，请二十分钟后再试。',
    bad_request: '请求格式有误，请刷新页面后重试。',
    unauthorized: '登录状态已失效，请重新登录。',
    db_unbound: '服务端数据库尚未就绪。',
    server_error: '服务器出错，请稍后重试。'
  };

  var busy = false;

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (busy) return;

    if (!validate()) {
      var bad = form.querySelector('[aria-invalid="true"]');
      if (bad) bad.focus();
      return;
    }

    busy = true;
    var prev = submitEl.innerHTML;
    submitEl.disabled = true;
    submitEl.textContent = '处理中…';
    noteEl.classList.remove('is-error');

    try {
      var payload = { email: emailEl.value.trim(), password: pwEl.value };
      if (mode === 'signup') payload.username = usernameEl.value.trim();

      var res = await fetch(mode === 'signup' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });

      if (res.ok && data.ok) {
        /* 登录/注册返回的资料先写缓存，落地页可立即秒显 */
        if (data.user && window.CF && CF.cache) CF.cache.set(data.user);
        noteEl.textContent = (mode === 'signup' ? '账户已创建' : '登录成功') + '，正在进入…';
        location.href = nextPath();
        return;
      }

      noteEl.textContent = ERRORS[data.error] || '操作失败，请稍后重试。';
      noteEl.classList.add('is-error');

      if (data.error === 'invalid_credentials') {
        fail(pwEl, pwErr, '邮箱或密码不正确。');
        pwEl.focus();
      }
    } catch (err) {
      noteEl.textContent = '网络连接失败，请检查网络后重试。';
      noteEl.classList.add('is-error');
    } finally {
      busy = false;
      submitEl.disabled = false;
      submitEl.innerHTML = prev;
    }
  });

  setMode('login');
})();
