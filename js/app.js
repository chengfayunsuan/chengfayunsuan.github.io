/* ============================================================
   乘法 · 站内页面公用逻辑
   问卷大厅 / 兑换中心 / 收支明细 / 天梯榜 / 联系客服 共用。
   每页用 <body data-page="hall|store|ledger|ladder|support"> 声明自己。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* 金额末尾的 0 不显示：0.0000 -> 0，128.4500 -> 128.45 */
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

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return fmtDate(iso) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ---------- 提示条 ---------- */

  var toastEl = $('toast');
  var toastTimer = null;

  function say(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  /* ---------- 取数 ---------- */

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.json().then(function (d) { return { status: r.status, body: d }; });
      })
      .catch(function () { return { status: 0, body: null }; });
  }

  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var preview = isLocal && /[?&]preview\b/.test(location.search);

  var DEMO_ME = {
    uid: 2, username: '林一舟', role: 'user',
    fc: '218.65', fcFrozen: '20', level: 2, exp: 240, affinity: 7
  };

  var DEMO_LEDGER = {
    ok: true,
    summary: { income: '486.5000', outcome: '96.0000', count: 9 },
    hasMore: false,
    items: [
      { at: '2026-11-12T09:20:00Z', kind: 'withdraw_paid', delta: '-20.0000', balance: '218.6500', memo: '提现至支付宝', ref: 'W20261112001' },
      { at: '2026-11-11T15:02:00Z', kind: 'survey_reward', delta: '12.0000', balance: '238.6500', memo: '城市通勤与公共交通调研', ref: 'S20261111007' },
      { at: '2026-11-09T11:41:00Z', kind: 'withdraw_lock', delta: '-20.0000', balance: '226.6500', memo: '提现申请，资金转入冻结', ref: 'W20261109002' },
      { at: '2026-11-08T20:15:00Z', kind: 'cdk_redeem', delta: '-30.0000', balance: '246.6500', memo: '兑换 Steam 充值卡 30 元', ref: 'C20261108005' },
      { at: '2026-11-06T10:33:00Z', kind: 'survey_reward', delta: '8.5000', balance: '276.6500', memo: '智能家居使用习惯调研', ref: 'S20261106003' },
      { at: '2026-11-03T19:08:00Z', kind: 'survey_reject', delta: '-4.0000', balance: '268.1500', memo: '答卷未通过有效性核验，奖励收回', ref: 'S20261103011' },
      { at: '2026-10-30T08:00:00Z', kind: 'signup_bonus', delta: '5.0000', balance: '272.1500', memo: '注册赠送', ref: '' },
      { at: '2026-10-28T14:02:00Z', kind: 'withdraw_paid', delta: '-16.5000', balance: '267.1500', memo: '提现至微信', ref: 'W20261028001' },
      { at: '2026-10-26T09:12:00Z', kind: 'admin_adjust', delta: '3.0000', balance: '283.6500', memo: '问卷补发差额', ref: '' }
    ]
  };

  var DEMO_LADDER = [
    { rank: 1, uid: 1, username: 'chengfa', role: 'owner', level: 9, exp: 8100, affinity: 128, fc: '1280.4' },
    { rank: 2, uid: 17, username: '沈知白', role: 'premium', level: 7, exp: 4900, affinity: 96, fc: '864.2' },
    { rank: 3, uid: 9, username: '顾南舟', role: 'admin', level: 6, exp: 3600, affinity: 74, fc: '512' },
    { rank: 4, uid: 2, username: '林一舟', role: 'user', level: 2, exp: 240, affinity: 7, fc: '218.65' },
    { rank: 5, uid: 23, username: '许临', role: 'user', level: 2, exp: 180, affinity: 5, fc: '96.4' },
    { rank: 6, uid: 31, username: '周与安', role: 'user', level: 1, exp: 80, affinity: 2, fc: '42' }
  ];

  /* ---------- 导航 ---------- */

  function paintNav(me) {
    if (!me) return;
    var bal = $('navBal');
    var name = $('navName');
    if (bal) bal.textContent = trimNum(me.fc);
    if (name) {
      name.textContent = me.username || '我';
      if (me.uid) name.href = '/space?uid=' + encodeURIComponent(me.uid);
    }
    document.body.setAttribute('data-uid', me.uid);

    /* 站长与管理员点左上角乘法进后台，其余保持原跳转 */
    var brand = document.querySelector('.brand');
    if (brand && (me.role === 'owner' || me.role === 'admin')) brand.setAttribute('href', '/admin');
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

  /* 未登录：直接去登录页，登录后回到当前页面 */
  function toLogin() {
    var next = location.pathname + location.search;
    location.replace('/login?next=' + encodeURIComponent(next));
  }

  function boot() {
    if (preview) {
      paintNav(DEMO_ME);
      return Promise.resolve(DEMO_ME);
    }
    return getJSON('/api/auth/me').then(function (r) {
      if (r.status === 200 && r.body && r.body.ok) {
        paintNav(r.body.user);
        return r.body.user;
      }
      if (r.status === 401) { toLogin(); return null; }
      say('账户信息载入失败，请刷新重试');
      return null;
    });
  }

  /* ---------- 收支类型 ---------- */

  var KIND = {
    signup_bonus: '注册赠送',
    survey_reward: '问卷奖励',
    survey_reject: '答卷驳回',
    withdraw_lock: '提现冻结',
    withdraw_refund: '提现退回',
    withdraw_paid: '提现完成',
    cdk_redeem: '兑换 CDK',
    admin_adjust: '人工调整',
    penalty: '违规扣罚'
  };

  function kindText(k) { return KIND[k] || k || '其他'; }

  /* 金额展示：正数带 +，负数带 − */
  function signedFc(v) {
    var s = trimNum(v);
    if (s.charAt(0) === '-') return { text: s.slice(1), out: true };
    return { text: s.replace(/^\+/, ''), out: false };
  }

  /* ---------- 问卷大厅 ---------- */

  function initHall(me) {
    /* 问卷接口尚未上线；列表里的样例卡是占位，接接口后由数据接管 */
    var n = $('hallCount');
    if (n) n.textContent = '0';

    document.querySelectorAll('.pg-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.pg-tab').forEach(function (t) { t.classList.remove('is-on'); });
        tab.classList.add('is-on');
        say('排序将在问卷开放后生效');
      });
    });

    document.querySelectorAll('[data-soon]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        say(el.getAttribute('data-soon') + ' · 内测阶段暂未开放');
      });
    });
  }

  /* ---------- 兑换中心 ---------- */

  function initStore(me) {
    if (!me) return;
    var fc = $('stFc');
    var fr = $('stFrozen');
    if (fc) fc.textContent = trimNum(me.fc);
    if (fr) fr.textContent = trimNum(me.fcFrozen);

    /* 余额不够的档位标灰：内部货币 1 FC 折算 1 元 */
    var have = Number(trimNum(me.fc)) || 0;
    document.querySelectorAll('[data-need]').forEach(function (el) {
      var need = Number(el.getAttribute('data-need')) || 0;
      if (have >= need) return;
      el.classList.add('is-locked');
      el.setAttribute('aria-disabled', 'true');
    });

    document.querySelectorAll('[data-soon]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        say(el.getAttribute('data-soon') + ' · 内测阶段暂未开放');
      });
    });
  }

  /* ---------- 收支明细 ---------- */

  function initLedger(me) {
    var now = $('lgNow');
    if (now && me) now.textContent = trimNum(me.fc);

    var body = $('lgBody');
    var empty = $('lgEmpty');
    var more = $('lgMore');
    var filter = 'all';
    var items = [];

    function paint() {
      var list = items.filter(function (it) {
        if (filter === 'all') return true;
        if (filter === 'in') return Number(it.delta) > 0;
        if (filter === 'out') return Number(it.delta) < 0;
        if (filter === 'survey') return it.kind === 'survey_reward' || it.kind === 'survey_reject';
        if (filter === 'withdraw') return it.kind.indexOf('withdraw_') === 0;
        if (filter === 'cdk') return it.kind === 'cdk_redeem';
        return true;
      });

      body.textContent = '';

      list.forEach(function (it) {
        var s = signedFc(it.delta);

        var row = document.createElement('div');
        row.className = 'lg-row';

        var at = document.createElement('span');
        at.className = 'lg-row__at';
        at.textContent = fmtTime(it.at);

        var k = document.createElement('span');
        k.className = 'lg-row__k';
        k.textContent = kindText(it.kind);

        var m = document.createElement('span');
        m.className = 'lg-row__m';
        m.textContent = it.memo || '—';

        var d = document.createElement('span');
        d.className = 'lg-row__d ' + (s.out ? 'is-out' : 'is-in');
        d.textContent = (s.out ? '−' : '+') + s.text;
        var du = document.createElement('i');
        du.setAttribute('data-cur', 'code');
        du.textContent = 'FC';
        d.appendChild(du);

        var b = document.createElement('span');
        b.className = 'lg-row__b';
        b.textContent = trimNum(it.balance);
        var bu = document.createElement('i');
        bu.setAttribute('data-cur', 'code');
        bu.textContent = 'FC';
        b.appendChild(bu);

        row.appendChild(at);
        row.appendChild(k);
        row.appendChild(m);
        row.appendChild(d);
        row.appendChild(b);
        body.appendChild(row);
      });

      empty.hidden = list.length > 0;
      if (!list.length) empty.textContent = items.length ? '当前筛选下没有记录。' : '账户还没有任何资金变动。';
    }

    function load() {
      if (preview) {
        items = DEMO_LEDGER.items;
        paintSummary(DEMO_LEDGER.summary);
        more.hidden = true;
        paint();
        return;
      }

      getJSON('/api/ledger?limit=200').then(function (r) {
        if (!r.body || !r.body.ok) {
          empty.hidden = false;
          empty.textContent = r.status === 401
            ? '登录状态已失效，请重新登录。'
            : '明细载入失败，请刷新重试。';
          return;
        }
        items = r.body.items || [];
        paintSummary(r.body.summary);
        more.hidden = true;
        paint();
      });
    }

    function paintSummary(sum) {
      if (!sum) return;
      var inc = $('lgIn');
      var out = $('lgOut');
      var cnt = $('lgCount');
      if (inc) inc.textContent = trimNum(sum.income);
      if (out) out.textContent = trimNum(sum.outcome);
      if (cnt) cnt.textContent = sum.count || 0;
    }

    document.querySelectorAll('[data-filter]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('[data-filter]').forEach(function (t) { t.classList.remove('is-on'); });
        tab.classList.add('is-on');
        filter = tab.getAttribute('data-filter');
        paint();
      });
    });

    load();
  }

  /* ---------- 天梯榜 ---------- */

  function initLadder(me) {
    var hero = $('ldHero');
    var list = $('ldList');
    var empty = $('ldEmpty');
    /* 法币比等级重要，默认按法币排 */
    var by = 'fc';
    var data = [];

    function rowText(rank) { return rank < 10 ? '0' + rank : String(rank); }

    function paint() {
      var rows = data.slice();

      if (by === 'fc') {
        rows.sort(function (a, b) { return Number(b.fc) - Number(a.fc); });
      } else {
        rows.sort(function (a, b) { return (b.level - a.level) || (b.exp - a.exp); });
      }

      hero.textContent = '';
      list.textContent = '';

      rows.forEach(function (it, i) {
        /* 前三名：整行大块，三种底色 */
        if (i < 3 && hero) {
          var hrow = document.createElement('li');
          hrow.className = 'ld-hero__row is-r' + (i + 1);

          var hrank = document.createElement('span');
          hrank.className = 'ld-hero__rank';
          hrank.textContent = rowText(i + 1);

          var hwho = document.createElement('span');
          hwho.className = 'ld-hero__who';

          var ha = document.createElement('a');
          ha.className = 'ld-hero__name';
          ha.href = '/space?uid=' + encodeURIComponent(it.uid);
          ha.textContent = it.username || '未命名';

          var huid = document.createElement('span');
          huid.className = 'ld-hero__uid';
          huid.textContent = 'UID ' + it.uid;

          hwho.appendChild(ha);
          hwho.appendChild(huid);

          if (me && String(me.uid) === String(it.uid)) {
            var hme = document.createElement('span');
            hme.className = 'ld-me';
            hme.textContent = 'ME';
            hwho.appendChild(hme);
          }

          var hstats = document.createElement('span');
          hstats.className = 'ld-hero__stats';

          var hlv = document.createElement('span');
          hlv.className = 'ld-hero__lv';
          hlv.textContent = 'LV ' + (it.level || 1);

          var haf = document.createElement('span');
          haf.className = 'ld-hero__af';
          haf.textContent = it.affinity || 0;
          var hafu = document.createElement('i');
          hafu.textContent = '好感';
          haf.appendChild(hafu);

          var hfc = document.createElement('span');
          hfc.className = 'ld-hero__fc';
          hfc.textContent = trimNum(it.fc);
          var hfcu = document.createElement('i');
          hfcu.setAttribute('data-cur', 'code');
          hfcu.textContent = 'CFB';
          hfc.appendChild(hfcu);

          hstats.appendChild(hlv);
          hstats.appendChild(haf);
          hstats.appendChild(hfc);

          hrow.appendChild(hrank);
          hrow.appendChild(hwho);
          hrow.appendChild(hstats);
          hero.appendChild(hrow);
          return;
        }

        /* 第四名起：普通行，名次接着前三往下排 */
        var rank = i + 1;
        var li = document.createElement('li');
        li.className = 'ld-row';

        var rk = document.createElement('span');
        rk.className = 'ld-rank';
        rk.textContent = rowText(rank);

        var who = document.createElement('span');
        who.className = 'ld-who';

        var a = document.createElement('a');
        a.className = 'ld-name';
        a.href = '/space?uid=' + encodeURIComponent(it.uid);
        a.textContent = it.username || '未命名';

        var uid = document.createElement('span');
        uid.className = 'ld-uid';
        uid.textContent = 'UID ' + it.uid;

        who.appendChild(a);
        who.appendChild(uid);

        if (me && String(me.uid) === String(it.uid)) {
          var tag = document.createElement('span');
          tag.className = 'ld-me';
          tag.textContent = 'ME';
          who.appendChild(tag);
        }

        var lv = document.createElement('span');
        lv.className = 'ld-lv';
        lv.textContent = 'LV ' + (it.level || 1);

        var af = document.createElement('span');
        af.className = 'ld-af';
        af.textContent = it.affinity || 0;
        var afu = document.createElement('i');
        afu.textContent = '好感';
        af.appendChild(afu);

        var fc = document.createElement('span');
        fc.className = 'ld-fc';
        fc.textContent = trimNum(it.fc);
        var fcu = document.createElement('i');
        fcu.setAttribute('data-cur', 'code');
        fcu.textContent = 'CFB';
        fc.appendChild(fcu);

        li.appendChild(rk);
        li.appendChild(who);
        li.appendChild(lv);
        li.appendChild(af);
        li.appendChild(fc);
        list.appendChild(li);
      });

      empty.hidden = rows.length > 0;
      empty.textContent = '榜单还没有数据。';
    }

    function load() {
      if (preview) {
        data = DEMO_LADDER.map(function (it) { return Object.assign({}, it); });
        paint();
        return;
      }

      getJSON('/api/ladder?by=' + by).then(function (r) {
        if (!r.body || !r.body.ok) {
          empty.hidden = false;
          empty.textContent = '榜单载入失败，请刷新重试。';
          return;
        }
        data = r.body.items || [];
        paint();
      });
    }

    document.querySelectorAll('[data-by]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('[data-by]').forEach(function (t) { t.classList.remove('is-on'); });
        tab.classList.add('is-on');
        by = tab.getAttribute('data-by');
        load();
      });
    });

    load();
  }

  /* ---------- 联系客服 ---------- */

  function initSupport(me) {
    var mail = $('spMail');
    if (mail && me && me.email) mail.value = me.email;

    var form = $('spForm');
    if (!form) return;

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      say('工单通道内测中，请先发邮件至 support@chengfa.cc');
    });
  }

  /* ---------- 启动 ---------- */

  var page = document.body.getAttribute('data-page');

  boot().then(function (me) {
    if (!me) return;
    if (page === 'hall') initHall(me);
    else if (page === 'store') initStore(me);
    else if (page === 'ledger') initLedger(me);
    else if (page === 'ladder') initLadder(me);
    else if (page === 'support') initSupport(me);
  });
})();
