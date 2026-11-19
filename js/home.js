/* ============================================================
   乘法 · 账户首页
   读取 /api/auth/me，渲染门面，未登录跳转登录页
   ============================================================ */
(function () {
  'use strict';

  var ROLES = { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };
  var STATUS = { active: '正常', frozen: '已冻结', banned: '已封禁' };
  var BIO_MAX = 200;

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');
  var toast = document.getElementById('toast');
  var bioEl = document.getElementById('bioText');

  function $(id) { return document.getElementById(id); }

  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  /* 余额小数末尾的 0 不显示：0.0000 -> 0，128.4500 -> 128.45 */
  function trimNum(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  /* ---------- 提示条 ---------- */

  var toastTimer = null;

  function say(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-on');
    }, 2200);
  }

  /* ---------- 未开放功能 ---------- */

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-soon]') : null;
    if (!el) return;
    ev.preventDefault();
    say((el.getAttribute('data-soon') || '该功能') + ' · 功能开发中');
  });

  /* ---------- 退出 ---------- */

  var logoutBtn = $('logoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logoutBtn.disabled = true;
      logoutBtn.textContent = '退出中';
      fetch('/api/auth/logout', { method: 'POST' })
        .catch(function () {})
        .then(function () { location.replace('/'); });
    });
  }

  /* ---------- 个人简介：点击即改 ---------- */

  var bioSaved = '';

  function paintBio(text) {
    bioSaved = text || '';
    bioEl.textContent = bioSaved;
    bioEl.classList.toggle('is-empty', !bioSaved);
  }

  function stopEdit() {
    bioEl.removeAttribute('contenteditable');
    bioEl.classList.remove('is-editing');
  }

  function saveBio(text) {
    bioEl.textContent = text;
    bioEl.classList.toggle('is-empty', !text);

    fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: text })
    })
      .then(function (res) {
        return res.json().then(function (d) { return { ok: res.ok, body: d }; });
      })
      .then(function (r) {
        if (r.ok && r.body.ok) {
          paintBio(r.body.user.bio);
          say('个人简介已保存');
        } else if (r.body && r.body.error === 'unauthorized') {
          paintBio(bioSaved);
          say('登录状态已失效，请刷新页面');
        } else {
          paintBio(bioSaved);
          say('保存失败，请重试');
        }
      })
      .catch(function () {
        paintBio(bioSaved);
        say('网络连接失败，简介未保存');
      });
  }

  if (bioEl) {
    bioEl.addEventListener('click', function () {
      if (bioEl.isContentEditable) return;
      bioEl.setAttribute('contenteditable', 'plaintext-only');
      bioEl.classList.add('is-editing');
      bioEl.focus();

      var range = document.createRange();
      range.selectNodeContents(bioEl);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    bioEl.addEventListener('blur', function () {
      if (!bioEl.isContentEditable) return;
      stopEdit();

      var text = (bioEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, BIO_MAX);
      if (text === bioSaved) {
        paintBio(bioSaved);
        return;
      }
      saveBio(text);
    });

    bioEl.addEventListener('keydown', function (ev) {
      if (!bioEl.isContentEditable) return;

      if (ev.key === 'Escape') {
        ev.preventDefault();
        paintBio(bioSaved);
        stopEdit();
        bioEl.blur();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        bioEl.blur();
      }
    });

    // 粘贴只取纯文本，避免带入外部样式
    bioEl.addEventListener('paste', function (ev) {
      if (!bioEl.isContentEditable) return;
      ev.preventDefault();
      var clip = ev.clipboardData || window.clipboardData;
      var text = clip ? clip.getData('text') : '';
      if (text) document.execCommand('insertText', false, text);
    });
  }

  /* ---------- 换算 ---------- */

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1, 2) + '.' + pad(d.getDate(), 2);
  }

  function daysSince(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 1;
    var n = Math.floor((Date.now() - d.getTime()) / 86400000) + 1;
    return n < 1 ? 1 : n;
  }

  /* 等级区间：每级 100 分，第 n 级 [(n-1)*100, n*100)
     LV1 = 0～99、LV0 = -100～-1、LV-1 = -200～-100，负等级一样有进度条 */
  function levelRange(level) {
    var lv = level | 0;
    var from = (lv - 1) * 100;
    return { from: from, to: from + 100 };
  }

  /* ---------- 渲染 ---------- */

  function render(user) {
    $('navName').textContent = user.username || '未命名';
    if (window.CF && CF.amount) CF.amount($('navBal'), user.fc);
    else $('navBal').textContent = trimNum(user.fc);

    /* 站长与管理员点左上角乘法进后台 */
    var brand = document.querySelector('.brand');
    if (brand && (user.role === 'owner' || user.role === 'admin')) brand.setAttribute('href', '/admin');

    $('uidText').textContent = user.uid;
    $('userName').textContent = user.username || '未命名';
    $('joinedAt').textContent = fmtDate(user.createdAt);
    $('statusText').textContent = STATUS[user.status] || user.status;

    var roleEl = $('roleText');
    roleEl.textContent = ROLES[user.role] || user.role;
    roleEl.setAttribute('data-role', user.role);

    paintBio(user.bio || '');

    var fcEl = $('fcText');
    var fcShown = window.CF && CF.money ? CF.money(user.fc) : trimNum(user.fc);
    fcEl.textContent = fcShown;
    /* 位数多时收一号字，避免大额余额把小窗口入口挤掉 */
    fcEl.classList.toggle('is-long', fcShown.length > 8);
    fcEl.setAttribute('data-cfb', user.fc);
    fcEl.setAttribute('data-cur', 'amount');
    if (window.CF && CF.amount) CF.amount($('fcFrozen'), user.fcFrozen);
    else $('fcFrozen').textContent = trimNum(user.fcFrozen);

    $('statDays').textContent = daysSince(user.createdAt);
    $('statLevel').textContent = user.level;
    $('statAff').textContent = user.affinity;

    var range = levelRange(user.level);
    var span = range.to - range.from;
    var pct = span > 0 ? ((user.exp - range.from) / span) * 100 : 0;
    pct = Math.max(0, Math.min(100, pct));

    $('expText').textContent = user.exp;
    $('expNext').textContent = range.to;

    requestAnimationFrame(function () {
      $('expBar').style.width = pct + '%';
    });
  }

  /* ---------- 本地预览 ---------- */
  /* 仅在本地开发服务器上带 ?preview 生效，用于检查版面，线上不触发 */

  var DEMO = {
    uid: 1,
    username: '乘法',
    role: 'owner',
    status: 'active',
    fc: '128.4500',
    fcFrozen: '20.0000',
    affinity: 12,
    exp: 520,
    level: 3,
    bio: '这里填写个人简介。这段文字用于检查较长内容在版面中的换行表现。',
    createdAt: '2026-11-16T08:00:46Z'
  };

  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  if (isLocal && /[?&]preview\b/.test(location.search)) {
    render(DEMO);
    loading.hidden = true;
    app.hidden = false;
    return;
  }

  /* ---------- 启动：缓存秒显，后台校验 ---------- */


  /* ---------- 公告 ---------- */

  function loadNotices() {
    var box = document.getElementById('homeNotice');
    if (!box) return;

    fetch('/api/announcements', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) { box.textContent = ''; return; }

        var items = d.items || [];
        box.textContent = '';

        if (!items.length) {
          var p0 = document.createElement('p');
          p0.className = 'hm-notice__i';
          p0.textContent = '暂时没有公告。';
          box.appendChild(p0);
          return;
        }

        items.slice(0, 2).forEach(function (n) {
          var p = document.createElement('p');
          p.className = 'hm-notice__i';
          p.setAttribute('data-lv', n.level || 'info');

          if (n.title) {
            var t = document.createElement('span');
            t.className = 'hm-notice__t';
            t.textContent = n.title + '：';
            p.appendChild(t);
          }

          p.appendChild(document.createTextNode(n.body));
          box.appendChild(p);
        });

        var more = document.createElement('a');
        more.className = 'hm-notice__more';
        more.href = '/notices';
        more.textContent = items.length > 2 ? '查看全部 ' + items.length + ' 条公告 →' : '查看公告 →';
        box.appendChild(more);
      })
      .catch(function () { box.textContent = ''; });
  }

  function show(user) {
    render(user);
    loadNotices();
    loading.hidden = true;
    app.hidden = false;
  }

  var cached = window.CF && CF.cache ? CF.cache.get() : null;
  if (cached) show(cached);

  fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
    .then(function (res) {
      if (res.status === 401) {
        if (window.CF && CF.cache) CF.cache.clear();
        location.replace('/login');
        return null;
      }
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      if (!data.ok || !data.user) {
        loading.hidden = true;
        if (!cached) say('账户载入失败，请刷新页面重试。');
        return;
      }
      if (window.CF && CF.cache) CF.cache.set(data.user);
      show(data.user);
    })
    .catch(function () {
      loading.hidden = true;
      if (!cached) say('网络连接失败，请检查网络后刷新。');
    });
})();
