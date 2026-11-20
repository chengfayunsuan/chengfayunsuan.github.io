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

  /* Cloudflare 给的省名是英文，常见的转一下；没收录的原样显示 */
  var PROV = {
    Beijing: '北京', Tianjin: '天津', Hebei: '河北', Shanxi: '山西',
    'Inner Mongolia': '内蒙古', Liaoning: '辽宁', Jilin: '吉林', Heilongjiang: '黑龙江',
    Shanghai: '上海', Jiangsu: '江苏', Zhejiang: '浙江', Anhui: '安徽',
    Fujian: '福建', Jiangxi: '江西', Shandong: '山东', Henan: '河南',
    Hubei: '湖北', Hunan: '湖南', Guangdong: '广东', Guangxi: '广西',
    Hainan: '海南', Chongqing: '重庆', Sichuan: '四川', Guizhou: '贵州',
    Yunnan: '云南', Tibet: '西藏', Xizang: '西藏', Shaanxi: '陕西',
    Gansu: '甘肃', Qinghai: '青海', Ningxia: '宁夏', Xinjiang: '新疆',
    'Hong Kong': '中国香港', Macau: '中国澳门', Macao: '中国澳门', Taiwan: '中国台湾'
  };

  /* Cloudflare 给的城市也是拼音，常见城市转成中文；没收录的原样显示 */
  var CITY = {
    Beijing: '北京', Shanghai: '上海', Tianjin: '天津', Chongqing: '重庆',
    Guangzhou: '广州', Shenzhen: '深圳', Dongguan: '东莞', Foshan: '佛山',
    Zhuhai: '珠海', Huizhou: '惠州', Zhongshan: '中山',
    Hangzhou: '杭州', Ningbo: '宁波', Wenzhou: '温州', Jiaxing: '嘉兴',
    Jinhua: '金华', Shaoxing: '绍兴', Taizhou: '台州',
    Nanjing: '南京', Suzhou: '苏州', Wuxi: '无锡', Changzhou: '常州',
    Nantong: '南通', Xuzhou: '徐州',
    Jinan: '济南', Qingdao: '青岛', Yantai: '烟台', Weifang: '潍坊', Linyi: '临沂',
    Zhengzhou: '郑州', Luoyang: '洛阳', Wuhan: '武汉', Yichang: '宜昌',
    Changsha: '长沙', Zhuzhou: '株洲', Chengdu: '成都', Mianyang: '绵阳',
    "Xi'an": '西安', Xian: '西安', Xianyang: '咸阳',
    Hefei: '合肥', Fuzhou: '福州', Xiamen: '厦门', Quanzhou: '泉州',
    Nanchang: '南昌', Shenyang: '沈阳', Dalian: '大连', Changchun: '长春',
    Harbin: '哈尔滨', Shijiazhuang: '石家庄', Taiyuan: '太原', Hohhot: '呼和浩特',
    Nanning: '南宁', Guilin: '桂林', Haikou: '海口', Sanya: '三亚',
    Guiyang: '贵阳', Kunming: '昆明', Lanzhou: '兰州', Xining: '西宁',
    Yinchuan: '银川', Urumqi: '乌鲁木齐', Lhasa: '拉萨',
    'Hong Kong': '中国香港', Macau: '中国澳门', Taipei: '中国台北',
    Singapore: '新加坡', Tokyo: '东京', Seoul: '首尔',
    'New York': '纽约', 'Los Angeles': '洛杉矶', 'San Francisco': '旧金山',
    Seattle: '西雅图', London: '伦敦', Frankfurt: '法兰克福',
    Amsterdam: '阿姆斯特丹', Paris: '巴黎', Sydney: '悉尼',
    Toronto: '多伦多', Vancouver: '温哥华', Moscow: '莫斯科',
    Mumbai: '孟买', Bangkok: '曼谷', 'Kuala Lumpur': '吉隆坡',
    Hanoi: '河内', 'Ho Chi Minh City': '胡志明市', Jakarta: '雅加达',
    Manila: '马尼拉', Dubai: '迪拜'
  };

  /* 中文地方名不跟着转，原样返回 */
  function zhCity(s) {
    if (!s) return '';
    return CITY[s] || s;
  }

  var page = 1;

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
    else if (/MicroMessenger/i.test(ua)) br = '微信';
    else if (/Chrome\//i.test(ua)) br = 'Chrome';
    else if (/Safari\//i.test(ua)) br = 'Safari';

    return os + ' · ' + br;
  }

  /* 国家 · 省 · 市；相邻两级同名时只留一个 */
  function place(it) {
    var out = [];
    var add = function (s) {
      if (!s) return;
      if (s === out[out.length - 1]) return;
      out.push(s);
    };
    if (it.country) add(CN[it.country] || it.country);
    if (it.region) add(PROV[it.region] || zhCity(it.region));
    if (it.city) add(zhCity(it.city));
    return out.join(' · ') || '—';
  }

  function listInto(box, items, opt) {
    if (!box) return;
    if (!items.length) {
      box.innerHTML = '<li class="tv-empty">' + esc(opt.empty || '这段时间还没有数据') + '</li>';
      return;
    }

    var max = 1;
    items.forEach(function (x) { if (x.pv > max) max = x.pv; });

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
      return '<div class="tv-col' + (x.pv ? '' : ' is-empty') + '" title="' + x.d + ' · ' + x.pv + ' 次浏览 / ' + x.uv + ' 个访客">' +
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

  function paintDetail(items) {
    var box = $('detail');
    if (!box) return;

    var head = '<div class="tv-tr tv-tr--h">' +
      '<span>时间</span><span>页面</span><span>IP</span>' +
      '<span>地区</span><span>来源</span><span>设备</span>' +
      '</div>';

    if (!items.length) {
      box.innerHTML = head + '<div class="tv-tr tv-tr--empty">还没有访问记录。有人打开页面后这里就会出现。</div>';
      return;
    }

    box.innerHTML = head + items.map(function (it) {
      var ip = it.ip || '—';
      var net = [it.asn ? 'AS' + it.asn : '', it.org, it.colo].filter(Boolean).join(' · ');
      return '<div class="tv-tr">' +
        '<span class="r-at" title="' + esc(it.at) + '">' + esc(String(it.at || '').slice(5, 19)) + '</span>' +
        '<span class="r-p" title="' + esc(it.path) + '">' + esc(it.path) + '</span>' +
        '<span class="r-ip" title="' + esc(net || ip) + '">' + esc(ip) + '</span>' +
        '<span class="r-c" title="' + esc([it.region, it.city].filter(Boolean).join(' / ')) + '">' + esc(place(it)) + '</span>' +
        '<span class="r-f" title="' + esc(it.ref || '直接访问') + '">' + esc(it.ref || '直接') + '</span>' +
        '<span class="r-u" title="' + esc(it.ua) + '">' + esc(uaBrief(it.ua)) + '</span>' +
      '</div>';
    }).join('');
  }

  function pageList(cur, total) {
    var out = [];
    if (total <= 7) {
      for (var i = 1; i <= total; i++) out.push(i);
      return out;
    }
    out.push(1);
    var s = Math.max(2, cur - 1);
    var e = Math.min(total - 1, cur + 1);
    if (s > 2) out.push('…');
    for (var j = s; j <= e; j++) out.push(j);
    if (e < total - 1) out.push('…');
    out.push(total);
    return out;
  }

  function paintPager(p) {
    var info = $('pgInfo');
    if (info) {
      info.textContent = p.total
        ? '共 ' + p.total + ' 条 · 每页 ' + p.per + ' 条 · 第 ' + p.page + ' / ' + p.pages + ' 页'
        : '暂无记录';
    }

    var box = $('pgBtns');
    if (!box) return;

    var html = '<button type="button" data-pg="' + (p.page - 1) + '"' + (p.page <= 1 ? ' disabled' : '') + '>上一页</button>';

    pageList(p.page, p.pages).forEach(function (n) {
      if (n === '…') {
        html += '<span class="tv-pg__gap">…</span>';
        return;
      }
      html += '<button type="button" data-pg="' + n + '"' + (n === p.page ? ' class="is-on"' : '') + '>' + n + '</button>';
    });

    html += '<button type="button" data-pg="' + (p.page + 1) + '"' + (p.page >= p.pages ? ' disabled' : '') + '>下一页</button>';
    box.innerHTML = html;
  }

  function paint(d) {
    $('kPv').textContent = d.today.pv;
    $('kUv').textContent = d.today.uv;
    $('kWpv').textContent = d.week.pv;
    $('kWuv').textContent = d.week.uv;
    $('kToday').textContent = d.today.pv + ' / ' + d.today.uv;

    paintChart(d.series, d.days);
    paintHours(d.hours);

    listInto($('browsers'), d.browsers, {
      label: function (it) { return it.k; },
      uv: true,
      empty: '还没有浏览器数据'
    });

    listInto($('systems'), d.systems, {
      label: function (it) { return it.k; },
      uv: true,
      empty: '还没有系统数据'
    });

    listInto($('mix'), d.mix, {
      label: function (it) { return it.k; },
      uv: true,
      empty: '今天还没有访客'
    });

    paintDetail(d.detail);
    paintPager(d.pager);

    var hint = $('detailHint');
    if (hint) hint.textContent = '最新在前 · 保留 90 天';
  }

  function load() {
    var btn = $('reload');
    if (btn) btn.disabled = true;

    fetch('/api/admin/traffic?days=14&page=' + page + '&per=30', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { location.replace('/login?next=/admin/traffic'); return null; }
        return r.json();
      })
      .then(function (d) {
        if (btn) btn.disabled = false;
        if (!d || !d.ok) return;
        page = d.pager.page;
        paint(d);
      })
      .catch(function () {
        if (btn) btn.disabled = false;
      });
  }

  /* 翻页：滚回明细表顶部，别让人翻完还在页脚 */
  function goto(n) {
    if (n === page) return;
    page = n;
    var box = $('detail');
    if (box) {
      var y = box.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo(0, Math.max(0, y));
    }
    load();
  }

  var pg = $('pgBtns');
  if (pg) {
    pg.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-pg]');
      if (!b || b.disabled) return;
      var n = Number(b.getAttribute('data-pg'));
      if (!n || n < 1) return;
      goto(n);
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
