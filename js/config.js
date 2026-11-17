/* ============================================================
   乘法 · 全站可配置项
   内部货币以 CFB（乘法币，人民币基准）记账，恒为原始数值。
   CFD（乘法刀，美元）显示时按实时汇率换算：CFD = CFB / usdCny。
   汇率来自 /api/fx（服务端每小时缓存），本地存 localStorage 兜底。
   选择存 localStorage('cf-currency')，设置页「币种显示」可切换。
   ============================================================ */
(function () {
  var MODES = {
    CNY: { code: 'CFB', name: '乘法币' },
    USD: { code: 'CFD', name: '乘法刀' }
  };

  var FX_KEY = 'cf-fx';
  var FX_DEFAULT = 7.0;

  function mode() {
    var m = '';
    try { m = localStorage.getItem('cf-currency') || ''; } catch (e) {}
    return MODES[m] ? m : 'CNY';
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

  /* 把 CFB 基准值转成当前模式应显示的数字字符串 */
  function money(v) {
    var n = Number(v) || 0;
    if (window.CF.currency.mode === 'USD') n = n / window.CF.rate;
    return trim(n.toFixed(4));
  }

  var listeners = [];

  function apply() {
    var m = mode();
    var cur = MODES[m];
    window.CF.currency = { mode: m, code: cur.code, name: cur.name };
    for (var j = 0; j < listeners.length; j++) {
      try { listeners[j](m); } catch (e) {}
    }

    var nodes = document.querySelectorAll('[data-cur]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-cur');
      if (key === 'amount') {
        if (el.hasAttribute('data-cfb')) {
          var raw = Number(el.getAttribute('data-cfb')) || 0;
          var signed = el.getAttribute('data-signed') === '1';
          var txt = signed && raw < 0 ? money(-raw) : money(raw);
          if (signed) txt = (raw < 0 ? '−' : '+') + txt;
          el.textContent = txt;
        }
      } else if (cur[key]) {
        el.textContent = cur[key];
      }
    }
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

  window.CF = {
    currency: { mode: 'CNY', code: 'CFB', name: '乘法币' },
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
      try { localStorage.setItem('cf-currency', m); } catch (e) {}
      apply();
    },
    refresh: apply,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    loadRate: loadRate
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { apply(); loadRate(); });
  } else {
    apply();
    loadRate();
  }
})();
