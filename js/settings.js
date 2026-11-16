/* ============================================================
   乘法 · 账户设置
   数据来自 /api/auth/me；用户名改写走 /api/user/profile
   ============================================================ */
(function () {
  'use strict';

  var ROLES = { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };
  var STATUS = { active: '正常', frozen: '已冻结', banned: '已封禁' };
  var PLATE_HINT = {
    owner: '站点所有者，权限最高',
    admin: '运营管理，可审核问卷与工单',
    premium: '大会员，手续费与审核优先',
    user: '普通账户'
  };

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');
  var toast = document.getElementById('toast');

  function $(id) { return document.getElementById(id); }
  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }

  /* ---------- 提示条 ---------- */

  var toastTimer = null;

  function say(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2400);
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-soon]') : null;
    if (!el) return;
    ev.preventDefault();
    say((el.getAttribute('data-soon') || '该功能') + ' · 功能开发中');
  });

  /* ---------- 退出 ---------- */

  var logoutBtn = $('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logoutBtn.disabled = true;
      logoutBtn.textContent = '退出中';
      fetch('/api/auth/logout', { method: 'POST' })
        .catch(function () {})
        .then(function () { location.replace('/'); });
    });
  }

  /* ---------- 换算 ---------- */

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1, 2) + '.' + pad(d.getDate(), 2);
  }

  function fmtFull(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return fmtDate(iso) + ' ' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2);
  }

  function daysSince(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 1;
    var n = Math.floor((Date.now() - d.getTime()) / 86400000) + 1;
    return n < 1 ? 1 : n;
  }

  /* ---------- 渲染 ---------- */

  var current = null;

  function render(u) {
    current = u;

    $('navName').textContent = u.username || '未命名';
    $('navBal').textContent = u.fc;

    $('setUid').textContent = u.uid;
    $('setUser').textContent = u.username || '未命名';
    $('setStatus').textContent = STATUS[u.status] || u.status;
    $('setJoined').textContent = fmtFull(u.createdAt);
    $('setEmail').textContent = u.email || '—';

    var role = u.role || 'user';
    $('setRole').textContent = ROLES[role] || role;
    $('setPlate').textContent = ROLES[role] || role;
    $('setPlateHint').textContent = PLATE_HINT[role] || '';

    $('curName').textContent = u.username || '—';
    $('curEmail').textContent = u.email || '—';

    $('setFc').textContent = u.fc;
    $('setFrozen').textContent = u.fcFrozen;

    $('stDone').textContent = u.done || 0;
    $('stDays').textContent = daysSince(u.createdAt);
    $('stLevel').textContent = u.level;
    $('stAff').textContent = u.affinity;

    $('ipReg').textContent = u.regIp || '未记录';
    $('netReg').textContent = u.regNet || '未记录';
    $('lastLogin').textContent = u.lastLoginAt ? fmtFull(u.lastLoginAt) : '未记录';
  }

  /* ---------- 03 安全：展开与提交 ---------- */

  function openEdit(which) {
    ['name', 'email', 'pw'].forEach(function (k) {
      $('form' + k.charAt(0).toUpperCase() + k.slice(1)).hidden = k !== which;
    });
    if (which === 'name') { $('newName').value = current ? current.username : ''; $('newName').focus(); }
    if (which === 'email') { $('newEmail').value = ''; $('emailPw').value = ''; $('newEmail').focus(); }
    if (which === 'pw') { $('oldPw').value = ''; $('newPw').value = ''; $('newPw2').value = ''; $('oldPw').focus(); }
  }

  function closeAll() {
    ['name', 'email', 'pw'].forEach(function (k) {
      var f = $('form' + k.charAt(0).toUpperCase() + k.slice(1));
      f.hidden = true;
      var err = f.querySelector('.edit__e');
      if (err) { err.hidden = true; err.textContent = ''; }
    });
  }

  document.querySelectorAll('[data-edit]').forEach(function (btn) {
    btn.addEventListener('click', function () { openEdit(btn.getAttribute('data-edit')); });
  });

  document.querySelectorAll('[data-cancel]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeAll(); });
  });

  function showErr(id, text) {
    var el = $(id);
    el.textContent = text;
    el.hidden = false;
  }

  var NAME_RE = /^[\u4e00-\u9fa5A-Za-z_\-][\u4e00-\u9fa5A-Za-z0-9_\-]{1,19}$/;

  $('formName').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var val = $('newName').value.trim();
    var err = $('nameErr');
    err.hidden = true;

    if (!NAME_RE.test(val) || /^\d+$/.test(val)) {
      showErr('nameErr', '用户名需 2 至 20 个字符，可用中文、字母、数字、下划线或连字符，不能以数字开头。');
      $('newName').setAttribute('aria-invalid', 'true');
      return;
    }

    var btn = $('saveName');
    btn.disabled = true;
    btn.textContent = '保存中';

    fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: val })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, body: d }; }); })
      .then(function (r) {
        if (r.ok && r.body.ok) {
          var u = r.body.user || {};
          if (u.username) { current.username = u.username; render(current); }
          closeAll();
          say('用户名已更新');
        } else if (r.body && r.body.error === 'username_taken') {
          showErr('nameErr', '这个用户名已被占用，换一个。');
        } else if (r.body && r.body.error === 'invalid_username') {
          showErr('nameErr', '格式不符合要求，2 至 20 个字符，不能是纯数字。');
        } else if (r.body && r.body.error === 'unauthorized') {
          showErr('nameErr', '登录状态已失效，请刷新页面。');
        } else {
          showErr('nameErr', '保存失败，请稍后重试。');
        }
      })
      .catch(function () { showErr('nameErr', '网络连接失败，未保存。'); })
      .then(function () {
        btn.disabled = false;
        btn.textContent = '保存';
      });
  });

  /* 邮箱与密码：接口尚未接入，提交后给出明确说明 */

  function notReady(formId, errId) {
    var form = $(formId);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      showErr(errId, '该功能的后端接口尚未接入，提交不会生效。用户名可以现在改。');
    });
  }

  notReady('formEmail', 'emailErr');
  notReady('formPw', 'pwErr');

  /* ---------- 08 自定义设置 ---------- */

  var PREF_KEY = 'cf.prefs';
  var DEFAULTS = {
    'notify.survey': true,
    'notify.review': true,
    'notify.balance': true,
    'notify.withdraw': true,
    'notify.notice': true,
    'notify.weekly': false,
    'privacy.page': true,
    'privacy.ladder': true,
    'privacy.joined': false,
    'privacy.search': true,
    'privacy.online': false,
    'ui.compact': false,
    'ui.motion': false,
    'ui.tabular': true,
    'ui.grid': false,
    'safe.device': true,
    'safe.region': false,
    'safe.withdraw': true,
    'data.stats': true,
    'data.research': false
  };

  var prefs = {};

  function loadPrefs() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    prefs = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      prefs[k] = Object.prototype.hasOwnProperty.call(saved, k) ? !!saved[k] : DEFAULTS[k];
    });
  }

  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* 存不了就算了 */ }
  }

  function applyPrefs() {
    var b = document.body;
    b.classList.toggle('is-compact', prefs['ui.compact']);
    b.classList.toggle('is-still', !prefs['ui.motion']);
    b.classList.toggle('is-tabular', prefs['ui.tabular']);
    b.classList.toggle('is-grid', prefs['ui.grid']);
  }

  loadPrefs();

  document.querySelectorAll('[data-pref]').forEach(function (input) {
    var key = input.getAttribute('data-pref');
    input.checked = !!prefs[key];
    input.addEventListener('change', function () {
      prefs[key] = input.checked;
      savePrefs();
      applyPrefs();
    });
  });

  applyPrefs();

  /* ---------- 09 查找 ---------- */

  $('findForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var q = $('findInput').value.trim();
    var out = $('findOut');
    out.classList.remove('is-hit');

    if (!q) {
      out.textContent = '请输入 UID 或用户名。';
      return;
    }
    if (/^\d+$/.test(q)) {
      out.textContent = '已识别为 UID ' + q + '。个人主页与查询接口尚未开放，开放后这里会直接给出主页入口。';
    } else {
      out.textContent = '已识别为用户名「' + q + '」。个人主页与查询接口尚未开放，开放后这里会直接给出主页入口。';
    }
  });

  /* ---------- 本地预览 ---------- */

  var DEMO = {
    uid: 1,
    username: '乘法',
    role: 'owner',
    status: 'active',
    fc: '128.4500',
    fcFrozen: '20.0000',
    affinity: 12,
    exp: 520,
    level: 3,
    done: 7,
    bio: '这里填写个人简介。',
    email: '574366992@qq.com',
    createdAt: '2026-11-16T08:00:46Z',
    lastLoginAt: '2026-11-16T09:30:00Z',
    regIp: '203.0.113.24',
    regNet: 'AS4134 CHINANET / CN'
  };

  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  if (isLocal && /[?&]preview\b/.test(location.search)) {
    render(DEMO);
    loading.hidden = true;
    app.hidden = false;
    return;
  }

  /* ---------- 启动 ---------- */

  fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
    .then(function (res) {
      if (res.status === 401) { location.replace('/login'); return null; }
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      loading.hidden = true;
      if (!data.ok || !data.user) { say('账户载入失败，请刷新页面重试。'); return; }
      render(data.user);
      app.hidden = false;
    })
    .catch(function () {
      loading.hidden = true;
      say('网络连接失败，请检查网络后刷新。');
    });
})();
