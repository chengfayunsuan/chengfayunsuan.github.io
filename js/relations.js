/* ============================================================
   乘法 · 关注与粉丝列表页
   数据来自 /api/pub/user（用户名与计数）与 /api/follow（列表）
   ============================================================ */
(function () {
  'use strict';

  var ROLES = { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');
  var none = document.getElementById('none');
  var toast = document.getElementById('toast');

  var relList = document.getElementById('relList');
  var relEmpty = document.getElementById('relEmpty');
  var relMore = document.getElementById('relMore');

  var state = {
    uid: null,
    scope: 'followers',
    self: false,
    signedIn: false,
    meUid: null,
    offset: 0,
    total: 0,
    busy: false
  };

  function $(id) { return document.getElementById(id); }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }

  var toastTimer = null;

  function say(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2400);
  }

  function showNone(title, desc, eyebrow) {
    loading.hidden = true;
    app.hidden = true;
    none.hidden = false;
    $('noneT').textContent = title;
    $('noneD').textContent = desc;
    $('noneK').textContent = eyebrow || 'NO SUCH USER';
    document.title = title + ' · 乘法';
  }

  /* ---------- 计数 ---------- */

  var counts = { followers: 0, following: 0 };

  function paintCounts() {
    $('tabFans').textContent = counts.followers;
    $('tabFollow').textContent = counts.following;
    $('sumFans').textContent = counts.followers;
    $('sumFollow').textContent = counts.following;
  }

  function paintTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-scope') === state.scope);
    });
  }

  /* ---------- 列表 ---------- */

  function itemNode(it) {
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

    var isSelfRow = state.meUid !== null && String(it.uid) === String(state.meUid);

    if (state.signedIn && !isSelfRow) {
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

  function emptyText() {
    var own = state.self;
    if (state.scope === 'followers') {
      return own ? '还没有人关注你。' : '该账户还没有粉丝。';
    }
    return own ? '还没有关注任何人。可在账户设置里按 UID 或用户名找到对方。' : '该账户还没有关注任何人。';
  }

  function failText(status, body) {
    var err = body && body.error;
    if (status === 401) return '登录状态已失效，请重新登录。';
    if (err === 'restricted') return '该账户当前状态不可查看。';
    if (err === 'not_found') return '该账户不存在。';
    return '列表载入失败，稍后重试。';
  }

  function load(append) {
    if (state.busy) return;
    state.busy = true;

    if (!append) {
      state.offset = 0;
      relList.textContent = '';
      relEmpty.hidden = true;
      relMore.hidden = true;
    } else {
      relMore.disabled = true;
    }

    paintTabs();

    var url =
      '/api/follow?scope=' + encodeURIComponent(state.scope) +
      '&uid=' + encodeURIComponent(state.uid) +
      '&offset=' + state.offset;

    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (d) { return { status: res.status, body: d }; });
      })
      .then(function (r) {
        state.busy = false;
        relMore.disabled = false;

        if (!r.body || !r.body.ok) {
          relEmpty.hidden = false;
          relEmpty.textContent = failText(r.status, r.body);
          return;
        }

        if (r.body.counts) {
          counts.followers = r.body.counts.followers;
          counts.following = r.body.counts.following;
          paintCounts();
        }

        var items = r.body.items || [];
        state.total = r.body.total || 0;
        state.offset += items.length;

        items.forEach(function (it) { relList.appendChild(itemNode(it)); });

        if (!state.offset) {
          relEmpty.hidden = false;
          relEmpty.textContent = emptyText();
        }

        relMore.hidden = !(r.body.hasMore && state.offset < state.total);
      })
      .catch(function () {
        state.busy = false;
        relMore.disabled = false;
        relEmpty.hidden = false;
        relEmpty.textContent = '网络连接失败，请稍后刷新。';
      });
  }

  /* ---------- 切换页签 ---------- */

  Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (tab) {
    tab.addEventListener('click', function () {
      var scope = tab.getAttribute('data-scope');
      if (scope === state.scope && state.offset > 0) return;

      state.scope = scope;

      if (window.history && history.replaceState) {
        history.replaceState(null, '',
          '/relations?uid=' + encodeURIComponent(state.uid) + '&scope=' + scope);
      }

      load(false);
    });
  });

  relMore.addEventListener('click', function () { load(true); });

  /* ---------- 行内关注 ---------- */

  relList.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('.rel__act') : null;
    if (!btn || btn.disabled) return;

    var uid = Number(btn.getAttribute('data-uid'));
    var wasFollowing = btn.getAttribute('data-following') === '1';

    btn.disabled = true;

    fetch('/api/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: uid, act: wasFollowing ? 'unfollow' : 'follow' })
    })
      .then(function (res) {
        return res.json().then(function (d) { return { ok: res.ok, body: d }; });
      })
      .then(function (r) {
        btn.disabled = false;

        if (!r.ok || !r.body.ok) {
          var err = r.body && r.body.error;
          if (err === 'unauthorized') say('登录状态已失效，请刷新页面');
          else if (err === 'too_many') say('关注人数已达上限');
          else if (err === 'self') say('不能关注自己');
          else if (err === 'restricted') say('该账户当前状态不可关注');
          else say('操作失败，请重试');
          return;
        }

        /* 自己取关自己关注的人，条目应从关注列表里消失 */
        if (state.self && state.scope === 'following' && wasFollowing) {
          var li = btn.closest('.rel__i');
          if (li) li.remove();

          state.total = Math.max(0, state.total - 1);
          state.offset = Math.max(0, state.offset - 1);
          counts.following = Math.max(0, counts.following - 1);
          paintCounts();

          if (!relList.children.length) {
            relEmpty.hidden = false;
            relEmpty.textContent = emptyText();
          }

          say('已取消关注');
          return;
        }

        btn.setAttribute('data-following', r.body.following ? '1' : '0');
        btn.textContent = r.body.following ? '取消关注' : '关注';
        say(r.body.following ? '已关注' : '已取消关注');
      })
      .catch(function () {
        btn.disabled = false;
        say('网络连接失败，操作未生效');
      });
  });

  /* ---------- 导航 ---------- */

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

  /* ---------- 取数 ---------- */

  var params = new URLSearchParams(location.search);
  var uidRaw = (params.get('uid') || '').trim();
  var scopeRaw = params.get('scope') === 'following' ? 'following' : 'followers';

  if (!uidRaw) {
    showNone('缺少 UID', '列表地址需要带上 UID，例如 /relations?uid=1。', 'MISSING UID');
    return;
  }
  if (!/^\d+$/.test(uidRaw)) {
    showNone('UID 格式不正确', 'UID 是一串数字，从 1 开始。', 'INVALID UID');
    return;
  }

  state.uid = Number(uidRaw);
  state.scope = scopeRaw;

  var meReq = fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
    .then(function (res) {
      if (!res.ok) return null;
      return res.json().then(function (d) { return d && d.ok ? d.user : null; });
    })
    .catch(function () { return null; });

  var infoReq = fetch('/api/pub/user?uid=' + encodeURIComponent(uidRaw), {
    headers: { Accept: 'application/json' }
  })
    .then(function (res) {
      return res.json().then(function (d) { return { status: res.status, body: d }; });
    })
    .catch(function () { return { status: 0, body: null }; });

  Promise.all([meReq, infoReq]).then(function (out) {
    var me = out[0];
    var r = out[1];

    if (me) {
      state.signedIn = true;
      state.meUid = me.uid;
      $('navGuest').hidden = true;
      $('navAuthed').hidden = false;
      $('navBal').textContent = me.fc;
      $('navName').textContent = me.username || '我';
      state.self = String(me.uid) === uidRaw;
    }

    if (r.status === 0) {
      loading.hidden = true;
      say('网络连接失败，请检查网络后刷新');
      return;
    }

    var u = r.body && r.body.ok ? r.body.user : null;

    if (r.status === 200 && u) {
      /* 封禁与冻结的账户不展开关系 */
      if (u.restricted) {
        showNone('该账户当前状态不可查看', '封禁或冻结的账户，关注与粉丝关系不再展示。', 'NOT AVAILABLE');
        return;
      }

      document.title = (u.username || '用户') + ' 的关注与粉丝 · 乘法';
      $('rlName').textContent = u.username || '未命名';
      $('rlUid').textContent = 'UID ' + u.uid;

      if (u.social) {
        counts.followers = u.social.followers || 0;
        counts.following = u.social.following || 0;
        paintCounts();
      }

      var back = $('backLink');
      var links = '/space?uid=' + encodeURIComponent(uidRaw);
      if (back) back.href = links;
      $('noneHome').href = state.self ? '/home' : links;

      loading.hidden = true;
      app.hidden = false;
      load(false);
      return;
    }

    var err = r.body && r.body.error;
    if (err === 'gone') {
      showNone('该账户已注销', '账户注销后，关注与粉丝关系不再展示。', 'ACCOUNT CLOSED');
    } else if (err === 'not_found') {
      showNone('没有这个用户', 'UID 可能写错了。UID 从 1 开始，按注册顺序发放。', 'NO SUCH USER');
    } else if (err === 'invalid_query') {
      showNone('UID 格式不正确', 'UID 是一串数字，从 1 开始。', 'INVALID UID');
    } else {
      showNone('列表载入失败', '服务暂时不可用，稍后刷新重试。', 'LOAD FAILED');
    }
  });
})();
