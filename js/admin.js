/* ============================================================
   乘法 · 运营后台逻辑
   admin / admin-users / admin-withdrawals 三页共用。
   仅站长（owner）与管理员（admin）可用，其余跳回账户首页。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function trimNum(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }


  /* 金额显示统一走 CF，切换币种时由 CF.refresh 重刷所有 data-cfb 节点 */
  function setAmt(el, v) {
    if (window.CF && CF.amount) CF.amount(el, v);
    else if (el) el.textContent = trimNum(v);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  var toastEl = $('toast');
  var toastTimer = null;

  function say(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.json().then(function (d) { return { status: r.status, body: d }; });
      })
      .catch(function () { return { status: 0, body: null }; });
  }

  function postJSON(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data || {})
    })
      .then(function (r) {
        return r.json().then(function (d) { return { status: r.status, body: d }; });
      })
      .catch(function () { return { status: 0, body: null }; });
  }

  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var preview = isLocal && /[?&]preview\b/.test(location.search);

  var ROLE = { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };
  var STATUS = { active: '正常', frozen: '冻结', banned: '封禁' };
  var KIND = {
    signup_bonus: '注册赠送', survey_reward: '问卷奖励', survey_reject: '答卷驳回',
    withdraw_lock: '提现冻结', withdraw_refund: '提现退回', withdraw_paid: '提现完成',
    cdk_redeem: '兑换 CDK', admin_adjust: '人工调整', penalty: '违规扣罚'
  };
  var CHANNEL = { alipay: '支付宝', wechat: '微信', paypal: 'PayPal', payoneer: 'Payoneer' };
  var TICKET_TYPE = { account: '账户与登录', balance: '余额与提现', survey: '问卷与奖励', report: '举报与申诉', other: '其他' };

  /* ---------- 预览数据 ---------- */

  var DEMO_ME = { uid: 1, username: 'chengfa', role: 'owner', fc: '1280.4', fcFrozen: '0' };

  var DEMO_OVERVIEW = {
    ok: true,
    users: { total: 42, active: 39, frozen: 2, banned: 1, today: 3 },
    money: { available: '3421.65', frozen: '96.5' },
    withdrawals: { pending: 2, amount: '46.5' },
    recent: [
      { at: '2026-11-16T12:20:00Z', uid: 2, username: '林一舟', kind: 'survey_reward', delta: '12', memo: '城市通勤调研' },
      { at: '2026-11-16T10:02:00Z', uid: 23, username: '许临', kind: 'admin_adjust', delta: '3', memo: '问卷补发差额' },
      { at: '2026-11-15T19:41:00Z', uid: 17, username: '沈知白', kind: 'withdraw_lock', delta: '-20', memo: '提现申请' }
    ]
  };

  var DEMO_USERS = {
    ok: true,
    items: [
      { uid: 1, username: 'chengfa', email: 'chengfa@chengfa.cc', role: 'owner', status: 'active', fc: '1280.4', fcFrozen: '0', level: 9, createdAt: '2026-10-01T09:00:00Z' },
      { uid: 17, username: '沈知白', email: 'shen@chengfa.cc', role: 'premium', status: 'active', fc: '864.2', fcFrozen: '20', level: 7, createdAt: '2026-10-12T11:20:00Z' },
      { uid: 23, username: '许临', email: 'xu@chengfa.cc', role: 'user', status: 'frozen', fc: '96.4', fcFrozen: '0', level: 2, createdAt: '2026-11-02T15:00:00Z' }
    ]
  };

  var DEMO_WD = {
    ok: true,
    pending: 2,
    items: [
      { id: 'W20261116002', uid: 17, username: '沈知白', amount: '26.5', channel: 'alipay', account: 'shen@pay.example', status: 'pending', createdAt: '2026-11-16T11:30:00Z' },
      { id: 'W20261116001', uid: 2, username: '林一舟', amount: '20', channel: 'wechat', account: 'wx_pay_88', status: 'pending', createdAt: '2026-11-16T09:12:00Z' },
      { id: 'W20261112001', uid: 2, username: '林一舟', amount: '12', channel: 'alipay', account: 'lin@pay.example', status: 'paid', createdAt: '2026-11-12T08:00:00Z', reviewedAt: '2026-11-12T10:00:00Z' }
    ]
  };

  /* ---------- 导航与守卫 ---------- */

  function paintNav(me) {
    var bal = $('navBal');
    var name = $('navName');
    if (bal) setAmt(bal, me.fc);
    if (name) name.textContent = me.username || '我';
    /* 后台页左上角「乘法」回账户首页 /home，HTML 里已是 /home，这里不覆盖 */
  }

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

  function isAdmin(me) { return me && (me.role === 'owner' || me.role === 'admin'); }

  /* ---------- 通用： soon 按钮 ---------- */

  document.querySelectorAll('[data-soon]').forEach(function (el) {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      say(el.getAttribute('data-soon') + ' · 待建，接口与表结构未开放');
    });
  });

  /* ---------- 概览 ---------- */

  function initOverview(me) {
    var roleEl = $('ovRole');
    var whoEl = $('ovWho');
    if (roleEl) roleEl.textContent = ROLE[me.role] || me.role;
    if (whoEl) whoEl.textContent = me.username || '当前操作者';

    function paint(d) {
      $('stUsers').textContent = d.users.total;
      $('stToday').textContent = d.users.today;
      var money = Number(d.money.available) + Number(d.money.frozen);
      setAmt($('stMoney'), String(money));
      setAmt($('stFrozen'), d.money.frozen);
      $('stWd').textContent = d.withdrawals.pending;
      setAmt($('stWdAmount'), d.withdrawals.amount);
      $('stActive').textContent = d.users.active;
      $('stFrozenN').textContent = d.users.frozen;
      $('stBanned').textContent = d.users.banned;

      var box = $('ovLedger');
      box.textContent = '';
      d.recent.forEach(function (it) {
        var row = document.createElement('div');
        row.className = 'adm-tr adm-tr--lg';

        var at = document.createElement('span');
        at.className = 'adm-cell adm-cell--mono';
        at.textContent = fmtTime(it.at);

        var who = document.createElement('span');
        who.className = 'adm-cell';
        who.innerHTML = '';
        var a = document.createElement('a');
        a.href = '/space?uid=' + encodeURIComponent(it.uid);
        a.textContent = it.username + ' · ' + it.uid;
        a.style.color = 'inherit';
        who.appendChild(a);

        var k = document.createElement('span');
        k.className = 'adm-cell';
        k.textContent = KIND[it.kind] || it.kind;

        var dlt = document.createElement('span');
        dlt.className = 'adm-cell adm-cell--num';
        dlt.style.color = Number(it.delta) < 0 ? 'var(--red-deep)' : 'var(--ink)';
        dlt.textContent = (Number(it.delta) < 0 ? '−' : '+') + trimNum(it.delta);

        var memo = document.createElement('span');
        memo.className = 'adm-cell';
        memo.textContent = it.memo || '—';

        row.appendChild(at); row.appendChild(who); row.appendChild(k);
        row.appendChild(dlt); row.appendChild(memo);
        box.appendChild(row);
      });
      $('ovEmpty').hidden = d.recent.length > 0;
    }

    if (preview) { paint(DEMO_OVERVIEW); return; }

    getJSON('/api/admin/overview').then(function (r) {
      if (r.body && r.body.ok) { paint(r.body); return; }
      say('概览载入失败，请刷新重试');
    });
  }

  /* ---------- 用户管理 ---------- */

  function initUsers(me) {
    var list = $('usList');
    var empty = $('usEmpty');
    var qInput = $('usQ');

    function tagEl(text, cls) {
      var s = document.createElement('span');
      s.className = 'adm-tag' + (cls ? ' ' + cls : '');
      s.textContent = text;
      return s;
    }

    function paint(items) {
      list.textContent = '';
      $('usCount').textContent = items.length;

      items.forEach(function (u) {
        var row = document.createElement('div');
        row.className = 'adm-tr adm-tr--user';

        var uid = document.createElement('span');
        uid.className = 'adm-cell adm-cell--mono';
        uid.textContent = u.uid;

        var who = document.createElement('span');
        who.className = 'adm-cell';
        var b = document.createElement('b');
        b.textContent = u.username || '未命名';
        var sub = document.createElement('span');
        sub.className = 'adm-sub';
        sub.textContent = ' ' + u.email;
        who.appendChild(b);
        who.appendChild(sub);

        var role = document.createElement('span');
        role.className = 'adm-cell';
        role.textContent = ROLE[u.role] || u.role;

        var st = document.createElement('span');
        st.appendChild(tagEl(STATUS[u.status] || u.status,
          u.status === 'banned' ? 'is-banned' : (u.status === 'frozen' ? 'is-frozen' : '')));

        var fc = document.createElement('span');
        fc.className = 'adm-cell adm-cell--num';
        setAmt(fc, u.fc);
        var fu = document.createElement('i');
        fu.setAttribute('data-cur', 'code');
        fu.textContent = 'CFB';
        fc.appendChild(fu);

        var fr = document.createElement('span');
        fr.className = 'adm-cell adm-cell--num';
        setAmt(fr, u.fcFrozen);
        var fru = document.createElement('i');
        fru.setAttribute('data-cur', 'code');
        fru.textContent = 'CFB';
        fr.appendChild(fru);

        /* 展开面板：调整法币 / 状态 / 角色 */
        var exp = document.createElement('div');
        exp.className = 'adm-expand';

        var g1 = document.createElement('div');
        g1.className = 'adm-exp__g';
        var k1 = document.createElement('span');
        k1.className = 'adm-exp__k';
        k1.textContent = '调整法币';
        var inN = document.createElement('input');
        inN.type = 'number'; inN.step = '0.0001'; inN.placeholder = '±金额';
        inN.style.width = '130px';
        var inM = document.createElement('input');
        inM.type = 'text'; inM.placeholder = '备注（写入流水）';
        inM.style.flex = '1 1 200px';
        var btnAdj = document.createElement('button');
        btnAdj.className = 'btn btn--red btn--s';
        btnAdj.type = 'button';
        btnAdj.textContent = '执行调整';
        g1.appendChild(k1); g1.appendChild(inN); g1.appendChild(inM); g1.appendChild(btnAdj);

        var g2 = document.createElement('div');
        g2.className = 'adm-exp__g';
        var k2 = document.createElement('span');
        k2.className = 'adm-exp__k';
        k2.textContent = '账户状态';
        g2.appendChild(k2);
        ['active', 'frozen', 'banned'].forEach(function (s) {
          var btn = document.createElement('button');
          btn.className = 'btn btn--ghost btn--s';
          btn.type = 'button';
          btn.textContent = STATUS[s];
          if (u.status === s) btn.disabled = true;
          btn.addEventListener('click', function () {
            postJSON('/api/admin/users/status', { uid: u.uid, status: s }).then(function (r) {
              if (r.body && r.body.ok) { say('状态已改为 ' + STATUS[s]); load(qInput.value); }
              else say('操作失败：' + (r.body && r.body.error || '网络错误'));
            });
          });
          g2.appendChild(btn);
        });

        var g3 = document.createElement('div');
        g3.className = 'adm-exp__g';
        var k3 = document.createElement('span');
        k3.className = 'adm-exp__k';
        k3.textContent = '角色';
        g3.appendChild(k3);
        var sel = document.createElement('select');
        Object.keys(ROLE).forEach(function (rk) {
          var opt = document.createElement('option');
          opt.value = rk;
          opt.textContent = ROLE[rk];
          if (u.role === rk) opt.selected = true;
          sel.appendChild(opt);
        });
        if (me.role !== 'owner') {
          sel.disabled = true;
          sel.title = '仅站长可修改角色';
        }
        var btnRole = document.createElement('button');
        btnRole.className = 'btn btn--ghost btn--s';
        btnRole.type = 'button';
        btnRole.textContent = '应用角色';
        if (me.role !== 'owner') btnRole.disabled = true;
        btnRole.addEventListener('click', function () {
          postJSON('/api/admin/users/role', { uid: u.uid, role: sel.value }).then(function (r) {
            if (r.body && r.body.ok) { say('角色已改为 ' + ROLE[sel.value]); load(qInput.value); }
            else say('操作失败：' + (r.body && r.body.error || '网络错误'));
          });
        });
        g3.appendChild(sel); g3.appendChild(btnRole);

        exp.appendChild(g1); exp.appendChild(g2); exp.appendChild(g3);

        btnAdj.addEventListener('click', function () {
          var delta = Number(inN.value);
          if (!delta) { say('请先填调整金额，正加负减'); return; }
          postJSON('/api/admin/users/adjust', { uid: u.uid, delta: delta, memo: inM.value }).then(function (r) {
            if (r.body && r.body.ok) { say('已调整，最新余额 ' + r.body.fc + ' CFB'); load(qInput.value); }
            else say('操作失败：' + (r.body && r.body.error || '网络错误'));
          });
        });

        row.appendChild(uid); row.appendChild(who); row.appendChild(role);
        row.appendChild(st); row.appendChild(fc); row.appendChild(fr);
        row.appendChild(exp);

        row.addEventListener('click', function (ev) {
          if (ev.target.closest('.adm-expand') || ev.target.tagName === 'INPUT' ||
              ev.target.tagName === 'SELECT' || ev.target.tagName === 'BUTTON') return;
          row.classList.toggle('is-open');
        });

        list.appendChild(row);
      });

      empty.hidden = items.length > 0;
    }

    function load(q) {
      if (preview) {
        var demo = DEMO_USERS.items.filter(function (u) {
          return !q || String(u.uid) === q || (u.username || '').indexOf(q) >= 0 || u.email.indexOf(q) >= 0;
        });
        paint(demo.length ? demo : DEMO_USERS.items);
        return;
      }

      getJSON('/api/admin/users?q=' + encodeURIComponent(q || '')).then(function (r) {
        if (r.body && r.body.ok) { paint(r.body.items || []); return; }
        say('账户载入失败，请刷新重试');
        empty.hidden = false;
      });
    }

    $('usGo').addEventListener('click', function () { load(qInput.value.trim()); });
    qInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') load(qInput.value.trim());
    });

    load('');
  }

  /* ---------- 提现审核 ---------- */

  function initWithdrawals(me) {
    var list = $('wdList');
    var empty = $('wdEmpty');
    var status = 'pending';
    var items = [];

    function tagEl(text, cls) {
      var s = document.createElement('span');
      s.className = 'adm-tag' + (cls ? ' ' + cls : '');
      s.textContent = text;
      return s;
    }

    function paint() {
      list.textContent = '';
      var shown = status === 'pending' ? items.filter(function (it) { return it.status === 'pending'; }) : items;
      $('wdPending').textContent = items.filter(function (it) { return it.status === 'pending'; }).length;

      shown.forEach(function (w) {
        var row = document.createElement('div');
        row.className = 'adm-tr adm-tr--wd';

        var id = document.createElement('span');
        id.className = 'adm-cell adm-cell--mono';
        id.textContent = w.id;

        var who = document.createElement('span');
        who.className = 'adm-cell';
        who.textContent = (w.username || '已注销') + ' · ' + w.uid;

        var amt = document.createElement('span');
        amt.className = 'adm-cell adm-cell--num';
        setAmt(amt, w.amount);
        var au = document.createElement('i');
        au.setAttribute('data-cur', 'code');
        au.textContent = 'CFB';
        amt.appendChild(au);

        var acc = document.createElement('span');
        acc.className = 'adm-cell';
        acc.textContent = (CHANNEL[w.channel] || w.channel) + ' / ' + w.account;

        var at = document.createElement('span');
        at.className = 'adm-cell adm-cell--mono adm-cell--hide-s';
        at.textContent = fmtTime(w.createdAt);

        var st = document.createElement('span');
        st.appendChild(tagEl(
          w.status === 'pending' ? '待审' : (w.status === 'paid' ? '已打款' : (w.status === 'rejected' ? '已驳回' : w.status)),
          w.status === 'pending' ? 'is-pending' : (w.status === 'paid' ? 'is-paid' : (w.status === 'rejected' ? 'is-rejected' : ''))));

        var acts = document.createElement('span');
        acts.className = 'adm-acts';

        if (w.status === 'pending') {
          var ok = document.createElement('button');
          ok.className = 'btn btn--red btn--s';
          ok.type = 'button';
          ok.textContent = '通过打款';
          ok.addEventListener('click', function () { decide(w.id, 'paid'); });

          var no = document.createElement('button');
          no.className = 'btn btn--ghost btn--s';
          no.type = 'button';
          no.textContent = '驳回退回';
          no.addEventListener('click', function () { decide(w.id, 'rejected'); });

          acts.appendChild(ok);
          acts.appendChild(no);
        } else {
          var done = document.createElement('span');
          done.className = 'adm-sub';
          done.textContent = '已处理 ' + (w.reviewedAt ? fmtTime(w.reviewedAt) : '');
          acts.appendChild(done);
        }

        row.appendChild(id); row.appendChild(who); row.appendChild(amt);
        row.appendChild(acc); row.appendChild(at); row.appendChild(st);
        row.appendChild(acts);
        list.appendChild(row);
      });

      empty.hidden = shown.length > 0;
    }

    function decide(id, action) {
      postJSON('/api/admin/withdrawals/decide', { id: id, action: action }).then(function (r) {
        if (r.body && r.body.ok) {
          say(action === 'paid' ? '已通过打款' : '已驳回，冻结退回余额');
          load();
        } else {
          say('操作失败：' + (r.body && r.body.error || '网络错误'));
        }
      });
    }

    function load() {
      if (preview) {
        items = DEMO_WD.items.map(function (it) { return Object.assign({}, it); });
        paint();
        return;
      }

      getJSON('/api/admin/withdrawals?status=' + status).then(function (r) {
        if (r.body && r.body.ok) {
          items = r.body.items || [];
          if (typeof r.body.pending === 'number') $('wdPending').textContent = r.body.pending;
          paint();
          return;
        }
        say('提现载入失败，请刷新重试');
        empty.hidden = false;
      });
    }

    document.querySelectorAll('[data-wd]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('[data-wd]').forEach(function (t) { t.classList.remove('is-on'); });
        tab.classList.add('is-on');
        status = tab.getAttribute('data-wd');
        load();
      });
    });

    load();
  }

  /* ---------- 启动 ---------- */

  var page = document.body.getAttribute('data-page');

  function boot() {
    if (preview) {
      paintNav(DEMO_ME);
      return Promise.resolve(DEMO_ME);
    }

    /* 缓存命中先用它点亮导航并放行，让本页数据请求与后台校验并行 */
    var cached = window.CF && CF.cache ? CF.cache.get() : null;
    if (cached) paintNav(cached);

    var verify = getJSON('/api/auth/me').then(function (r) {
      if (r.status === 200 && r.body && r.body.ok) {
        if (window.CF && CF.cache) CF.cache.set(r.body.user);
        paintNav(r.body.user);
        return r.body.user;
      }
      if (r.status === 401) {
        if (window.CF && CF.cache) CF.cache.clear();
        location.replace('/login?next=' + encodeURIComponent(location.pathname));
        return null;
      }
      if (!cached) say('账户信息载入失败，请刷新重试');
      return cached || null;
    });

    /* 有缓存时不阻塞：本页数据可以立刻开跑 */
    if (cached && (cached.role === 'owner' || cached.role === 'admin')) {
      return Promise.resolve(cached);
    }
    return verify;
  }

  /* ---------- 工单管理 ---------- */

  function initTickets(me) {
    var list = $('tkList');
    var empty = $('tkEmpty');
    var sheet = $('tkSheet');
    var status = 'open';
    var items = [];
    var current = null;

    function fmt(d) { return fmtTime(d); }

    function tagEl(text, cls) {
      var s = document.createElement('span');
      s.className = 'adm-tag' + (cls ? ' ' + cls : '');
      s.textContent = text;
      return s;
    }

    function decide(t, done) {
      done.disabled = true;
      postJSON('/api/admin/tickets/decide', {
        id: t.id,
        action: t.status === 'open' ? 'closed' : 'open'
      }).then(function (r) {
        if (r.body && r.body.ok) {
          say(t.status === 'open' ? '已标记处理' : '已重开');
          closeSheet();
          load();
        } else {
          say('操作失败：' + (r.body && r.body.error || '网络错误'));
          done.disabled = false;
        }
      });
    }

    function paint() {
      list.textContent = '';
      $('tkOpen').textContent = items.filter(function (it) { return it.status === 'open'; }).length;

      items.forEach(function (t) {
        var row = document.createElement('div');
        row.className = 'adm-tr adm-tr--tk';
        row.style.cursor = 'pointer';

        var id = document.createElement('span');
        id.className = 'adm-cell adm-cell--mono';
        id.textContent = '#' + t.id;

        var who = document.createElement('span');
        who.className = 'adm-cell';
        who.textContent = (t.username || '未命名') + (t.uid ? ' · ' + t.uid : ' · 未登录');

        var type = document.createElement('span');
        type.className = 'adm-cell';
        type.textContent = TICKET_TYPE[t.type] || t.type;

        var detail = document.createElement('span');
        detail.className = 'adm-cell adm-cell--detail';
        detail.textContent = t.detail;
        detail.title = t.detail;

        var at = document.createElement('span');
        at.className = 'adm-cell adm-cell--mono adm-cell--hide-s';
        at.textContent = fmt(t.created_at);

        var st = document.createElement('span');
        st.appendChild(tagEl(t.status === 'open' ? '待处理' : '已处理',
          t.status === 'open' ? 'is-pending' : 'is-paid'));

        var acts = document.createElement('span');
        acts.className = 'adm-acts';
        var btn = document.createElement('button');
        btn.className = 'btn ' + (t.status === 'open' ? 'btn--red' : 'btn--ghost') + ' btn--s';
        btn.type = 'button';
        btn.textContent = t.status === 'open' ? '标记已处理' : '重开';
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          decide(t, btn);
        });
        acts.appendChild(btn);

        row.appendChild(id); row.appendChild(who); row.appendChild(type);
        row.appendChild(detail); row.appendChild(at); row.appendChild(st); row.appendChild(acts);

        row.addEventListener('click', function (ev) {
          if (ev.target.closest('button')) return;
          openSheet(t);
        });

        list.appendChild(row);
      });

      empty.hidden = items.length > 0;
    }

    /* ---------- 详情弹窗 ---------- */

    function openSheet(t) {
      current = t;
      $('tkdTitle').textContent = '工单 #' + t.id + ' · ' + (TICKET_TYPE[t.type] || t.type);
      $('tkdMeta').textContent = '';

      [
        ['提交人', (t.username || '未命名') + (t.uid ? '（UID ' + t.uid + '）' : '（未登录）')],
        ['提交时间', fmt(t.created_at)],
        ['状态', t.status === 'open' ? '待处理' : '已处理'],
        ['当前等级', t.level ? 'LV ' + t.level : '—']
      ].forEach(function (pair) {
        var s = document.createElement('span');
        s.textContent = pair[0] + ' ';
        var b = document.createElement('b');
        b.textContent = pair[1];
        s.appendChild(b);
        $('tkdMeta').appendChild(s);
      });

      $('tkdDetail').textContent = t.detail || '';
      var replyBox = $('tkdReply');
      if (t.reply) {
        replyBox.hidden = false;
        replyBox.textContent = '处理意见：' + t.reply;
      } else {
        replyBox.hidden = true;
        replyBox.textContent = '';
      }

      var done = $('tkdDone');
      done.textContent = t.status === 'open' ? '标记已处理' : '重开工单';
      done.className = 'btn ' + (t.status === 'open' ? 'btn--red' : 'btn--ghost') + ' btn--s';
      done.disabled = false;
      done.onclick = function () { decide(t, done); };

      renderUser(t);

      sheet.hidden = false;
      document.body.classList.add('is-locked');
    }

    function closeSheet() {
      sheet.hidden = true;
      document.body.classList.remove('is-locked');
      current = null;
    }

    function g(label) {
      var wrap = document.createElement('div');
      wrap.className = 'adm-exp__g';
      var k = document.createElement('span');
      k.className = 'adm-exp__k';
      k.textContent = label;
      wrap.appendChild(k);
      return wrap;
    }

    /* 账号操作：与用户管理共用同一批接口 */
    function renderUser(t) {
      var box = $('tkdUserBody');
      box.textContent = '';

      if (!t.uid) {
        var none = document.createElement('p');
        none.className = 'tkd__none';
        none.textContent = '该工单为未登录提交，没有关联账户。';
        $('tkdUser').hidden = true;
        box.appendChild(none);
        return;
      }
      $('tkdUser').hidden = false;

      /* 余额概览 */
      var info = document.createElement('p');
      info.className = 'tkd__none';
      info.textContent = '当前法币 ' + (t.userFc || '0') + ' CFB · 冻结 ' + (t.userFrozen || '0') +
        ' CFB · 状态 ' + (STATUS[t.userStatus] || t.userStatus || '—') +
        ' · 角色 ' + (ROLE[t.userRole] || t.userRole || '—');
      box.appendChild(info);

      /* 法币调整 */
      var g1 = g('调整法币');
      var inN = document.createElement('input');
      inN.type = 'number'; inN.step = '0.0001'; inN.placeholder = '±金额';
      inN.style.width = '130px';
      var inM = document.createElement('input');
      inM.type = 'text'; inM.placeholder = '备注（写入流水）';
      inM.style.flex = '1 1 180px';
      var btnAdj = document.createElement('button');
      btnAdj.className = 'btn btn--red btn--s';
      btnAdj.type = 'button';
      btnAdj.textContent = '执行调整';
      btnAdj.addEventListener('click', function () {
        var delta = Number(inN.value);
        if (!delta) { say('请先填调整金额，正加负减'); return; }
        btnAdj.disabled = true;
        postJSON('/api/admin/users/adjust', { uid: t.uid, delta: delta, memo: inM.value })
          .then(function (r) {
            if (r.body && r.body.ok) { say('已调整，最新余额 ' + r.body.fc + ' CFB'); load(); }
            else say('操作失败：' + (r.body && r.body.error || '网络错误'));
            btnAdj.disabled = false;
          });
      });
      g1.appendChild(inN); g1.appendChild(inM); g1.appendChild(btnAdj);
      box.appendChild(g1);

      /* 账户状态 */
      var g2 = g('账户状态');
      ['active', 'frozen', 'banned'].forEach(function (s) {
        var btn = document.createElement('button');
        btn.className = 'btn btn--ghost btn--s';
        btn.type = 'button';
        btn.textContent = STATUS[s];
        if (t.userStatus === s) btn.disabled = true;
        btn.addEventListener('click', function () {
          btn.disabled = true;
          postJSON('/api/admin/users/status', { uid: t.uid, status: s }).then(function (r) {
            if (r.body && r.body.ok) { say('状态已改为 ' + STATUS[s]); load(); }
            else { say('操作失败：' + (r.body && r.body.error || '网络错误')); btn.disabled = false; }
          });
        });
        g2.appendChild(btn);
      });
      box.appendChild(g2);

      /* 角色（仅站长可改） */
      var g3 = g('角色');
      var sel = document.createElement('select');
      Object.keys(ROLE).forEach(function (rk) {
        var opt = document.createElement('option');
        opt.value = rk;
        opt.textContent = ROLE[rk];
        if (t.userRole === rk) opt.selected = true;
        sel.appendChild(opt);
      });
      if (me.role !== 'owner') { sel.disabled = true; sel.title = '仅站长可修改角色'; }
      var btnRole = document.createElement('button');
      btnRole.className = 'btn btn--ghost btn--s';
      btnRole.type = 'button';
      btnRole.textContent = '应用角色';
      if (me.role !== 'owner') btnRole.disabled = true;
      btnRole.addEventListener('click', function () {
        btnRole.disabled = true;
        postJSON('/api/admin/users/role', { uid: t.uid, role: sel.value }).then(function (r) {
          if (r.body && r.body.ok) { say('角色已改为 ' + ROLE[sel.value]); load(); }
          else { say('操作失败：' + (r.body && r.body.error || '网络错误')); btnRole.disabled = false; }
        });
      });
      g3.appendChild(sel); g3.appendChild(btnRole);
      box.appendChild(g3);
    }

    sheet.querySelectorAll('[data-tk-close]').forEach(function (el) {
      el.addEventListener('click', closeSheet);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !sheet.hidden) closeSheet();
    });

    function load() {
      if (preview) {
        items = [
          { id: 3, uid: 17, username: '沈知白', type: 'balance', detail: '提现申请提交后一直显示审核中，想确认到账时间。', status: 'open', created_at: '2026-11-17T01:20:00Z', userStatus: 'active', userRole: 'premium', userFc: '864.2', userFrozen: '20', level: 7 },
          { id: 2, uid: 9, username: '顾南舟', type: 'survey', detail: '完成的问卷奖励没有到账，答卷编号记不清了。', status: 'open', created_at: '2026-11-16T22:10:00Z', userStatus: 'active', userRole: 'admin', userFc: '512', userFrozen: '0', level: 6 },
          { id: 1, uid: 23, username: '许临', type: 'account', detail: '无法登录，提示密码错误，确认密码没有输错。', status: 'closed', created_at: '2026-11-15T09:00:00Z', userStatus: 'frozen', userRole: 'user', userFc: '96.4', userFrozen: '0', level: 2 }
        ].filter(function (t) { return status === 'all' || t.status === status; });
        paint();
        return;
      }

      getJSON('/api/admin/tickets?status=' + status).then(function (r) {
        if (r.body && r.body.ok) { items = r.body.items || []; paint(); return; }
        say('工单载入失败，请刷新重试');
        empty.hidden = false;
      });
    }

    document.querySelectorAll('[data-tk]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('[data-tk]').forEach(function (t) { t.classList.remove('is-on'); });
        tab.classList.add('is-on');
        status = tab.getAttribute('data-tk');
        load();
      });
    });

    load();
  }

  boot().then(function (me) {
    if (!isAdmin(me)) { location.replace('/home'); return; }
    if (page === 'admin') initOverview(me);
    else if (page === 'admin-users') initUsers(me);
    else if (page === 'admin-withdrawals') initWithdrawals(me);
    else if (page === 'admin-tickets') initTickets(me);
  });
})();
