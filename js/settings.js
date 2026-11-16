/* ============================================================
   乘法 · 账户设置
   数据来自 /api/auth/me；用户名改写走 /api/user/profile
   ============================================================ */
(function () {
  'use strict';

  var ROLES = { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };
  var STATUS = { active: '正常', frozen: '已冻结', banned: '已封禁' };

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');
  var toast = document.getElementById('toast');

  function $(id) { return document.getElementById(id); }
  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }

  /* 余额小数末尾的 0 不显示：0.0000 -> 0，128.4500 -> 128.45 */
  function trimNum(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

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
    $('navBal').textContent = trimNum(u.fc);

    $('setUid').textContent = u.uid;
    $('setUser').textContent = u.username || '未命名';
    $('setStatus').textContent = STATUS[u.status] || u.status;
    $('setJoined').textContent = fmtFull(u.createdAt);

    var role = u.role || 'user';
    $('setRole').textContent = ROLES[role] || role;

    $('curName').textContent = u.username || '—';
    $('curEmail').textContent = u.email || '—';

    $('setFc').textContent = trimNum(u.fc);
    $('setFrozen').textContent = trimNum(u.fcFrozen);

    $('stDone').textContent = u.done || 0;
    $('stDays').textContent = daysSince(u.createdAt);
    $('stLevel').textContent = u.level;
    $('stAff').textContent = u.affinity;

    $('curIp').textContent = u.ip || '未记录';
    $('curNet').textContent = u.net || '未记录';
    $('lastLogin').textContent = u.lastLoginAt ? fmtFull(u.lastLoginAt) : '未记录';
  }

  /* ---------- 关注与粉丝：两行数字与小窗口 ---------- */

  var relList = $('relList');
  var relEmpty = $('relEmpty');
  var relMore = $('relMore');
  var sheet = $('relSheet');

  var REL = { uid: null, scope: 'following', offset: 0, total: 0, busy: false };
  var SOC = { followers: 0, following: 0 };
  var lastFocus = null;
  var socialBound = false;

  function paintSocial() {
    $('setFollowN').textContent = SOC.following;
    $('setFansN').textContent = SOC.followers;
    $('tabFollow').textContent = SOC.following;
    $('tabFans').textContent = SOC.followers;
  }

  function openSheet(scope) {
    if (!sheet) return;
    lastFocus = document.activeElement;
    sheet.hidden = false;
    document.body.classList.add('is-locked');
    var x = $('sheetClose');
    if (x) x.focus();
    loadRel(scope, false);
  }

  function closeSheet() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.body.classList.remove('is-locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function setTabs(scope) {
    Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-scope') === scope);
    });
  }

  function emptyText(scope) {
    return scope === 'followers' ? '还没有人关注你。' : '还没有关注任何人。';
  }

  function relItem(it) {
    var li = document.createElement('li');
    li.className = 'rel__i';

    var a = document.createElement('a');
    a.className = 'rel__a';
    a.href = '/space?uid=' + encodeURIComponent(it.uid);

    var uid = document.createElement('span');
    uid.className = 'rel__uid';
    uid.textContent = 'UID ' + it.uid;

    var name = document.createElement('span');
    name.className = 'rel__name';
    name.textContent = it.username || '未命名';

    var role = document.createElement('span');
    role.className = 'face__role rel__role';
    role.setAttribute('data-role', it.role || 'user');
    role.textContent = ROLES[it.role] || it.role || '用户';

    var lv = document.createElement('span');
    lv.className = 'rel__lv';
    lv.textContent = 'LV ' + (it.level || 1);

    var at = document.createElement('span');
    at.className = 'rel__at';
    at.textContent = fmtDate(it.at);

    a.appendChild(uid);
    a.appendChild(name);
    a.appendChild(role);
    a.appendChild(lv);
    a.appendChild(at);
    li.appendChild(a);

    if (String(it.uid) !== String(REL.uid)) {
      var act = document.createElement('button');
      act.className = 'rel__act';
      act.type = 'button';
      act.setAttribute('data-uid', it.uid);
      act.setAttribute('data-following', it.following ? '1' : '0');
      act.textContent = it.following ? '取消关注' : '关注';
      li.appendChild(act);
    }

    return li;
  }

  function loadRel(scope, append) {
    if (REL.busy || !sheet) return;

    REL.busy = true;
    REL.scope = scope;

    if (!append) {
      REL.offset = 0;
      relList.textContent = '';
      relEmpty.hidden = true;
      relMore.hidden = true;
    } else {
      relMore.disabled = true;
    }

    setTabs(scope);

    fetch('/api/follow?scope=' + encodeURIComponent(scope) +
          '&uid=' + encodeURIComponent(REL.uid) + '&offset=' + REL.offset,
          { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json().then(function (d) { return { status: res.status, body: d }; }); })
      .then(function (r) {
        REL.busy = false;
        relMore.disabled = false;

        if (!r.body || !r.body.ok) {
          relEmpty.hidden = false;
          relEmpty.textContent = r.status === 401
            ? '登录状态已失效，请重新登录。'
            : '列表载入失败，稍后重试。';
          return;
        }

        if (r.body.counts) {
          SOC.followers = r.body.counts.followers;
          SOC.following = r.body.counts.following;
          paintSocial();
        }

        var items = r.body.items || [];
        REL.total = r.body.total || 0;
        REL.offset += items.length;
        items.forEach(function (it) { relList.appendChild(relItem(it)); });

        if (!REL.offset) {
          relEmpty.hidden = false;
          relEmpty.textContent = emptyText(scope);
        }

        relMore.hidden = !(r.body.hasMore && REL.offset < REL.total);
      })
      .catch(function () {
        REL.busy = false;
        relMore.disabled = false;
        relEmpty.hidden = false;
        relEmpty.textContent = '网络连接失败，请稍后刷新。';
      });
  }

  function setupSocial(uid) {
    if (!sheet) return;
    REL.uid = uid;

    if (!socialBound) {
      socialBound = true;

      Array.prototype.forEach.call(document.querySelectorAll('.set-soc__i'), function (b) {
        b.addEventListener('click', function () {
          openSheet(b.getAttribute('data-scope'));
        });
      });

      $('sheetClose').addEventListener('click', closeSheet);

      var mask = sheet.querySelector('.sheet__mask');
      if (mask) mask.addEventListener('click', closeSheet);

      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') closeSheet();
      });

      Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (tab) {
        tab.addEventListener('click', function () {
          var scope = tab.getAttribute('data-scope');
          if (scope === REL.scope && REL.offset > 0) return;
          loadRel(scope, false);
        });
      });

      if (relMore) {
        relMore.addEventListener('click', function () { loadRel(REL.scope, true); });
      }

      relList.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('.rel__act') : null;
        if (!btn || btn.disabled) return;

        var target = Number(btn.getAttribute('data-uid'));
        var wasFollowing = btn.getAttribute('data-following') === '1';

        btn.disabled = true;

        fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: target, act: wasFollowing ? 'unfollow' : 'follow' })
        })
          .then(function (res) {
            return res.json().then(function (d) { return { ok: res.ok, body: d }; });
          })
          .then(function (r) {
            if (r.ok && r.body.ok) {
              btn.setAttribute('data-following', r.body.following ? '1' : '0');
              btn.textContent = r.body.following ? '取消关注' : '关注';
              SOC.followers = r.body.followers;
              SOC.following = r.body.followees;
              paintSocial();
              say(r.body.following ? '已关注该用户' : '已取消关注');
              return;
            }
            btn.disabled = false;
            var err = r.body && r.body.error;
            if (err === 'unauthorized') say('登录状态已失效，请刷新页面');
            else if (err === 'self') say('不能关注自己');
            else if (err === 'restricted') say('该账户当前状态不可关注');
            else if (err === 'too_many') say('关注人数已达上限');
            else say('操作失败，请重试');
          })
          .catch(function () {
            btn.disabled = false;
            say('网络连接失败，操作未生效');
          });
      });
    }

    fetch('/api/follow?scope=following&uid=' + encodeURIComponent(uid),
          { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.counts) return;
        SOC.followers = d.counts.followers;
        SOC.following = d.counts.following;
        paintSocial();
      })
      .catch(function () {});

    if (isLocal) {
      var m = location.search.match(/[?&]sheet=(following|followers)\b/);
      if (m) setTimeout(function () { openSheet(m[1]); }, 400);
    }
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

  var NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_\-]{2,20}$/;

  $('formName').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var val = $('newName').value.trim();
    var err = $('nameErr');
    err.hidden = true;

    if (!NAME_RE.test(val)) {
      showErr('nameErr', '用户名需 2 至 20 个字符，可用中文、字母、数字、下划线或连字符。');
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
          showErr('nameErr', '格式不符合要求，2 至 20 个字符，可用中文、字母、数字、下划线或连字符。');
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

  /* ---------- 账户概览右侧：查找用户 ---------- */

  var findForm = $('findForm');
  var findInput = $('findInput');
  var findBtn = findForm.querySelector('button[type="submit"]');
  var findLabel = findBtn.textContent;
  var finding = false;

  findForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (finding) return;

    var q = findInput.value.trim();
    if (!q) {
      say('请输入 UID 或用户名。');
      return;
    }

    finding = true;
    findBtn.disabled = true;
    findBtn.textContent = '查找中';

    fetch('/api/pub/user?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (d) { return { status: res.status, body: d }; });
      })
      .then(function (r) {
        var err = r.body && r.body.error;
        if (r.status === 200 && r.body.ok && r.body.user) {
          say('找到 UID ' + r.body.user.uid + '「' + r.body.user.username + '」，正在进入主页…');
          location.href = '/space?uid=' + r.body.user.uid;
        } else if (err === 'not_found') {
          say('没有这个 UID 或用户名，检查一下再试。');
        } else if (err === 'gone') {
          say('该账户已注销，主页不再公开。');
        } else {
          say('查找失败，请稍后重试。');
        }
      })
      .catch(function () {
        say('网络连接失败，请检查网络后重试。');
      })
      .then(function () {
        finding = false;
        findBtn.disabled = false;
        findBtn.textContent = findLabel;
      });
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
    ip: '203.0.113.24',
    net: 'CN · 浙江 · 电信'
  };

  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  if (isLocal && /[?&]preview\b/.test(location.search)) {
    render(DEMO);
    setupSocial(DEMO.uid);
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
      setupSocial(data.user.uid);
      app.hidden = false;
    })
    .catch(function () {
      loading.hidden = true;
      say('网络连接失败，请检查网络后刷新。');
    });
})();
