/* ============================================================
   乘法 · 站内页面公用逻辑
   问卷大厅 / 兑换中心 / 收支明细 / 天梯榜 / 联系客服 共用。
   每页用 <body data-page="hall|store|ledger|ladder|support"> 声明自己。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* 金额显示统一走 CF，切换币种时由 CF.refresh 重刷所有 data-cfb 节点 */
  function setAmt(el, v) {
    if (window.CF && CF.amount) CF.amount(el, v);
    else if (el) el.textContent = trimNum(v);
  }

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
    if (bal) setAmt(bal, me.fc);
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

  var page = document.body.getAttribute('data-page');

  function boot() {
    if (preview) {
      paintNav(DEMO_ME);
      return Promise.resolve(DEMO_ME);
    }

    /* 先用缓存把导航条与页面点亮，不等接口 */
    var cached = window.CF && CF.cache ? CF.cache.get() : null;
    if (cached) paintNav(cached);

    return getJSON('/api/auth/me').then(function (r) {
      if (r.status === 200 && r.body && r.body.ok) {
        if (window.CF && CF.cache) CF.cache.set(r.body.user);
        paintNav(r.body.user);
        return r.body.user;
      }
      if (r.status === 401) {
        if (window.CF && CF.cache) CF.cache.clear();
        /* 工单页对封禁/未登录也开放，不在此跳登录 */
        if (page === 'support') return null;
        toLogin();
        return null;
      }
      if (!cached) say('账户信息载入失败，请刷新重试');
      return cached || null;
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

  function cardEl(s, feat) {
    var card = document.createElement('article');
    card.className = 'svc';

    if (feat) {
      var flag = document.createElement('span');
      flag.className = 'svc__flag';
      flag.textContent = 'PICK';
      card.appendChild(flag);
    }

    /* 价格：主角，一律走 CF.amount 以便跟随币种切换 */
    var top = document.createElement('div');
    top.className = 'svc__top';

    var pay = document.createElement('div');
    pay.className = 'svc__pay';
    var num = document.createElement('b');
    setAmt(num, s.price);
    var unit = document.createElement('i');
    unit.setAttribute('data-cur', 'code');
    unit.textContent = 'CFB';
    pay.appendChild(num);
    pay.appendChild(unit);

    var rate = document.createElement('div');
    rate.className = 'svc__rate';

    if (s.grade) {
      var g = document.createElement('span');
      g.className = 'svc__grade';
      g.setAttribute('data-grade', s.grade);
      g.textContent = s.grade + ' 级';
      rate.appendChild(g);
    }

    if (s.stars) {
      var st = document.createElement('span');
      st.className = 'svc__stars';
      st.title = s.stars + ' 星';
      for (var i = 1; i <= 5; i++) {
        var star = document.createElement('span');
        if (i > s.stars) star.className = 'off';
        star.textContent = '★';
        st.appendChild(star);
      }
      rate.appendChild(st);
    }

    top.appendChild(pay);
    top.appendChild(rate);
    card.appendChild(top);

    var h = document.createElement('h3');
    h.className = 'svc__t';
    h.textContent = s.title;
    card.appendChild(h);

    var meta = document.createElement('div');
    meta.className = 'svc__meta';

    function addMeta(label, value) {
      if (!value) return;
      var m = document.createElement('span');
      m.className = 'svc__m';
      var lab = document.createElement('i');
      lab.textContent = label;
      var val = document.createElement('b');
      val.textContent = value;
      m.appendChild(lab);
      m.appendChild(val);
      meta.appendChild(m);
    }

    addMeta('问卷商', s.provider);
    addMeta('耗时', s.durationMin ? s.durationMin + ' 分钟' : '');
    addMeta('主题', s.topic);
    if (meta.children.length) card.appendChild(meta);

    if (s.requirement) {
      var req = document.createElement('p');
      req.className = 'svc__req';
      var em = document.createElement('em');
      em.textContent = '要求';
      req.appendChild(em);
      req.appendChild(document.createTextNode(s.requirement));
      card.appendChild(req);
    }

    var go = document.createElement(s.entry ? 'a' : 'span');
    go.className = 'btn btn--red btn--s svc__go';
    go.appendChild(document.createTextNode(s.entry ? '进入问卷' : '暂未开放'));
    var arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    go.appendChild(arrow);

    if (s.entry) {
      go.href = s.entry;
      if (/^https?:/i.test(s.entry)) {
        go.target = '_blank';
        go.rel = 'noopener';
      }
    } else {
      go.classList.add('is-dead');
    }

    card.appendChild(go);
    return card;
  }

  function initHall(me) {
    var featWrap = $('featWrap');
    var featList = $('featList');
    var list = $('svList');
    var empty = document.querySelector('.pg-empty');
    var count = $('hallCount');
    if (!list) return;

    var all = [];
    var sort = 'fc';

    function paint() {
      var sorted = all.slice();
      if (sort === 'fc') {
        sorted.sort(function (a, b) { return Number(b.price) - Number(a.price); });
      } else if (sort === 'time') {
        sorted.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      } else if (sort === 'star') {
        sorted.sort(function (a, b) { return (b.stars - a.stars) || (Number(b.price) - Number(a.price)); });
      }

      list.innerHTML = '';
      sorted.forEach(function (s) { list.appendChild(cardEl(s, false)); });

      var picks = all.filter(function (s) { return s.featured; });
      if (featWrap && featList) {
        featList.innerHTML = '';
        if (picks.length) {
          picks.forEach(function (s) { featList.appendChild(cardEl(s, true)); });
          featWrap.hidden = false;
        } else {
          featWrap.hidden = true;
        }
      }
    }

    document.querySelectorAll('.pg-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.pg-tab').forEach(function (t) { t.classList.remove('is-on'); });
        tab.classList.add('is-on');
        sort = tab.getAttribute('data-sort') || 'fc';
        paint();
      });
    });

    getJSON('/api/surveys').then(function (r) {
      if (r.status === 200 && r.body && r.body.ok) {
        all = r.body.items || [];
      }
      if (count) count.textContent = String(all.length);

      if (!all.length) {
        document.querySelectorAll('.hl-sect').forEach(function (sec) { sec.hidden = true; });
        if (empty) empty.hidden = false;
        return;
      }

      paint();
    });
  }

  /* ---------- 兑换中心 ---------- */

  function initStore(me) {
    if (!me) return;
    var fc = $('stFc');
    var fr = $('stFrozen');
    if (fc) setAmt(fc, me.fc);
    if (fr) setAmt(fr, me.fcFrozen);

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
    if (now && me) setAmt(now, me.fc);

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
        /* 带符号金额：存 CFB 原值，CF 换算后补回正负号 */
        d.setAttribute('data-cfb', it.delta);
        d.setAttribute('data-cur', 'amount');
        d.textContent = (window.CF && CF.money ? CF.money(it.delta) : s.text);
        d.setAttribute('data-signed', '1');
        var du = document.createElement('i');
        du.setAttribute('data-cur', 'code');
        du.textContent = 'FC';
        d.appendChild(du);

        var b = document.createElement('span');
        b.className = 'lg-row__b';
        setAmt(b, it.balance);
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
      if (inc) setAmt(inc, sum.income);
      if (out) setAmt(out, sum.outcome);
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
          setAmt(hfc, it.fc);
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
        setAmt(fc, it.fc);
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
    var form = $('spForm');
    if (!form) return;

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var type = form.querySelector('[name="type"]');
      var detail = form.querySelector('[name="detail"]');
      var text = (detail && detail.value || '').trim();

      if (text.length < 5) { say('请填写详细描述，至少 5 个字'); return; }
      if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }

      /* uid 由会话决定；封禁用户会话失效时，用本地缓存的身份兜底 */
      var uid = me && me.uid ? me.uid : 0;
      if (!uid && window.CF && CF.cache) {
        var cached = CF.cache.get();
        if (cached && cached.uid) uid = cached.uid;
      }

      postJSON('/api/ticket', { type: type ? type.value : 'other', detail: text, uid: uid })
        .then(function (r) {
          if (r.body && r.body.ok) {
            form.reset();
            say('工单已提交，可在「我的工单」查看进度');
          } else {
            say('提交失败：' + (r.body && r.body.error || '网络错误'));
          }
        })
        .catch(function () { say('网络连接失败，请重试'); })
        .then(function () {
          if (btn) { btn.disabled = false; btn.textContent = '提交工单'; }
        });
    });
  }

  /* ---------- 启动 ---------- */

  boot().then(function (me) {
    /* 工单页即使没有有效会话也要能提交，me 为 null 时表单留空 */
    if (page === 'support') { initSupport(me); return; }
    if (!me) return;
    if (page === 'hall') initHall(me);
    else if (page === 'store') initStore(me);
    else if (page === 'ledger') initLedger(me);
    else if (page === 'ladder') initLadder(me);
  });
})();
