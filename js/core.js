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
    '/home': { page: 'home', js: '/js/home.js?v=11' },
    '/settings': { page: 'settings', js: '/js/settings.js?v=14', css: ['/css/settings.css?v=13', '/css/relation.css?v=2'] },
    '/admin': { page: 'admin', js: '/js/admin.js?v=6' },
    '/admin/users': { page: 'admin-users', js: '/js/admin.js?v=6' },
    '/admin/withdrawals': { page: 'admin-withdrawals', js: '/js/admin.js?v=6' },
    '/admin/tickets': { page: 'admin-tickets', js: '/js/admin.js?v=6' },
    '/admin/surveys': { page: 'admin-surveys', js: '/js/admin-surveys.js?v=1' },
    '/admin/orders': { page: 'admin-orders', js: '/js/admin-shop.js?v=2' },
    '/admin/items': { page: 'admin-items', js: '/js/admin-shop.js?v=2' },
    '/admin/messages': { page: 'admin-messages', js: '/js/admin-msg.js?v=4' }
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
        if (window.CF && CF.bindToggles) CF.bindToggles();
        if (window.CF && CF.bindStyleButtons) CF.bindStyleButtons();

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

    var body = document.createElement('div');
    body.className = 'mo__body';
    (opts.fields || []).forEach(function (f) { body.appendChild(buildField(f)); });
    panel.appendChild(body);

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
