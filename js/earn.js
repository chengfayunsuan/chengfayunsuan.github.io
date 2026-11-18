/* ============================================================
   乘法 · 赚积分（Moonetix 广告墙）
   奖励只能来自服务端回调：本脚本只负责取签名链接、打开墙、展示记录。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var toastEl = $('toast');
  var toastTimer = null;

  function say(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  function money(el, v) {
    if (!el) return;
    if (window.CF && CF.amount) CF.amount(el, v);
    else el.textContent = String(v == null ? '0' : v);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; }); })
      .catch(function () { return { status: 0, body: {} }; });
  }

  function postJSON(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(data || {})
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; }); })
      .catch(function () { return { status: 0, body: {} }; });
  }

  var me = null;
  var wall = null;
  var busy = false;

  /* ---------- 导航 ---------- */

  function paintNav(user) {
    var bal = $('navBal');
    var name = $('navName');
    if (bal) money(bal, user.fc);
    if (name) {
      name.textContent = user.username || '我';
      if (user.uid) name.href = '/space?uid=' + encodeURIComponent(user.uid);
    }
    money($('erFc'), user.fc);
    money($('erFrozen'), user.fcFrozen);
    if (window.CF && CF.cache) CF.cache.set(user);
  }

  /* ---------- 墙状态 ---------- */

  function paintWall() {
    var title = $('erTitle');
    var desc = $('erDesc');
    var state = $('erState');
    var dot = '<span class="er-dot"></span>';

    if (!wall) {
      state.className = 'er-wall__st';
      state.innerHTML = dot + '取不到状态，刷新试试';
      return;
    }

    if (wall.demo) {
      if (!wall.canTest) {
        title.textContent = '广告墙还没开放';
        desc.textContent = '接入第三方服务商之后，这里会出现可做的任务。现在的账户、问卷、兑换都不受影响——' +
          '问卷大厅和兑换码照常能用。';
        state.className = 'er-wall__st';
        state.innerHTML = dot + 'COMING / 待开放';
        var openBtn = $('mtxOpen');
        if (openBtn) {
          openBtn.disabled = true;
          openBtn.textContent = '尚未开放';
        }
        return;
      }
      title.textContent = '模拟墙（尚未接入真实服务商）';
      desc.textContent = '还没有配置 Moonetix 的 App ID 与签名密钥，这里先用站内模拟墙跑通整条链路：' +
        '点开墙、完成一件任务、看它走回调入账。配好密钥后这一页自动切到真实广告墙。';
      state.className = 'er-wall__st is-demo';
      state.innerHTML = dot + 'DEMO / 模拟模式（仅站长可见）';
    } else {
      title.textContent = 'Moonetix 广告墙已接入';
      desc.textContent = '链接由服务端用你的 UID 与签名盐生成，墙里显示的是与你的地区和设备匹配的任务。' +
        '完成后奖励由服务商回调本站入账，重复回调只入一次。';
      state.className = 'er-wall__st is-live';
      state.innerHTML = dot + 'LIVE / 已接入';
    }
  }

  function loadWall() {
    return getJSON('/api/moonetix/link').then(function (r) {
      if (r.status === 401) { location.replace('/login?next=/earn'); return; }
      if (r.body && r.body.ok) {
        wall = r.body;
        paintWall();
        return;
      }
      paintWallFail(r.body && r.body.error);
    }).catch(function () {
      paintWallFail('network');
    });
  }

  /* 拿不到链接也要给结论，不能把「正在检查接入状态…」一直挂在那儿 */
  function paintWallFail(code) {
    var title = $('erTitle');
    var desc = $('erDesc');
    var state = $('erState');
    var openBtn = $('mtxOpen');
    var dot = '<span class="er-dot"></span>';

    if (code === 'account_locked') {
      if (title) title.textContent = '账户受限，广告墙暂不可用';
      if (desc) desc.textContent = '冻结或封禁状态下不能参与广告墙。设置页的封禁记录里能看到原因，' +
        '觉得有误可以在联系客服提交工单。';
      if (state) { state.className = 'er-wall__st is-off'; state.innerHTML = dot + 'LIMITED / 账户受限'; }
    } else if (code === 'network') {
      if (title) title.textContent = '没连上服务端';
      if (desc) desc.textContent = '刷新页面重试。一直失败可以到联系客服反馈。';
      if (state) { state.className = 'er-wall__st is-off'; state.innerHTML = dot + 'OFFLINE / 连接失败'; }
    } else {
      if (title) title.textContent = '接入状态获取失败';
      if (desc) desc.textContent = '服务端没能返回广告墙链接。刷新重试；持续失败请提交工单。';
      if (state) { state.className = 'er-wall__st is-off'; state.innerHTML = dot + 'ERROR / 获取失败'; }
    }

    if (openBtn) { openBtn.disabled = true; openBtn.textContent = '暂不可用'; }
  }

  /* ---------- 记录 ---------- */

  function paintTasks(data) {
    var list = $('erList');
    var empty = $('erEmpty');
    var sum = $('erSum');
    var items = (data && data.items) || [];

    list.textContent = '';

    if (!items.length) {
      empty.hidden = false;
      if (sum) sum.textContent = '暂无记录';
      return;
    }
    empty.hidden = true;

    if (sum) {
      sum.textContent = '在账 ' + (data.summary && data.summary.total ? data.summary.total : '0') + ' · 共 ' + items.length + ' 笔';
    }

    items.forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'er-row';

      var at = document.createElement('span');
      at.className = 'er-row__at';
      at.textContent = fmtTime(t.at);
      row.appendChild(at);

      var m = document.createElement('div');
      m.className = 'er-row__m';

      var title = document.createElement('div');
      title.className = 'er-row__t';
      title.textContent = t.name;
      if (t.status === 2) {
        var tag = document.createElement('span');
        tag.className = 'er-tag is-rev';
        tag.textContent = '已冲正';
        title.appendChild(tag);
      }
      m.appendChild(title);

      var sub = document.createElement('div');
      sub.className = 'er-row__s';
      sub.textContent = t.tid;
      m.appendChild(sub);

      row.appendChild(m);

      var p = document.createElement('span');
      p.className = 'er-row__p';
      var b = document.createElement('b');
      if (t.status === 2) b.className = 'is-out';
      if (window.CF && CF.amount) CF.amount(b, t.reward);
      else b.textContent = String(t.reward);
      p.appendChild(b);
      var u = document.createElement('i');
      u.setAttribute('data-cur', 'code');
      u.textContent = 'CFB';
      p.appendChild(u);
      row.appendChild(p);

      list.appendChild(row);
    });
  }

  function loadTasks() {
    return getJSON('/api/moonetix/tasks').then(function (r) {
      if (r.body && r.body.ok) paintTasks(r.body);
    });
  }

  function refresh() {
    return getJSON('/api/auth/me').then(function (r) {
      if (r.status === 401) { location.replace('/login?next=/earn'); return null; }
      if (r.body && r.body.ok) { me = r.body.user; paintNav(me); }
      return me;
    });
  }

  /* ---------- 打开墙 ---------- */

  function openWall() {
    if (busy || !wall) { say('正在准备链接，稍等一秒'); return; }
    busy = true;
    var btn = $('mtxOpen');
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '生成链接…';

    loadWall().then(function () {
      btn.disabled = false;
      btn.textContent = old;
      busy = false;
      if (!wall || !wall.url) return;

      if (wall.demo) {
        location.href = wall.url;
        return;
      }
      window.open(wall.url, '_blank', 'noopener');
      say('已在新的标签页打开，完成后回来刷新');
    });
  }

  /* ---------- 启动 ---------- */

  var openBtn = $('mtxOpen');
  if (openBtn) openBtn.addEventListener('click', openWall);

  refresh().then(function (user) {
    if (!user) return;
    loadWall();
    loadTasks();
  });

  /* 从墙回来时：余额和记录都该是最新的 */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    refresh();
    loadTasks();
  });

  window.addEventListener('focus', function () {
    refresh();
    loadTasks();
  });
})();
