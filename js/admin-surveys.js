/* ============================================================
   乘法 · 后台问卷管理
   录入 / 编辑 / 上下架 / 提拔到站长推荐
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var STATUS = { open: '开放', paused: '暂停', closed: '关闭' };

  function trimNum(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  function setAmt(el, v) {
    if (window.CF && CF.amount) CF.amount(el, v);
    else if (el) el.textContent = trimNum(v);
  }

  var toastEl = $('toast');
  var toastTimer = null;

  function say(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2400);
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
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .catch(function () { return { status: 0, body: null }; });
  }

  function paintNav(me) {
    var name = $('navName');
    if (name) name.textContent = me.username || '我';
    var bal = $('navBal');
    if (bal && me.fc) setAmt(bal, me.fc);
  }

  /* ---------- 表单 ---------- */

  var form = $('svForm');
  var msgEl = $('svMsg');
  var listEl = $('svList');
  var emptyEl = $('svEmpty');
  var items = [];

  function setMsg(text, bad) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.classList.toggle('is-error', !!bad);
  }

  function fillForm(s) {
    $('svId').value = s ? s.id : '';
    $('svTitle').value = s ? s.title : '';
    $('svPrice').value = s ? s.price : '';
    $('svProvider').value = s ? s.provider : '';
    $('svGrade').value = s ? s.grade : '';
    $('svStars').value = String(s ? s.stars : 0);
    $('svDur').value = s && s.durationMin ? s.durationMin : '';
    $('svTopic').value = s ? s.topic : '';
    $('svEntry').value = s ? s.entry : '';
    $('svReq').value = s ? s.requirement : '';
    $('svStatus').value = s ? s.status : 'open';
    $('svFormTitle').textContent = s ? '编辑问卷 #' + s.id : '新增问卷';
  }

  /* ---------- 列表 ---------- */

  function starsText(n) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += i <= n ? '★' : '☆';
    return out;
  }

  function rowEl(s) {
    var row = document.createElement('div');
    row.className = 'adm-tr adm-tr--sv';

    var price = document.createElement('span');
    price.className = 'adm-cell adm-cell--num';
    var num = document.createElement('span');
    setAmt(num, s.price);
    var unit = document.createElement('i');
    unit.setAttribute('data-cur', 'code');
    unit.textContent = 'CFB';
    price.appendChild(num);
    price.appendChild(unit);

    var title = document.createElement('span');
    title.className = 'adm-cell';
    var b = document.createElement('b');
    b.textContent = s.title;
    title.appendChild(b);

    var sub = [];
    if (s.provider) sub.push(s.provider);
    if (s.durationMin) sub.push(s.durationMin + ' 分钟');
    if (s.topic) sub.push(s.topic);
    if (sub.length) {
      var detail = document.createElement('span');
      detail.className = 'adm-cell--detail';
      detail.textContent = ' · ' + sub.join(' · ');
      title.appendChild(detail);
    }

    var rate = document.createElement('span');
    rate.className = 'adm-cell';
    rate.textContent = (s.grade ? s.grade + ' 级' : '—') + (s.stars ? ' · ' + starsText(s.stars) : '');

    var status = document.createElement('span');
    status.className = 'adm-cell';
    status.textContent = STATUS[s.status] || s.status;

    var feat = document.createElement('span');
    feat.className = 'adm-cell';
    feat.textContent = s.featured ? '推荐位' : '—';

    var ops = document.createElement('span');
    ops.className = 'adm-cell adm-sv__ops';

    function op(label, act, on) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'adm-sv__op' + (on ? ' is-on' : '');
      btn.textContent = label;
      btn.setAttribute('data-act', act);
      btn.setAttribute('data-id', String(s.id));
      ops.appendChild(btn);
    }

    op('编辑', 'edit');
    op(s.featured ? '取消推荐' : '设为推荐', 'feature', s.featured);
    op('删除', 'del');

    [price, title, rate, status, feat, ops].forEach(function (el) { row.appendChild(el); });
    return row;
  }

  function render() {
    listEl.innerHTML = '';
    items.forEach(function (s) { listEl.appendChild(rowEl(s)); });

    var total = items.length;
    var feats = items.filter(function (s) { return s.featured; }).length;
    $('svCount').textContent = String(total);
    $('svFeatCount').textContent = String(feats);
    if (emptyEl) emptyEl.hidden = total > 0;
  }

  function load() {
    return getJSON('/api/admin/surveys').then(function (r) {
      if (r.status === 200 && r.body && r.body.ok) {
        items = r.body.items || [];
      } else {
        items = [];
        say('问卷列表载入失败');
      }
      render();
    });
  }

  /* ---------- 交互 ---------- */

  if (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();

      var title = $('svTitle').value.trim();
      if (!title) {
        setMsg('标题不能为空。', true);
        $('svTitle').focus();
        return;
      }

      var payload = {
        title: title,
        price: $('svPrice').value,
        provider: $('svProvider').value.trim(),
        grade: $('svGrade').value.trim(),
        stars: Number($('svStars').value) || 0,
        durationMin: Number($('svDur').value) || 0,
        topic: $('svTopic').value.trim(),
        entry: $('svEntry').value.trim(),
        requirement: $('svReq').value.trim(),
        status: $('svStatus').value
      };

      var id = $('svId').value;
      if (id) payload.id = Number(id);

      setMsg('保存中…');
      postJSON('/api/admin/surveys/save', payload).then(function (r) {
        if (r.status === 200 && r.body && r.body.ok) {
          setMsg('');
          say(id ? '已保存' : '已新增');
          fillForm(null);
          load();
        } else {
          setMsg('保存失败：' + ((r.body && r.body.error) || '未知错误'), true);
        }
      });
    });
  }

  var resetBtn = $('svReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      fillForm(null);
      setMsg('');
    });
  }

  if (listEl) {
    listEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.adm-sv__op') : null;
      if (!btn) return;

      var id = Number(btn.getAttribute('data-id'));
      var act = btn.getAttribute('data-act');
      var item = items.filter(function (s) { return s.id === id; })[0];

      if (act === 'edit' && item) {
        fillForm(item);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (act === 'feature' && item) {
        btn.disabled = true;
        postJSON('/api/admin/surveys/feature', { id: id, featured: item.featured ? 0 : 1 })
          .then(function (r) {
            btn.disabled = false;
            if (r.status === 200 && r.body && r.body.ok) {
              say(item.featured ? '已移出推荐位' : '已进入推荐位');
              load();
            } else {
              say('操作失败');
            }
          });
        return;
      }

      if (act === 'del') {
        if (!window.confirm('删除后无法恢复，确定删除这份问卷？')) return;
        postJSON('/api/admin/surveys/delete', { id: id }).then(function (r) {
          if (r.status === 200 && r.body && r.body.ok) {
            say('已删除');
            load();
          } else {
            say('删除失败');
          }
        });
      }
    });
  }

  /* ---------- 启动 ---------- */

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
    paintNav(me);
    fillForm(null);
    load();
  });
})();
