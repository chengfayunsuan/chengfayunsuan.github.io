/* ============================================================
   乘法 · 用户公开主页
   数据来自 /api/pub/user；关注与粉丝只占两行数字，
   点开是小窗口，列表来自 /api/follow
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

  var relList = document.getElementById('relList');
  var relEmpty = document.getElementById('relEmpty');
  var relMore = document.getElementById('relMore');
  var sheet = document.getElementById('relSheet');

  var state = {
    uid: null,
    social: { followers: 0, following: 0 },
    viewer: { self: false, signedIn: false, following: false }
  };

  var REL = { scope: 'following', offset: 0, total: 0, busy: false };

  function $(id) { return document.getElementById(id); }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* 余额小数末尾的 0 不显示：0.0000 -> 0，128.4500 -> 128.45 */
  function trimNum(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
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

  /* ---------- 空态 ---------- */

  function showNone(title, desc) {
    loading.hidden = true;
    app.hidden = true;
    none.hidden = false;
    $('noneT').textContent = title;
    $('noneD').textContent = desc;
    document.title = title + ' · 乘法';
  }

  /* ---------- 关注与粉丝数字 ---------- */

  function paintSocial() {
    var f = state.social;
    $('fansN').textContent = f.followers;
    $('followN').textContent = f.following;
    $('tabFans').textContent = f.followers;
    $('tabFollow').textContent = f.following;
  }

  /* ---------- 关注按钮 ---------- */

  function paintFollow(on) {
    state.viewer.following = on;
    var btn = $('followBtn');
    if (!btn) return;
    btn.textContent = on ? '已关注' : '关注';
    btn.classList.toggle('is-on', on);
    btn.disabled = false;
  }

  function setupFollow() {
    var box = $('followBox');
    var btn = $('followBtn');

    if (state.viewer.self) {
      box.hidden = true;
      return;
    }

    box.hidden = false;

    if (!state.viewer.signedIn) {
      btn.textContent = '登录后关注';
      btn.addEventListener('click', function () {
        location.href = '/login';
      });
      return;
    }

    paintFollow(state.viewer.following);

    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true;

      var act = state.viewer.following ? 'unfollow' : 'follow';

      fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: Number(state.uid), act: act })
      })
        .then(function (res) {
          return res.json().then(function (d) { return { ok: res.ok, body: d }; });
        })
        .then(function (r) {
          if (r.ok && r.body.ok) {
            state.social.followers = r.body.followers;
            state.social.following = r.body.followees;
            paintSocial();
            paintFollow(r.body.following);
            say(r.body.following ? '已关注该用户' : '已取消关注');

            /* 关系变了，窗口开着就按新状态重取 */
            if (!sheet.hidden) loadRel(REL.scope, false);
            return;
          }

          btn.disabled = false;

          var err = r.body && r.body.error;
          if (err === 'unauthorized') {
            say('登录状态已失效，请刷新页面');
          } else if (err === 'self') {
            say('不能关注自己');
          } else if (err === 'restricted') {
            say('该账户当前状态不可关注');
          } else if (err === 'too_many') {
            say('关注人数已达上限');
          } else if (err === 'not_found') {
            say('该用户不存在');
          } else {
            say('操作失败，请重试');
          }
        })
        .catch(function () {
          btn.disabled = false;
          say('网络连接失败，操作未生效');
        });
    });
  }

  /* ---------- 小窗口 ---------- */

  var lastFocus = null;

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

  if (sheet) {
    $('sheetClose').addEventListener('click', closeSheet);

    var mask = sheet.querySelector('.sheet__mask');
    if (mask) mask.addEventListener('click', closeSheet);

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeSheet();
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.sp-soc__i'), function (b) {
    b.addEventListener('click', function () {
      openSheet(b.getAttribute('data-scope'));
    });
  });

  /* ---------- 关系列表 ---------- */

  function setTabs(scope) {
    Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-scope') === scope);
    });
  }

  function emptyText(scope) {
    if (state.viewer.self) {
      return scope === 'followers' ? '还没有人关注你。' : '还没有关注任何人。';
    }
    return scope === 'followers' ? '该账户还没有粉丝。' : '该账户还没有关注任何人。';
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

    var isSelfRow = String(it.uid) === String(state.uid);

    if (state.viewer.signedIn && !isSelfRow) {
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
    if (REL.busy) return;

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

    var url =
      '/api/follow?scope=' + encodeURIComponent(scope) +
      '&uid=' + encodeURIComponent(state.uid) +
      '&offset=' + REL.offset;

    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (d) { return { status: res.status, body: d }; });
      })
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
          state.social.followers = r.body.counts.followers;
          state.social.following = r.body.counts.following;
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

        /* 在自己的关注列表里取关，条目应当消失 */
        if (state.viewer.self && REL.scope === 'following' && wasFollowing) {
          var li = btn.closest('.rel__i');
          if (li) li.remove();

          REL.total = Math.max(0, REL.total - 1);
          REL.offset = Math.max(0, REL.offset - 1);
          state.social.following = Math.max(0, state.social.following - 1);
          paintSocial();

          if (!relList.children.length) {
            relEmpty.hidden = false;
            relEmpty.textContent = emptyText('following');
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

  /* ---------- 提现记录 ---------- */

  function renderPayouts(p) {
    var data = p || { count: 0, total: '0.0000', lastAt: null, items: [] };

    $('poCount').textContent = data.count || 0;
    $('poTotal').textContent = trimNum(data.total || '0');
    $('poLast').textContent = data.lastAt ? fmtDate(data.lastAt) : '—';

    var list = $('poList');
    list.textContent = '';

    var items = data.items || [];

    items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'po__i';

      var amt = document.createElement('span');
      amt.className = 'po__amt';
      amt.textContent = trimNum(it.amount);
      var unit = document.createElement('i');
      unit.setAttribute('data-cur', 'code');
      unit.textContent = 'FC';
      amt.appendChild(unit);

      var ch = document.createElement('span');
      ch.className = 'po__ch';
      ch.textContent = it.channel;

      var at = document.createElement('span');
      at.className = 'po__at';
      at.textContent = fmtDate(it.at);

      li.appendChild(amt);
      li.appendChild(ch);
      li.appendChild(at);
      list.appendChild(li);
    });

    $('poEmpty').hidden = items.length > 0;
  }

  /* ---------- 渲染 ---------- */

  function render(u) {
    document.title = (u.username || '用户') + ' · 乘法';

    state.uid = u.uid;
    state.viewer = u.viewer || { self: false, signedIn: false, following: false };
    state.social = u.social || { followers: 0, following: 0 };

    $('uid').textContent = u.uid;
    $('name').textContent = u.username || '未命名';

    var role = u.role || 'user';
    var roleEl = $('role');
    roleEl.textContent = ROLES[role] || role;
    roleEl.setAttribute('data-role', role);

    $('status').textContent = STATUS[u.status] || u.status || '—';
    $('statusBox').classList.toggle('is-bad', u.status !== 'active');

    if (u.restricted) {
      $('sub').hidden = true;
      $('restrictNote').hidden = false;
      $('restrictNote').textContent = RESTRICT_TEXT[u.status] || '该账户当前状态异常，公开资料不展示。';
      $('bio').hidden = true;
      $('socialRow').hidden = true;
      $('followBox').hidden = true;
      $('payoutSec').hidden = true;
      var lvBox = document.querySelector('.sp-side');
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

    /* 余额是这块的主数字，位数多了要缩字号，免得撑破格子 */
    var fcText = trimNum(u.fc == null ? '0' : u.fc);
    var fcEl = $('fc');
    fcEl.textContent = fcText;
    fcEl.classList.toggle('is-long', fcText.length > 7);

    $('fcFrozen').textContent = trimNum(u.fcFrozen == null ? '0' : u.fcFrozen);

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

    paintSocial();
    setupFollow();
    renderPayouts(u.payouts);

    if (state.viewer.self) {
      $('selfNote').hidden = false;
    }
  }

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
    fc: '218.65',
    fcFrozen: '20',
    level: 2,
    exp: 240,
    affinity: 7,
    bio: '抽空填问卷，偶尔写点东西。对长问卷有耐心，对诱导性提问没有。',
    joinedMonth: '2026 年 10 月',
    joinedDays: 28,
    social: { followers: 12, following: 5 },
    payouts: {
      count: 3,
      total: '46.5000',
      lastAt: '2026-11-12T09:20:00Z',
      items: [
        { amount: '20.0000', channel: '支付宝', at: '2026-11-12T09:20:00Z' },
        { amount: '16.5000', channel: '微信', at: '2026-10-28T14:02:00Z' },
        { amount: '10.0000', channel: '支付宝', at: '2026-10-05T11:41:00Z' }
      ]
    },
    viewer: { self: false, signedIn: true, following: false }
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
      $('navBal').textContent = trimNum(me.fc);
      $('navName').textContent = me.username || '我';

      /* 站长与管理员点左上角乘法进后台 */
      var brand = document.querySelector('.brand');
      if (brand && (me.role === 'owner' || me.role === 'admin')) brand.setAttribute('href', '/admin');
      if (String(me.uid) === uid) $('selfNote').hidden = false;
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

      /* 本地开发：?sheet=following|followers 直接展开小窗口，便于检查版面 */
      if (isLocal) {
        var m = location.search.match(/[?&]sheet=(following|followers)\b/);
        if (m) setTimeout(function () { openSheet(m[1]); }, 400);
      }

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
