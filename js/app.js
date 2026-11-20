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
    penalty: '违规扣罚',
    moonetix_reward: '广告墙奖励',
    moonetix_reverse: '广告墙冲正'
  };

  function kindText(k) { return KIND[k] || k || '其他'; }

  /* 金额展示：正数带 +，负数带 − */
  function signedFc(v) {
    var s = trimNum(v);
    if (s.charAt(0) === '-') return { text: s.slice(1), out: true };
    return { text: s.replace(/^\+/, ''), out: false };
  }

  /* ---------- 问卷大厅 ---------- */

  /* 问卷商图标：没有 logo 素材，用名字首字做一个稳定的方块标识 */
  function providerIcon(name) {
    var n = String(name || '').trim();
    var box = document.createElement('span');
    box.className = 'svc__prov-ico';
    box.setAttribute('aria-hidden', 'true');
    box.textContent = n ? n.charAt(0) : '?';
    return box;
  }

  /* 出口网络预检结果：null 未知 / 对象 可疑。
     hall 页加载时查一次，可疑的话点问卷当场拦住，不让人跳出去才发现号没了。 */
  var netSuspect = null;

  function cardEl(s, feat) {
    var card = document.createElement('article');
    card.className = 'svc' + (feat ? ' svc--feat' : '');

    if (feat) {
      var flag = document.createElement('span');
      flag.className = 'svc__flag';
      flag.textContent = 'PICK';
      card.appendChild(flag);
    }

    /* ---------- 顶部：价格（主角）+ 评级星级 ---------- */

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
      g.textContent = s.grade;
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
    if (rate.children.length) top.appendChild(rate);
    card.appendChild(top);

    /* ---------- 问卷商：图标 + 名字，右侧耗时 ---------- */

    if (s.provider || s.durationMin || s.joined) {
      var prov = document.createElement('div');
      prov.className = 'svc__prov';

      if (s.provider) {
        prov.appendChild(providerIcon(s.provider));
        var pn = document.createElement('span');
        pn.className = 'svc__prov-name';
        pn.textContent = s.provider;
        prov.appendChild(pn);
      }

      if (s.durationMin) {
        var dt = document.createElement('span');
        dt.className = 'svc__prov-time';
        dt.textContent = s.durationMin + ' 分钟';
        prov.appendChild(dt);
      }

      if (s.joined) {
        var dn = document.createElement('span');
        dn.className = 'svc__done';
        dn.textContent = '已参与';
        prov.appendChild(dn);
      }

      card.appendChild(prov);
    }

    /* ---------- 以下三块都可能没有，有才渲染 ---------- */

    if (s.title || s.topic) {
      var head = document.createElement('div');
      head.className = 'svc__head';

      if (s.title) {
        var h = document.createElement('h3');
        h.className = 'svc__t';
        h.textContent = s.title;
        head.appendChild(h);
      }

      if (s.topic) {
        var tp = document.createElement('span');
        tp.className = 'svc__topic';
        tp.textContent = s.topic;
        head.appendChild(tp);
      }

      card.appendChild(head);
    }

    if (s.requirement) {
      var req = document.createElement('p');
      req.className = 'svc__req';
      var em = document.createElement('em');
      em.textContent = '要求';
      req.appendChild(em);
      req.appendChild(document.createTextNode(s.requirement));
      card.appendChild(req);
    }

    /* ---------- 入口：始终贴卡片底部 ---------- */

    var foot = document.createElement('div');
    foot.className = 'svc__foot';

    /* 封禁 / 冻结的号不能接问卷，入口直接置灰，替它把话说清楚 */
    var restricted = false;
    try {
      var meNow = (window.CF && CF.cache) ? CF.cache.get() : null;
      restricted = !!(meNow && meNow.status && meNow.status !== 'active');
    } catch (e) {}

    var usable = !!s.entry && !restricted;
    var netBlocked = !!netSuspect && usable;

    var go = document.createElement(usable ? 'a' : 'span');
    go.className = 'svc__go' + (netBlocked ? ' is-net' : '');

    var gt = document.createElement('span');
    gt.textContent = restricted ? '账户受限' : (netBlocked ? '网络受限' : (s.entry ? '进入问卷' : '暂未开放'));
    go.appendChild(gt);

    if (usable) {
      var arrow = document.createElement('span');
      arrow.className = 'svc__go-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      go.appendChild(arrow);

      go.href = s.entry;
      if (/^https?:/i.test(s.entry)) {
        go.target = '_blank';
        go.rel = 'noopener';
      }

      /* 点开就记一次参与，keepalive 保证跳转时请求不被取消。
         网络被判定为代理/VPN 时不放行：仍然报给服务端（该封就封），但不跳走。 */
      go.addEventListener('click', function (ev) {
        if (netSuspect) {
          ev.preventDefault();
          say('这个网络被判定为代理 / VPN，不能接问卷');

          try {
            fetch('/api/surveys/join', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: s.id }),
              keepalive: true
            }).then(function (r) { return r.json().catch(function () { return null; }); })
              .then(function (d) {
                if (!d || d.error !== 'proxy_banned') return;

                /* 封了就说明白：为什么封、封多久、还能干什么 */
                if (window.CF && CF.modal) {
                  CF.modal({
                    kicker: 'BANNED',
                    title: '账号已被封禁',
                    desc: '这个出口 IP 被判定为代理 / VPN 网络'
                      + (d.org ? '（' + d.org + (d.country ? ' · ' + d.country : '') + '）' : '')
                      + '。按站规，问卷任务只接受真实本地网络，点开即封号并扣 8 点经验，现在只能提交工单和查看消息。',
                    hideCancel: true,
                    submitText: '去设置页看看',
                    fields: [],
                    onSubmit: function () { location.href = '/settings'; }
                  });
                }
                if (window.CF && CF.cache) CF.cache.clear();
              })
              .catch(function () {});
          } catch (e) {}

          return;
        }

        if (s.joined) return;
        try {
          fetch('/api/surveys/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: s.id }),
            keepalive: true
          }).catch(function () {});
        } catch (e) {}
      });
    } else {
      go.classList.add('is-dead');
    }

    foot.appendChild(go);
    card.appendChild(foot);
    return card;
  }

  function initHall(me) {
    var featWrap = $('featWrap');
    var featList = $('featList');
    var list = $('svList');
    var empty = document.querySelector('.pg-empty');
    var count = $('hallCount');
    if (!list) return;

    /* 先问一次出口网络：判定为代理/机房就把问卷入口标成「网络受限」 */
    fetch('/api/ip/check', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.ok && d.suspect) {
          netSuspect = d;
          if (typeof paint === 'function') paint();
        }
      })
      .catch(function () {});

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

  var STORE_ERR = {
    insufficient_balance: '可用余额不足，先去做问卷攒够再来。',
    has_pending: '已有一笔提现正在审核，等它处理完再提交下一笔。',
    below_min: '低于起提金额。',
    bad_amount: '请填写正确的提现金额。',
    bad_channel: '请选择收款渠道。',
    account_required: '请填写收款账号。',
    out_of_stock: '库存不足，暂时无法兑换。',
    item_off: '该商品已下架。',
    code_not_found: '兑换码不存在，检查一下有没有输错。',
    code_used: '这个兑换码已经被用过了。',
    code_item_only: '这是商品专用码，请到对应商品处兑换。',
    bad_code: '兑换码格式不对。',
    account_locked: '账户当前状态无法操作，联系客服确认。',
    unauthorized: '登录状态已失效，请重新登录。'
  };

  function storeErr(code) {
    return STORE_ERR[code] || ('操作失败：' + (code || '未知错误'));
  }

  /* 弹层文案里的金额：按当前显示币种换算并带单位，避免说「扣 20」而界面是 CFD */
  function curText(v) {
    if (!window.CF || !CF.money) return trimNum(String(v));
    return CF.money(v) + ' ' + CF.currency.code;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { say('已复制到剪贴板'); })
        .catch(function () { say('复制失败，请手动选中'); });
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); say('已复制到剪贴板'); } catch (e) { say('复制失败，请手动选中'); }
    document.body.removeChild(ta);
  }

  function initStore(me) {
    if (!me) return;

    var walletFc = $('stFc');
    var walletFrozen = $('stFrozen');
    var listEl = $('stList');
    var emptyEl = $('stEmpty');
    var ordersEl = $('stOrders');
    var withdrawsEl = $('stWithdraws');
    var recEmpty = $('stRecEmpty');

    var items = [];
    var orders = [];
    var withdraws = [];
    var tab = 'orders';
    var curFc = Number(trimNum(me.fc)) || 0;

    function setWallet(fc, frozen) {
      if (fc != null) {
        curFc = Number(fc) || 0;
        if (walletFc) setAmt(walletFc, fc);
        var nav = $('navBal');
        if (nav) setAmt(nav, fc);
        if (window.CF && CF.cache) {
          var c = CF.cache.get();
          if (c) { c.fc = String(fc); CF.cache.set(c); }
        }
      }
      if (frozen != null) {
        if (walletFrozen) setAmt(walletFrozen, frozen);
        if (window.CF && CF.cache) {
          var c2 = CF.cache.get();
          if (c2) { c2.fcFrozen = String(frozen); CF.cache.set(c2); }
        }
      }
    }

    /* ---------- 商品 ---------- */

    var KIND_LABEL = { code: 'CODE / 兑换码', cash: 'CASH / 现金', sub: 'SUB / 订阅' };

    function stockText(it) {
      if (it.stock < 0) return '不限量';
      if (it.stock === 0) return '已兑完';
      return '剩 ' + it.stock + ' 件';
    }

    function itemCard(it) {
      var card = document.createElement('article');
      card.className = 'st-item' + (it.soldOut ? ' is-off' : '');

      var k = document.createElement('span');
      k.className = 'st-item__k';
      k.textContent = KIND_LABEL[it.kind] || 'ITEM';
      card.appendChild(k);

      var t = document.createElement('h3');
      t.className = 'st-item__t';
      t.textContent = it.title;
      card.appendChild(t);

      if (it.subtitle) {
        var sub = document.createElement('span');
        sub.className = 'st-item__s';
        sub.textContent = it.subtitle;
        card.appendChild(sub);
      }

      var p = document.createElement('div');
      p.className = 'st-item__p';

      var b = document.createElement('b');
      setAmt(b, it.price);
      var u = document.createElement('i');
      u.setAttribute('data-cur', 'code');
      u.textContent = 'CFB';
      p.appendChild(b);
      p.appendChild(u);

      var st = document.createElement('span');
      st.className = 'st-item__stock' + (it.stock > 0 && it.stock <= 3 ? ' is-low' : '');
      st.textContent = stockText(it);
      p.appendChild(st);

      card.appendChild(p);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'st-item__b';

      if (it.soldOut) {
        btn.disabled = true;
        btn.textContent = '已兑完';
      } else if (curFc < Number(it.price)) {
        btn.disabled = true;
        btn.textContent = '余额不足';
      } else {
        btn.textContent = it.kind === 'cash' ? '兑换并提现' : it.kind === 'sub' ? '兑换 · 人工发货' : '立即兑换';
        btn.addEventListener('click', function () { openRedeem(it); });
      }

      card.appendChild(btn);
      return card;
    }

    function paintItems() {
      listEl.textContent = '';
      items.forEach(function (it) { listEl.appendChild(itemCard(it)); });
      if (emptyEl) emptyEl.hidden = items.length > 0;
    }

    function openRedeem(it) {
      var fields = [];
      var desc = it.note || '';

      if (it.kind === 'cash') {
        fields.push({
          name: 'account', label: '收款账号',
          placeholder: '支付宝账号或绑定手机号',
          hint: '账号需与实名信息一致，不一致会被驳回。'
        });
      } else if (it.kind === 'sub') {
        fields.push({
          name: 'memo', label: '开通信息',
          placeholder: '需要开通的手机号 / 账号，可留空',
          hint: '留空则通过站内消息联系你补填。'
        });
      }

      CF.modal({
        kicker: 'REDEEM',
        title: '兑换「' + it.title + '」',
        desc: '将从可用余额扣除 ' + curText(it.price) + '，' + desc,
        fields: fields,
        submitText: '确认兑换',
        busyText: '兑换中…',
        onSubmit: function (v, api) {
          api.setError('');
          if (it.kind === 'cash' && (v.account || '').length < 4) {
            api.setError('请填写完整的收款账号。');
            return;
          }
          api.setBusy(true);

          postJSON('/api/store/redeem', { itemId: it.id, account: v.account || '', memo: v.memo || '' })
            .then(function (r) {
              if (r.body && r.body.ok) {
                api.close();
                setWallet(r.body.balance, null);
                loadStore();
                loadOrders();
                if (r.body.code) {
                  CF.modal({
                    kicker: 'SUCCESS',
                    title: '兑换成功',
                    desc: '卡密：' + r.body.code + '\n单号：' + r.body.sn + '\n\n卡密同时写入兑换记录，可随时回来查看。',
                    submitText: '知道了',
                    hideCancel: true,
                    onSubmit: function (_, m) { m.close(); }
                  });
                } else {
                  say(it.kind === 'cash' ? '已提交提现申请，等待审核' : '兑换成功，等待人工发货');
                }
              } else {
                api.setBusy(false);
                api.setError(storeErr(r.body && r.body.error));
              }
            })
            .catch(function () {
              api.setBusy(false);
              api.setError('网络连接失败，请重试。');
            });
        }
      });
    }

    /* ---------- 提现 ---------- */

    function openWithdraw() {
      /* 输入框跟着当前显示币种走，提交前再换回 CFB；否则显示 CFD 时输入「10」实际扣的是 10 CFB */
      var usd = !!(window.CF && CF.currency && CF.currency.mode === 'USD');
      var unit = window.CF ? CF.currency.code : 'CFB';
      var MIN_CFB = 10;
      var minShow = usd ? CF.money(MIN_CFB) : '10';

      function toCfb(v) { return usd ? v * CF.rate : v; }

      CF.modal({
        kicker: 'WITHDRAW',
        title: '申请提现',
        desc: '可提余额 ' + curText(curFc) + '，起提 ' + minShow + ' ' + unit +
          '。提交后金额进入冻结，审核通过七个工作日内到账。',
        fields: [
          {
            name: 'amount', label: '提现金额（' + unit + '）', type: 'number',
            value: minShow, min: minShow, step: usd ? '0.0001' : '0.01'
          },
          {
            name: 'channel', label: '收款渠道', type: 'select', value: 'alipay',
            options: [
              { value: 'alipay', label: '支付宝' },
              { value: 'wechat', label: '微信' },
              { value: 'paypal', label: 'PayPal' },
              { value: 'payoneer', label: 'Payoneer' }
            ]
          },
          { name: 'account', label: '收款账号', placeholder: '与实名一致的账号或绑定手机号' }
        ],
        submitText: '提交申请',
        busyText: '提交中…',
        onSubmit: function (v, api) {
          api.setError('');
          var typed = Number(v.amount);
          var amount = Math.round(toCfb(typed) * 10000) / 10000;
          if (!isFinite(typed) || amount < MIN_CFB) {
            api.setError('起提金额为 ' + minShow + ' ' + unit + '，请填写不低于该数值的金额。');
            return;
          }
          if (amount > curFc) {
            api.setError('超出可用余额，当前最多可提 ' + curText(curFc) + '。');
            return;
          }
          if ((v.account || '').length < 4) {
            api.setError('请填写收款账号。');
            return;
          }
          api.setBusy(true);

          postJSON('/api/withdraw', { amount: amount, channel: v.channel, account: v.account })
            .then(function (r) {
              if (r.body && r.body.ok) {
                api.close();
                setWallet(r.body.balance, null);
                loadStore();
                loadWithdraws();
                say('提现申请已提交，单号 ' + r.body.ref);
              } else {
                api.setBusy(false);
                api.setError(storeErr(r.body && r.body.error));
              }
            })
            .catch(function () {
              api.setBusy(false);
              api.setError('网络连接失败，请重试。');
            });
        }
      });
    }

    /* ---------- 兑换码 ---------- */

    function openCode() {
      CF.modal({
        kicker: 'CDK',
        title: '兑换充值码',
        desc: '充值码直接加到可用余额，不区分面额，兑换后即时到账。',
        fields: [
          { name: 'code', label: '兑换码', placeholder: 'CF-XXXX-XXXX-XXXX' }
        ],
        submitText: '立即兑换',
        busyText: '兑换中…',
        onSubmit: function (v, api) {
          api.setError('');
          if ((v.code || '').length < 4) {
            api.setError('请输入兑换码。');
            return;
          }
          api.setBusy(true);

          postJSON('/api/cdk/redeem', { code: v.code })
            .then(function (r) {
              if (r.body && r.body.ok) {
                api.close();
                setWallet(r.body.balance, null);
                loadStore();
                say('充值成功，到账 ' + curText(r.body.amount));
              } else {
                api.setBusy(false);
                api.setError(storeErr(r.body && r.body.error));
              }
            })
            .catch(function () {
              api.setBusy(false);
              api.setError('网络连接失败，请重试。');
            });
        }
      });
    }

    /* ---------- 记录 ---------- */

    var ORDER_ST = { paid: '已完成', pending: '待发货', refunded: '已退款' };
    var WD_ST = { pending: '审核中', paid: '已打款', rejected: '已驳回' };

    function orderRow(o) {
      var row = document.createElement('div');
      row.className = 'st-rec';

      var at = document.createElement('span');
      at.className = 'st-rec__at';
      at.textContent = fmtTime(o.at);
      row.appendChild(at);

      var m = document.createElement('div');
      m.className = 'st-rec__m';

      var t = document.createElement('div');
      t.className = 'st-rec__t';
      t.textContent = o.title;
      m.appendChild(t);

      var sub = document.createElement('div');
      sub.className = 'st-rec__s';
      sub.textContent = o.sn + (o.memo ? ' · ' + o.memo : '');
      m.appendChild(sub);

      if (o.code) {
        var cd = document.createElement('span');
        cd.className = 'st-rec__code';
        cd.setAttribute('role', 'button');
        cd.setAttribute('tabindex', '0');
        cd.title = '点击复制';
        cd.appendChild(document.createTextNode(o.code));
        var hint = document.createElement('em');
        hint.textContent = '复制';
        cd.appendChild(hint);
        cd.addEventListener('click', function () { copyText(o.code); });
        m.appendChild(cd);
      }

      row.appendChild(m);

      var p = document.createElement('span');
      p.className = 'st-rec__p';
      var pb = document.createElement('b');
      setAmt(pb, o.price);
      var u = document.createElement('i');
      u.setAttribute('data-cur', 'code');
      u.textContent = 'CFB';
      p.appendChild(pb);
      p.appendChild(u);
      row.appendChild(p);

      var st = document.createElement('span');
      st.className = 'st-rec__st';
      st.setAttribute('data-s', o.status);
      st.textContent = ORDER_ST[o.status] || o.status;
      row.appendChild(st);

      return row;
    }

    function withdrawRow(w) {
      var row = document.createElement('div');
      row.className = 'st-rec';

      var at = document.createElement('span');
      at.className = 'st-rec__at';
      at.textContent = fmtTime(w.at);
      row.appendChild(at);

      var m = document.createElement('div');
      m.className = 'st-rec__m';

      var t = document.createElement('div');
      t.className = 'st-rec__t';
      t.textContent = '提现至' + w.channelText;
      m.appendChild(t);

      var sub = document.createElement('div');
      sub.className = 'st-rec__s';
      sub.textContent = w.account + (w.note ? ' · ' + w.note : '');
      m.appendChild(sub);

      row.appendChild(m);

      var p = document.createElement('span');
      p.className = 'st-rec__p';
      var pb = document.createElement('b');
      setAmt(pb, w.amount);
      var u = document.createElement('i');
      u.setAttribute('data-cur', 'code');
      u.textContent = 'CFB';
      p.appendChild(pb);
      p.appendChild(u);
      row.appendChild(p);

      var st = document.createElement('span');
      st.className = 'st-rec__st';
      st.setAttribute('data-s', w.status);
      st.textContent = WD_ST[w.status] || w.status;
      row.appendChild(st);

      return row;
    }

    function paintRecords() {
      ordersEl.textContent = '';
      orders.forEach(function (o) { ordersEl.appendChild(orderRow(o)); });

      withdrawsEl.textContent = '';
      withdraws.forEach(function (w) { withdrawsEl.appendChild(withdrawRow(w)); });

      var cur = tab === 'orders' ? orders : withdraws;
      ordersEl.hidden = tab !== 'orders';
      withdrawsEl.hidden = tab !== 'withdraws' && tab !== 'withdraw';
      if (recEmpty) {
        recEmpty.hidden = cur.length > 0;
        recEmpty.textContent = tab === 'orders' ? '还没有兑换记录。' : '还没有提现记录。';
      }
    }

    /* ---------- 取数 ---------- */

    function loadStore() {
      getJSON('/api/store').then(function (r) {
        if (r.body && r.body.ok) {
          items = r.body.items || [];
          setWallet(r.body.wallet.fc, r.body.wallet.fcFrozen);
          paintItems();
        } else {
          if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = '商品载入失败，请刷新重试。'; }
        }
      });
    }

    function loadOrders() {
      getJSON('/api/orders').then(function (r) {
        if (r.body && r.body.ok) {
          orders = r.body.items || [];
          paintRecords();
        }
      });
    }

    function loadWithdraws() {
      getJSON('/api/withdraw').then(function (r) {
        if (r.body && r.body.ok) {
          withdraws = r.body.items || [];
          paintRecords();
        }
      });
    }

    document.querySelectorAll('.st-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.st-tab').forEach(function (x) { x.classList.remove('is-on'); });
        t.classList.add('is-on');
        tab = t.getAttribute('data-tab');
        paintRecords();
      });
    });

    var wBtn = $('stWithdrawBtn');
    if (wBtn) wBtn.addEventListener('click', openWithdraw);

    var cBtn = $('stCodeBtn');
    if (cBtn) cBtn.addEventListener('click', openCode);

    setWallet(me.fc, me.fcFrozen);
    loadStore();
    loadOrders();
    loadWithdraws();
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
        /* 金额节点与单位节点分开，币种刷新只改金额，不会把单位冲掉 */
        var dv = document.createElement('b');
        dv.setAttribute('data-cfb', it.delta);
        dv.setAttribute('data-cur', 'amount');
        dv.setAttribute('data-signed', '1');
        dv.textContent = (window.CF && CF.money ? CF.money(it.delta) : s.text);
        d.appendChild(dv);
        var du = document.createElement('i');
        du.setAttribute('data-cur', 'code');
        du.textContent = 'FC';
        d.appendChild(du);

        var b = document.createElement('span');
        b.className = 'lg-row__b';
        var bb = document.createElement('b');
        setAmt(bb, it.balance);
        b.appendChild(bb);
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
        var rank = i + 1;
        var isHero = i < 3;
        var isMe = me && String(me.uid) === String(it.uid);

        /* 前三名与普通行用同一套六列：名次 / 用户名 / UID / LV / 好感 / 分数 */
        var row = document.createElement('li');
        row.className = isHero ? 'ld-hero__row is-r' + rank : 'ld-row';

        var rk = document.createElement('span');
        rk.className = isHero ? 'ld-hero__rank' : 'ld-rank';
        rk.textContent = rowText(rank);

        var who = document.createElement('span');
        who.className = 'ld-who';

        var a = document.createElement('a');
        a.className = 'ld-name';
        a.href = '/space?uid=' + encodeURIComponent(it.uid);
        a.textContent = it.username || '未命名';
        who.appendChild(a);

        if (isMe) {
          var tag = document.createElement('span');
          tag.className = 'ld-me';
          tag.textContent = 'ME';
          who.appendChild(tag);
        }

        var uid = document.createElement('span');
        uid.className = 'ld-uid';
        uid.textContent = 'UID ' + it.uid;

        var lv = document.createElement('span');
        lv.className = 'ld-lv';
        lv.textContent = 'LV ' + (it.level == null ? 1 : it.level);

        var af = document.createElement('span');
        af.className = 'ld-af';
        af.textContent = it.affinity || 0;
        var afu = document.createElement('i');
        afu.textContent = '好感';
        af.appendChild(afu);

        var fc = document.createElement('span');
        fc.className = 'ld-fc';
        var fcn = document.createElement('b');
        setAmt(fcn, it.fc);
        fc.appendChild(fcn);
        var fcu = document.createElement('i');
        fcu.setAttribute('data-cur', 'code');
        fcu.textContent = 'CFB';
        fc.appendChild(fcu);

        row.appendChild(rk);
        row.appendChild(who);
        row.appendChild(uid);
        row.appendChild(lv);
        row.appendChild(af);
        row.appendChild(fc);

        (isHero ? hero : list).appendChild(row);
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

      /* uid 完全由服务端按会话认定，前端不再传，避免冒名 */
      postJSON('/api/ticket', { type: type ? type.value : 'other', detail: text })
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
