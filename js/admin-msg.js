/* ============================================================
   Chengfa · 后台公告与消息
   公告是公开文本（谁都能看），消息是提醒（有已读状态）。
   全员提醒在后台按批次合并成一条「提醒所有人」。
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

  var LEVEL = { info: '普通', warn: '提醒', critical: '重要' };
  var KIND = { system: '系统', admin: '管理员', reward: '奖励' };

  /* ============================================================
     公告
     ============================================================ */

  var notices = [];

  function setMsg(el, text, bad) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!bad);
  }

  function noticeRow(n) {
    var row = document.createElement('div');
    row.className = 'adm-tr adm-tr--nt';

    var st = document.createElement('span');
    st.className = 'adm-cell';
    var tag = document.createElement('span');
    tag.className = 'adm-tag';
    tag.setAttribute('data-s', n.status === 'published' ? 'paid' : 'void');
    tag.textContent = n.status === 'published' ? '已发布' : '草稿';
    st.appendChild(tag);
    if (n.pinned) {
      var pin = document.createElement('span');
      pin.className = 'adm-tag adm-tag--pin';
      pin.textContent = '置顶';
      st.appendChild(pin);
    }
    row.appendChild(st);

    var main = document.createElement('span');
    main.className = 'adm-cell';
    var b = document.createElement('b');
    b.textContent = n.title || (n.body.length > 24 ? n.body.slice(0, 24) + '…' : n.body);
    main.appendChild(b);
    var d = document.createElement('span');
    d.className = 'adm-cell--detail';
    d.textContent = n.body;
    main.appendChild(d);
    row.appendChild(main);

    var lv = document.createElement('span');
    lv.className = 'adm-cell';
    var lvTag = document.createElement('span');
    lvTag.className = 'adm-lv';
    lvTag.setAttribute('data-lv', n.level);
    lvTag.textContent = LEVEL[n.level] || n.level;
    lv.appendChild(lvTag);
    row.appendChild(lv);

    row.appendChild(cell(fmtTime(n.at)));

    var ops = document.createElement('span');
    ops.className = 'adm-sv__ops';

    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'adm-sv__op';
    edit.textContent = '编辑';
    edit.addEventListener('click', function () {
      fillNoticeForm(n);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'adm-sv__op';
    toggle.textContent = n.status === 'published' ? '转为草稿' : '发布';
    toggle.addEventListener('click', function () {
      postJSON('/api/admin/announcements/save', {
        id: n.id,
        title: n.title,
        body: n.body,
        level: n.level,
        pinned: n.pinned,
        status: n.status === 'published' ? 'draft' : 'published'
      }).then(function (r) {
        if (r.body && r.body.ok) {
          say(n.status === 'published' ? '已转为草稿，前台不再显示' : '已发布');
          loadNotices();
        } else {
          say('操作失败');
        }
      });
    });

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'adm-sv__op';
    del.textContent = '删除';
    del.addEventListener('click', function () {
      if (!window.confirm('删除后无法恢复，确定？')) return;
      postJSON('/api/admin/announcements/delete', { id: n.id }).then(function (r) {
        if (r.body && r.body.ok) { say('已删除'); loadNotices(); }
        else say('删除失败');
      });
    });

    ops.appendChild(edit);
    ops.appendChild(toggle);
    ops.appendChild(del);
    row.appendChild(ops);

    return row;
  }

  /* 表单处于「编辑某条」还是「新建」：标题与按钮文案跟着走 */
  function syncNoticeMode() {
    var id = $('ntId').value;
    $('ntFormTitle').textContent = id ? '编辑公告 #' + id : '发布公告';
    if ($('ntPublish')) $('ntPublish').textContent = id ? '保存并发布' : '发布';
    if ($('ntDraft')) $('ntDraft').textContent = id ? '转为草稿' : '存草稿';
  }

  function fillNoticeForm(n) {
    $('ntId').value = n ? n.id : '';
    $('ntTitle').value = n ? n.title : '';
    $('ntBody').value = n ? n.body : '';
    $('ntLevel').value = n ? n.level : 'info';
    $('ntPinned').checked = n ? n.pinned : false;
    syncNoticeMode();
    setMsg($('ntMsg'), '');
  }

  function paintNotices() {
    var list = $('ntList');
    if (!list) return;
    list.textContent = '';
    notices.forEach(function (n) { list.appendChild(noticeRow(n)); });

    var empty = $('ntEmpty');
    if (empty) empty.hidden = notices.length > 0;

    var cnt = $('ntCount');
    if (cnt) {
      cnt.textContent = String(notices.filter(function (n) { return n.status === 'published'; }).length);
    }
  }

  function loadNotices() {
    getJSON('/api/admin/announcements').then(function (r) {
      if (r.body && r.body.ok) {
        notices = r.body.items || [];
        paintNotices();
      } else {
        say('公告载入失败');
      }
    });
  }

  function submitNotice(status) {
    var body = $('ntBody').value.trim();
    var msg = $('ntMsg');
    setMsg(msg, '');

    if (!body) {
      setMsg(msg, '正文不能为空', true);
      return;
    }

    var payload = {
      id: $('ntId').value || 0,
      title: $('ntTitle').value.trim(),
      body: body,
      level: $('ntLevel').value,
      pinned: $('ntPinned').checked,
      status: status
    };

    var btns = [$('ntPublish'), $('ntDraft')];
    btns.forEach(function (b) { if (b) b.disabled = true; });

    postJSON('/api/admin/announcements/save', payload).then(function (r) {
      btns.forEach(function (b) { if (b) b.disabled = false; });
      if (r.body && r.body.ok) {
        /* 存完不清空：把 id 留在表单里，接着点「保存并发布」就是更新这一条 */
        if (r.body.id) $('ntId').value = r.body.id;
        syncNoticeMode();
        setMsg(msg, status === 'published'
          ? '已发布，前台立即可见'
          : '已存为草稿，内容还在表单里，点「保存并发布」就能上线');
        loadNotices();
      } else {
        var e = (r.body && r.body.error) || '网络错误';
        setMsg(msg, e === 'empty_body' ? '正文不能为空' : ('保存失败：' + e), true);
      }
    });
  }

  /* ============================================================
     提醒（站内消息）
     ============================================================ */

  function loadMessages() {
    getJSON('/api/admin/messages').then(function (r) {
      if (!r.body || !r.body.ok) { say('消息载入失败'); return; }

      var items = r.body.items || [];
      var list = $('msList');
      list.textContent = '';

      /* 全员提醒按批次合并，一条批次只显示一行「提醒所有人」 */
      var groups = [];
      var byBatch = {};

      items.forEach(function (m) {
        if (m.batch) {
          if (!byBatch[m.batch]) {
            byBatch[m.batch] = {
              mode: 'all', title: m.title, body: m.body, kind: m.kind,
              at: m.at, total: 0, read: 0
            };
            groups.push(byBatch[m.batch]);
          }
          byBatch[m.batch].total++;
          if (m.read) byBatch[m.batch].read++;
        } else {
          groups.push({
            mode: 'single', username: m.username, title: m.title,
            body: m.body, kind: m.kind, at: m.at, read: m.read
          });
        }
      });

      groups.forEach(function (g) {
        var row = document.createElement('div');
        row.className = 'adm-tr adm-tr--msg';

        var who = document.createElement('span');
        who.className = 'adm-cell';
        var wn = document.createElement('b');
        wn.textContent = g.mode === 'all' ? '所有人' : g.username;
        who.appendChild(wn);
        if (g.mode === 'all') {
          var wd = document.createElement('span');
          wd.className = 'adm-cell--detail';
          wd.textContent = '共 ' + g.total + ' 人 · 已读 ' + g.read;
          who.appendChild(wd);
        }
        row.appendChild(who);

        var main = document.createElement('span');
        main.className = 'adm-cell';
        var b = document.createElement('b');
        b.textContent = g.title;
        main.appendChild(b);
        if (g.body) {
          var d = document.createElement('span');
          d.className = 'adm-cell--detail';
          d.textContent = g.body;
          main.appendChild(d);
        }
        row.appendChild(main);

        row.appendChild(cell(KIND[g.kind] || g.kind));

        var st = document.createElement('span');
        st.className = 'adm-cell';
        var tag = document.createElement('span');
        tag.className = 'adm-tag';
        if (g.mode === 'all') {
          tag.setAttribute('data-s', g.read === g.total ? 'paid' : 'pending');
          tag.textContent = g.read === g.total ? '全部已读' : '待读';
        } else {
          tag.setAttribute('data-s', g.read ? 'paid' : 'pending');
          tag.textContent = g.read ? '已读' : '未读';
        }
        st.appendChild(tag);
        row.appendChild(st);

        row.appendChild(cell(fmtTime(g.at)));
        list.appendChild(row);
      });

      var empty = $('msEmpty');
      if (empty) empty.hidden = groups.length > 0;

      if ($('msgCount')) $('msgCount').textContent = String(items.length);
    });
  }

  function sendMessage() {
    var form = $('msForm');
    if (!form) return;

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
        msg.textContent = '填 UID，或者勾选「提醒所有人」';
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
          msg.textContent = r.body.mode === 'all'
            ? '已提醒所有人（' + r.body.count + ' 个账户）'
            : '已发送';
          $('msTitle').value = '';
          $('msBody').value = '';
          $('msUid').value = '';
          $('msAll').checked = false;
          loadMessages();
        } else {
          var e = (r.body && r.body.error) || '网络错误';
          msg.textContent = e === 'user_not_found' ? '这个 UID 不存在' : ('发送失败：' + e);
          msg.classList.add('is-error');
        }
      });
    });
  }

  /* ============================================================
     启动
     ============================================================ */

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

    var ntForm = $('ntForm');
    if (ntForm) {
      ntForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        submitNotice('published');
      });
    }
    if ($('ntDraft')) $('ntDraft').addEventListener('click', function () { submitNotice('draft'); });
    if ($('ntReset')) $('ntReset').addEventListener('click', function () { fillNoticeForm(null); });

    sendMessage();
    fillNoticeForm(null);
    loadNotices();
    loadMessages();
  });
})();
