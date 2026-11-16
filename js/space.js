/* ============================================================
   乘法 · 用户公开主页
   数据来自 /api/pub/user，登录态来自 /api/auth/me
   页面只渲染接口给出的字段，缺的字段不猜、不补假值
   ============================================================ */
(function () {
  'use strict';

  var ROLES = { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };
  var STATUS = { active: '正常', frozen: '已冻结', banned: '已封禁' };
  var RESTRICT_TEXT = {
    banned: '该账户已被封禁，公开资料不再展示。',
    frozen: '该账户已被冻结，公开资料暂停展示。'
  };

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');
  var none = document.getElementById('none');
  var toast = document.getElementById('toast');

  function $(id) { return document.getElementById(id); }

  /* ---------- 提示条 ---------- */

  var toastTimer = null;

  function say(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2400);
  }

  /* ---------- 空态 ---------- */

  function showNone(title, desc) {
    loading.hidden = true;
    app.hidden = true;
    none.hidden = false;
    $('noneT').textContent = title;
    $('noneD').textContent = desc;
    document.title = title + ' · 乘法';
  }

  /* ---------- 渲染 ---------- */

  function render(u) {
    document.title = (u.username || '用户') + ' · 乘法';

    $('uid').textContent = u.uid;
    $('name').textContent = u.username || '未命名';

    var role = u.role || 'user';
    var roleEl = $('role');
    roleEl.textContent = ROLES[role] || role;
    roleEl.setAttribute('data-role', role);

    var st = $('status');
    st.textContent = STATUS[u.status] || u.status || '—';
    st.classList.toggle('is-bad', u.status !== 'active');

    if (u.restricted) {
      $('sub').hidden = true;
      $('restrictNote').hidden = false;
      $('restrictNote').textContent = RESTRICT_TEXT[u.status] || '该账户当前状态异常，公开资料不展示。';
      $('bio').hidden = true;
      $('scopeSec').hidden = true;
      var lvBox = document.querySelector('.sp-lv');
      if (lvBox) lvBox.hidden = true;
      var heroIn = document.querySelector('.sp-hero__in');
      if (heroIn) heroIn.classList.add('is-single');
      return;
    }

    $('sub').textContent =
      '注册于 ' + (u.joinedMonth || '未记录') + ' · 已加入 ' + (u.joinedDays || 1) + ' 天';

    /* 经验：第 n 级起点 (n-1)^2*100，第 n 级终点 n^2*100 */
    var lv = u.level || 1;
    var exp = u.exp || 0;
    var start = Math.pow(lv - 1, 2) * 100;
    var next = lv * lv * 100;
    var pct = ((exp - start) / (next - start)) * 100;
    pct = Math.max(0, Math.min(100, pct));

    $('lv').textContent = lv;
    $('expNow').textContent = exp;
    $('expNext').textContent = next;
    $('aff').textContent = u.affinity || 0;

    var hint = $('expHint');
    if (exp >= next) {
      hint.textContent = '已达到当前等级上限，等待等级结算。';
    } else {
      hint.textContent = '再获得 ' + (next - exp) + ' 点经验升至 LV' + (lv + 1) + '。';
    }

    var bar = $('expBar');
    requestAnimationFrame(function () { bar.style.width = pct + '%'; });

    var bio = $('bio');
    if (u.bio && u.bio.trim()) {
      bio.textContent = u.bio;
    } else {
      bio.textContent = '该用户还没有填写个人简介。';
      bio.classList.add('is-empty');
    }
  }

  /* ---------- 导航与自身判断 ---------- */

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

  function showSelf() {
    $('selfNote').hidden = false;
  }

  /* ---------- 复制链接 ---------- */

  $('copyLink').addEventListener('click', function () {
    var url = location.origin + '/space?uid=' + encodeURIComponent(uid);
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      say('当前浏览器不支持自动复制，请手动复制地址栏');
      return;
    }
    navigator.clipboard.writeText(url).then(
      function () { say('主页链接已复制'); },
      function () { say('复制被拒绝，请手动复制地址栏'); }
    );
  });

  /* ---------- 取数 ---------- */

  var params = new URLSearchParams(location.search);
  var uid = (params.get('uid') || '').trim();

  if (!uid) {
    showNone('缺少 UID', '主页地址需要带上 UID，例如 /space?uid=1。');
    return;
  }
  if (!/^\d+$/.test(uid)) {
    showNone('UID 格式不正确', 'UID 是一串数字，从 1 开始。检查地址里的 uid 参数。');
    return;
  }

  /* ---------- 本地预览 ---------- */

  var DEMO = {
    uid: 2,
    username: '林一舟',
    role: 'user',
    status: 'active',
    level: 2,
    exp: 240,
    affinity: 7,
    bio: '抽空填问卷，偶尔写点东西。对长问卷有耐心，对诱导性提问没有。',
    joinedMonth: '2026 年 10 月',
    joinedDays: 28
  };

  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isLocal && /[?&]preview\b/.test(location.search)) {
    render(DEMO);
    loading.hidden = true;
    app.hidden = false;
    return;
  }

  /* ---------- 启动 ---------- */

  var meReq = fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
    .then(function (res) {
      if (!res.ok) return null;
      return res.json().then(function (d) { return d && d.ok ? d.user : null; });
    })
    .catch(function () { return null; });

  var userReq = fetch('/api/pub/user?uid=' + encodeURIComponent(uid), {
    headers: { Accept: 'application/json' }
  })
    .then(function (res) {
      return res.json().then(function (d) { return { status: res.status, body: d }; });
    })
    .catch(function () { return { status: 0, body: null }; });

  Promise.all([meReq, userReq]).then(function (out) {
    var me = out[0];
    var r = out[1];

    if (me) {
      $('navGuest').hidden = true;
      $('navAuthed').hidden = false;
      $('navBal').textContent = me.fc;
      $('navName').textContent = me.username || '我';
      if (String(me.uid) === uid) showSelf();
    }

    if (r.status === 0) {
      loading.hidden = true;
      say('网络连接失败，请检查网络后刷新');
      return;
    }

    if (r.status === 200 && r.body && r.body.ok && r.body.user) {
      render(r.body.user);
      loading.hidden = true;
      app.hidden = false;
      return;
    }

    var err = r.body && r.body.error;
    if (err === 'gone') {
      showNone('该账户已注销', '账户注销后主页不再公开，相关内容也不再展示。');
    } else if (err === 'not_found') {
      showNone('没有这个用户', 'UID 可能写错了。UID 从 1 开始，按注册顺序发放。');
    } else if (err === 'invalid_query') {
      showNone('UID 格式不正确', 'UID 是一串数字，从 1 开始。');
    } else {
      showNone('主页载入失败', '服务暂时不可用，稍后刷新重试。');
    }
  });
})();
