/* ============================================================
   乘法 · 模拟广告墙
   任务清单来自服务端（同一份 MTX_DEMO_OFFERS），点完成就发一笔
   带交易号的入账，走的是和真实回调完全相同的 mtxApply。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var grid = $('mwGrid');
  var note = $('mwNote');
  var toastEl = $('toast');
  var toastTimer = null;

  function say(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2400);
  }

  function noteText(text, kind) {
    if (!note) return;
    note.textContent = text;
    note.className = 'mw-note' + (kind ? ' is-' + kind : '');
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { return { status: res.status, body: b }; }); })
      .catch(function () { return { status: 0, body: {} }; });
  }

  function postJSON(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(data || {})
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { return { status: res.status, body: b }; }); })
      .catch(function () { return { status: 0, body: {} }; });
  }

  var uid = new URLSearchParams(location.search).get('uid') || '';
  if ($('mwUid')) $('mwUid').textContent = uid || '未提供';

  function card(offer) {
    var box = document.createElement('article');
    box.className = 'mw-offer';
    box.setAttribute('data-id', offer.id);

    var k = document.createElement('span');
    k.className = 'mw-offer__k';
    k.textContent = 'OFFER / ' + offer.id.toUpperCase();
    box.appendChild(k);

    var t = document.createElement('h3');
    t.className = 'mw-offer__t';
    t.textContent = offer.name;
    box.appendChild(t);

    var d = document.createElement('p');
    d.className = 'mw-offer__d';
    d.textContent = '广告主结算后由服务端回调入账，重复回调只记一次。';
    box.appendChild(d);

    var p = document.createElement('div');
    p.className = 'mw-offer__p';
    var b = document.createElement('b');
    if (window.CF && CF.money) b.textContent = CF.money(offer.reward);
    else b.textContent = String(offer.reward);
    p.appendChild(b);
    var u = document.createElement('i');
    u.setAttribute('data-cur', 'code');
    u.textContent = 'XB';
    p.appendChild(u);
    box.appendChild(p);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mw-btn';
    btn.textContent = '标记完成';
    btn.addEventListener('click', function () { complete(offer, box, btn); });
    box.appendChild(btn);

    return box;
  }

  function complete(offer, box, btn) {
    btn.disabled = true;
    btn.textContent = '入账中…';
    noteText('正在向本站发回调…');

    postJSON('/api/moonetix/mock/complete', { offerId: offer.id, uid: uid ? Number(uid) : 0 })
      .then(function (r) {
        if (r.body && r.body.ok) {
          box.classList.add('is-done');
          btn.textContent = '已入账';
          noteText('已入账 ' + r.body.reward + ' XB，交易号 ' + r.body.tid + '，当前余额 ' + r.body.balance + ' XB。', 'ok');
          say('入账成功');
          return;
        }
        btn.disabled = false;
        btn.textContent = '重试';
        var code = r.body && r.body.error;
        if (code === 'forbidden') noteText('模拟墙只对站长与管理员开放，普通账户在这里点不动是正常的。', 'err');
        else if (code === 'live_mode') noteText('已经接入真实服务商，模拟墙自动停用了。', 'err');
        else noteText('入账失败：' + (code || '网络错误'), 'err');
      });
  }

  function boot() {
    getJSON('/api/moonetix/link').then(function (r) {
      if (r.status === 401) {
        noteText('登录状态已失效，回「赚积分」页重新登录。', 'err');
        return;
      }
      var data = r.body || {};
      if (!data.ok) {
        noteText('取不到墙状态：' + (data.error || '未知错误'), 'err');
        return;
      }
      if (!data.demo) {
        noteText('已接入真实服务商，这页模拟墙不再使用。', 'err');
        return;
      }
      var offers = data.offers || [];
      if (!offers.length) {
        noteText('没有可用的模拟任务。', 'err');
        return;
      }

      grid.textContent = '';
      offers.forEach(function (o) { grid.appendChild(card(o)); });
      noteText('共 ' + offers.length + ' 项任务，点「标记完成」即发起一次入账。', 'ok');
    });
  }

  boot();

  /* 币种切换由 config.js 接管，这里不用管 */
})();
