/* ============================================================
   乘法 · 账户入口
   仅负责界面交互与前端校验，不发起任何网络请求
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
  var agreeRow = document.getElementById('agreeRow');
  var agreeEl = document.getElementById('agree');
  var pwEl = document.getElementById('password');
  var pwHint = document.getElementById('pwHint');
  var emailEl = document.getElementById('email');
  var emailErr = document.getElementById('emailErr');
  var pwErr = document.getElementById('pwErr');
  var agreeErr = document.getElementById('agreeErr');

  var MODES = {
    login: {
      title: '登录',
      desc: '使用注册时填写的邮箱与密码进入账户。',
      submit: '登录',
      note: '后端账户系统尚未接入。本页仅呈现界面结构，提交不会进入账户。',
      pwAuto: 'current-password',
      pwHint: '若忘记密码，需通过注册邮箱重置。'
    },
    signup: {
      title: '注册',
      desc: '创建账户后可浏览全部公开问卷，参与市场调研并累积积分。',
      submit: '创建账户',
      note: '后端账户系统尚未接入。本页仅呈现界面结构，提交不会创建账户。',
      pwAuto: 'new-password',
      pwHint: '至少 8 位，需同时包含字母与数字。'
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
    pwHint.textContent = cfg.pwHint;

    agreeRow.hidden = mode !== 'signup';

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

    if (mode === 'signup' && !agreeEl.checked) {
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

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!validate()) {
      var bad = form.querySelector('[aria-invalid="true"]');
      if (bad) bad.focus();
      return;
    }
    noteEl.textContent = '账户系统尚未接入，本次提交未发送至服务器。接入后可在此完成' +
      (mode === 'signup' ? '账户创建' : '身份验证') + '。';
  });

  setMode('login');
})();
