/* ============================================================
   乘法 · 自定义版块（设置页 / 后台外观页共用）
   1) 快捷导航：数字键映射，开关 + 改键
   2) 主题配色：六个颜色变量，预设 + 调色板 + 实时预览，确定后写入 cookie
   数据层在 core.js（CF.keys / CF.theme），这里只做界面。
   ============================================================ */
(function () {
  'use strict';

  var CF = window.CF;
  if (!CF || !CF.keys || !CF.theme) return;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var toastTimer = null;
  function say(text) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2400);
  }

  /* ============================================================
     一、快捷导航
     ============================================================ */

  var scope = 'user';
  var catching = null;

  /* 后台键位只对站长和管理员有意义。
     普通用户与大会员在设置页看不到「后台」这一栏，免得看到一个自己永远用不上的目录。 */
  function gateAdminTab() {
    var page = (document.body.getAttribute('data-page') || '');
    if (page.indexOf('admin') === 0) return;

    function allow(u) {
      if (u && (u.role === 'owner' || u.role === 'admin')) {
        document.body.classList.add('has-adm-tab');
      }
    }

    var me = CF.cache && CF.cache.get ? CF.cache.get() : null;
    if (me) { allow(me); return; }

    fetch('/api/auth/me', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { allow(d && (d.user || d)); })
      .catch(function () {});
  }

  function paintHot() {
    var cfg = CF.keys.read();

    var on = $('hkOn');
    if (on) on.checked = cfg.on !== false;

    var st = $('hkState');
    if (st) {
      st.textContent = cfg.on === false ? '已关闭' : '已开启';
      st.className = 'cz-tag' + (cfg.on === false ? '' : ' is-on');
    }

    var tabs = document.querySelectorAll('[data-hk-scope]');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].classList.toggle('is-on', tabs[t].getAttribute('data-hk-scope') === scope);
    }

    var box = $('hkList');
    if (!box) return;

    var list = CF.keys.list(scope, cfg);
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var isCatch = catching === it.href;
      var right = it.fixed
        ? '<span class="hk__fix">固定</span>'
        : '<button class="hk__b" type="button" data-hk-edit="' + esc(it.href) + '">' +
          (isCatch ? '取消' : '改键') + '</button>';

      html += '<li class="hk__i' + (it.fixed ? ' is-fixed' : '') + (isCatch ? ' is-catching' : '') + '">' +
        '<span class="hk__k">' + esc(isCatch ? '?' : it.key) + '</span>' +
        '<span class="hk__x"><b>' + esc(it.t) + '</b><i>' + esc(it.href) + '</i></span>' +
        '<span class="hk__d">' + (it.fixed ? '常驻' : '默认 ' + esc(it.def)) + '</span>' +
        right +
        '</li>';
    }
    box.innerHTML = html;
  }

  function setCatching(href) {
    catching = href || null;
    document.body.setAttribute('data-hot-catch', catching ? '1' : '0');
    paintHot();
  }

  function assignKey(href, key) {
    var cfg = CF.keys.read();
    var list = CF.keys.list(scope, cfg);
    var map = cfg[scope] || {};

    var mine = '';
    for (var i = 0; i < list.length; i++) {
      if (list[i].href === href) mine = list[i].key;
    }

    /* 撞键就交换，不产生两个同键 */
    for (var j = 0; j < list.length; j++) {
      var it = list[j];
      if (it.href === href) continue;
      if (it.key.toLowerCase() === key.toLowerCase()) {
        map[it.href] = mine || it.def;
      }
    }

    map[href] = key;
    cfg[scope] = map;
    cfg.on = cfg.on !== false;
    CF.keys.save(cfg);
  }

  function bindHotUI() {
    var box = $('hkList');
    if (box) {
      box.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-hk-edit]');
        if (!b) return;
        var href = b.getAttribute('data-hk-edit');
        setCatching(catching === href ? null : href);
      });
    }

    var tabs = document.querySelectorAll('[data-hk-scope]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        scope = this.getAttribute('data-hk-scope');
        setCatching(null);
      });
    }

    var on = $('hkOn');
    if (on) {
      on.addEventListener('change', function () {
        var cfg = CF.keys.read();
        cfg.on = this.checked;
        CF.keys.save(cfg);
        paintHot();
        say(this.checked ? '数字键快捷导航已开启' : '数字键快捷导航已关闭');
      });
    }

    var reset = $('hkReset');
    if (reset) {
      reset.addEventListener('click', function () {
        var cfg = CF.keys.read();
        cfg[scope] = {};
        CF.keys.save(cfg);
        setCatching(null);
        say(scope === 'admin' ? '后台键位已恢复默认' : '用户端键位已恢复默认');
      });
    }

    /* 捕获阶段先拿到按键，避免被页面其它快捷键吃掉。
       SPA 换页会把这支脚本重跑一遍，所以同一次按键只让一份处理，别互相打架。 */
    document.addEventListener('keydown', function (ev) {
      if (!catching || ev.__pzCatch) return;
      ev.__pzCatch = true;
      ev.preventDefault();
      ev.stopPropagation();

      if (ev.key === 'Escape') { setCatching(null); return; }
      if (!/^[0-9a-zA-Z]$/.test(ev.key)) return;

      var href = catching;
      assignKey(href, ev.key.toLowerCase());
      setCatching(null);
      say('已绑定到 ' + ev.key.toUpperCase() + ' 键');
    }, true);
  }

  /* ============================================================
     二、主题配色
     ============================================================ */

  var draft = {};

  function baseOf(saved) {
    var out = {};
    for (var k in CF.theme.DEF) out[k] = (saved && saved[k]) || CF.theme.DEF[k];
    return out;
  }

  function paintPal() {
    var box = $('thPal');
    if (!box) return;

    var html = '';
    for (var i = 0; i < CF.theme.LIST.length; i++) {
      var it = CF.theme.LIST[i];
      var v = draft[it.key];
      html += '<li class="th-pal__i" data-th-row="' + it.key + '">' +
        '<span class="th-pal__x"><b>' + esc(it.label) + '</b><i>' + esc(it.hint) + '</i></span>' +
        '<input class="th-pal__c" type="color" value="' + esc(v) + '" data-th-color="' + it.key + '" aria-label="' + esc(it.label) + '">' +
        '<input class="th-pal__h" type="text" value="' + esc(v) + '" maxlength="7" spellcheck="false" data-th-hex="' + it.key + '" aria-label="' + esc(it.label) + ' 色值">' +
        '</li>';
    }
    box.innerHTML = html;
  }

  function paintDemo() {
    var d = $('thDemo');
    if (!d) return;
    for (var k in draft) d.style.setProperty('--' + k, draft[k]);
    d.style.setProperty('--red-rgb', CF.theme.hexRgb(draft.red));
    d.style.setProperty('--ink-rgb', CF.theme.hexRgb(draft.ink));
    d.style.setProperty('--paper-rgb', CF.theme.hexRgb(draft.paper));
    d.style.setProperty('--paper2-rgb', CF.theme.hexRgb(draft['paper-2']));
  }

  function renderPresets() {
    var box = document.getElementById('thPresets');
    if (!box) return;
    var list = CF.theme.presets ? CF.theme.presets() : [];
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var ps = list[i];
      html += '<button class="th-sw" type="button" data-theme-preset="' + esc(ps.key) + '">' +
        '<span class="th-sw__c" style="--c:' + esc(ps.red) + '"></span>' + esc(ps.label) + '</button>';
    }
    box.innerHTML = html;
  }

  function paintPreset() {
    var btns = document.querySelectorAll('[data-theme-preset]');
    for (var i = 0; i < btns.length; i++) {
      var p = CF.theme.preset(btns[i].getAttribute('data-theme-preset'));
      var same = String(draft.red).toLowerCase() === p.red.toLowerCase() &&
        String(draft['red-deep']).toLowerCase() === p['red-deep'].toLowerCase();
      btns[i].classList.toggle('is-on', same);
    }
  }

  function paintState(dirty) {
    var st = $('thState');
    if (!st) return;
    var saved = CF.theme.read();
    var txt = '默认配色';
    if (saved) txt = '自定义 · 已保存';
    if (dirty) txt = '有未保存的改动';
    st.textContent = txt;
    st.className = 'cz-tag' + (dirty || saved ? ' is-on' : '');
  }

  var dirty = false;

  function setDraft(key, val, fromText) {
    var v = String(val || '').trim();
    if (v.charAt(0) !== '#') v = '#' + v;
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return false;
    draft[key] = v.toLowerCase();
    dirty = true;

    /* 同步另一侧的输入框 */
    var color = document.querySelector('[data-th-color="' + key + '"]');
    if (color && fromText) color.value = draft[key];
    var hex = document.querySelector('[data-th-hex="' + key + '"]');
    if (hex && !fromText) hex.value = draft[key];
    if (hex) hex.classList.remove('is-bad');

    paintDemo();
    paintPreset();
    paintState(true);
    return true;
  }

  function bindThemeUI() {
    var box = $('thPal');
    if (box) {
      box.addEventListener('input', function (ev) {
        var t = ev.target;
        if (t.hasAttribute('data-th-color')) {
          setDraft(t.getAttribute('data-th-color'), t.value, true);
          return;
        }
        if (t.hasAttribute('data-th-hex')) {
          var ok = setDraft(t.getAttribute('data-th-hex'), t.value, false);
          t.classList.toggle('is-bad', !ok && t.value.replace('#', '').length >= 3);
        }
      });

      box.addEventListener('blur', function (ev) {
        var t = ev.target;
        if (!t.hasAttribute || !t.hasAttribute('data-th-hex')) return;
        var key = t.getAttribute('data-th-hex');
        if (!/^#[0-9a-fA-F]{6}$/.test(t.value)) {
          t.value = draft[key];
          t.classList.remove('is-bad');
        }
      }, true);
    }

    var pre = document.querySelectorAll('[data-theme-preset]');
    for (var i = 0; i < pre.length; i++) {
      pre[i].addEventListener('click', function () {
        var p = CF.theme.preset(this.getAttribute('data-theme-preset'));
        draft.red = p.red.toLowerCase();
        draft['red-deep'] = p['red-deep'].toLowerCase();
        dirty = true;
        paintPal();
        paintDemo();
        paintPreset();
        paintState(true);
      });
    }

    var save = $('thSave');
    if (save) {
      save.addEventListener('click', function () {
        CF.theme.save(draft);
        dirty = false;
        paintState(false);
        say('配色已保存，整站立即生效');
      });
    }

    var reset = $('thReset');
    if (reset) {
      reset.addEventListener('click', function () {
        draft = CF.theme.reset();
        draft = baseOf(null);
        dirty = false;
        paintPal();
        paintDemo();
        paintPreset();
        paintState(false);
        say('已恢复默认配色');
      });
    }
  }

  /* ---------- 启动 ---------- */

  function boot() {
    /* 每次进来都从零开始：SPA 换页后 DOM 是新的，旧状态（等键、页签、草稿）都得清掉 */
    scope = (document.body.getAttribute('data-page') || '').indexOf('admin') === 0 ? 'admin' : 'user';
    catching = null;
    dirty = false;
    document.body.setAttribute('data-hot-catch', '0');

    draft = baseOf(CF.theme.read());

    bindHotUI();
    paintHot();
    gateAdminTab();

    renderPresets();
    bindThemeUI();
    paintPal();
    paintDemo();
    paintPreset();
    paintState(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
