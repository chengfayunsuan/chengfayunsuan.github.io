/* 流量页 · 只读接口，前端负责把这几个数字摆开 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var CN = {
    CN: '中国', HK: '中国香港', TW: '中国台湾', MO: '中国澳门',
    US: '美国', JP: '日本', SG: '新加坡', KR: '韩国', GB: '英国',
    DE: '德国', FR: '法国', CA: '加拿大', AU: '澳大利亚', NL: '荷兰',
    RU: '俄罗斯', IN: '印度', BR: '巴西', VN: '越南', TH: '泰国', MY: '马来西亚'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 北京时间日期，往前推 n 天 */
  function bjDate(offset) {
    var d = new Date(Date.now() + 8 * 3600 * 1000);
    d.setUTCDate(d.getUTCDate() + (offset || 0));
    return d.toISOString().slice(0, 10);
  }

  function shortDate(iso) {
    return iso.slice(5);   // 2026-11-20 -> 11-20
  }

  function uaBrief(ua) {
    if (!ua) return '—';
    var os = '其他';
    if (/Windows NT 10/i.test(ua)) os = 'Win10';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    var br = '浏览器';
    if (/Edg\//i.test(ua)) br = 'Edge';
    else if (/OPR\/|Opera/i.test(ua)) br = 'Opera';
    else if (/Firefox\//i.test(ua)) br = 'Firefox';
    else if (/Chrome\//i.test(ua)) br = 'Chrome';
    else if (/Safari\//i.test(ua)) br = 'Safari';

    return os + ' · ' + br;
  }

  function listInto(box, items, opt) {
    if (!box) return;
    if (!items.length) {
      box.innerHTML = '<li class="tv-empty">' + esc(opt.empty || '这段时间还没有数据') + '</li>';
      return;
    }

    var max = items[0].pv || 1;
    box.innerHTML = items.map(function (it) {
      var label = opt.label(it);
      var pct = Math.round((it.pv / max) * 100);
      var right = opt.uv ? '<em>' + it.uv + ' 人</em>' : (opt.suffix ? '<em>' + esc(opt.suffix) + '</em>' : '');
      return '<li>' +
        '<span class="tv-li__x">' +
          '<span class="tv-li__t" title="' + esc(label) + '">' + esc(label) + '</span>' +
          '<span class="tv-li__bar"><i style="width:' + pct + '%"></i></span>' +
        '</span>' +
        '<span class="tv-li__n">' + it.pv + right + '</span>' +
      '</li>';
    }).join('');
  }

  function paintChart(series, days) {
    var box = $('chart');
    if (!box) return;

    var map = {};
    series.forEach(function (s) { map[s.d] = s; });

    var list = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = bjDate(-i);
      var hit = map[d];
      list.push({ d: d, pv: hit ? hit.pv : 0, uv: hit ? hit.uv : 0 });
    }

    var max = 1;
    list.forEach(function (x) { if (x.pv > max) max = x.pv; });

    box.innerHTML = list.map(function (x) {
      var h = Math.round((x.pv / max) * 100);
      return '<div class="tv-col' + (x.pv ? '' : ' is-empty') + '">' +
        '<span class="tv-col__v">' + (x.pv || '') + '</span>' +
        '<span class="tv-col__b" style="height:' + Math.max(2, h) + '%"></span>' +
        '<span class="tv-col__d">' + shortDate(x.d) + '</span>' +
      '</div>';
    }).join('');
  }

  function paintHours(hours) {
    var box = $('hours');
    if (!box) return;

    var map = {};
    hours.forEach(function (h) { map[h.h] = h.pv; });

    var max = 1;
    hours.forEach(function (h) { if (h.pv > max) max = h.pv; });

    var html = '';
    for (var i = 0; i < 24; i++) {
      var k = ('0' + i).slice(-2);
      var v = map[k] || 0;
      var h = v ? Math.max(4, Math.round((v / max) * 100)) : 2;
      html += '<div class="tv-hour" title="' + k + ':00 · ' + v + ' 次">' +
        '<b style="height:' + h + '%"></b>' +
        '<i>' + (i % 3 === 0 ? i : '') + '</i>' +
      '</div>';
    }
    box.innerHTML = html;
  }

  function paintRecent(items) {
    var box = $('recent');
    if (!box) return;

    if (!items.length) {
      box.innerHTML = '<li class="tv-empty">还没有访问记录。有人打开页面后这里就会出现。</li>';
      return;
    }

    var head = '<li class="tv-head">' +
      '<span>时间</span><span>页面</span><span>地区</span><span>来源</span><span>设备</span>' +
      '</li>';

    box.innerHTML = head + items.map(function (it) {
      return '<li>' +
        '<span class="r-at">' + esc(String(it.at || '').slice(5, 16)) + '</span>' +
        '<span class="r-p" title="' + esc(it.path) + '">' + esc(it.path) + '</span>' +
        '<span class="r-c">' + esc(CN[it.country] || it.country || '—') + '</span>' +
        '<span class="r-f">' + esc(it.ref || '直接访问') + '</span>' +
        '<span class="r-u" title="' + esc(it.ua) + '">' + esc(uaBrief(it.ua)) + '</span>' +
      '</li>';
    }).join('');
  }

  function paint(d) {
    $('kPv').textContent = d.today.pv;
    $('kUv').textContent = d.today.uv;
    $('kWpv').textContent = d.week.pv;
    $('kWuv').textContent = d.week.uv;
    $('kToday').textContent = d.today.pv + ' / ' + d.today.uv;

    paintChart(d.series, d.days);
    paintHours(d.hours);

    listInto($('paths'), d.paths, {
      label: function (it) { return it.path; },
      uv: true,
      empty: '还没有页面访问'
    });

    listInto($('refs'), d.refs, {
      label: function (it) { return it.ref || '直接访问 / 站内跳转'; },
      uv: false,
      suffix: '次',
      empty: '还没有外部来源'
    });

    listInto($('countries'), d.countries, {
      label: function (it) { return CN[it.country] || it.country || '未知'; },
      uv: false,
      suffix: '次',
      empty: '还没有地区数据'
    });

    paintRecent(d.recent);
    $('recentHint').textContent = d.recent.length ? '最近 ' + d.recent.length + ' 条' : '暂无记录';
  }

  function load() {
    var btn = $('reload');
    if (btn) btn.disabled = true;

    fetch('/api/admin/traffic?days=14', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { location.replace('/login?next=/admin/traffic'); return null; }
        return r.json();
      })
      .then(function (d) {
        if (btn) btn.disabled = false;
        if (!d || !d.ok) return;
        paint(d);
      })
      .catch(function () {
        if (btn) btn.disabled = false;
      });
  }

  /* 顶栏：余额与名字、退出 */
  fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
    .then(function (r) {
      if (r.status === 401) { location.replace('/login?next=/admin/traffic'); return null; }
      return r.json();
    })
    .then(function (d) {
      var u = d && d.user;
      if (!u) return;
      var bal = $('navBal');
      if (bal) bal.textContent = u.fc;
      var nm = $('navName');
      if (nm) nm.textContent = u.username || '我';
    })
    .catch(function () {});

  var out = $('logoutBtn');
  if (out) {
    out.addEventListener('click', function () {
      out.disabled = true;
      out.textContent = '退出中';
      fetch('/api/auth/logout', { method: 'POST' })
        .catch(function () {})
        .then(function () { location.replace('/'); });
    });
  }

  var rb = $('reload');
  if (rb) rb.addEventListener('click', load);

  load();
})();
