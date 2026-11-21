/* ============================================================
   Chengfa · 后台广告墙
   只读流水：入账 / 冲正 / 交易号。数据来自 /api/admin/moonetix
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
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2500);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { return { status: res.status, body: b }; }); })
      .catch(function () { return { status: 0, body: {} }; });
  }

  function cell(html) {
    var d = document.createElement('div');
    d.className = 'adm-cell';
    if (html instanceof Node) d.appendChild(html);
    else d.textContent = html == null ? '' : String(html);
    return d;
  }

  function paintNav(user) {
    if (window.CF && CF.amount) {
      CF.amount($('navBal'), user.fc);
    } else if ($('navBal')) {
      $('navBal').textContent = user.fc;
    }
    if ($('navName')) {
      $('navName').textContent = user.username || '我';
      $('navName').href = '/space?uid=' + encodeURIComponent(user.uid);
    }
  }

  function row(t) {
    var tr = document.createElement('div');
    tr.className = 'adm-tr adm-tr--mtx';

    tr.appendChild(cell(fmtTime(t.at)));

    var who = document.createElement('div');
    who.className = 'adm-cell';
    var name = document.createElement('b');
    name.textContent = t.name || '广告任务';
    var sub = document.createElement('span');
    sub.className = 'adm-sub';
    sub.textContent = (t.username || 'UID ' + t.uid);
    who.appendChild(name);
    who.appendChild(sub);
    tr.appendChild(who);

    var amount = document.createElement('div');
    amount.className = 'adm-cell';
    var b = document.createElement('b');
    if (window.CF && CF.amount) CF.amount(b, t.reward);
    else b.textContent = String(t.reward);
    if (t.status === 2) b.style.color = 'var(--gray)';
    amount.appendChild(b);
    var u = document.createElement('i');
    u.setAttribute('data-cur', 'code');
    u.textContent = 'XB';
    u.style.fontStyle = 'normal';
    u.style.marginLeft = '3px';
    amount.appendChild(u);
    tr.appendChild(amount);

    var st = document.createElement('div');
    st.className = 'adm-cell';
    var tag = document.createElement('span');
    tag.className = 'adm-tag' + (t.status === 2 ? ' adm-tag--off' : '');
    tag.textContent = t.status === 2 ? '已冲正' : '已入账';
    st.appendChild(tag);
    tr.appendChild(st);

    var tid = document.createElement('div');
    tid.className = 'adm-cell adm-tid';
    tid.textContent = t.tid;
    tr.appendChild(tid);

    return tr;
  }

  function paint(data) {
    var list = $('mtxRows');
    var empty = $('mtxEmpty');
    var items = (data && data.items) || [];
    var sum = (data && data.summary) || {};

    $('mtxLive').textContent = sum.live == null ? '0' : sum.live;
    $('mtxCount').textContent = sum.count == null ? '0' : sum.count;
    $('mtxUsers').textContent = sum.users == null ? '0' : sum.users;
    $('mtxRev').textContent = sum.reversed == null ? '0' : sum.reversed;

    list.textContent = '';
    if (!items.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    items.forEach(function (t) { list.appendChild(row(t)); });
  }

  function load() {
    return getJSON('/api/admin/moonetix').then(function (r) {
      if (r.status === 403) { location.replace('/home'); return; }
      if (r.body && r.body.ok) paint(r.body);
      else say('读取失败，刷新重试');
    });
  }

  getJSON('/api/auth/me').then(function (r) {
    if (r.status === 401) { location.replace('/login?next=/admin/moonetix'); return; }
    if (r.body && r.body.ok) paintNav(r.body.user);
    load();
  });
})();
