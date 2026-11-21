/* ============================================================
   Chengfa · 英文站运行时翻译
   静态 HTML 已经在构建时翻好了，这个脚本只补 JS 拼出来的那部分
   （按钮文字、toast、倒计时、卡片上的「12 分钟」这类）。
   字典由 /en/dict.js 提供，跟构建用的是同一份 i18n/zh-en.jsonl。
   ============================================================ */
(function () {
  'use strict';

  var dict = window.__EN_DICT || {};
  var keys = Object.keys(dict).filter(function (k) { return k.length >= 2; })
    .sort(function (a, b) { return b.length - a.length; });

  var CN = /[\u4e00-\u9fa5]/;

  function tr(s) {
    if (!s || !CN.test(s)) return s;

    var t = s.trim();
    if (dict[t]) return s.replace(t, dict[t]);

    /* 整体没命中就按词表替换（长的先替，避免「分钟」抢先吃掉「分钟数」） */
    var out = s;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (out.indexOf(k) < 0) continue;
      out = out.split(k).join(dict[k]);
      if (!CN.test(out)) break;
    }
    return out;
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };

  /* 用户自己的东西一律不翻：用户名、问卷标题与供应商、商品名、消息正文。
     标记优先看 data-tr-skip，下面这串选择器是给不由本脚本控制的节点兜底的。
     注意 .svc__req 与 .lg-row__m 不在这里：它们的数据部分已在源头单独包了
     data-tr-skip（app.js），整段保护会把「要求」标签和系统前缀也拦住。 */
  var RAW = [
    '[data-tr-skip]',
    '#navName', '.hm-nav__name',
    '.svc__t', '.svc__prov-name', '.svc__topic',
    '.st-item__t', '.st-item__s',
    '.ord__t', '.msg__b', '.lg-n',
    /* 下面这些是用户 / 问卷商 / 站长自己填的内容，翻了就是篡改 */
    '.ld-who', '.ld-name', '.nt', '.rel__name',
    '.sp-name', '.sp-bio', '.mw-offer__t', '.mw-offer__d',
    '.paper-q__t', '.paper-opt__t', '.tk__d', '.tk__re',
    '.hm-notice__i', '.msg__t', '.face__name',
    '.er-row__n'
  ].join(',');

  function raw(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hasAttribute('data-tr-skip')) return true;
    return !!(el.closest && el.closest(RAW));
  }

  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      var p = node.parentNode;
      if (p && SKIP[p.nodeName]) return;
      if (raw(p)) return;
      var next = tr(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1) return;
    if (SKIP[node.nodeName]) return;
    if (raw(node)) return;

    var attrs = ['placeholder', 'title', 'aria-label', 'alt'];
    for (var i = 0; i < attrs.length; i++) {
      var v = node.getAttribute && node.getAttribute(attrs[i]);
      if (v && CN.test(v)) {
        var nv = tr(v);
        if (nv !== v) node.setAttribute(attrs[i], nv);
      }
    }

    for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
  }

  function boot() {
    walk(document.body);

    /* 之后由 JS 插进来的节点也要翻 */
    var mo = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'characterData') {
          /* 用户名这类节点内容会随登录态变化，别被改动 */
          if (raw(m.target.parentNode)) continue;
          var nv = tr(m.target.nodeValue);
          if (nv !== m.target.nodeValue) m.target.nodeValue = nv;
        } else {
          for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
        }
      }
    });

    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
