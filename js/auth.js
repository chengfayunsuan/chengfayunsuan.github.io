/* ============================================================
   乘法 · 账户入口
   界面交互、前端校验、接口调用
   ============================================================ */
(function () {
  'use strict';

  var form = document.getElementById('authForm');
  if (!form) return;

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

  function setMode(next) {
    mode = next === 'signup' ? 'signup' : 'login';
    var cfg = MODES[mode];

    titleEl.textContent = cfg.title;
    descEl.textContent = cfg.desc;
    submitEl.innerHTML = cfg.submit + ' <span aria-hidden="true">→</span>';
    noteEl.textContent = cfg.note;
    pwEl.setAttribute('autocomplete', cfg.pwAuto);

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
    [[emailEl, emailErr], [pwEl, pwErr], [agreeEl, agreeErr]].forEach(function (pair) {
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

  function validate() {
    clearErrors();
    var ok = true;
    var email = emailEl.value.trim();
    var pw = pwEl.value;

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

  [emailEl, pwEl].forEach(function (el) {
    el.addEventListener('input', function () {
      if (el.getAttribute('aria-invalid') !== 'true') return;
      el.removeAttribute('aria-invalid');
      (el === emailEl ? emailErr : pwErr).hidden = true;
    });
  });

  /* ---------- 提交 ---------- */

  var ERRORS = {
    invalid_email: '邮箱格式不正确，请检查后重试。',
    invalid_password: '密码长度需在 8 至 72 位之间。',
    weak_password: '密码需同时包含字母与数字。',
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
      var res = await fetch(mode === 'signup' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailEl.value.trim(), password: pwEl.value })
      });
      var data = await res.json().catch(function () { return {}; });

      if (res.ok && data.ok) {
        noteEl.textContent = (mode === 'signup' ? '账户已创建' : '登录成功') + '，正在进入…';
        location.href = '/home';
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
