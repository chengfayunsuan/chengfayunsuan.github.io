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

  /* ---------- 同导航组 SPA ---------- */

  var ROUTES = {
    '/home': { page: 'home', js: '/js/home.js?v=9' },
    '/settings': { page: 'settings', js: '/js/settings.js?v=12', css: ['/css/settings.css?v=12', '/css/relation.css?v=1'] },
    '/admin': { page: 'admin', js: '/js/admin.js?v=6' },
    '/admin/users': { page: 'admin-users', js: '/js/admin.js?v=6' },
    '/admin/withdrawals': { page: 'admin-withdrawals', js: '/js/admin.js?v=6' },
    '/admin/tickets': { page: 'admin-tickets', js: '/js/admin.js?v=6' },
    '/admin/surveys': { page: 'admin-surveys', js: '/js/admin-surveys.js?v=1' }
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

  var current = document.body.getAttribute('data-page') || '';

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

  function runScript(src) {
    if (!src) return;
    var s = document.createElement('script');
    s.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
    s.defer = true;
    document.body.appendChild(s);
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

        /* 先把目标页独有样式挂上，再换 DOM，避免出现无样式闪烁 */
        ensureCss(route.css);

        nowMain.replaceWith(document.importNode(nextMain, true));
        document.title = doc.title;
        document.body.setAttribute('data-page', route.page);
        current = route.page;

        /* 新换进来的 [data-cur] 节点要重新套用币种显示 */
        /* 新换进来的币种节点与按钮要重新套用显示并绑定 */
        if (window.CF && CF.refresh) CF.refresh();
        if (window.CF && CF.bindCurrencyButtons) CF.bindCurrencyButtons();

        if (push) history.pushState({ page: route.page, path: path }, '', path);
        window.scrollTo(0, 0);

        runScript(route.js);
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
    if (groupOf(current) !== groupOf(to.page)) return;

    ev.preventDefault();
    swap(to, normalize(href), true);
  });

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
