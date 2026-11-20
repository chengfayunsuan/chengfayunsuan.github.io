/* ============================================================
   乘法 · 公共层
   1) 会话缓存：把 /api/auth/me 的用户资料存进 sessionStorage，
      页面先用缓存秒显，再后台校验，避免整页卡在接口上。
   2) 同导航组 SPA：功能目录（home / settings）与后台目录
      （admin / users / withdrawals）内部切换只换 main，不整页刷新。
   跨组链接与其它页面保持正常跳转。
   ============================================================ */
(function () {
  'use strict';

  var CF = window.CF = window.CF || {};

  /* ============================================================
     外观：主题色
     六个颜色变量是整站配色的全部来源，用户可在设置里改，存 cookie。
     这里在 head 阶段同步执行一次，避免先闪一帧默认红再变色。
     ============================================================ */

  var THEME_KEY = 'cf-theme';

  var THEME_DEF = {
    red: '#E0291E',
    'red-deep': '#B31F16',
    ink: '#14130F',
    paper: '#F4F0E6',
    'paper-2': '#E7E1D2',
    gray: '#8D8577'
  };

  var THEME_LIST = [
    { key: 'red', label: '主色', hint: '按钮、进度条、强调块、可选中的标记' },
    { key: 'red-deep', label: '主色·深', hint: '按钮按下、印章描边、深一档的强调' },
    { key: 'ink', label: '墨色', hint: '正文、边框、深色底块' },
    { key: 'paper', label: '纸色', hint: '页面底色、卡片底' },
    { key: 'paper-2', label: '纸色·深', hint: '次级底色、条纹、悬停' },
    { key: 'gray', label: '次要灰', hint: '说明文字、编号、占位' }
  ];

  /* 预设配色：每套只换主色与深色，墨色和纸色保持不动 */
  var THEME_PRESETS = [
    { key: 'red', label: '正红', red: '#E0291E', deep: '#B31F16' },
    { key: 'blue', label: '后台蓝', red: '#1D52E2', deep: '#1439A6' },
    { key: 'green', label: '松绿', red: '#1F7A45', deep: '#145C33' },
    { key: 'orange', label: '陶橙', red: '#C25A0F', deep: '#8F400A' },
    { key: 'purple', label: '黛紫', red: '#6D33B0', deep: '#4C2380' },
    { key: 'teal', label: '深海青', red: '#0F7C8C', deep: '#0A5A66' },
    { key: 'ink', label: '皂黑', red: '#2A2822', deep: '#14130F' }
  ];

  function readCookie(name) {
    var parts = ('; ' + document.cookie).split('; ' + name + '=');
    if (parts.length < 2) return '';
    return decodeURIComponent(parts[1].split(';')[0]);
  }

  function writeCookie(name, val, days) {
    var d = new Date(Date.now() + (days || 365) * 864e5);
    document.cookie = name + '=' + encodeURIComponent(val) +
      ';path=/;expires=' + d.toUTCString() + ';SameSite=Lax';
  }

  function dropCookie(name) {
    document.cookie = name + '=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT;SameSite=Lax';
  }

  function hexRgb(hex) {
    var h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return '';
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ].join(', ');
  }

  function applyTheme(obj) {
    var t = {};
    var k;
    for (k in THEME_DEF) t[k] = (obj && obj[k]) || THEME_DEF[k];

    var s = document.documentElement.style;
    s.setProperty('--red', t.red);
    s.setProperty('--red-deep', t['red-deep']);
    s.setProperty('--ink', t.ink);
    s.setProperty('--paper', t.paper);
    s.setProperty('--paper-2', t['paper-2']);
    s.setProperty('--gray', t.gray);

    var rgbOf = {
      '--red-rgb': t.red,
      '--ink-rgb': t.ink,
      '--paper-rgb': t.paper,
      '--paper2-rgb': t['paper-2']
    };
    for (var v in rgbOf) {
      var rgb = hexRgb(rgbOf[v]);
      if (rgb) s.setProperty(v, rgb);
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.red);

    /* 标记「用户改过配色」：后台的默认蓝让位给用户自己的主题 */
    var same = true;
    for (k in THEME_DEF) if (t[k].toLowerCase() !== THEME_DEF[k].toLowerCase()) same = false;
    if (same) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'on');

    CF.theme.current = t;
    return t;
  }

  function loadTheme() {
    var raw = readCookie(THEME_KEY);
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }

  CF.theme = {
    KEY: THEME_KEY,
    DEF: THEME_DEF,
    LIST: THEME_LIST,
    current: null,
    hexRgb: hexRgb,
    read: loadTheme,
    /* 只应用不保存：设置页拿来做即时预览 */
    apply: applyTheme,
    save: function (obj) {
      var t = {};
      for (var k in THEME_DEF) t[k] = (obj && obj[k]) || THEME_DEF[k];
      writeCookie(THEME_KEY, JSON.stringify(t));
      return applyTheme(t);
    },
    reset: function () {
      dropCookie(THEME_KEY);
      return applyTheme(null);
    },
    /* 预设：正红 / 后台蓝 */
    /* 预设：主色 + 深一档，名字给按钮用 */
    presets: function () { return THEME_PRESETS; },
    preset: function (name) {
      for (var i = 0; i < THEME_PRESETS.length; i++) {
        if (THEME_PRESETS[i].key === name) {
          return { red: THEME_PRESETS[i].red, 'red-deep': THEME_PRESETS[i].deep };
        }
      }
      return { red: THEME_DEF.red, 'red-deep': THEME_DEF['red-deep'] };
    }
  };

  applyTheme(loadTheme());

  /* ============================================================
     快捷键：数字键 1-9 / 0 直达导航项
     默认按功能目录的编号走（第 10 项用 0），用户可改键，存 cookie。
     ============================================================ */

  var HOT_KEY = 'cf-hotkeys';

  var NAV_USER = [
    { k: '1', href: '/hall', t: '问卷大厅' },
    { k: '2', href: '/earn', t: '赚积分' },
    { k: '3', href: '/store', t: '兑换中心' },
    { k: '4', href: '/ledger', t: '收支明细' },
    { k: '5', href: '/ladder', t: '天梯榜' },
    { k: '6', href: '/messages', t: '站内消息' },
    { k: '7', href: '/support', t: '联系客服' },
    { k: '8', href: '/settings', t: '账户设置' },
    { k: '9', href: '/home', t: '账户首页' },
    { k: '0', href: '/notices', t: '公告' }
  ];

  var NAV_ADMIN = [
    { k: '1', href: '/admin', t: '后台概览' },
    { k: '2', href: '/admin/users', t: '用户管理' },
    { k: '3', href: '/admin/withdrawals', t: '提现审核' },
    { k: '4', href: '/admin/orders', t: '兑换订单' },
    { k: '5', href: '/admin/tickets', t: '工单' },
    { k: '6', href: '/admin/surveys', t: '问卷管理' },
    { k: '7', href: '/admin/items', t: '商品兑换' },
    { k: '8', href: '/admin/messages', t: '公告' },
    { k: '9', href: '/admin/moonetix', t: '广告墙' },
    { k: '0', href: '/admin/traffic', t: '流量' }
  ];

  /* 反引号键：数字键 1-9/0 已经排满了，它单独占一个「回首页」的位置。
     跟数字键同一套开关、同一份列表，只是键位固定（它不是字母数字，输入框里也绑不了）。 */
  var NAV_FIXED = {
    user: { href: '/home', t: '回账户首页', k: '~' },
    admin: { href: '/admin', t: '回后台概览', k: '~' }
  };

  function loadHot() {
    var raw = readCookie(HOT_KEY);
    var o = null;
    try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    return {
      on: o && o.on === false ? false : true,
      user: (o && o.user) || {},
      admin: (o && o.admin) || {}
    };
  }

  function saveHot(cfg) {
    var out = {
      on: cfg.on !== false,
      user: cfg.user || {},
      admin: cfg.admin || {}
    };
    writeCookie(HOT_KEY, JSON.stringify(out));
    return out;
  }

  /* 合并默认与自定义：返回 [{href,t,key,def,fixed}]，反引号键排在最前 */
  function hotList(scope, cfg) {
    var def = scope === 'admin' ? NAV_ADMIN : NAV_USER;
    var custom = (cfg || loadHot())[scope] || {};
    var fix = NAV_FIXED[scope] || NAV_FIXED.user;
    var out = [{ href: fix.href, t: fix.t, key: fix.k, def: fix.k, fixed: true }];
    for (var i = 0; i < def.length; i++) {
      var item = def[i];
      out.push({
        href: item.href,
        t: item.t,
        key: custom[item.href] || item.k,
        def: item.k
      });
    }
    return out;
  }

  function go(href) {
    if (!href) return false;
    var path = normalize(href);
    if (normalize(location.pathname) === path) return false;

    /* 同一个导航组里就直接换页，别整页刷新 */
    var route = routeOf(path);
    var nowPage = (document.body || document.documentElement).getAttribute('data-page') || '';
    if (route && groupOf(nowPage) && groupOf(nowPage) === groupOf(route.page)) {
      swap(route, path, true);
      return true;
    }

    var a = document.querySelector('.dock a[href="' + href + '"]');
    if (a) { a.click(); return true; }
    location.href = href;
    return true;
  }

  var hotBound = false;

  function bindHotkeys() {
    if (hotBound) return;
    hotBound = true;

    document.addEventListener('keydown', function (ev) {
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
      if (ev.repeat) return;

      var t = ev.target;
      if (t && t.nodeType === 1) {
        var tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }

      /* 面板正在等键时不抢 */
      if (document.body && document.body.getAttribute('data-hot-catch') === '1') return;

      var key = ev.key;
      var isAdmin = location.pathname.indexOf('/admin') === 0;

      var cfg = loadHot();
      if (!cfg.on) return;

      /* 反引号 / ~ 键：回首页。它跟数字键同一套开关，但键位固定不参与改键。 */
      if (key === '`' || key === '~' || ev.code === 'Backquote') {
        ev.preventDefault();
        go((NAV_FIXED[isAdmin ? 'admin' : 'user'] || NAV_FIXED.user).href);
        return;
      }

      if (ev.shiftKey) return;
      if (!/^[0-9a-zA-Z]$/.test(key)) return;

      /* 后台页面用后台那套键位 */
      var list = hotList(isAdmin ? 'admin' : 'user', cfg);
      var want = '';
      for (var i = 0; i < list.length; i++) {
        if (list[i].key.toLowerCase() === key.toLowerCase()) { want = list[i].href; break; }
      }
      if (!want) return;

      ev.preventDefault();
      go(want);
    });
  }

  CF.keys = {
    KEY: HOT_KEY,
    DEF_USER: NAV_USER,
    DEF_ADMIN: NAV_ADMIN,
    read: loadHot,
    save: saveHot,
    list: hotList,
    go: go,
    bind: bindHotkeys
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindHotkeys);
  else bindHotkeys();

  /* ---------- 会话缓存 ---------- */

  var KEY = 'cf-me';

  CF.cache = {
    get: function () {
      try {
        var s = sessionStorage.getItem(KEY);
        return s ? JSON.parse(s) : null;
      } catch (e) { return null; }
    },
    set: function (user) {
      try { sessionStorage.setItem(KEY, JSON.stringify(user)); } catch (e) {}
    },
    clear: function () {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
    }
  };

  /* ---------- 全局交互：只绑一次，SPA 重跑页面脚本不会重复 ---------- */

  function toast(text) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('is-on'); }, 2600);
  }

  /* 捕获阶段拦截，命中即停止传播：各页脚本里残留的同名绑定不再重复触发 */
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t.closest) return;

    /* 退出：清缓存 + 登出 */
    var out = t.closest('#logoutBtn');
    if (out) {
      ev.stopPropagation();
      CF.cache.clear();
      if (!out.disabled) {
        out.disabled = true;
        out.textContent = '退出中';
        fetch('/api/auth/logout', { method: 'POST' })
          .catch(function () {})
          .then(function () { location.replace('/'); });
      }
      return;
    }

    /* 未开放功能提示：各页统一交给这里处理 */
    var soon = t.closest('[data-soon]');
    if (soon) {
      ev.preventDefault();
      ev.stopPropagation();
      var label = soon.getAttribute('data-soon') || '该功能';
      var page = document.body.getAttribute('data-page') || '';
      var suffix = page.indexOf('admin') === 0 ? ' · 待建，接口与表结构未开放' : ' · 功能开发中';
      toast(label + suffix);
    }
  }, true);

  /* ---------- 同导航组 SPA ----------
     目标页要用的 css / js 不再写在这里，换页时直接读目标 HTML 自己引了什么。
     以前每加一个样式就得记得来这儿补一条，漏一次就是「有时候样式没了」。 */

  var ROUTES = {
    '/home': { page: 'home' },
    '/settings': { page: 'settings' },
    '/admin': { page: 'admin' },
    '/admin/users': { page: 'admin-users' },
    '/admin/withdrawals': { page: 'admin-withdrawals' },
    '/admin/tickets': { page: 'admin-tickets' },
    '/admin/surveys': { page: 'admin-surveys' },
    '/admin/orders': { page: 'admin-orders' },
    '/admin/items': { page: 'admin-items' },
    '/admin/messages': { page: 'admin-messages' },
    '/admin/moonetix': { page: 'admin-moonetix' },
    '/admin/traffic': { page: 'admin-traffic' }
  };

  function normalize(path) {
    if (!path) return '';
    path = path.split('?')[0].split('#')[0];
    if (path.length > 1 && path.charAt(path.length - 1) === '/') path = path.slice(0, -1);
    return path;
  }

  function routeOf(path) { return ROUTES[normalize(path)] || null; }

  function groupOf(page) {
    if (page === 'home' || page === 'settings') return 'dock';
    if (page && page.indexOf('admin') === 0) return 'admin';
    return '';
  }

  var current = (document.body || document.documentElement).getAttribute('data-page') || '';

  /* 后台页面的左上角乘法回账户首页。
     其它页面由各页脚本按角色把 brand 指到 /admin，后台里再指后台就成了死循环。 */
  function fixBrand() {
    var pg = (document.body || document.documentElement).getAttribute('data-page') || '';
    if (pg.indexOf('admin') !== 0) return;
    var b = document.querySelector('.brand');
    if (b) b.setAttribute('href', '/home');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fixBrand);
  else fixBrand();

  function ensureCss(list) {
    (list || []).forEach(function (href) {
      var base = href.split('?')[0];
      var found = document.querySelector('link[rel="stylesheet"][href^="' + base + '"]');
      if (found) return;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    });
  }

  var GLOBAL_JS = /^\/js\/(core|config)\.js/i;

  function runScript(src) {
    if (!src) return;
    /* core / config 是全局的，SPA 换页时不能重跑，否则事件会绑两遍 */
    if (GLOBAL_JS.test(src.split('?')[0])) return;
    var s = document.createElement('script');
    s.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
    s.defer = true;
    document.body.appendChild(s);
  }

  /* 目标页自己要用的资源，一律以目标 HTML 里写的为准。
     以前靠 ROUTES 手写白名单，加一个 css 忘一次就漏一次（设置页的 customize.css 就是这么丢的）。 */
  function collect(doc, sel, attr) {
    var out = [];
    var list = doc.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) {
      var v = list[i].getAttribute(attr);
      if (v) out.push(v);
    }
    return out;
  }

  function swap(route, path, push) {
    fetch(path, { headers: { 'X-CF-SPA': '1' } })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var nextMain = doc.querySelector('main');
        var nowMain = document.querySelector('main');
        if (!nextMain || !nowMain) throw new Error('no main');

        var cssList = (route.css || []).concat(collect(doc, 'link[rel="stylesheet"]', 'href'));

        /* 同一个 js 只跑一次：route.js 和 HTML 里的引用经常是同一份 */
        var jsAll = (route.js ? [route.js] : []).concat(collect(doc, 'script[src]', 'src'));
        var jsList = [], seenJs = {};
        for (var k = 0; k < jsAll.length; k++) {
          var base = jsAll[k].split('?')[0];
          if (seenJs[base]) continue;
          seenJs[base] = 1;
          jsList.push(jsAll[k]);
        }

        /* 先把目标页独有样式挂上，再换 DOM，避免出现无样式闪烁 */
        ensureCss(cssList);

        nowMain.replaceWith(document.importNode(nextMain, true));
        document.title = doc.title;
        document.body.setAttribute('data-page', route.page);
        current = route.page;

        /* 新换进来的 [data-cur] 节点要重新套用币种显示 */
        /* 新换进来的币种节点与按钮要重新套用显示并绑定 */
        if (window.CF && CF.refresh) CF.refresh();
        if (window.CF && CF.bindToggles) CF.bindToggles();
        if (window.CF && CF.bindStyleButtons) CF.bindStyleButtons();

        if (push) history.pushState({ page: route.page, path: path }, '', path);
        window.scrollTo(0, 0);

        for (var i = 0; i < jsList.length; i++) runScript(jsList[i]);
      })
      .catch(function () { location.href = path; });
  }

  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

    var a = ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;

    var href = a.getAttribute('href');
    if (!href || href.charAt(0) !== '/' || href.indexOf('//') === 0) return;
    if (/[?&](preview|sheet)\b/.test(location.search)) return;

    var to = routeOf(href);
    if (!to) return;
    if (normalize(href) === normalize(location.pathname)) return;

    /* 每次点击实时读 data-page：core.js 在 head 同步执行，此时 body 还没解析出来，
       常量 current 初值是空的，会导致第一次组内点击走整页刷新。 */
    var nowPage = (document.body || document.documentElement).getAttribute('data-page') || current;
    if (groupOf(nowPage) !== groupOf(to.page)) return;

    ev.preventDefault();
    swap(to, normalize(href), true);
  });



  /* ---------- 站内消息未读角标 ---------- */

  function paintMsgBadge() {
    var dock = document.querySelector('[data-msg-dock]');
    if (!dock || dock.querySelector('.dock__badge')) return;

    fetch('/api/messages', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok || !d.unread) return;
        var b = document.createElement('span');
        b.className = 'dock__badge';
        b.textContent = d.unread > 99 ? '99+' : String(d.unread);
        dock.appendChild(b);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintMsgBadge);
  } else {
    paintMsgBadge();
  }

  /* ---------- 受限账户提示条 ----------
     封禁与冻结的号能登录，但只能做工单与看消息。
     登录时缓存的资料里带 status，这里直接读，不再多发请求。 */

  function paintRestrictedBar() {
    if (document.querySelector('.res-bar')) return;

    var me = null;
    try { me = (window.CF && CF.cache) ? CF.cache.get() : null; } catch (e) {}

    if (me) {
      renderRestrictedBar(me);
      return;
    }

    /* 缓存被清过（换标签页、浏览器回收）时补查一次，别让提示条凭空消失 */
    fetch('/api/auth/me', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok || !d.user) return;
        if (window.CF && CF.cache) CF.cache.set(d.user);
        renderRestrictedBar(d.user);
      })
      .catch(function () {});
  }

  function renderRestrictedBar(me) {
    if (document.querySelector('.res-bar')) return;
    if (!me || !me.status || me.status === 'active') return;

    var banned = me.status === 'banned';

    var bar = document.createElement('div');
    bar.className = 'res-bar';

    var tag = document.createElement('span');
    tag.className = 'res-bar__k';
    tag.textContent = banned ? 'BANNED' : 'FROZEN';
    bar.appendChild(tag);

    var text = document.createElement('span');
    text.className = 'res-bar__t';
    text.textContent = banned
      ? '账户已被封禁：参与问卷、兑换与提现均已停用，只能提交工单与查看消息。'
      : '账户已被冻结：参与问卷、兑换与提现均已暂停，可提交工单说明情况。';
    bar.appendChild(text);

    var link = document.createElement('a');
    link.className = 'res-bar__a';
    link.href = '/support';
    link.textContent = '提交工单 →';
    bar.appendChild(link);

    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintRestrictedBar);
  } else {
    paintRestrictedBar();
  }

  /* ---------- 通用弹层 ----------
     全站统一入口，避免每页各写一套。
     用法：CF.modal({
       kicker, title, desc,
       fields: [{ name, label, type, value, placeholder, hint, options }],
       submitText, onSubmit(values, api)
     })
     onSubmit 里调用 api.setBusy(true/false)、api.setError(text)、api.close()。
  */

  var modalEl = null;

  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove('is-on');
    var node = modalEl;
    modalEl = null;
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 180);
  }

  function buildField(f) {
    var wrap = document.createElement('label');
    wrap.className = 'mo__f';

    var lab = document.createElement('span');
    lab.className = 'mo__l';
    lab.textContent = f.label || '';
    wrap.appendChild(lab);

    var input;
    if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = f.rows || 3;
    } else if (f.type === 'select') {
      input = document.createElement('select');
      (f.options || []).forEach(function (o) {
        var op = document.createElement('option');
        op.value = o.value;
        op.textContent = o.label;
        if (String(o.value) === String(f.value)) op.selected = true;
        input.appendChild(op);
      });
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      if (f.value != null) input.value = f.value;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.type === 'number') { input.step = f.step || '0.01'; input.min = f.min != null ? f.min : '0'; }
    }

    if (f.name) input.name = f.name;
    if (f.maxlength) input.maxLength = f.maxlength;
    input.className = 'mo__i';
    wrap.appendChild(input);

    if (f.hint) {
      var hint = document.createElement('span');
      hint.className = 'mo__hint';
      hint.textContent = f.hint;
      wrap.appendChild(hint);
    }

    return wrap;
  }

  function modal(opts) {
    opts = opts || {};
    closeModal();

    var back = document.createElement('div');
    back.className = 'mo-back';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');

    var panel = document.createElement('form');
    panel.className = 'mo';

    var head = document.createElement('div');
    head.className = 'mo__head';

    if (opts.kicker) {
      var k = document.createElement('span');
      k.className = 'mo__k';
      k.textContent = opts.kicker;
      head.appendChild(k);
    }

    var t = document.createElement('h3');
    t.className = 'mo__t';
    t.textContent = opts.title || '';
    head.appendChild(t);

    if (opts.desc) {
      var d = document.createElement('p');
      d.className = 'mo__d';
      d.textContent = opts.desc;
      head.appendChild(d);
    }

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mo__x';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closeModal);
    head.appendChild(closeBtn);

    panel.appendChild(head);

    /* 没有字段的纯提示框就不留这块，免得底部空一截 */
    var fields = opts.fields || [];
    if (fields.length) {
      var body = document.createElement('div');
      body.className = 'mo__body';
      fields.forEach(function (f) { body.appendChild(buildField(f)); });
      panel.appendChild(body);
    }

    var msg = document.createElement('p');
    msg.className = 'mo__msg';
    msg.hidden = true;
    panel.appendChild(msg);

    var foot = document.createElement('div');
    foot.className = 'mo__foot';

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'mo__btn mo__btn--ghost';
    cancel.textContent = opts.cancelText || '取消';
    cancel.addEventListener('click', closeModal);

    var ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'mo__btn mo__btn--main';
    ok.textContent = opts.submitText || '确认';

    if (!opts.hideCancel) foot.appendChild(cancel);
    foot.appendChild(ok);
    panel.appendChild(foot);

    var api = {
      close: closeModal,
      setBusy: function (busy) {
        ok.disabled = !!busy;
        if (cancel) cancel.disabled = !!busy;
        ok.textContent = busy ? (opts.busyText || '处理中…') : (opts.submitText || '确认');
      },
      setError: function (text) {
        if (!text) { msg.hidden = true; return; }
        msg.hidden = false;
        msg.textContent = text;
      },
      values: function () {
        var out = {};
        (opts.fields || []).forEach(function (f) {
          var el = panel.querySelector('[name="' + f.name + '"]');
          out[f.name] = el ? String(el.value).trim() : '';
        });
        return out;
      }
    };

    panel.addEventListener('submit', function (ev) {
      ev.preventDefault();
      api.setError('');
      if (opts.onSubmit) opts.onSubmit(api.values(), api);
      else closeModal();
    });

    back.addEventListener('mousedown', function (ev) {
      if (ev.target === back) closeModal();
    });

    document.addEventListener('keydown', onEsc);

    function onEsc(ev) {
      if (ev.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', onEsc);
      }
    }

    back.appendChild(panel);
    document.body.appendChild(back);
    modalEl = back;

    /* 进场动画下一帧再加类，避免闪 */
    requestAnimationFrame(function () { back.classList.add('is-on'); });

    var first = panel.querySelector('.mo__i');
    if (first) setTimeout(function () { first.focus(); }, 60);

    return api;
  }

  if (window.CF) CF.modal = modal;

  /* ---------- 代理 / VPN 提醒 ----------
     落地页和登录页不打扰；其余页面判定为机房/代理网络就提示一次。
     真去点问卷由服务端封号（/api/surveys/join 里判），前端只负责把话说清楚。 */

  var NET_AT = 'cf-net-at';
  var NET_WARNED = 'cf-net-warned';

  function netWarn(d) {
    if (!CF.modal) return;
    var where = d.org ? '（' + d.org + (d.country ? ' · ' + d.country : '') + '）' : (d.country ? '（' + d.country + '）' : '');
    CF.modal({
      kicker: 'NETWORK',
      title: '这个网络看起来像代理 / VPN',
      desc: '当前出口 IP 属于' + (d.kind === 'proxy' ? '代理或 VPN 网络' : '数据中心机房') + where
        + '。站内的问卷任务要求真实本地网络，用这种网络点开问卷会被判定为异常，账号直接封禁，并且扣 8 点经验。',
      hideCancel: true,
      submitText: '我知道了',
      fields: []
    });
  }

  function checkNet() {
    var p = location.pathname;
    if (p === '/' || p === '/index.html' || p === '/login') return;
    if (sessionStorage.getItem(NET_WARNED) === '1') return;

    /* 半小时内不重复查，免得每换一页打一次接口 */
    var last = Number(sessionStorage.getItem(NET_AT) || 0);
    if (last && Date.now() - last < 30 * 60 * 1000) return;
    try { sessionStorage.setItem(NET_AT, String(Date.now())); } catch (e) {}

    fetch('/api/ip/check', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok || !d.suspect) return;
        try { sessionStorage.setItem(NET_WARNED, '1'); } catch (e) {}
        netWarn(d);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(checkNet, 500); });
  } else {
    setTimeout(checkNet, 500);
  }

  window.addEventListener('popstate', function (ev) {
    var path = location.pathname;
    var to = routeOf(path);
    if (to && groupOf(to.page) === groupOf(current)) {
      swap(to, normalize(path), false);
    } else {
      location.reload();
    }
  });
})();
