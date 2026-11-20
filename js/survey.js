/* ============================================================
   乘法 · 站内问卷答题页
   题目从 /api/surveys/paper 取，结局由服务端判定，这里只管画和报。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var id = Number(new URLSearchParams(location.search).get('id')) || 0;
  var paper = null;
  var startedAt = '';
  var ticker = 0;
  var poller = 0;

  var toastEl = $('toast');
  var toastTimer = null;

  function say(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function note(text, bad) {
    var el = $('svNote');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.classList.toggle('is-bad', !!bad);
  }

  /* 用时按开卷时间算，跟服务端一致 */
  function secondsSince(ts) {
    if (!ts) return 0;
    var t = Date.parse(String(ts).replace(' ', 'T') + '+08:00');
    if (isNaN(t)) return 0;
    return Math.max(0, Math.round((Date.now() - t) / 1000));
  }

  function startTimer() {
    clearInterval(ticker);
    var el = $('svTimer');
    var tick = function () {
      if (!el) return;
      var s = secondsSince(startedAt);
      el.textContent = '用时 ' + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    };
    tick();
    ticker = setInterval(tick, 1000);
  }

  function paintQuestions(qs) {
    var box = $('svQs');
    if (!box) return;

    box.innerHTML = qs.map(function (q, i) {
      var opts = q.options.map(function (o, j) {
        return '<label class="paper-opt">' +
          '<input type="radio" name="q' + i + '" value="' + j + '" data-q="' + i + '" data-o="' + j + '">' +
          '<span class="paper-opt__dot" aria-hidden="true"></span>' +
          '<span class="paper-opt__t">' + esc(o) + '</span>' +
          '</label>';
      }).join('');

      return '<div class="paper-q" data-i="' + i + '">' +
        '<div class="paper-q__l">' +
          '<span class="paper-q__n">' + ('0' + (i + 1)).slice(-2) + '</span>' +
          '<span class="paper-q__t">' + esc(q.q) + '</span>' +
        '</div>' +
        '<div class="paper-opts">' + opts + '</div>' +
        '</div>';
    }).join('');

    updateProgress();
  }

  function picked() {
    var out = {};
    [].forEach.call(document.querySelectorAll('#svQs input[type=radio]:checked'), function (r) {
      out[r.getAttribute('data-q')] = Number(r.getAttribute('data-o'));
    });
    return out;
  }

  function updateProgress() {
    var total = paper ? paper.questions.length : 0;
    var done = Object.keys(picked()).length;
    var el = $('svProgress');
    if (el) el.textContent = done + ' / ' + total + ' 题';
    var btn = $('svSend');
    if (btn) btn.disabled = done < total;
  }

  /* ---------- 结果 ---------- */

  var KIND = {
    success: '通过',
    fail: '失败',
    speed: '超速',
    quota: '满额',
    kick: '被踢',
    reject: '打回'
  };

  var DESC = {
    success: '答卷通过质检，奖励已经入账。',
    fail: '问卷商那边接口出错，答卷没能保存。',
    speed: '答得太快，被判超速作废。',
    quota: '这份问卷的名额刚好在提交前收满了。',
    kick: '答题过程中命中了排除条件，会话被终止。',
    reject: '问卷商说这份要过质检，先入账，过一会儿再看结果。'
  };

  function showResult(d) {
    $('svForm').hidden = true;
    $('svResult').hidden = false;
    clearInterval(ticker);

    var kind = d.result || 'success';
    $('svResKind').textContent = (KIND[kind] || kind).toUpperCase() + ' / ' + (d.elapsed || 0) + ' 秒';
    $('svResTitle').textContent = KIND[kind] || kind;
    $('svResDesc').textContent = DESC[kind] || '';

    var steps = (d.steps || []).map(function (s) {
      return '<li>' + esc(s) + '</li>';
    }).join('');
    $('svSteps').innerHTML = steps;

    if (d.pending) waitReject(d.delay);
  }

  /* 打回：前端只做倒计时，到点问服务端，冲正由后端做 */
  function waitReject(delay) {
    var left = Number(delay) || 30;
    var due = Date.now() + left * 1000;

    var tip = $('svResDesc');
    var base = tip ? tip.textContent : '';

    var tick = function () {
      var s = Math.max(0, Math.round((due - Date.now()) / 1000));
      if (tip) tip.textContent = base + ' 质检还剩 ' + s + ' 秒。';
    };
    tick();
    clearInterval(poller);
    poller = setInterval(tick, 1000);

    var ask = function () {
      fetch('/api/surveys/poll?id=' + id, { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok) return;
          if (d.done) {
            clearInterval(poller);
            if (d.rejected) {
              $('svResKind').textContent = '打回 / 已冲正';
              $('svResTitle').textContent = '被打回了';
              if (tip) tip.textContent = '质检没通过：奖励已经扣回，经验 −8。';
              var ul = $('svSteps');
              if (ul) {
                ul.insertAdjacentHTML('beforeend',
                  '<li>质检结论：答卷无效</li><li>奖励冲正，经验 −8，参与记录标记为打回</li>');
              }
            }
            return;
          }
          setTimeout(ask, 1200);
        })
        .catch(function () { setTimeout(ask, 2000); });
    };
    setTimeout(ask, Math.min(4000, (left + 1) * 1000));
  }

  /* ---------- 启动 ---------- */

  function boot() {
    if (!id) {
      note('地址里少了问卷编号。回大厅重新点一次。', true);
      return;
    }

    fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search)); return null; }
        return r.json();
      })
      .then(function (d) {
        var u = d && d.user;
        if (!u) return;
        if (window.CF && CF.cache) CF.cache.set(u);
        var bal = $('navBal');
        if (bal) bal.textContent = u.fc;
        var nm = $('navName');
        if (nm) nm.textContent = u.username || '我';
      })
      .catch(function () {});

    fetch('/api/surveys/paper?id=' + id, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search)); return null; }
        return r.json();
      })
      .then(function (d) {
        if (!d) return;

        if (!d.ok) {
          if (d.error === 'already_done') {
            $('svTitle').textContent = '这个网络已经交过这份问卷';
            $('svMeta').textContent = '同一份问卷同一个 IP 只能参与一次。';
            note('换了网络之后可以再来一次。', false);
          } else if (d.error === 'not_inline') {
            $('svTitle').textContent = '这份问卷要跳转到问卷商页面';
            $('svMeta').textContent = '回大厅点入口就能进去。';
          } else if (d.error === 'not_found') {
            $('svTitle').textContent = '问卷不存在或已下架';
          } else {
            $('svTitle').textContent = '这份问卷现在打不开';
            $('svMeta').textContent = d.error || '';
          }
          return;
        }

        paper = d.survey;
        paper.questions = d.questions;   /* 题面在 d.questions 里，surevy 只有基本信息 */
        startedAt = d.startedAt;

        $('svTitle').textContent = paper.title;
        $('svMeta').textContent = [
          d.questions.length + ' 题',
          paper.durationMin ? '约 ' + paper.durationMin + ' 分钟' : '',
          paper.provider || ''
        ].filter(Boolean).join(' · ');
        $('svReward').textContent = '+' + paper.price;
        if (paper.requirement) {
          var req = $('svReq');
          req.hidden = false;
          req.textContent = '要求：' + paper.requirement;
        }

        paintQuestions(d.questions);
        $('svForm').hidden = false;
        startTimer();
      })
      .catch(function () {
        note('载入失败，刷新一下再试。', true);
      });
  }

  var form = $('svForm');
  if (form) {
    form.addEventListener('change', updateProgress);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();

      var pick = picked();
      var total = paper ? paper.questions.length : 0;
      if (Object.keys(pick).length < total) {
        say('还有题目没选');
        return;
      }

      var answers = paper.questions.map(function (q, i) {
        return { q: i, o: pick[i] };
      });

      var btn = $('svSend');
      if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
      $('svTip').textContent = '正在交给问卷商核验…';

      fetch('/api/surveys/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: id, answers: answers })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok) {
            if (btn) { btn.disabled = false; btn.textContent = '提交答卷'; }
            $('svTip').textContent = '';
            if (d && d.error === 'already_done') {
              note('这个 IP 已经交过这份问卷了，换个网络可以再来一次。', true);
              $('svForm').hidden = true;
              return;
            }
            if (d && d.error === 'proxy_banned') {
              note('检测到代理 / VPN 网络，账号已被封禁。去设置页看封禁记录。', true);
              $('svForm').hidden = true;
              return;
            }
            say('提交失败：' + ((d && d.error) || '未知错误'));
            return;
          }
          showResult(d);
          if (window.CF && CF.cache) CF.cache.clear();
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = '提交答卷'; }
          $('svTip').textContent = '网络不稳，再点一次提交。';
        });
    });
  }

  boot();
})();
