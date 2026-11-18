/* ============================================================
   乘法 · 公告页
   数据来自公开接口 /api/announcements，未登录也能看。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }

  var listEl = $('ntList');
  var emptyEl = $('ntEmpty');
  var metaEl = $('ntMeta');

  function noticeEl(n) {
    var box = document.createElement('article');
    box.className = 'nt' + (n.pinned ? ' is-pinned' : '');
    box.setAttribute('data-lv', n.level || 'info');

    var head = document.createElement('div');
    head.className = 'nt__head';

    if (n.pinned) {
      var pin = document.createElement('span');
      pin.className = 'nt__pin';
      pin.textContent = 'PIN';
      head.appendChild(pin);
    }

    if (n.title) {
      var t = document.createElement('h2');
      t.className = 'nt__t';
      t.textContent = n.title;
      head.appendChild(t);
    }

    var at = document.createElement('span');
    at.className = 'nt__at';
    at.textContent = fmtDate(n.at);
    head.appendChild(at);

    box.appendChild(head);

    var b = document.createElement('p');
    b.className = 'nt__b';
    b.textContent = n.body;
    box.appendChild(b);

    return box;
  }

  fetch('/api/announcements', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.ok) {
        if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = '公告载入失败，请稍后刷新。'; }
        if (metaEl) metaEl.textContent = '';
        return;
      }

      var items = d.items || [];
      if (metaEl) {
        metaEl.textContent = items.length
          ? '共 ' + items.length + ' 条 · 最新的排在最前'
          : '暂时没有公告';
      }

      items.forEach(function (n) { listEl.appendChild(noticeEl(n)); });
      if (emptyEl) emptyEl.hidden = items.length > 0;
    })
    .catch(function () {
      if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = '网络连接失败，请稍后刷新。'; }
    });
})();
