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

  /* ---------- 题目编辑（站内作答） ---------- */

  var SCEN = [
    ['', '不绑定结局'],
    ['success', '通过 · 奖励入账'],
    ['fail', '失败 · 接口 500'],
    ['speed', '超速 · 判作废'],
    ['quota', '配额满 · 被退回'],
    ['kick', '被踢 · 中途终止'],
    ['reject', '打回 · 延迟冲正']
  ];

  var kindEl = $('svKind');
  var paperWrap = $('svPaperWrap');
  var paperList = $('svPaperList');
  var paperEmpty = $('svPaperEmpty');
  var entryWrap = $('svEntryWrap');
  var entryEl = $('svEntry');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isInline() {
    return kindEl && kindEl.value === 'inline';
  }

  function syncKind() {
    var inline = isInline();
    if (paperWrap) paperWrap.hidden = !inline;
    if (entryWrap) entryWrap.hidden = inline;
    if (entryEl) entryEl.disabled = inline;
    renumber();
  }

  function renumber() {
    if (!paperList) return;
    var qs = paperList.querySelectorAll('.svp__q');
    [].forEach.call(qs, function (q, i) {
      var n = q.querySelector('.svp__n');
      if (n) n.textContent = ('0' + (i + 1)).slice(-2);
    });
    if (paperEmpty) paperEmpty.hidden = qs.length > 0;
  }

  function optRow(label, outcome) {
    var opts = SCEN.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === (outcome || '') ? ' selected' : '') + '>' +
        esc(o[1]) + '</option>';
    }).join('');
    return '<div class="svp__o">' +
      '<input class="svp__i" data-o type="text" maxlength="200" value="' + esc(label || '') + '" placeholder="选项文字">' +
      '<select class="svp__s" data-out>' + opts + '</select>' +
      '<button class="svp__x" type="button" data-delopt title="删掉这个选项">×</button>' +
      '</div>';
  }

  function addQuestion(q) {
    if (!paperList) return;
    var item = q && typeof q === 'object' ? q : {};
    var list = Array.isArray(item.options) && item.options.length ? item.options : ['', ''];

    var html = '<div class="svp__q">' +
      '<div class="svp__qh">' +
        '<span class="svp__n">01</span>' +
        '<input class="svp__i svp__i--q" data-q type="text" maxlength="300" value="' + esc(item.q || '') + '" placeholder="题干，例如：你平时主要用什么设备上网">' +
        '<button class="svp__x" type="button" data-delq title="删掉这道题">删除</button>' +
      '</div>' +
      '<div class="svp__opts">' + list.map(function (o) {
        if (o && typeof o === 'object') return optRow(o.label, o.outcome);
        return optRow(o, '');
      }).join('') + '</div>' +
      '<button class="svp__add" type="button" data-addopt>+ 加一个选项</button>' +
      '</div>';

    paperList.insertAdjacentHTML('beforeend', html);
    renumber();
  }

  function collectPaper() {
    if (!paperList) return { questions: [] };
    var qs = [].map.call(paperList.querySelectorAll('.svp__q'), function (qEl) {
      var qt = qEl.querySelector('[data-q]');
      var text = qt ? qt.value.trim() : '';
      var opts = [].map.call(qEl.querySelectorAll('.svp__o'), function (oEl) {
        var li = oEl.querySelector('[data-o]');
        var se = oEl.querySelector('[data-out]');
        var label = li ? li.value.trim() : '';
        if (!label) return null;
        var out = se ? se.value : '';
        return out ? { label: label, outcome: out } : label;
      }).filter(Boolean);
      return text && opts.length ? { q: text, options: opts } : null;
    }).filter(Boolean);
    return { questions: qs };
  }

  function paintPaper(raw) {
    if (!paperList) return;
    paperList.innerHTML = '';
    var paper = {};
    try { paper = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch (e) { paper = {}; }
    (paper.questions || []).forEach(addQuestion);
    renumber();
  }

  if (kindEl) kindEl.addEventListener('change', syncKind);

  var addBtn = $('svPaperAdd');
  if (addBtn) addBtn.addEventListener('click', function () { addQuestion(null); });

  if (paperList) {
    paperList.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t.closest) return;

      if (t.closest('[data-addopt]')) {
        var q = t.closest('.svp__q');
        var opts = q.querySelector('.svp__opts');
        if (opts.querySelectorAll('.svp__o').length >= 12) { say('一题最多 12 个选项'); return; }
        opts.insertAdjacentHTML('beforeend', optRow('', ''));
        return;
      }

      if (t.closest('[data-delopt]')) {
        var row = t.closest('.svp__o');
        var box = row.parentNode;
        if (box.querySelectorAll('.svp__o').length <= 1) { say('每题至少留一个选项'); return; }
        row.remove();
        return;
      }

      if (t.closest('[data-delq]')) {
        var item = t.closest('.svp__q');
        item.remove();
        renumber();
      }
    });
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

    if (kindEl) kindEl.value = s && s.kind === 'inline' ? 'inline' : 'link';
    paintPaper(s ? s.paper : '');
    syncKind();
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
    unit.textContent = 'XB';
    price.appendChild(num);
    price.appendChild(unit);

    var title = document.createElement('span');
    title.className = 'adm-cell';
    var b = document.createElement('b');
    b.textContent = s.title;
    title.appendChild(b);

    var sub = [];
    if (s.kind === 'inline') sub.push('站内作答 · ' + (s.questionCount || 0) + ' 题');
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
        status: $('svStatus').value,
        kind: isInline() ? 'inline' : 'link'
      };

      if (isInline()) {
        var paper = collectPaper();
        if (!paper.questions.length) {
          setMsg('选了站内作答，但一道题都没有。至少加一道有选项的题。', true);
          return;
        }
        payload.paper = paper;
      }

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
