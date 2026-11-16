/* ============================================================
   乘法 · 全站可配置项
   货币名称尚未定稿，统一从这里读取。
   改名时只改 name 一项，页面上所有出现处随之更新。
   ============================================================ */
window.CF = {
  currency: {
    code: 'FC',
    name: '法币'
  }
};

/* 把页面里 data-cur="name" / data-cur="code" 的节点填上当前名称 */
(function () {
  var apply = function () {
    var cur = window.CF.currency;
    var nodes = document.querySelectorAll('[data-cur]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-cur');
      if (cur[key]) nodes[i].textContent = cur[key];
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
