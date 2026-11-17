/* ============================================================
   乘法 · 后台商品、卡密与订单
   同一个脚本服务 /admin/items 与 /admin/orders 两个页面。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var page = document.body.getAttribute('data-page');

  function trimNum(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  function setAmt(el, v) {
    if (window.CF && CF.amount) CF.amount(el, v);
    else if (el) el.textContent = trimNum(v);
  }

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

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { say('已复制'); })
        .catch(function () { say('复制失败'); });
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); say('已复制'); } catch (e) { say('复制失败'); }
    document.body.removeChild(ta);
  }

  var KIND = { code: '兑换码', sub: '订阅', cash: '现金' };
  var ORD_ST = { paid: '已完成', pending: '待发货', refunded: '已退款' };

  function cell(text, cls) {
    var el = document.createElement('span');
    el.className = 'adm-cell' + (cls ? ' ' + cls : '');
    el.textContent = text;
    return el;
  }

  function moneyCell(v) {
    var el = document.createElement('span');
    el.className = 'adm-cell adm-cell--num';
    var b = document.createElement('b');
    setAmt(b, v);
    var i = document.createElement('i');
    i.setAttribute('data-cur', 'code');
    i.textContent = 'CFB';
    el.appendChild(b);
    el.appendChild(i);
    return el;
  }

  /* ============================================================
     商品与卡密
     ============================================================ */

  var items = [];
  var cds = [];

  function setMsg(el, text, bad) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!bad);
  }

  function fillItemForm(it) {
    $('itId').value = it ? it.id : '';
    $('itTitle').value = it ? it.title : '';
    $('itKind').value = it ? it.kind : 'code';
    $('itPrice').value = it ? trimNum(it.rawPrice / 10000) : '';
    $('itStock').value = it ? String(it.stock) : '-1';
    $('itSort').value = it ? String(it.sort) : '0';
    $('itSubtitle').value = it ? it.subtitle : '';
    $('itStatus').value = it ? it.status : 'on';
    $('itNote').value = it ? it.note : '';
    $('itDeliver').value = it ? it.deliver : '';
    $('itFormTitle').textContent = it ? '编辑商品 #' + it.id : '新增商品';
  }

  function itemRow(it) {
    var row = document.createElement('div');
    row.className = 'adm-tr adm-tr--it';

    row.appendChild(moneyCell(it.price));

    var main = document.createElement('span');
    main.className = 'adm-cell';
    var b = document.createElement('b');
    b.textContent = it.title;
    main.appendChild(b);
    if (it.subtitle || it.status === 'off') {
      var d = document.createElement('span');
      d.className = 'adm-cell--detail';
      d.textContent = [it.subtitle, it.status === 'off' ? '已下架' : ''].filter(Boolean).join(' · ');
      main.appendChild(d);
    }
    row.appendChild(main);

    row.appendChild(cell(KIND[it.kind] || it.kind));

    var stock = document.createElement('span');
    stock.className = 'adm-cell';
    stock.textContent = it.stock < 0 ? '不限量' : (it.stock === 0 ? '已兑完' : it.stock + ' 件');
    if (it.kind === 'code') {
      var f = document.createElement('span');
      f.className = 'adm-cell--detail';
      f.textContent = '卡密 ' + it.freeCodes + ' 个';
      stock.appendChild(f);
    }
    row.appendChild(stock);

    row.appendChild(cell(String(it.sold || 0)));

    var ops = document.createElement('span');
    ops.className = 'adm-sv__ops';

    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'adm-sv__op';
    edit.textContent = '编辑';
    edit.addEventListener('click', function () {
      fillItemForm(it);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'adm-sv__op';
    del.textContent = '删除';
    del.addEventListener('click', function () {
      if (!window.confirm('删除商品会同时清掉它未使用的卡密，确定？')) return;
      postJSON('/api/admin/items/delete', { id: it.id }).then(function (r) {
        if (r.body && r.body.ok) { say('已删除'); loadItems(); loadCdk(); }
        else if (r.body && r.body.error === 'has_orders') say('该商品已有订单，改成下架更稳妥');
        else say('删除失败');
      });
    });

    ops.appendChild(edit);
    ops.appendChild(del);
    row.appendChild(ops);

    return row;
  }

  function paintItems() {
    var list = $('itList');
    if (!list) return;
    list.textContent = '';
    items.forEach(function (it) { list.appendChild(itemRow(it)); });

    var empty = $('itEmpty');
    if (empty) empty.hidden = items.length > 0;

    var cnt = $('itCount');
    if (cnt) cnt.textContent = String(items.length);

    var sel = $('cdItem');
    if (sel) {
      var cur = sel.value;
      sel.innerHTML = '<option value="">通用充值码</option>';
      items.forEach(function (it) {
        var op = document.createElement('option');
        op.value = String(it.id);
        op.textContent = it.title;
        sel.appendChild(op);
      });
      if (cur) sel.value = cur;
    }
  }

  function loadItems() {
    getJSON('/api/admin/items').then(function (r) {
      if (r.body && r.body.ok) {
        items = r.body.items || [];
        paintItems();
      } else {
        say('商品载入失败');
      }
    });
  }

  function cdkRow(cd) {
    var row = document.createElement('div');
    row.className = 'adm-tr adm-tr--cd';

    var code = document.createElement('span');
    code.className = 'adm-cell adm-code';
    code.textContent = cd.code;
    code.title = '点击复制';
    code.style.cursor = 'pointer';
    code.addEventListener('click', function () { copyText(cd.code); });
    row.appendChild(code);

    var owner = cell(cd.itemId ? ('商品 #' + cd.itemId) : '通用');
    row.appendChild(owner);

    row.appendChild(cell(cd.value ? cd.value + ' CFB' : '—'));

    var st = document.createElement('span');
    st.className = 'adm-cell';
    var badge = document.createElement('span');
    badge.className = 'adm-tag';
    badge.setAttribute('data-s', cd.status);
    badge.textContent = cd.status === 'free' ? '可用' : cd.status === 'used' ? '已用' : '作废';
    st.appendChild(badge);
    row.appendChild(st);

    row.appendChild(cell(cd.usedBy ? 'UID ' + cd.usedBy : '—'));

    var ops = document.createElement('span');
    ops.className = 'adm-sv__ops';
    if (cd.status === 'free') {
      var v = document.createElement('button');
      v.type = 'button';
      v.className = 'adm-sv__op';
      v.textContent = '作废';
      v.addEventListener('click', function () {
        postJSON('/api/admin/cdk/void', { id: cd.id }).then(function (r) {
          if (r.body && r.body.ok) { say('已作废'); loadCdk(); }
          else say('操作失败');
        });
      });
      ops.appendChild(v);
    } else {
      ops.appendChild(cell('—'));
    }
    row.appendChild(ops);

    return row;
  }

  function paintCdk(data) {
    cds = data.items || [];
    var list = $('cdList');
    if (list) {
      list.textContent = '';
      cds.forEach(function (cd) { list.appendChild(cdkRow(cd)); });
    }

    var empty = $('cdEmpty');
    if (empty) empty.hidden = cds.length > 0;

    var s = data.stats || {};
    if ($('cdStatFree')) $('cdStatFree').textContent = String(s.free || 0);
    if ($('cdStatUsed')) $('cdStatUsed').textContent = String(s.used || 0);
    if ($('cdStatVoid')) $('cdStatVoid').textContent = String(s.void || 0);
    if ($('cdFree')) $('cdFree').textContent = String(s.free || 0);
  }

  function loadCdk() {
    getJSON('/api/admin/cdk').then(function (r) {
      if (r.body && r.body.ok) paintCdk(r.body);
    });
  }

  function initItems() {
    var form = $('itForm');
    if (!form) return;

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = $('itMsg');
      setMsg(msg, '');

      var title = $('itTitle').value.trim();
      var price = Number($('itPrice').value);
      if (!title) { setMsg(msg, '请填写商品名称', true); return; }
      if (!isFinite(price) || price <= 0) { setMsg(msg, '价格必须大于 0', true); return; }

      var payload = {
        id: $('itId').value || 0,
        title: title,
        subtitle: $('itSubtitle').value.trim(),
        kind: $('itKind').value,
        price: price,
        stock: Number($('itStock').value),
        sort: Number($('itSort').value),
        status: $('itStatus').value,
        note: $('itNote').value.trim(),
        deliver: $('itDeliver').value.trim()
      };

      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;

      postJSON('/api/admin/items/save', payload).then(function (r) {
        btn.disabled = false;
        if (r.body && r.body.ok) {
          setMsg(msg, '已保存');
          fillItemForm(null);
          loadItems();
        } else {
          setMsg(msg, '保存失败：' + ((r.body && r.body.error) || '网络错误'), true);
        }
      });
    });

    $('itReset').addEventListener('click', function () {
      fillItemForm(null);
      setMsg($('itMsg'), '');
    });

    var cdForm = $('cdForm');
    if (cdForm) {
      cdForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var msg = $('cdMsg');
        setMsg(msg, '');

        var itemId = Number($('cdItem').value) || 0;
        var value = Number($('cdValue').value) || 0;
        var codes = $('cdCodes').value.trim();

        if (!itemId && value <= 0 && !codes) {
          setMsg(msg, '通用充值码要填面额，或直接粘现成卡密', true);
          return;
        }

        var btn = cdForm.querySelector('button[type="submit"]');
        btn.disabled = true;

        postJSON('/api/admin/cdk/generate', {
          itemId: itemId,
          value: value,
          count: Number($('cdCount').value) || 1,
          batch: $('cdBatch').value.trim(),
          codes: codes
        }).then(function (r) {
          btn.disabled = false;
          if (r.body && r.body.ok) {
            setMsg(msg, '已生成 ' + r.body.count + ' 个，批次 ' + r.body.batch);
            $('cdCodes').value = '';
            loadCdk();
            loadItems();
          } else {
            var e = (r.body && r.body.error) || '网络错误';
            var txt = e === 'need_value' ? '通用码必须填面额' : e === 'no_codes' ? '没有解析到有效卡密' : e;
            setMsg(msg, '生成失败：' + txt, true);
          }
        });
      });
    }

    fillItemForm(null);
    loadItems();
    loadCdk();
  }

  /* ============================================================
     订单
     ============================================================ */

  var ordFilter = '';

  function orderRow(o) {
    var row = document.createElement('div');
    row.className = 'adm-tr adm-tr--ord';

    var sn = document.createElement('span');
    sn.className = 'adm-cell adm-code';
    sn.textContent = o.sn;
    row.appendChild(sn);

    var main = document.createElement('span');
    main.className = 'adm-cell';
    var b = document.createElement('b');
    b.textContent = o.title;
    main.appendChild(b);
    var d = document.createElement('span');
    d.className = 'adm-cell--detail';
    d.textContent = o.username + (o.code ? ' · ' + o.code : '') + (o.memo ? ' · ' + o.memo : '');
    main.appendChild(d);
    row.appendChild(main);

    row.appendChild(moneyCell(o.price));

    var st = document.createElement('span');
    st.className = 'adm-cell';
    var badge = document.createElement('span');
    badge.className = 'adm-tag';
    badge.setAttribute('data-s', o.status);
    badge.textContent = ORD_ST[o.status] || o.status;
    st.appendChild(badge);
    row.appendChild(st);

    row.appendChild(cell(fmtTime(o.at)));

    var ops = document.createElement('span');
    ops.className = 'adm-sv__ops';

    if (o.status === 'pending') {
      var ship = document.createElement('button');
      ship.type = 'button';
      ship.className = 'adm-sv__op is-on';
      ship.textContent = '发货';
      ship.addEventListener('click', function () { decide(o, 'paid'); });
      ops.appendChild(ship);
    }

    if (o.status !== 'refunded') {
      var rf = document.createElement('button');
      rf.type = 'button';
      rf.className = 'adm-sv__op';
      rf.textContent = '退款';
      rf.addEventListener('click', function () {
        if (!window.confirm('退款会把 ' + trimNum(o.price) + ' 退回用户余额并作废卡密，确定？')) return;
        decide(o, 'refunded');
      });
      ops.appendChild(rf);
    }

    if (!ops.children.length) ops.appendChild(cell('—'));
    row.appendChild(ops);

    return row;
  }

  function decide(o, action) {
    postJSON('/api/admin/orders/decide', { id: o.id, action: action }).then(function (r) {
      if (r.body && r.body.ok) {
        say(action === 'paid' ? '已标记发货' : '已退款');
        loadOrders();
      } else {
        say('操作失败：' + ((r.body && r.body.error) || '网络错误'));
      }
    });
  }

  function paintOrders(data) {
    var list = $('ordList');
    var rows = data.items || [];

    if (list) {
      list.textContent = '';
      rows.forEach(function (o) { list.appendChild(orderRow(o)); });
    }

    var empty = $('ordEmpty');
    if (empty) {
      empty.hidden = rows.length > 0;
      empty.textContent = ordFilter ? '这个状态下没有订单。' : '还没有订单。';
    }

    var pending = rows.filter(function (o) { return o.status === 'pending'; }).length;
    if ($('ordPending')) $('ordPending').textContent = String(pending);
    if ($('ordTotal')) $('ordTotal').textContent = String(rows.length);
  }

  function loadOrders() {
    getJSON('/api/admin/orders' + (ordFilter ? '?status=' + ordFilter : '')).then(function (r) {
      if (r.body && r.body.ok) paintOrders(r.body);
      else say('订单载入失败');
    });
  }

  function initOrders() {
    document.querySelectorAll('#ordFilters .adm-f').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#ordFilters .adm-f').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        ordFilter = b.getAttribute('data-s') || '';
        loadOrders();
      });
    });
    loadOrders();
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
    if ($('navBal') && me.fc) setAmt($('navBal'), me.fc);

    if (page === 'admin-items') initItems();
    else if (page === 'admin-orders') initOrders();
  });
})();
