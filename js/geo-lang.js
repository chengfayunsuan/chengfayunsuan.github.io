/* 落地页专用：海外访客直接给英文版。
   落地页不加载 core.js，所以这一小段单独放一个文件。
   判断只看国家，不看是不是机房 —— 海外家宽是正常访客，不该被当成梯子。 */
(function () {
  'use strict';

  /* 语言按钮点过之后记住选择。这件事在哪一页都要做 ——
     包括英文页和中文页，否则点完「中文」又被自动跳回去。 */
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a.nav__lang');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var v = (href === '/en' || href.indexOf('/en/') === 0) ? 'en' : 'zh';
    document.cookie = 'cf_lang=' + v + ';path=/;max-age=' + (365 * 86400) + ';samesite=lax';
  });

  /* 已经在英文页里，别再跳一次，否则自己刷自己 */
  if (location.pathname.indexOf('/en') === 0) return;

  var pref = (document.cookie.match(/(?:^|;\s*)cf_lang=([a-z]{2})/) || [])[1] || '';
  if (pref === 'zh') return;                                  /* 手动选了中文 */
  if (pref === 'en') {                                        /* 手动选了英文 */
    location.replace('/en/' + location.search + location.hash);
    return;
  }

  var CN_REGION = { CN: 1, HK: 1, MO: 1, TW: 1 };

  function go(d) {
    if (!d || !d.ok) return;
    var c = String(d.country || '').toUpperCase();
    if (!c || CN_REGION[c]) return;
    location.replace('/en/' + location.search + location.hash);
  }

  /* 语言按钮点过之后记住选择 */
  var hit = null;
  try { hit = JSON.parse(sessionStorage.getItem('cf-net-cache') || 'null'); } catch (e) {}
  if (hit && hit.t && Date.now() - hit.t < 30 * 60 * 1000) {
    go(hit.d);
    return;
  }

  fetch('/api/ip/check', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.ok) return;
      try { sessionStorage.setItem('cf-net-cache', JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
      go(d);
    })
    .catch(function () {});
})();
