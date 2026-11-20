/* ============================================================
   乘法 · 设备指纹
   目的只有一个：同一台机器在同一份问卷上只能算一次，
   换 IP、换账号都绕不过去。算出来的是一串哈希，不含任何可反查个人的信息。
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'cf_fp';

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  /* 同一段文字在不同显卡/驱动/字体下的抗锯齿结果不一样，这一笔就够分开了 */
  function canvasSign() {
    try {
      var c = document.createElement('canvas');
      c.width = 240;
      c.height = 60;
      var x = c.getContext('2d');
      if (!x) return '';
      x.textBaseline = 'top';
      x.font = '14px "Arial"';
      x.fillStyle = '#f60';
      x.fillRect(0, 0, 100, 20);
      x.fillStyle = '#069';
      x.fillText('乘法 chengfa fp 0123', 2, 4);
      x.fillStyle = 'rgba(102,204,0,0.7)';
      x.fillText('乘法 chengfa fp 0123', 4, 18);
      return c.toDataURL().slice(-96);
    } catch (e) {
      return '';
    }
  }

  function gpuSign() {
    try {
      var c = document.createElement('canvas');
      var g = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!g) return '';
      var d = g.getExtension('WEBGL_debug_renderer_info');
      if (!d) return String(g.getParameter(g.VERSION) || '');
      return String(g.getParameter(d.UNMASKED_VENDOR_WEBGL)) + '/' +
        String(g.getParameter(d.UNMASKED_RENDERER_WEBGL));
    } catch (e) {
      return '';
    }
  }

  function raw() {
    var n = navigator;
    return [
      n.userAgent,
      n.language,
      (n.languages || []).join(','),
      n.platform || '',
      screen.width + 'x' + screen.height + 'x' + (screen.colorDepth || 0),
      new Date().getTimezoneOffset(),
      n.hardwareConcurrency || 0,
      n.deviceMemory || 0,
      n.maxTouchPoints || 0,
      canvasSign(),
      gpuSign()
    ].join('|');
  }

  var id = '';
  try { id = localStorage.getItem(KEY) || ''; } catch (e) {}

  if (!id || id.length < 4) {
    id = hash(raw());
    try { localStorage.setItem(KEY, id); } catch (e) {}
  }

  window.CF_FP = id;
})();
