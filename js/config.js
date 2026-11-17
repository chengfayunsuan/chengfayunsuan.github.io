/* ============================================================
   乘法 · 全站可配置项
   内部货币以 CFB（乘法币，人民币基准）记账，恒为原始数值。
   CFD（乘法刀，美元）显示时按实时汇率换算：CFD = CFB / usdCny。

   两个互不影响的开关：
   cf-currency   数值按人民币还是美元算   CNY / USD
   cf-cur-style  单位写成字母还是汉字     code（CFB / CFD）/ name（乘法币 / 乘法刀）

   任何带 data-cur 的节点都由本文件统一套用：
     data-cur="amount"  金额，原始 CFB 值存 data-cfb
     data-cur="code"    币种单位，跟随显示形式（CFB 或 乘法币）
     data-cur="name"    固定显示中文名
   动态插入的节点由 MutationObserver 自动接管，渲染方不用手动刷新。
   ============================================================ */
(function () {
  var MODES = {
    CNY: { code: 'CFB', name: '乘法币' },
    USD: { code: 'CFD', name: '乘法刀' }
  };

  var FX_KEY = 'cf-fx';
  var FX_DEFAULT = 7.0;
  var CUR_KEY = 'cf-currency';
  var STYLE_KEY = 'cf-cur-style';

  function mode() {
    var m = '';
    try { m = localStorage.getItem(CUR_KEY) || ''; } catch (e) {}
    return MODES[m] ? m : 'CNY';
  }

  function style() {
    var s = '';
    try { s = localStorage.getItem(STYLE_KEY) || ''; } catch (e) {}
    return s === 'name' ? 'name' : 'code';
  }

  function loadFx() {
    try {
      var s = JSON.parse(localStorage.getItem(FX_KEY) || 'null');
      if (s && Number(s.rate) > 0) return Number(s.rate);
    } catch (e) {}
    return FX_DEFAULT;
  }

  function trim(s) {
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  /* 币种单位该怎么写：字母还是汉字 */
  function labelOf(m) {
    var cur = MODES[m] || MODES.CNY;
    return style() === 'name' ? cur.name : cur.code;
  }

  /* 把 CFB 基准值转成当前模式应显示的数字字符串 */
  function money(v) {
    var n = Number(v) || 0;
    if (mode() === 'USD') n = n / window.CF.rate;
    return trim(n.toFixed(4));
  }

  /* 单个节点套用 */
  function applyOne(el) {
    if (!el || el.nodeType !== 1) return;
    var key = el.getAttribute('data-cur');
    if (!key) return;
    var m = mode();

    if (key === 'amount') {
      if (!el.hasAttribute('data-cfb')) return;
      var raw = Number(el.getAttribute('data-cfb')) || 0;
      var signed = el.getAttribute('data-signed') === '1';
      var txt = money(signed ? Math.abs(raw) : raw);
      if (signed) txt = (raw < 0 ? '−' : '+') + txt;
      el.textContent = txt;
    } else if (key === 'code') {
      el.textContent = labelOf(m);
    } else if (key === 'name') {
      el.textContent = MODES[m].name;
    } else if (key === 'cash') {
      /* 折算对应的真实货币：乘法币对人民币，乘法刀对美元 */
      el.textContent = m === 'USD' ? '美元' : '人民币';
    }
  }

  function apply(root) {
    var m = mode();
    window.CF.currency = {
      mode: m,
      code: labelOf(m),
      name: MODES[m].name,
      style: style()
    };

    /* 显示形式按钮的选中态 */
    var styleBtns = document.querySelectorAll('[data-cur-style]');
    for (var s = 0; s < styleBtns.length; s++) {
      var onStyle = styleBtns[s].getAttribute('data-cur-style') === style();
      styleBtns[s].classList.toggle('is-on', onStyle);
      styleBtns[s].setAttribute('aria-pressed', onStyle ? 'true' : 'false');
    }

    var nodes = (root || document).querySelectorAll('[data-cur]');
    for (var i = 0; i < nodes.length; i++) applyOne(nodes[i]);
  }

  /* ---------- 动态节点自动接管 ----------
     页面渲染常发生在初始化之后，手动调 refresh 容易漏。
     这里直接盯新增节点，凡带 data-cur 立即套用。 */

  function watchDynamic() {
    if (!window.MutationObserver) return;

    var mo = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var added = list[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.hasAttribute && n.hasAttribute('data-cur')) applyOne(n);
          if (n.querySelectorAll) {
            var kids = n.querySelectorAll('[data-cur]');
            for (var q = 0; q < kids.length; q++) applyOne(kids[q]);
          }
        }
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function loadRate() {
    fetch('/api/fx', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        var v = Number(d.usdCny);
        if (!(v > 0)) return;
        try { localStorage.setItem(FX_KEY, JSON.stringify({ rate: v, at: Date.now() })); } catch (e) {}
        if (Math.abs(v - window.CF.rate) > 0.0001) {
          window.CF.rate = v;
          apply();
        }
      })
      .catch(function () {});
  }

  var listeners = [];

  window.CF = {
    currency: { mode: 'CNY', code: 'CFB', name: '乘法币', style: 'code' },
    rate: loadFx(),
    /* 金额显示：传 CFB 基准值，返回当前模式下的数字 */
    money: money,
    /* 给金额节点标记原始 CFB 值，并立即套用当前显示 */
    amount: function (el, v) {
      if (!el) return;
      el.setAttribute('data-cfb', v == null ? '0' : String(v));
      el.setAttribute('data-cur', 'amount');
      el.textContent = money(v);
    },
    setCurrency: function (m) {
      if (!MODES[m]) return;
      try { localStorage.setItem(CUR_KEY, m); } catch (e) {}
      apply();
    },
    toggleCurrency: function () {
      window.CF.setCurrency(mode() === 'CNY' ? 'USD' : 'CNY');
    },
    setStyle: function (s) {
      if (s !== 'code' && s !== 'name') return;
      try { localStorage.setItem(STYLE_KEY, s); } catch (e) {}
      apply();
    },
    /* 导航条上的币种开关：元素带 data-cur-toggle 即可 */
    bindToggles: function () {
      var btns = document.querySelectorAll('[data-cur-toggle]');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-bound') === '1') continue;
        btns[i].setAttribute('data-bound', '1');
        btns[i].addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          window.CF.toggleCurrency();
        });
      }
    },
    /* 设置页的显示形式按钮：元素带 data-cur-style 即可 */
    bindStyleButtons: function () {
      var btns = document.querySelectorAll('[data-cur-style]');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-bound') === '1') continue;
        btns[i].setAttribute('data-bound', '1');
        btns[i].addEventListener('click', function (ev) {
          ev.preventDefault();
          window.CF.setStyle(this.getAttribute('data-cur-style'));
        });
      }
    },
    refresh: apply,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    loadRate: loadRate
  };

  /* apply 时通知订阅者（设置页等旧代码仍可注册） */
  var rawApply = apply;
  apply = function (root) {
    rawApply(root);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](window.CF.currency.mode); } catch (e) {}
    }
  };
  window.CF.refresh = apply;

  function boot() {
    apply();
    window.CF.bindToggles();
    window.CF.bindStyleButtons();
    watchDynamic();
    loadRate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
