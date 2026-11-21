/* ============================================================
   Chengfa · 账户设置
   数据来自 /api/auth/me；用户名改写走 /api/user/profile
   ============================================================ */
(function () {
  'use strict';

  /* /en/ 与中文页共用这一份脚本。只有密码/验证码这几块做了双语，
     其余区域仍由 i18n-en.js 扫静态 DOM 翻译。 */
  var EN = /^\/en(\/|$)/.test(location.pathname);
  function T(zh, en) { return EN ? en : zh; }

  var ROLES = { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };
  var STATUS = { active: '正常', frozen: '已冻结', banned: '已封禁' };

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');
  var toast = document.getElementById('toast');

  function $(id) { return document.getElementById(id); }
  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }

  /* 余额小数末尾的 0 不显示：0.0000 -> 0，128.4500 -> 128.45 */
  /* 金额显示统一走 CF，切换币种时由 CF.refresh 重刷所有 data-cfb 节点 */
  function setAmt(el, v) {
    if (window.CF && CF.amount) CF.amount(el, v);
    else if (el) el.textContent = trimNum(v);
  }

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
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2400);
  }

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

  /* ---------- 换算 ---------- */

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1, 2) + '.' + pad(d.getDate(), 2);
  }

  function fmtFull(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return fmtDate(iso) + ' ' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2);
  }

  function daysSince(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 1;
    var n = Math.floor((Date.now() - d.getTime()) / 86400000) + 1;
    return n < 1 ? 1 : n;
  }

  /* ---------- 兑换记录 ---------- */

  var ORDER_ST = { paid: '已完成', pending: '待发货', refunded: '已退款' };

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { say('已复制'); })
        .catch(function () { say('复制失败，请手动选中'); });
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); say('已复制'); } catch (e) { say('复制失败，请手动选中'); }
    document.body.removeChild(ta);
  }

  /* 封禁记录：后台每次改状态都会留痕，见 /api/user/bans */
  var BAN_LABEL = { banned: '封禁', frozen: '冻结', active: '解除' };

  function loadBans() {
    var list = $('banList');
    var cnt = $('banCount');
    if (!list || !cnt) return;

    fetch('/api/user/bans', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        cnt.textContent = String(d.count || 0);

        var items = d.items || [];
        if (!items.length) return;

        list.textContent = '';

        items.forEach(function (it) {
          var li = document.createElement('li');
          li.className = 'ban__i';

          var hd = document.createElement('div');
          hd.className = 'ban__hd';

          var tag = document.createElement('b');
          tag.className = 'ban__tag ' +
            (it.to === 'banned' ? 'is-ban' : it.to === 'frozen' ? 'is-frz' : 'is-act');
          tag.textContent = BAN_LABEL[it.to] || it.to;
          hd.appendChild(tag);

          var when = document.createElement('span');
          when.className = 'ban__t';
          when.textContent = fmtFull(it.at);
          hd.appendChild(when);

          var who = document.createElement('span');
          who.className = 'ban__t';
          who.textContent = '由' + (it.by || '管理员') + '操作';
          hd.appendChild(who);

          li.appendChild(hd);

          var why = document.createElement('p');
          why.className = 'ban__r';
          why.textContent = it.reason
            ? it.reason
            : (it.to === 'active' ? '账户已恢复正常。' : '未填写原因。');
          li.appendChild(why);

          list.appendChild(li);
        });
      })
      .catch(function () {});
  }

  /* 我的工单 */
  var TK_LABEL = {
    account: '账户与登录', balance: '余额与提现', survey: '问卷与奖励',
    report: '举报与申诉', other: '其他'
  };

  function loadTickets() {
    var list = $('ticketList');
    if (!list) return;

    fetch('/api/ticket', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        var items = d.items || [];
        if (!items.length) return;

        list.textContent = '';

        items.forEach(function (t) {
          var li = document.createElement('li');
          li.className = 'tk__i';

          var hd = document.createElement('div');
          hd.className = 'tk__hd';

          var tag = document.createElement('b');
          tag.className = 'tk__tag ' + (t.status === 'closed' ? 'is-closed' : 'is-open');
          tag.textContent = t.status === 'closed' ? '已处理' : '处理中';
          hd.appendChild(tag);

          var kind = document.createElement('span');
          kind.className = 'tk__at';
          kind.textContent = TK_LABEL[t.type] || '其他';
          hd.appendChild(kind);

          var at = document.createElement('span');
          at.className = 'tk__at';
          at.textContent = fmtFull(t.created_at);
          hd.appendChild(at);

          li.appendChild(hd);

          var body = document.createElement('p');
          body.className = 'tk__d';
          body.textContent = t.detail;
          li.appendChild(body);

          if (t.reply) {
            var re = document.createElement('p');
            re.className = 'tk__re';
            re.textContent = '站长回复：' + t.reply;
            li.appendChild(re);
          }

          list.appendChild(li);
        });
      })
      .catch(function () {});
  }

  function loadRedeems() {
    var body = $('redeemBody');
    if (!body) return;

    fetch('/api/orders', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        var items = d.items || [];
        if (!items.length) return;

        body.textContent = '';

        items.forEach(function (o) {
          var tr = document.createElement('tr');

          var t = document.createElement('td');
          t.textContent = fmtFull(o.at);
          tr.appendChild(t);

          var name = document.createElement('td');
          var nb = document.createElement('b');
          nb.textContent = o.title;
          name.appendChild(nb);
          tr.appendChild(name);

          var amount = document.createElement('td');
          amount.className = 'ta-r';
          var num = document.createElement('b');
          setAmt(num, o.price);
          var unit = document.createElement('i');
          unit.setAttribute('data-cur', 'code');
          unit.textContent = 'XB';
          amount.appendChild(num);
          amount.appendChild(unit);
          tr.appendChild(amount);

          var code = document.createElement('td');
          if (o.code) {
            code.className = 'tb__code';
            code.textContent = o.code;
            code.title = '点击复制';
            code.addEventListener('click', function () { copyText(o.code); });
          } else {
            code.textContent = o.sn;
          }
          tr.appendChild(code);

          var st = document.createElement('td');
          st.textContent = ORDER_ST[o.status] || o.status;
          tr.appendChild(st);

          body.appendChild(tr);
        });
      })
      .catch(function () {});
  }

  /* ---------- 渲染 ---------- */

  var current = null;

  function render(u) {
    current = u;

    $('navName').textContent = u.username || '未命名';
    setAmt($('navBal'), u.fc);

    /* 站长与管理员点左上角Chengfa进后台 */
    var brand = document.querySelector('.brand');
    if (brand && (u.role === 'owner' || u.role === 'admin')) brand.setAttribute('href', '/admin');

    $('setUid').textContent = u.uid;
    $('setUser').textContent = u.username || '未命名';
    $('setStatus').textContent = STATUS[u.status] || u.status;
    $('setJoined').textContent = fmtFull(u.createdAt);

    var role = u.role || 'user';
    $('setRole').textContent = ROLES[role] || role;
    $('setRole').setAttribute('data-role', role);

    $('curName').textContent = u.username || '—';
    $('curEmail').textContent = u.email || '—';

    /* 邮箱验证状态：已验证就不再显示“验证邮箱”按钮 */
    var tag = $('emailTag');
    if (tag) {
      tag.hidden = !u.email;
      tag.textContent = u.emailVerified ? '已验证' : '未验证';
      tag.classList.toggle('is-ok', !!u.emailVerified);
    }
    var vbtn = $('emailVerifyBtn');
    if (vbtn) vbtn.hidden = !u.email || !!u.emailVerified;

    setAmt($('setFc'), u.fc);
    setAmt($('setFrozen'), u.fcFrozen);

    $('stDone').textContent = u.done || 0;
    $('stDays').textContent = daysSince(u.createdAt);
    $('stLevel').textContent = u.level;
    $('stAff').textContent = u.affinity;

    $('curIp').textContent = u.ip || '未记录';
    $('curNet').textContent = u.net || '未记录';
    $('lastLogin').textContent = u.lastLoginAt ? fmtFull(u.lastLoginAt) : '未记录';
  }

  /* ---------- 关注与粉丝：两行数字与小窗口 ---------- */

  var relList = $('relList');
  var relEmpty = $('relEmpty');
  var relMore = $('relMore');
  var sheet = $('relSheet');

  var REL = { uid: null, scope: 'following', offset: 0, total: 0, busy: false };
  var SOC = { followers: 0, following: 0 };
  var lastFocus = null;
  var socialBound = false;

  function paintSocial() {
    $('setFollowN').textContent = SOC.following;
    $('setFansN').textContent = SOC.followers;
    $('tabFollow').textContent = SOC.following;
    $('tabFans').textContent = SOC.followers;
  }

  function openSheet(scope) {
    if (!sheet) return;
    lastFocus = document.activeElement;
    sheet.hidden = false;
    document.body.classList.add('is-locked');
    var x = $('sheetClose');
    if (x) x.focus();
    loadRel(scope, false);
  }

  function closeSheet() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.body.classList.remove('is-locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function setTabs(scope) {
    Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-scope') === scope);
    });
  }

  function emptyText(scope) {
    return scope === 'followers' ? '还没有人关注你。' : '还没有关注任何人。';
  }

  function relItem(it) {
    var li = document.createElement('li');
    li.className = 'rel__i';

    var a = document.createElement('a');
    a.className = 'rel__a';
    a.href = '/space?uid=' + encodeURIComponent(it.uid);

    var uid = document.createElement('span');
    uid.className = 'rel__uid';
    uid.textContent = 'UID ' + it.uid;

    var name = document.createElement('span');
    name.className = 'rel__name';
    name.textContent = it.username || '未命名';

    var role = document.createElement('span');
    role.className = 'face__role rel__role';
    role.setAttribute('data-role', it.role || 'user');
    role.textContent = ROLES[it.role] || it.role || '用户';

    var lv = document.createElement('span');
    lv.className = 'rel__lv';
    lv.textContent = 'LV ' + (it.level == null ? 1 : it.level);

    var at = document.createElement('span');
    at.className = 'rel__at';
    at.textContent = fmtDate(it.at);

    a.appendChild(uid);
    a.appendChild(name);
    a.appendChild(role);
    a.appendChild(lv);
    a.appendChild(at);
    li.appendChild(a);

    if (String(it.uid) !== String(REL.uid)) {
      var act = document.createElement('button');
      act.className = 'rel__act';
      act.type = 'button';
      act.setAttribute('data-uid', it.uid);
      act.setAttribute('data-following', it.following ? '1' : '0');
      act.textContent = it.following ? '取消关注' : '关注';
      li.appendChild(act);
    }

    return li;
  }

  function loadRel(scope, append) {
    if (REL.busy || !sheet) return;

    REL.busy = true;
    REL.scope = scope;

    if (!append) {
      REL.offset = 0;
      relList.textContent = '';
      relEmpty.hidden = true;
      relMore.hidden = true;
    } else {
      relMore.disabled = true;
    }

    setTabs(scope);

    fetch('/api/follow?scope=' + encodeURIComponent(scope) +
          '&uid=' + encodeURIComponent(REL.uid) + '&offset=' + REL.offset,
          { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json().then(function (d) { return { status: res.status, body: d }; }); })
      .then(function (r) {
        REL.busy = false;
        relMore.disabled = false;

        if (!r.body || !r.body.ok) {
          relEmpty.hidden = false;
          relEmpty.textContent = r.status === 401
            ? '登录状态已失效，请重新登录。'
            : '列表载入失败，稍后重试。';
          return;
        }

        if (r.body.counts) {
          SOC.followers = r.body.counts.followers;
          SOC.following = r.body.counts.following;
          paintSocial();
        }

        var items = r.body.items || [];
        REL.total = r.body.total || 0;
        REL.offset += items.length;
        items.forEach(function (it) { relList.appendChild(relItem(it)); });

        if (!REL.offset) {
          relEmpty.hidden = false;
          relEmpty.textContent = emptyText(scope);
        }

        relMore.hidden = !(r.body.hasMore && REL.offset < REL.total);
      })
      .catch(function () {
        REL.busy = false;
        relMore.disabled = false;
        relEmpty.hidden = false;
        relEmpty.textContent = '网络连接失败，请稍后刷新。';
      });
  }

  function setupSocial(uid) {
    if (!sheet) return;
    REL.uid = uid;

    if (!socialBound) {
      socialBound = true;

      Array.prototype.forEach.call(document.querySelectorAll('.set-soc__i'), function (b) {
        b.addEventListener('click', function () {
          openSheet(b.getAttribute('data-scope'));
        });
      });

      $('sheetClose').addEventListener('click', closeSheet);

      var mask = sheet.querySelector('.sheet__mask');
      if (mask) mask.addEventListener('click', closeSheet);

      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') closeSheet();
      });

      Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (tab) {
        tab.addEventListener('click', function () {
          var scope = tab.getAttribute('data-scope');
          if (scope === REL.scope && REL.offset > 0) return;
          loadRel(scope, false);
        });
      });

      if (relMore) {
        relMore.addEventListener('click', function () { loadRel(REL.scope, true); });
      }

      relList.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('.rel__act') : null;
        if (!btn || btn.disabled) return;

        var target = Number(btn.getAttribute('data-uid'));
        var wasFollowing = btn.getAttribute('data-following') === '1';

        btn.disabled = true;

        fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: target, act: wasFollowing ? 'unfollow' : 'follow' })
        })
          .then(function (res) {
            return res.json().then(function (d) { return { ok: res.ok, body: d }; });
          })
          .then(function (r) {
            if (r.ok && r.body.ok) {
              btn.setAttribute('data-following', r.body.following ? '1' : '0');
              btn.textContent = r.body.following ? '取消关注' : '关注';
              SOC.followers = r.body.followers;
              SOC.following = r.body.followees;
              paintSocial();
              say(r.body.following ? '已关注该用户' : '已取消关注');
              return;
            }
            btn.disabled = false;
            var err = r.body && r.body.error;
            if (err === 'unauthorized') say('登录状态已失效，请刷新页面');
            else if (err === 'self') say('不能关注自己');
            else if (err === 'restricted') say('该账户当前状态不可关注');
            else if (err === 'too_many') say('关注人数已达上限');
            else say('操作失败，请重试');
          })
          .catch(function () {
            btn.disabled = false;
            say('网络连接失败，操作未生效');
          });
      });
    }

    fetch('/api/follow?scope=following&uid=' + encodeURIComponent(uid),
          { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.counts) return;
        SOC.followers = d.counts.followers;
        SOC.following = d.counts.following;
        paintSocial();
      })
      .catch(function () {});

    if (isLocal) {
      var m = location.search.match(/[?&]sheet=(following|followers)\b/);
      if (m) setTimeout(function () { openSheet(m[1]); }, 400);
    }
  }

  /* ---------- 03 安全：展开与提交 ---------- */

  function openEdit(which) {
    ['name', 'email', 'pw', 'verify'].forEach(function (k) {
      $('form' + k.charAt(0).toUpperCase() + k.slice(1)).hidden = k !== which;
    });
    /* 表单搬到三列下方整行显示，容器跟着展开 */
    var panel = $('secEdit');
    if (panel) panel.hidden = false;
    if (which === 'name') { $('newName').value = current ? current.username : ''; $('newName').focus(); }
    if (which === 'email') { $('newEmail').value = ''; $('emailPw').value = ''; $('newEmail').focus(); }
    if (which === 'verify') {
      $('vfCode').value = '';
      $('vfErr').hidden = true;
      $('vfOk').hidden = true;
      $('vfCode').focus();
    }
    if (which === 'pw') {
      $('oldPw').value = '';
      $('newPw').value = '';
      $('newPw2').value = '';
      $('pwCode').value = '';
      $('pwErr').hidden = true;
      $('pwOk').hidden = true;
      $('oldPw').focus();
    }
  }

  function closeAll() {
    ['name', 'email', 'pw', 'verify'].forEach(function (k) {
      var f = $('form' + k.charAt(0).toUpperCase() + k.slice(1));
      f.hidden = true;
      var err = f.querySelector('.edit__e');
      if (err) { err.hidden = true; err.textContent = ''; }
    });
    var panel = $('secEdit');
    if (panel) panel.hidden = true;
  }

  document.querySelectorAll('[data-edit]').forEach(function (btn) {
    btn.addEventListener('click', function () { openEdit(btn.getAttribute('data-edit')); });
  });

  document.querySelectorAll('[data-cancel]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeAll(); });
  });

  function showErr(id, text) {
    var el = $(id);
    el.textContent = text;
    el.hidden = false;
  }

  var NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_\-]{2,20}$/;

  $('formName').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var val = $('newName').value.trim();
    var err = $('nameErr');
    err.hidden = true;

    if (!NAME_RE.test(val)) {
      showErr('nameErr', '用户名需 2 至 20 个字符，可用中文、字母、数字、下划线或连字符。');
      $('newName').setAttribute('aria-invalid', 'true');
      return;
    }

    var btn = $('saveName');
    btn.disabled = true;
    btn.textContent = '保存中';

    fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: val })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, body: d }; }); })
      .then(function (r) {
        if (r.ok && r.body.ok) {
          var u = r.body.user || {};
          if (u.username) { current.username = u.username; render(current); }
          closeAll();
          say('用户名已更新');
        } else if (r.body && r.body.error === 'username_taken') {
          showErr('nameErr', '这个用户名已被占用，换一个。');
        } else if (r.body && r.body.error === 'invalid_username') {
          showErr('nameErr', '格式不符合要求，2 至 20 个字符，可用中文、字母、数字、下划线或连字符。');
        } else if (r.body && r.body.error === 'unauthorized') {
          showErr('nameErr', '登录状态已失效，请刷新页面。');
        } else {
          showErr('nameErr', '保存失败，请稍后重试。');
        }
      })
      .catch(function () { showErr('nameErr', '网络连接失败，未保存。'); })
      .then(function () {
        btn.disabled = false;
        btn.textContent = '保存';
      });
  });

  /* 邮箱：换绑要当前密码确认，换完视为未验证 */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  $('formEmail').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var email = $('newEmail').value.trim();
    var pw = $('emailPw').value;
    $('emailErr').hidden = true;

    if (!EMAIL_RE.test(email)) { showErr('emailErr', '邮箱格式不对，检查一下。'); return; }
    if (!pw) { showErr('emailErr', '请输入当前密码确认身份。'); return; }

    var btn = $('saveEmail');
    btn.disabled = true;
    btn.textContent = '保存中';

    fetch('/api/user/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pw })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, body: d }; }); })
      .then(function (r) {
        var code = r.body && r.body.error;
        if (r.ok && r.body.ok) {
          var u = r.body.user || {};
          if (u.email) { current.email = u.email; render(current); }
          $('emailPw').value = '';
          closeAll();
          say('邮箱已更新，新邮箱待验证');
          return;
        }
        if (code === 'wrong_password') showErr('emailErr', '当前密码不正确。');
        else if (code === 'email_taken') showErr('emailErr', '这个邮箱已被其他账号使用。');
        else if (code === 'same_email') showErr('emailErr', '这就是当前邮箱，不用改。');
        else if (code === 'invalid_email') showErr('emailErr', '邮箱格式不对，检查一下。');
        else if (code === 'account_locked') showErr('emailErr', '账户当前状态不能修改资料，先提交工单。');
        else if (code === 'unauthorized') showErr('emailErr', '登录状态已失效，请刷新页面。');
        else showErr('emailErr', '保存失败，请稍后重试。');
      })
      .catch(function () { showErr('emailErr', '网络连接失败，未保存。'); })
      .then(function () {
        btn.disabled = false;
        btn.textContent = '保存';
      });
  });

  /* ---------- 邮箱验证：发码 + 校验 ---------- */

  var vbtn = $('emailVerifyBtn');
  if (vbtn) {
    vbtn.addEventListener('click', function () { openEdit('verify'); });
  }

  var vfSend = $('vfSend');
  if (vfSend) {
    vfSend.addEventListener('click', function () {
      $('vfErr').hidden = true;
      $('vfOk').hidden = true;
      vfSend.disabled = true;
      vfSend.textContent = '发送中';

      fetch('/api/user/email/code', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
        .then(function (r) {
          var d = r.body || {};
          if (r.ok && d.ok) {
            $('vfOk').textContent = '验证码已发到 ' + (d.email || '你的邮箱') + '，10 分钟内有效。';
            $('vfOk').hidden = false;
            $('vfCode').focus();
            return;
          }
          if (d.error === 'too_soon') { $('vfErr').textContent = '刚发过，' + (d.wait || 60) + ' 秒后再发。'; $('vfErr').hidden = false; return; }
          if (d.error === 'too_many') { $('vfErr').textContent = d.message || '今天发太多了。'; $('vfErr').hidden = false; return; }
          if (d.error === 'already_verified') { $('vfErr').textContent = '这个邮箱已经验证过了。'; $('vfErr').hidden = false; return; }
          if (d.error === 'mail_unconfigured') {
            /* 站长还没配发信服务：本地调试时后端会把码带回来，直接填进去 */
            if (d.devCode) {
              $('vfCode').value = d.devCode;
              $('vfErr').textContent = '发信服务没配（本地调试模式），已把验证码填好。';
            } else {
              $('vfErr').textContent = '站长还没配发信服务，暂时发不出邮件。';
            }
            $('vfErr').hidden = false;
            return;
          }
          $('vfErr').textContent = d.message || '发送失败，稍后再试。';
          $('vfErr').hidden = false;
        })
        .catch(function () { $('vfErr').textContent = '网络连接失败。'; $('vfErr').hidden = false; })
        .then(function () {
          vfSend.disabled = false;
          vfSend.textContent = '发送验证码';
        });
    });
  }

  $('formVerify').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('vfErr').hidden = true;

    var code = $('vfCode').value.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) { $('vfErr').textContent = '验证码是 6 位数字。'; $('vfErr').hidden = false; return; }

    var btn = $('vfDone');
    btn.disabled = true;
    btn.textContent = '校验中';

    fetch('/api/user/email/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
      .then(function (r) {
        var d = r.body || {};
        if (r.ok && d.ok) {
          if (d.user) { current = d.user; render(current); }
          closeAll();
          say('邮箱已验证');
          return;
        }
        if (d.error === 'wrong_code') { $('vfErr').textContent = '验证码不对，还能试 ' + (d.left || 0) + ' 次。'; }
        else if (d.error === 'expired') { $('vfErr').textContent = d.message || '验证码过期了，重新发一条。'; }
        else if (d.error === 'too_many_tries') { $('vfErr').textContent = d.message || '试太多次了，重新发一条。'; }
        else if (d.error === 'no_code') { $('vfErr').textContent = d.message || '先发一条验证码。'; }
        else { $('vfErr').textContent = '验证失败，稍后再试。'; }
        $('vfErr').hidden = false;
      })
      .catch(function () { $('vfErr').textContent = '网络连接失败。'; $('vfErr').hidden = false; })
      .then(function () {
        btn.disabled = false;
        btn.textContent = '提交验证';
      });
  });

  /* 密码：旧密码 + 邮箱验证码双确认，改完其它设备下线 */

  var PW_ERR = EN ? {
    invalid_password: 'New password must be 8-72 characters.',
    weak_password: 'New password needs both letters and numbers.',
    wrong_password: 'Current password is wrong.',
    same_password: 'New password is the same as the old one.',
    password_required: 'Enter your current password.',
    bad_code: 'The code is 6 digits. Check the email.',
    no_code: 'No code yet. Tap Send code first.',
    wrong_code: 'Wrong code. Check the email.',
    expired: 'That code expired. Send a new one.',
    too_many_tries: 'Too many wrong codes. Send a new one.',
    too_soon: 'Just sent one. Please wait a moment.',
    too_many: 'That is 3 emails today. Try again tomorrow.',
    mail_unconfigured: 'Email sending is not configured yet.',
    mail_failed: 'The email did not go out. Try again later.',
    no_email: 'No email on this account. Please open a ticket.',
    account_locked: 'Account status blocks this change. Open a ticket first.',
    unauthorized: 'Session expired. Refresh the page.'
  } : {
    invalid_password: '新密码需 8 至 72 位。',
    weak_password: '新密码要同时包含字母和数字。',
    wrong_password: '当前密码不正确。',
    same_password: '新密码和当前密码一样，换一个。',
    password_required: '请输入当前密码。',
    bad_code: '验证码是 6 位数字，检查一下邮件。',
    no_code: '还没发验证码，先点「发送验证码」。',
    wrong_code: '验证码不对，检查一下邮件。',
    expired: '验证码过期了，重新发一条。',
    too_many_tries: '试太多次了，重新发一条。',
    too_soon: '刚发过一封，等一会儿再发。',
    too_many: '今天 3 封已经发完了，明天再来。',
    mail_unconfigured: '站长还没配发信服务，暂时发不出邮件。',
    mail_failed: '邮件没发出去，稍后再试。',
    no_email: '账户没绑邮箱，没法发验证码，先提交工单。',
    account_locked: '账户当前状态不能修改密码，先提交工单。',
    unauthorized: '登录状态已失效，请刷新页面。'
  };

  /* 发送验证码：一个账号一天 3 封，验证邮箱 / 找回密码 / 改密码共用这份额度 */
  var pwSend = $('pwSend');
  var pwTimer = null;

  var PW_SEND_IDLE = T('发送验证码', 'Send code');

  function pwCooldown(sec) {
    var left = Math.max(1, Number(sec) || 60);
    clearInterval(pwTimer);
    pwSend.disabled = true;
    pwSend.textContent = T(left + ' 秒后重发', 'Resend in ' + left + 's');
    pwTimer = setInterval(function () {
      left--;
      if (left <= 0) {
        clearInterval(pwTimer);
        pwSend.disabled = false;
        pwSend.textContent = T('重新发送', 'Resend code');
        return;
      }
      pwSend.textContent = T(left + ' 秒后重发', 'Resend in ' + left + 's');
    }, 1000);
  }

  if (pwSend) {
    pwSend.addEventListener('click', function () {
      $('pwErr').hidden = true;
      $('pwOk').hidden = true;
      pwSend.disabled = true;
      pwSend.textContent = T('发送中', 'Sending…');

      fetch('/api/user/password/code', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
        .then(function (r) {
          var d = r.body || {};
          if (r.ok && d.ok) {
            var remain = d.left === undefined ? 2 : d.left;
            $('pwOk').textContent = T(
              '验证码已发到 ' + (d.email || '注册邮箱') + '，10 分钟内有效。今天还剩 ' + remain + ' 次。',
              'Code sent to ' + (d.email || 'your email') + '. Valid 10 minutes. ' + remain + ' left today.');
            $('pwOk').hidden = false;
            pwCooldown(60);
            $('pwCode').focus();
            return;
          }
          if (d.error === 'too_soon') {
            showErr('pwErr', T('这个账号刚发过一封，' + (d.wait || 60) + ' 秒后再发。',
              'This account just got one. Wait ' + (d.wait || 60) + 's.'));
            pwCooldown(d.wait || 60);
            return;
          }
          if (d.error === 'too_many') {
            showErr('pwErr', T('今天 3 封已经发完了，明天再来。',
              'That is 3 emails today. Try again tomorrow.'));
            pwCooldown(3600);
            return;
          }
          if (d.error === 'mail_unconfigured' && d.devCode) {
            /* 本地没配发信服务时后端会把码带回来 */
            $('pwCode').value = d.devCode;
            showErr('pwErr', T('发信服务没配（本地调试模式），已把验证码填好。',
              'Mail is not configured (local debug). Code filled in for you.'));
            pwSend.disabled = false;
            pwSend.textContent = PW_SEND_IDLE;
            return;
          }
          showErr('pwErr', PW_ERR[d.error] || d.message || T('发送失败，稍后再试。', 'Sending failed. Try again.'));
          pwSend.disabled = false;
          pwSend.textContent = PW_SEND_IDLE;
        })
        .catch(function () {
          showErr('pwErr', T('网络连接失败。', 'Network error.'));
          pwSend.disabled = false;
          pwSend.textContent = PW_SEND_IDLE;
        });
    });
  }

  $('formPw').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var oldPw = $('oldPw').value;
    var a = $('newPw').value;
    var b = $('newPw2').value;
    var code = $('pwCode').value.replace(/\D/g, '').slice(0, 6);
    $('pwErr').hidden = true;

    if (!oldPw) { showErr('pwErr', T('请输入当前密码。', 'Enter your current password.')); return; }
    if (a.length < 8 || a.length > 72) { showErr('pwErr', T('新密码需 8 至 72 位。', 'New password must be 8-72 characters.')); return; }
    if (!/[a-zA-Z]/.test(a) || !/[0-9]/.test(a)) { showErr('pwErr', T('新密码要同时包含字母和数字。', 'New password needs both letters and numbers.')); return; }
    if (a !== b) { showErr('pwErr', T('两次输入的新密码不一致。', 'The two passwords do not match.')); return; }
    if (code.length !== 6) {
      showErr('pwErr', T('验证码是 6 位数字，检查一下邮件。', 'The code is 6 digits. Check the email.'));
      $('pwCode').focus();
      return;
    }

    var btn = $('savePw');
    btn.disabled = true;
    btn.textContent = T('保存中', 'Saving…');

    fetch('/api/user/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old: oldPw, new: a, code: code })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, body: d }; }); })
      .then(function (r) {
        if (r.ok && r.body.ok) {
          $('oldPw').value = '';
          $('newPw').value = '';
          $('newPw2').value = '';
          $('pwCode').value = '';
          $('pwOk').hidden = true;
          closeAll();
          say(T('密码已更新，其它设备已下线', 'Password updated. Other devices signed out.'));
          return;
        }
        var code = r.body && r.body.error;
        if (code === 'wrong_code' && r.body.left !== undefined) {
          showErr('pwErr', T('验证码不对，还能试 ' + r.body.left + ' 次。',
            'Wrong code. ' + r.body.left + ' attempts left.'));
        } else {
          showErr('pwErr', PW_ERR[code] || T('保存失败，请稍后重试。', 'Save failed. Try again.'));
        }
      })
      .catch(function () { showErr('pwErr', T('网络连接失败，未保存。', 'Network error. Nothing saved.')); })
      .then(function () {
        btn.disabled = false;
        btn.textContent = T('保存', 'Save');
      });
  });

  /* ---------- 账户概览右侧：查找用户 ---------- */

  var findForm = $('findForm');
  var findInput = $('findInput');
  var findBtn = findForm.querySelector('button[type="submit"]');
  var findLabel = findBtn.textContent;
  var finding = false;

  findForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (finding) return;

    var q = findInput.value.trim();
    if (!q) {
      say('请输入 UID 或用户名。');
      return;
    }

    finding = true;
    findBtn.disabled = true;
    findBtn.textContent = '查找中';

    fetch('/api/pub/user?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (d) { return { status: res.status, body: d }; });
      })
      .then(function (r) {
        var err = r.body && r.body.error;
        if (r.status === 200 && r.body.ok && r.body.user) {
          say('找到 UID ' + r.body.user.uid + '「' + r.body.user.username + '」，正在进入主页…');
          location.href = '/space?uid=' + r.body.user.uid;
        } else if (err === 'not_found') {
          say('没有这个 UID 或用户名，检查一下再试。');
        } else if (err === 'gone') {
          say('该账户已注销，主页不再公开。');
        } else {
          say('查找失败，请稍后重试。');
        }
      })
      .catch(function () {
        say('网络连接失败，请检查网络后重试。');
      })
      .then(function () {
        finding = false;
        findBtn.disabled = false;
        findBtn.textContent = findLabel;
      });
  });

  /* ---------- 本地预览 ---------- */

  var DEMO = {
    uid: 1,
    username: 'Chengfa',
    role: 'owner',
    status: 'active',
    fc: '128.4500',
    fcFrozen: '20.0000',
    affinity: 12,
    exp: 520,
    level: 3,
    done: 7,
    bio: '这里填写个人简介。',
    email: '574366992@qq.com',
    createdAt: '2026-11-16T08:00:46Z',
    lastLoginAt: '2026-11-16T09:30:00Z',
    ip: '203.0.113.24',
    net: 'CN · 浙江 · 电信'
  };

  /* 币种切换按钮由 config.js 全局绑定，无需此处处理 */

  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  if (isLocal && /[?&]preview\b/.test(location.search)) {
    render(DEMO);
    setupSocial(DEMO.uid);
    loading.hidden = true;
    app.hidden = false;
    return;
  }

  /* ---------- 启动：缓存秒显，后台校验 ---------- */

  function show(user) {
    render(user);
    setupSocial(user.uid);
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
      loadRedeems();
      loadBans();
      loadTickets();
    })
    .catch(function () {
      loading.hidden = true;
      if (!cached) say('网络连接失败，请检查网络后刷新。');
    });
})();
