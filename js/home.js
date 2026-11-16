/* ============================================================
   乘法 · 账户首页
   读取 /api/auth/me，渲染门面，未登录跳转登录页
   ============================================================ */
(function () {
  'use strict';

  var ROLES = { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };
  var STATUS = { active: '正常', frozen: '已冻结', banned: '已封禁' };
  var BIO_MAX = 200;

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');
  var toast = document.getElementById('toast');
  var bioEl = document.getElementById('bioText');

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

  /* ---------- 个人简介：点击即改 ---------- */

  var bioSaved = '';

  function paintBio(text) {
    bioSaved = text || '';
    bioEl.textContent = bioSaved;
    bioEl.classList.toggle('is-empty', !bioSaved);
  }

  function stopEdit() {
    bioEl.removeAttribute('contenteditable');
    bioEl.classList.remove('is-editing');
  }

  function saveBio(text) {
    bioEl.textContent = text;
    bioEl.classList.toggle('is-empty', !text);

    fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: text })
    })
      .then(function (res) {
        return res.json().then(function (d) { return { ok: res.ok, body: d }; });
      })
      .then(function (r) {
        if (r.ok && r.body.ok) {
          paintBio(r.body.user.bio);
          say('个人简介已保存');
        } else if (r.body && r.body.error === 'unauthorized') {
          paintBio(bioSaved);
          say('登录状态已失效，请刷新页面');
        } else {
          paintBio(bioSaved);
          say('保存失败，请重试');
        }
      })
      .catch(function () {
        paintBio(bioSaved);
        say('网络连接失败，简介未保存');
      });
  }

  if (bioEl) {
    bioEl.addEventListener('click', function () {
      if (bioEl.isContentEditable) return;
      bioEl.setAttribute('contenteditable', 'plaintext-only');
      bioEl.classList.add('is-editing');
      bioEl.focus();

      var range = document.createRange();
      range.selectNodeContents(bioEl);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    bioEl.addEventListener('blur', function () {
      if (!bioEl.isContentEditable) return;
      stopEdit();

      var text = (bioEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, BIO_MAX);
      if (text === bioSaved) {
        paintBio(bioSaved);
        return;
      }
      saveBio(text);
    });

    bioEl.addEventListener('keydown', function (ev) {
      if (!bioEl.isContentEditable) return;

      if (ev.key === 'Escape') {
        ev.preventDefault();
        paintBio(bioSaved);
        stopEdit();
        bioEl.blur();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        bioEl.blur();
      }
    });

    // 粘贴只取纯文本，避免带入外部样式
    bioEl.addEventListener('paste', function (ev) {
      if (!bioEl.isContentEditable) return;
      ev.preventDefault();
      var clip = ev.clipboardData || window.clipboardData;
      var text = clip ? clip.getData('text') : '';
      if (text) document.execCommand('insertText', false, text);
    });
  }

  /* ---------- 关注与粉丝 ---------- */

  var relList = $('relList');
  var relEmpty = $('relEmpty');
  var relMore = $('relMore');

  var REL = { scope: 'following', offset: 0, total: 0, busy: false };

  function paintCounts(c) {
    if (!c) return;
    $('tabFollow').textContent = c.following;
    $('tabFans').textContent = c.followers;
  }

  function relEmptyText(scope) {
    return scope === 'following'
      ? '还没有关注任何人。可在账户设置里按 UID 或用户名找到对方。'
      : '还没有人关注你。';
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

    var act = document.createElement('button');
    act.className = 'rel__act';
    act.type = 'button';
    act.setAttribute('data-uid', it.uid);
    act.setAttribute('data-following', it.following ? '1' : '0');
    act.textContent = it.following ? '取消关注' : '关注';
    li.appendChild(act);

    return li;
  }

  function loadRel(scope, append) {
    if (!relList || REL.busy) return;

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

    Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-scope') === scope);
    });

    var url = '/api/follow?scope=' + encodeURIComponent(scope) + '&offset=' + REL.offset;

    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (d) { return { status: res.status, body: d }; });
      })
      .then(function (r) {
        REL.busy = false;
        relMore.disabled = false;

        if (r.status === 401) {
          relEmpty.hidden = false;
          relEmpty.textContent = '登录状态已失效，请重新登录。';
          return;
        }

        if (!r.body || !r.body.ok) {
          relEmpty.hidden = false;
          relEmpty.textContent = '列表载入失败，稍后重试。';
          return;
        }

        paintCounts(r.body.counts);

        var items = r.body.items || [];
        REL.total = r.body.total || 0;
        REL.offset += items.length;

        items.forEach(function (it) { relList.appendChild(relItem(it)); });

        if (!REL.offset) {
          relEmpty.hidden = false;
          relEmpty.textContent = relEmptyText(scope);
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

  Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (tab) {
    tab.addEventListener('click', function () {
      var scope = tab.getAttribute('data-scope');
      if (scope === REL.scope && REL.offset > 0) return;
      loadRel(scope, false);
    });
  });

  if (relMore) {
    relMore.addEventListener('click', function () {
      loadRel(REL.scope, true);
    });
  }

  if (relList) {
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
            if (err === 'too_many') say('关注人数已达上限');
            else if (err === 'self') say('不能关注自己');
            else if (err === 'restricted') say('该账户当前状态不可关注');
            else say('操作失败，请重试');
            return;
          }

          paintCounts(r.body.mine);

          if (REL.scope === 'following' && wasFollowing) {
            var li = btn.closest('.rel__i');
            if (li) li.remove();
            REL.total = Math.max(0, REL.total - 1);
            REL.offset = Math.max(0, REL.offset - 1);
            if (!relList.children.length) {
              relEmpty.hidden = false;
              relEmpty.textContent = relEmptyText('following');
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

    $('uidText').textContent = user.uid;
    $('userName').textContent = user.username || '未命名';
    $('joinedAt').textContent = fmtDate(user.createdAt);
    $('statusText').textContent = STATUS[user.status] || user.status;

    var mineLink = $('mineLink');
    if (mineLink) mineLink.href = '/space?uid=' + encodeURIComponent(user.uid);

    var roleEl = $('roleText');
    roleEl.textContent = ROLES[user.role] || user.role;
    roleEl.setAttribute('data-role', user.role);

    paintBio(user.bio || '');

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

    requestAnimationFrame(function () {
      $('expBar').style.width = pct + '%';
    });
  }

  /* ---------- 本地预览 ---------- */
  /* 仅在本地开发服务器上带 ?preview 生效，用于检查版面，线上不触发 */

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
    bio: '这里填写个人简介。这段文字用于检查较长内容在版面中的换行表现。',
    createdAt: '2026-11-16T08:00:46Z'
  };

  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  if (isLocal && /[?&]preview\b/.test(location.search)) {
    render(DEMO);
    paintCounts({ following: 5, followers: 12 });
    [
      { uid: 2, username: '林一舟', role: 'user', level: 2, at: '2026-10-28T09:00:00Z', following: true },
      { uid: 7, username: '周与安', role: 'premium', level: 4, at: '2026-10-12T09:00:00Z', following: true }
    ].forEach(function (it) { relList.appendChild(relItem(it)); });
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
      loadRel('following', false);
    })
    .catch(function () {
      loading.hidden = true;
      say('网络连接失败，请检查网络后刷新。');
    });
})();
