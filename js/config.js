/* ============================================================
   乘法 · 全站可配置项
   内部货币两种显示：CFB（乘法币，按人民币）/ CFD（乘法刀，按美元）
   数值恒为 1:1，切换只改名称与单位，不做任何换算。
   选择存 localStorage('cf-currency')，设置页「币种显示」可切换。
   ============================================================ */
(function () {
  var MODES = {
    CNY: { code: 'CFB', name: '乘法币' },
    USD: { code: 'CFD', name: '乘法刀' }
  };

  function mode() {
    var m = '';
    try { m = localStorage.getItem('cf-currency') || ''; } catch (e) {}
    return MODES[m] ? m : 'CNY';
  }

  function apply() {
    var m = mode();
    var cur = MODES[m];
    window.CF.currency = { mode: m, code: cur.code, name: cur.name };
    var nodes = document.querySelectorAll('[data-cur]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-cur');
      if (cur[key]) nodes[i].textContent = cur[key];
    }
  }

  window.CF = {
    currency: { mode: 'CNY', code: 'CFB', name: '乘法币' },
    /* 设置页的币种开关调用这里，mode 传 'CNY' 或 'USD' */
    setCurrency: function (m) {
      if (!MODES[m]) return;
      try { localStorage.setItem('cf-currency', m); } catch (e) {}
      apply();
    },
    refresh: apply
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
