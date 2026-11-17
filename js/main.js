/* 乘法 · index 交互
   只做三件事：滚动进入、数字滚动、未开放提示 */

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

  /* ---------- 2. 未开放提示 ---------- */
  var toast = null;
  var toastTimer = null;

  function showToast(msg) {
    if (!toast) {
      toast = document.createElement('div');
      toast.setAttribute('role', 'status');
      toast.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:32px',
        'transform:translate(-50%,120%)',
        'z-index:200',
        'background:#14130F',
        'color:#F4F0E6',
        'border:3px solid #E0291E',
        'padding:14px 22px',
        'font-size:14px',
        'font-weight:700',
        'letter-spacing:.02em',
        'box-shadow:8px 8px 0 rgba(224,41,30,.35)',
        'transition:transform .28s cubic-bezier(.22,.8,.3,1)',
        'max-width:calc(100vw - 40px)',
        'text-align:center'
      ].join(';');
      document.body.appendChild(toast);
    }

    toast.textContent = msg;
    requestAnimationFrame(function () {
      toast.style.transform = 'translate(-50%,0)';
    });

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.style.transform = 'translate(-50%,120%)';
    }, 2600);
  }

  document.querySelectorAll('[data-soon]').forEach(function (el) {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      showToast('注册通道正在调试，开放后将在此处公布入口。');
    });
  });

  /* ---------- 3. 登录态：已登录就不再给「登录」，直接进账户页 ---------- */
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
