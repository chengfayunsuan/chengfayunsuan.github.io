/* ============================================================
   乘法 · 站内消息
   列表来自 /api/messages，点击展开全文并标记已读。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function trimNum(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
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
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .catch(function () { return { status: 0, body: null }; });
  }

  function postJSON(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data || {})
    }).then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .catch(function () { return { status: 0, body: null }; });
  }

  function paintNav(me) {
    if (!me) return;
    var bal = $('navBal');
    if (bal && window.CF) CF.amount(bal, me.fc);
    var name = $('navName');
    if (name) {
      name.textContent = me.username || '我';
      if (me.uid) name.href = '/space?uid=' + encodeURIComponent(me.uid);
    }
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

  var KIND = {
    system: '系统',
    admin: '管理员',
    reward: '奖励'
  };

  var items = [];
  var filter = 'all';
  var listEl = $('msgList');
  var emptyEl = $('msgEmpty');
  var unreadEl = $('msgUnread');

  function paintUnread(n) {
    if (!unreadEl) return;
    unreadEl.textContent = String(n || 0);
    var badge = document.querySelector('.msg-tab[data-f="unread"]');
    if (badge) badge.textContent = n > 0 ? '未读 ' + n : '未读';
  }

  function rowEl(m) {
    var row = document.createElement('article');
    row.className = 'msg' + (m.read ? '' : ' is-unread');
    row.setAttribute('tabindex', '0');

    var dot = document.createElement('span');
    dot.className = 'msg__dot';
    dot.setAttribute('aria-hidden', 'true');

    var main = document.createElement('div');
    main.className = 'msg__main';

    var head = document.createElement('div');
    head.className = 'msg__head';

    var k = document.createElement('span');
    k.className = 'msg__k';
    k.textContent = KIND[m.kind] || '消息';

    var t = document.createElement('span');
    t.className = 'msg__t';
    t.textContent = m.title;

    var at = document.createElement('span');
    at.className = 'msg__at';
    at.textContent = fmtTime(m.at);

    head.appendChild(k);
    head.appendChild(t);
    head.appendChild(at);

    var body = document.createElement('p');
    body.className = 'msg__b';
    body.textContent = m.body || '';

    main.appendChild(head);
    main.appendChild(body);

    row.appendChild(dot);
    row.appendChild(main);

    function toggle() {
      var open = row.classList.toggle('is-open');
      if (open && !m.read) {
        m.read = true;
        row.classList.remove('is-unread');
        postJSON('/api/messages/read', { id: m.id }).then(function (r) {
          if (r.body && r.body.ok) {
            var n = items.filter(function (x) { return !x.read; }).length;
            paintUnread(n);
          }
        });
      }
    }

    row.addEventListener('click', toggle);
    row.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
    });

    return row;
  }

  function paint() {
    var list = items.filter(function (m) {
      return filter === 'all' ? true : !m.read;
    });

    listEl.textContent = '';
    list.forEach(function (m) { listEl.appendChild(rowEl(m)); });

    if (emptyEl) {
      emptyEl.hidden = list.length > 0;
      emptyEl.textContent = items.length
        ? '未读消息已经看完了。'
        : '还没有任何消息，兑换或提现的结果会出现在这里。';
    }
  }

  function load() {
    getJSON('/api/messages').then(function (r) {
      if (r.status === 401) {
        location.replace('/login?next=' + encodeURIComponent('/messages'));
        return;
      }
      if (!r.body || !r.body.ok) {
        if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = '消息载入失败，请刷新重试。'; }
        return;
      }
      items = r.body.items || [];
      paintUnread(r.body.unread || 0);
      paint();
    });
  }

  document.querySelectorAll('.msg-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.msg-tab').forEach(function (x) { x.classList.remove('is-on'); });
      tab.classList.add('is-on');
      filter = tab.getAttribute('data-f');
      paint();
    });
  });

  var readAllBtn = $('msgReadAll');
  if (readAllBtn) {
    readAllBtn.addEventListener('click', function () {
      var unread = items.filter(function (m) { return !m.read; }).length;
      if (!unread) { say('没有未读消息'); return; }

      readAllBtn.disabled = true;
      postJSON('/api/messages/read', { all: true }).then(function (r) {
        readAllBtn.disabled = false;
        if (r.body && r.body.ok) {
          items.forEach(function (m) { m.read = true; });
          paintUnread(0);
          paint();
          say('已全部标为已读');
        } else {
          say('操作失败，请重试');
        }
      });
    });
  }

  /* 先化解缓存把导航点亮，再拉会话与消息 */
  var cached = window.CF && CF.cache ? CF.cache.get() : null;
  if (cached) paintNav(cached);

  getJSON('/api/auth/me').then(function (r) {
    if (r.status === 200 && r.body && r.body.ok) {
      if (window.CF && CF.cache) CF.cache.set(r.body.user);
      paintNav(r.body.user);
    } else if (r.status === 401) {
      if (window.CF && CF.cache) CF.cache.clear();
      location.replace('/login?next=' + encodeURIComponent('/messages'));
      return;
    }
    if (window.CF && CF.refresh) CF.refresh();
    load();
  });
})();
