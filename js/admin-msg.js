/* ============================================================
   乘法 · 后台站内消息
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

  function cell(text, cls) {
    var el = document.createElement('span');
    el.className = 'adm-cell' + (cls ? ' ' + cls : '');
    el.textContent = text;
    return el;
  }

  var KIND = { system: '系统', admin: '管理员', reward: '奖励' };

  function load() {
    getJSON('/api/admin/messages').then(function (r) {
      if (!r.body || !r.body.ok) { say('消息载入失败'); return; }
      var rows = r.body.items || [];
      var list = $('msList');
      list.textContent = '';

      rows.forEach(function (m) {
        var row = document.createElement('div');
        row.className = 'adm-tr adm-tr--msg';

        row.appendChild(cell(m.username));

        var main = document.createElement('span');
        main.className = 'adm-cell';
        var b = document.createElement('b');
        b.textContent = m.title;
        main.appendChild(b);
        if (m.body) {
          var d = document.createElement('span');
          d.className = 'adm-cell--detail';
          d.textContent = m.body;
          main.appendChild(d);
        }
        row.appendChild(main);

        row.appendChild(cell(KIND[m.kind] || m.kind));

        var st = document.createElement('span');
        st.className = 'adm-cell';
        var tag = document.createElement('span');
        tag.className = 'adm-tag';
        tag.setAttribute('data-s', m.read ? 'paid' : 'pending');
        tag.textContent = m.read ? '已读' : '未读';
        st.appendChild(tag);
        row.appendChild(st);

        row.appendChild(cell(fmtTime(m.at)));

        list.appendChild(row);
      });

      var empty = $('msEmpty');
      if (empty) empty.hidden = rows.length > 0;

      if ($('msgCount')) $('msgCount').textContent = String(rows.length);
    });
  }

  var form = $('msForm');
  if (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = $('msMsg');
      msg.textContent = '';
      msg.classList.remove('is-error');

      var title = $('msTitle').value.trim();
      var body = $('msBody').value.trim();
      var all = $('msAll').checked;
      var uid = Number($('msUid').value) || 0;

      if (!title) {
        msg.textContent = '请填写标题';
        msg.classList.add('is-error');
        return;
      }
      if (!all && !uid) {
        msg.textContent = '填 UID，或者勾选发给全部';
        msg.classList.add('is-error');
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;

      postJSON('/api/admin/messages/send', {
        uid: uid,
        all: all,
        title: title,
        body: body,
        kind: $('msKind').value
      }).then(function (r) {
        btn.disabled = false;
        if (r.body && r.body.ok) {
          msg.textContent = '已发送 ' + r.body.count + ' 条';
          $('msTitle').value = '';
          $('msBody').value = '';
          $('msUid').value = '';
          $('msAll').checked = false;
          load();
        } else {
          var e = (r.body && r.body.error) || '网络错误';
          msg.textContent = e === 'user_not_found' ? '这个 UID 不存在' : ('发送失败：' + e);
          msg.classList.add('is-error');
        }
      });
    });
  }

  getJSON('/api/auth/me').then(function (r) {
    if (r.status !== 200 || !r.body || !r.body.ok) {
      location.replace('/login?next=' + encodeURIComponent(location.pathname));
      return;
    }
    var me = r.body.user;
    if (me.role !== 'owner' && me.role !== 'admin') {
      location.replace('/home');
      return;
    }
    if (window.CF && CF.cache) CF.cache.set(me);
    if ($('navName')) $('navName').textContent = me.username || '我';
    if ($('navBal') && me.fc && window.CF) CF.amount($('navBal'), me.fc);
    load();
  });
})();
