/* 实验台 · 六种结局，一次一种。
   所有数字都来自后端，前端只负责把每一步摊开给你看。 */
(function () {
  'use strict';

  var CASES = [
    { k: 'success', t: '通过', d: '奖励 +2.5 CFB，经验 +1' },
    { k: 'fail',    t: '失败', d: '问卷商 500，答卷没保存' },
    { k: 'speed',   t: '超速', d: '4 秒交卷，答卷一概作废' },
    { k: 'quota',   t: '配额满', d: '入口就被挡回去' },
    { k: 'kick',    t: '被踢', d: '筛选题不符，中途终止' },
    { k: 'reject',  t: '事后打回', d: '先入账再冲正，经验 −7' }
  ];

  var NAMES = {
    success: '通过', fail: '失败', speed: '超速',
    quota: '配额满', kick: '被踢', reject: '打回'
  };

  var $ = function (id) { return document.getElementById(id); };
  var runId = 0, startedAt = 0, ticker = 0, busy = false, fresh = true;

  function say(text, cls) {
    var pre = $('log');
    if (fresh) { pre.textContent = ''; fresh = false; }
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    var line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '  ' + text;
    pre.appendChild(line);
    pre.scrollTop = pre.scrollHeight;
  }

  function api(method, path, body) {
    var opt = { method: method, headers: {} };
    if (body) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch('/api' + path, opt).then(function (r) {
      return r.json()
        .then(function (j) { return { status: r.status, body: j }; })
        .catch(function () { return { status: r.status, body: null }; });
    });
  }

  function paint(u) {
    if (!u) return;
    if (u.fc != null) { $('stFc').textContent = u.fc; $('navBal').textContent = u.fc; }
    if (u.frozen != null) $('stFrozen').textContent = u.frozen;
    if (u.exp != null) $('stExp').textContent = u.exp;
    if (u.level != null) $('stLevel').textContent = 'LV ' + u.level;
    if (u.affinity != null) $('stAff').textContent = u.affinity;
  }

  function lock(on) {
    [].forEach.call(document.querySelectorAll('.lab-case'), function (b) {
      b.disabled = !!on || !!runId;
    });
  }

  function buildCases() {
    var box = $('cases');
    CASES.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lab-case';
      b.innerHTML = '<span class="lab-case__k">' + c.k + '</span>' +
        '<span class="lab-case__t">' + c.t + '</span>' +
        '<span class="lab-case__d">' + c.d + '</span>';
      b.addEventListener('click', function () { start(c); });
      box.appendChild(b);
    });
  }

  function start(c) {
    if (busy || runId) return;
    busy = true;
    lock(true);
    say('▶ 开始「' + c.t + '」');

    api('POST', '/admin/lab/start', { scenario: c.k }).then(function (r) {
      busy = false;
      if (!r.body || !r.body.ok) {
        say('✗ 接口拒绝：' + ((r.body && r.body.error) || r.status), 'bad');
        lock(false);
        return;
      }
      (r.body.steps || []).forEach(function (s) { say('  ' + s, 'dim'); });
      paint(r.body.user);

      if (r.body.blocked) {
        say('结果：配额满，根本没进去答题', 'bad');
        say('余额 ' + r.body.user.fc + ' · 经验 ' + r.body.user.exp + '（没变）', 'dim');
        lock(false);
        return;
      }

      runId = r.body.runId;
      startedAt = Date.now();
      $('live').hidden = false;
      $('liveName').textContent = c.t + ' · 会话 #' + runId;
      $('liveTime').textContent = '0 秒';
      clearInterval(ticker);
      ticker = setInterval(function () {
        $('liveTime').textContent = Math.floor((Date.now() - startedAt) / 1000) + ' 秒';
      }, 400);
    }).catch(function () {
      busy = false;
      lock(false);
      say('✗ 网络错误', 'bad');
    });
  }

  function finish() {
    if (!runId || busy) return;
    busy = true;
    $('liveSubmit').disabled = true;

    api('POST', '/admin/lab/finish', { runId: runId }).then(function (r) {
      busy = false;
      $('liveSubmit').disabled = false;
      if (!r.body || !r.body.ok) {
        say('✗ 提交失败：' + ((r.body && r.body.error) || r.status), 'bad');
        return;
      }
      var b = r.body;
      (b.steps || []).forEach(function (s) { say('  ' + s, 'dim'); });
      say('结果：' + (NAMES[b.result] || b.result), b.result === 'success' ? 'ok' : 'bad');
      if (b.user) {
        say('余额 ' + b.user.fc + ' · 经验 ' + b.user.exp + ' · LV ' + b.user.level, 'dim');
        paint(b.user);
      }
      drop();
    }).catch(function () {
      busy = false;
      $('liveSubmit').disabled = false;
      say('✗ 网络错误', 'bad');
    });
  }

  function drop() {
    clearInterval(ticker);
    ticker = 0;
    runId = 0;
    $('live').hidden = true;
    $('liveTime').textContent = '0 秒';
    lock(false);
  }

  $('liveSubmit').addEventListener('click', finish);
  $('liveDrop').addEventListener('click', function () {
    if (runId) say('已丢弃本次会话，没有提交', 'dim');
    drop();
  });

  api('GET', '/auth/me').then(function (r) {
    if (r.status === 401) { location.replace('/login?next=/lab'); return; }
    var u = r.body && r.body.user;
    if (!u || (u.role !== 'owner' && u.role !== 'admin')) { location.replace('/home'); return; }
    $('navName').textContent = u.username || '我';
    paint({ fc: u.fc, frozen: u.fcFrozen, exp: u.exp, level: u.level, affinity: u.affinity });
    buildCases();
  }).catch(function () {
    say('✗ 无法读取账户信息', 'bad');
  });
})();
