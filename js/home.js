/* ============================================================
   乘法 · 账户首页
   读取 /api/auth/me，渲染门面，未登录跳转登录页
   ============================================================ */
(function () {
  'use strict';

  var ROLES = { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };
  var STATUS = { active: '正常', frozen: '已冻结', banned: '已封禁' };

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');
  var toast = document.getElementById('toast');

  function $(id) { return document.getElementById(id); }

  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  /* ---------- 提示条 ---------- */

  var toastTimer = null;

  function say(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-on');
    }, 2200);
  }

  /* ---------- 未开放功能 ---------- */

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

  function daysSince(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 1;
    var n = Math.floor((Date.now() - d.getTime()) / 86400000) + 1;
    return n < 1 ? 1 : n;
  }

  /* 等级区间：第 n 级起点为 (n-1)^2 * 100 点经验 */
  function levelRange(level) {
    var lv = Math.max(1, level | 0);
    return { from: Math.pow(lv - 1, 2) * 100, to: Math.pow(lv, 2) * 100 };
  }

  /* ---------- 渲染 ---------- */

  function render(user) {
    $('navName').textContent = user.username || '未命名';
    $('navBal').textContent = user.fc;

    $('uidText').textContent = pad(user.uid, 6);
    $('userName').textContent = user.username || '未命名';
    $('joinedAt').textContent = fmtDate(user.createdAt);
    $('statusText').textContent = STATUS[user.status] || user.status;

    var roleEl = $('roleText');
    roleEl.textContent = ROLES[user.role] || user.role;
    roleEl.setAttribute('data-role', user.role);

    $('bioText').textContent = user.bio || '';

    $('fcText').textContent = user.fc;
    $('fcFrozen').textContent = user.fcFrozen;

    $('statDays').textContent = daysSince(user.createdAt);
    $('statLevel').textContent = user.level;
    $('statAff').textContent = user.affinity;

    var range = levelRange(user.level);
    var span = range.to - range.from;
    var pct = span > 0 ? ((user.exp - range.from) / span) * 100 : 0;
    pct = Math.max(0, Math.min(100, pct));

    $('expText').textContent = user.exp;
    $('expNext').textContent = range.to;
    $('expHint').textContent =
      '再获得 ' + Math.max(0, range.to - user.exp) + ' 点经验升至 ' + (user.level + 1) + ' 级。';

    requestAnimationFrame(function () {
      $('expBar').style.width = pct + '%';
    });
  }

  /* ---------- 本地预览 ---------- */
  /* 仅在本地开发服务器上带 ?preview 生效，用于检查版面，线上不触发 */

  var DEMO = {
    uid: 1,
    username: '用户1',
    role: 'owner',
    status: 'active',
    fc: '128.4500',
    fcFrozen: '20.0000',
    affinity: 12,
    exp: 520,
    level: 3,
    bio: '这里填写个人简介。这段文字用于检查较长内容在版面中的换行表现。',
    createdAt: '2026-11-16T08:00:46Z'
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
      if (res.status === 401) {
        location.replace('/login');
        return null;
      }
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      loading.hidden = true;
      if (!data.ok || !data.user) {
        say('账户载入失败，请刷新页面重试。');
        return;
      }
      render(data.user);
      app.hidden = false;
    })
    .catch(function () {
      loading.hidden = true;
      say('网络连接失败，请检查网络后刷新。');
    });
})();
