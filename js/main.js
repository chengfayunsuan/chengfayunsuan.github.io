/* Chengfa · index 交互
   只做两件事：滚动进入、导航栏登录态 */

(function () {
  'use strict';

  /* ---------- 1. 滚动进入 ---------- */
  var reveals = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 2. 登录态：已登录就不再给「登录」，直接进账户页 ---------- */
  var navCta = document.querySelector('.nav__cta');

  if (navCta) {
    fetch('/api/auth/me', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.ok || !data.user) return;

        var authed = navCta.querySelector('[data-auth]');
        navCta.querySelectorAll('[data-guest]').forEach(function (el) { el.hidden = true; });
        if (authed) authed.hidden = false;

        /* 页内其它注册入口一并改成进账户，不再绕登录页 */
        ['heroCta', 'ctaCta'].forEach(function (id) {
          var el = document.getElementById(id);
          if (!el) return;
          el.setAttribute('href', '/home');
          el.innerHTML = '进入我的账户 <span aria-hidden="true">→</span>';
        });
      })
      .catch(function () {});
  }

})();
