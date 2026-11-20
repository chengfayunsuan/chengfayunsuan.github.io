/* 实验台 · 上传问卷 → 答题 → 提交 → 出结果。
   结局不是按钮选的，是答题时选中的那个选项决定的（选项上带 outcome）。
   打回类结局不立刻生效：先入账，等服务端到点冲正，前端只负责倒计时。 */
(function () {
  'use strict';

  var OUT_NAMES = {
    success: '通过', fail: '问卷商 500', speed: '超速作废',
    quota: '配额已满', kick: '中途被踢', reject: '事后打回'
  };

  var $ = function (id) { return document.getElementById(id); };

  var paper = null;
  var runId = 0, startedAt = 0, ticker = 0, poller = 0, busy = false, fresh = true;

  /* ---------- 日志 ---------- */

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

  function tip(text, bad) {
    var el = $('formTip');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'lab-form__tip' + (bad ? ' is-bad' : '');
  }

  function api(method, path, body) {
    var opt = { method: method, headers: {} };
    if (body !== undefined) {
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

  /* ---------- 问卷 ---------- */

  function paintPaper() {
    if (!paper) return;
    $('paperTitle').textContent = paper.title || '未命名问卷';

    var qs = paper.questions || [];
    var bound = 0;
    qs.forEach(function (q) {
      (q.options || []).forEach(function (o) { if (o && typeof o === 'object' && o.outcome) bound++; });
    });

    var bits = [qs.length + ' 题'];
    bits.push(bound ? bound + ' 个选项绑了结局' : '没有绑结局的选项，按用时判');
    bits.push(paper.builtin ? '内置' : '已上传');
    if (paper.at) bits.push('更新于 ' + paper.at);
    $('paperMeta').textContent = bits.join(' · ');
  }

  function loadPaper() {
    api('GET', '/admin/lab/paper').then(function (r) {
      if (r.body && r.body.ok) { paper = r.body.paper; paintPaper(); }
      else $('paperTitle').textContent = '读取失败';
    }).catch(function () { $('paperTitle').textContent = '读取失败'; });
  }

  /* ---------- 答题 ---------- */

  function renderForm() {
    var box = $('qs');
    box.innerHTML = '';

    var list = paper.questions || [];
    list.forEach(function (q, qi) {
      var li = document.createElement('li');
      li.className = 'lab-q';

      var n = document.createElement('span');
      n.className = 'lab-q__n';
      n.textContent = ('0' + (qi + 1)).slice(-2);
      li.appendChild(n);

      var t = document.createElement('p');
      t.className = 'lab-q__t';
      t.textContent = q.q;
      li.appendChild(t);

      var opts = document.createElement('div');
      opts.className = 'lab-q__o';

      (q.options || []).forEach(function (o, oi) {
        var label = document.createElement('label');
        label.className = 'lab-opt';

        var input = document.createElement('input');
        input.type = 'radio';
        input.name = 'q' + qi;
        input.value = String(oi);

        var span = document.createElement('span');
        span.textContent = (o && typeof o === 'object') ? o.label : String(o);

        label.appendChild(input);
        label.appendChild(span);
        opts.appendChild(label);
      });

      li.appendChild(opts);
      box.appendChild(li);
    });

    $('formDone').textContent = '0 / ' + list.length + ' 题';
    $('form').hidden = false;
    $('form').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function countPicked() {
    var list = paper.questions || [];
    var done = 0;
    for (var i = 0; i < list.length; i++) {
      if (document.querySelector('input[name="q' + i + '"]:checked')) done++;
    }
    $('formDone').textContent = done + ' / ' + list.length + ' 题';
    return done;
  }

  function startRun() {
    if (busy || runId) return;
    busy = true;
    $('startBtn').disabled = true;

    api('POST', '/admin/lab/start', {}).then(function (r) {
      busy = false;
      $('startBtn').disabled = false;

      if (!r.body || !r.body.ok) {
        say('✗ 开始失败：' + ((r.body && r.body.error) || r.status), 'bad');
        return;
      }

      paper = r.body.paper || paper;
      paintPaper();

      runId = r.body.runId;
      startedAt = Date.now();

      say('▶ 会话 #' + runId + ' 已建立，开始计时');
      (r.body.steps || []).forEach(function (s) { say('  ' + s, 'dim'); });

      renderForm();
      tip('每题都要选一个，选完才能提交。最后一题的选项决定这次出什么结局。');

      clearInterval(ticker);
      ticker = setInterval(function () {
        $('formTime').textContent = Math.floor((Date.now() - startedAt) / 1000) + ' 秒';
      }, 400);
    }).catch(function () {
      busy = false;
      $('startBtn').disabled = false;
      say('✗ 网络错误', 'bad');
    });
  }

  function resetForm() {
    clearInterval(ticker);
    ticker = 0;
    clearInterval(poller);
    poller = 0;
    runId = 0;
    $('form').hidden = true;
    $('formTime').textContent = '0 秒';
    $('formDone').textContent = '0 / 0 题';
    $('submitBtn').disabled = false;
    $('dropBtn').disabled = false;
    $('startBtn').disabled = false;
    tip('每题都要选一个，选完才能提交。最后一题的选项决定这次出什么结局。');
  }

  /* ---------- 提交 ---------- */

  function submit() {
    if (!runId || busy) return;

    var list = paper.questions || [];
    var answers = [];
    for (var i = 0; i < list.length; i++) {
      var el = document.querySelector('input[name="q' + i + '"]:checked');
      if (!el) { tip('第 ' + (i + 1) + ' 题还没选', true); return; }
      answers.push({ q: i, o: Number(el.value) });
    }

    busy = true;
    $('submitBtn').disabled = true;
    tip('提交中…');

    api('POST', '/admin/lab/finish', { runId: runId, answers: answers }).then(function (r) {
      busy = false;

      if (!r.body || !r.body.ok) {
        $('submitBtn').disabled = false;
        tip('提交失败：' + ((r.body && r.body.error) || r.status), true);
        say('✗ 提交失败：' + ((r.body && r.body.error) || r.status), 'bad');
        return;
      }

      var b = r.body;
      (b.steps || []).forEach(function (s) { say('  ' + s, 'dim'); });
      if (b.user) paint(b.user);

      if (b.pending) {
        /* 打回：先入账，倒计时结束后由服务端冲正 */
        say('结果：' + (OUT_NAMES[b.result] || b.result) + '（等待质检）', 'bad');
        waitReject(b);
        return;
      }

      say('结果：' + (OUT_NAMES[b.result] || b.result), b.result === 'success' ? 'ok' : 'bad');
      if (b.user) say('余额 ' + b.user.fc + ' · 经验 ' + b.user.exp + ' · LV ' + b.user.level, 'dim');
      resetForm();
    }).catch(function () {
      busy = false;
      $('submitBtn').disabled = false;
      tip('网络错误', true);
      say('✗ 网络错误', 'bad');
    });
  }

  function waitReject(b) {
    var left = Number(b.delay) || 30;
    var due = Date.now() + left * 1000;

    /* 提交完就别让人再改答案了，看着像还能改一样 */
    [].forEach.call(document.querySelectorAll('.lab-q input'), function (i) { i.disabled = true; });
    $('dropBtn').disabled = true;
    tip('已入账，质检中… ' + left + ' 秒');

    clearInterval(poller);
    poller = setInterval(function () {
      var rest = Math.max(0, Math.ceil((due - Date.now()) / 1000));
      tip('已入账，质检中… ' + rest + ' 秒');
      if (rest > 0) return;

      clearInterval(poller);
      poller = 0;
      pollOnce();
    }, 400);
  }

  function pollOnce() {
    api('GET', '/admin/lab/poll?runId=' + runId).then(function (r) {
      if (!r.body || !r.body.ok) {
        say('✗ 查询失败：' + ((r.body && r.body.error) || r.status), 'bad');
        resetForm();
        return;
      }

      if (!r.body.done) {
        var rest = Number(r.body.secondsLeft) || 0;
        tip('已入账，质检中… ' + rest + ' 秒');
        setTimeout(pollOnce, Math.max(1200, rest * 1000));
        return;
      }

      (r.body.steps || []).forEach(function (s) { say('  ' + s, 'dim'); });
      say('结果：打回，奖励已冲正', 'bad');
      if (r.body.user) {
        paint(r.body.user);
        say('余额 ' + r.body.user.fc + ' · 经验 ' + r.body.user.exp + ' · LV ' + r.body.user.level, 'dim');
      }
      resetForm();
    }).catch(function () {
      say('✗ 网络错误', 'bad');
      resetForm();
    });
  }

  /* ---------- 上传问卷 ---------- */

  function bindPaperUI() {
    $('paperUpload').addEventListener('click', function () {
      var box = $('pasteBox');
      box.hidden = !box.hidden;
      if (!box.hidden) $('pasteArea').focus();
    });

    $('pasteCancel').addEventListener('click', function () {
      $('pasteBox').hidden = true;
    });

    $('pickFile').addEventListener('click', function () { $('paperFile').click(); });

    $('paperFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      if (f.size > 200 * 1024) { say('✗ 文件超过 200KB', 'bad'); return; }
      var fr = new FileReader();
      fr.onload = function () {
        $('pasteArea').value = String(fr.result || '');
        say('已读入 ' + f.name + '，确认后点「保存问卷」', 'dim');
      };
      fr.readAsText(f);
    });

    $('pasteSave').addEventListener('click', function () {
      var txt = $('pasteArea').value.trim();
      if (!txt) { say('✗ 粘贴框是空的', 'bad'); return; }

      var obj;
      try { obj = JSON.parse(txt); }
      catch (e) { say('✗ JSON 解析失败：' + e.message, 'bad'); return; }

      api('POST', '/admin/lab/paper', obj).then(function (r) {
        if (!r.body || !r.body.ok) {
          say('✗ ' + ((r.body && r.body.message) || '保存失败'), 'bad');
          return;
        }
        paper = r.body.paper;
        paintPaper();
        $('pasteBox').hidden = true;
        $('pasteArea').value = '';
        say('✓ 问卷已换成「' + paper.title + '」，共 ' + paper.questions.length + ' 题', 'ok');
      });
    });

    $('paperReset').addEventListener('click', function () {
      api('POST', '/admin/lab/paper/reset', {}).then(function (r) {
        if (!r.body || !r.body.ok) { say('✗ 恢复失败', 'bad'); return; }
        paper = r.body.paper;
        paintPaper();
        say('✓ 已回到内置问卷', 'ok');
      });
    });
  }

  /* ---------- 启动 ---------- */

  $('startBtn').addEventListener('click', startRun);
  $('submitBtn').addEventListener('click', submit);
  $('dropBtn').addEventListener('click', function () {
    if (runId) say('已丢弃本次会话，没有提交', 'dim');
    resetForm();
  });

  $('qs').addEventListener('change', countPicked);

  api('GET', '/auth/me').then(function (r) {
    if (r.status === 401) { location.replace('/login?next=/lab'); return; }
    var u = r.body && r.body.user;
    if (!u || (u.role !== 'owner' && u.role !== 'admin')) { location.replace('/home'); return; }
    $('navName').textContent = u.username || '我';
    paint({ fc: u.fc, frozen: u.fcFrozen, exp: u.exp, level: u.level, affinity: u.affinity });
    bindPaperUI();
    loadPaper();
  }).catch(function () {
    say('✗ 无法读取账户信息', 'bad');
  });
})();
