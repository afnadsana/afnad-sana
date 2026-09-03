/* ============================================================
   portal.js — بوابة الجهات (قراءة فقط)
   منفصلة تماماً عن نظام الفواتير: لا تستدعي bootstrap_org ولا
   تقرأ أي جدول مالي للشركة. تعتمد على RLS في القاعدة:
   الجهة ترى صفها فقط ومستحقاتها وتقاريرها لا غير.
   ============================================================ */
(function () {
  'use strict';

  var F = window.Fmt;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var sb = null;
  var state = {
    client: null,      // بيانات الجهة
    dues: [],          // مستحقاتها
    reports: [],       // تقارير الأداء اليومية
    range: 'last30'    // today | last7 | last30 | thisMonth | all
  };

  function client() {
    if (sb) return sb;
    if (!window.SUPA_READY) throw new Error('لم تُضبط مفاتيح الاتصال');
    sb = window.supabase.createClient(window.SUPA_CONFIG.url, window.SUPA_CONFIG.anonKey);
    return sb;
  }

  function todayISO() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    var p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  function toast(msg, isErr) {
    var el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    $('#toastHost').appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0'; el.style.transition = 'opacity .25s';
      setTimeout(function () { el.remove(); }, 260);
    }, 2600);
  }

  /* ---------- المدى الزمني ---------- */
  function computeRange() {
    var t = todayISO();
    switch (state.range) {
      case 'today':     return { from: t, to: t };
      case 'last7':     return { from: addDays(t, -6), to: t };
      case 'last30':    return { from: addDays(t, -29), to: t };
      case 'thisMonth': return { from: t.slice(0, 8) + '01', to: t };
      case 'all':       return { from: null, to: null };
      default:          return { from: addDays(t, -29), to: t };
    }
  }
  function inRange(dateStr, r) {
    if (r.from && dateStr < r.from) return false;
    if (r.to && dateStr > r.to) return false;
    return true;
  }

  /* ---------- تحميل البيانات ---------- */
  async function loadAll() {
    var db = client();

    // RLS تضمن أن هذا يرجع صف الجهة فقط
    var cRes = await db.from('clients').select('*').limit(1);
    if (cRes.error) throw new Error(cRes.error.message);
    if (!cRes.data || !cRes.data.length) {
      throw new Error('لا توجد جهة مرتبطة بهذا الحساب. تواصل مع إدارة أفناد سنا.');
    }
    var c = cRes.data[0];
    state.client = {
      id: c.id, name: c.name, contractStatus: c.contract_status,
      contractStart: c.contract_start, contractEnd: c.contract_end,
      note: c.note || ''
    };

    var dRes = await db.from('client_dues').select('*').order('period', { ascending: false });
    state.dues = (dRes.data || []).map(function (x) {
      return {
        period: x.period, amountDue: num(x.amount_due), amountPaid: num(x.amount_paid),
        paidDate: x.paid_date, note: x.note || ''
      };
    });

    var rRes = await db.from('client_reports').select('*').order('report_date', { ascending: false });
    state.reports = (rRes.data || []).map(function (x) {
      return {
        date: x.report_date, spend: num(x.spend), revenue: num(x.revenue),
        reach: num(x.reach), leads: num(x.leads),
        achievements: x.achievements || '', note: x.note || ''
      };
    });
  }

  /* ---------- الواجهة ---------- */
  var STATUS = {
    active:  ['ساري', 'var(--green-bg)', 'var(--green)'],
    pending: ['قيد توقيع العقد', '#e8ecff', '#3b45c9'],
    paused:  ['موقوف مؤقتاً', 'var(--amber-bg)', 'var(--amber-ink)'],
    ended:   ['منتهي', 'var(--red-bg)', 'var(--red)']
  };

  function kpi(title, big, sub, ico) {
    var icons = {
      money: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      cart:  '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
      trend: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
      pct:   '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'
    };
    return '<div class="kpi kpi--' + ico + '">' +
      '<div class="kpi-head"><span class="t">' + title + '</span>' +
        '<span class="kpi-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round">' + icons[ico] + '</svg></span></div>' +
      '<div class="kpi-big num">' + big + '</div>' +
      '<div class="kpi-sub">' + sub + '</div></div>';
  }

  function render() {
    var c = state.client;
    var r = computeRange();
    var rows = state.reports.filter(function (x) { return inRange(x.date, r); });

    var spend = rows.reduce(function (a, x) { return a + x.spend; }, 0);
    var revenue = rows.reduce(function (a, x) { return a + x.revenue; }, 0);
    var reach = rows.reduce(function (a, x) { return a + x.reach; }, 0);
    var leads = rows.reduce(function (a, x) { return a + x.leads; }, 0);
    var roi = spend > 0 ? ((revenue - spend) / spend) * 100 : 0;

    var st = STATUS[c.contractStatus] || STATUS.active;

    var presets = [['today', 'اليوم'], ['last7', 'آخر 7 أيام'], ['last30', 'آخر 30 يوم'],
                   ['thisMonth', 'هذا الشهر'], ['all', 'كل الفترات']];
    var chips = presets.map(function (p) {
      return '<button class="chip' + (state.range === p[0] ? ' active' : '') +
             '" data-range="' + p[0] + '">' + p[1] + '</button>';
    }).join('');

    /* المنجزات — أحدث ما أُنجز */
    var achievements = rows.filter(function (x) { return x.achievements.trim(); });
    var achHTML = achievements.length
      ? '<ul class="ach-list">' + achievements.map(function (x) {
          return '<li><span class="ach-date num">' + F.arDate(x.date) + '</span>' +
                 '<span class="ach-txt">' + F.esc(x.achievements) + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="hint" style="padding:6px 2px">لا توجد منجزات مسجّلة في هذه الفترة.</p>';

    /* جدول الأداء اليومي */
    var tbl = rows.map(function (x) {
      var net = x.revenue - x.spend;
      return '<tr>' +
        '<td class="num">' + F.arDate(x.date) + '</td>' +
        '<td class="num">' + F.money(x.spend) + '</td>' +
        '<td class="num">' + F.money(x.revenue) + '</td>' +
        '<td class="num" style="font-weight:700;color:' +
          (net < 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(net) + '</td>' +
        '<td class="num">' + F.int(x.reach) + '</td>' +
        '<td class="num">' + F.int(x.leads) + '</td>' +
        '<td>' + (x.achievements ? F.esc(x.achievements) : '—') + '</td>' +
      '</tr>';
    }).join('');

    /* المستحقات — بيانات الجهة نفسها فقط */
    var totDue = state.dues.reduce(function (a, x) { return a + x.amountDue; }, 0);
    var totPaid = state.dues.reduce(function (a, x) { return a + x.amountPaid; }, 0);
    var rest = Math.round((totDue - totPaid) * 100) / 100;
    var dueRows = state.dues.map(function (d) {
      var left = Math.round((d.amountDue - d.amountPaid) * 100) / 100;
      var s = d.amountDue > 0 && d.amountPaid >= d.amountDue ? ['مسدَّد', 'var(--green-bg)', 'var(--green)']
            : d.amountPaid > 0 ? ['جزئي', 'var(--amber-bg)', 'var(--amber-ink)']
            : ['غير مسدَّد', 'var(--red-bg)', 'var(--red)'];
      return '<tr>' +
        '<td>' + F.arMonth(d.period.slice(0, 7)) + '</td>' +
        '<td class="num">' + F.money(d.amountDue) + '</td>' +
        '<td class="num">' + F.money(d.amountPaid) + '</td>' +
        '<td class="num" style="font-weight:700;color:' +
          (left > 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(left) + '</td>' +
        '<td><span class="tag" style="background:' + s[1] + ';color:' + s[2] + '">' + s[0] + '</span></td>' +
        '<td class="num">' + (d.paidDate ? F.arDate(d.paidDate) : '—') + '</td>' +
      '</tr>';
    }).join('');

    $('#pHost').innerHTML =
      '<div class="page-head"><div>' +
        '<h2>تقرير الأداء</h2>' +
        '<p>ملخص ما نُفِّذ لحملاتكم — ' + (rows.length ? rows.length + ' يوم في الفترة المختارة' : 'لا توجد بيانات في الفترة المختارة') + '</p>' +
      '</div>' +
      '<span class="tag" style="background:' + st[1] + ';color:' + st[2] + ';font-size:13px;padding:6px 14px">' +
        'العقد: ' + st[0] + '</span>' +
      '</div>' +

      '<div class="filterbar">' + chips + '</div>' +

      '<div class="grid grid-4 mb">' +
        kpi('ما أنفقناه', F.money(spend) + ' ر.س', 'إجمالي الصرف على حملاتكم', 'money') +
        kpi('العائد', F.money(revenue) + ' ر.س', 'إجمالي العائد المحقق', 'cart') +
        kpi('صافي الأثر', F.money(revenue - spend) + ' ر.س', 'العائد − الصرف · ' + F.pct(roi) , 'trend') +
        kpi('الوصول', F.int(reach), F.int(leads) + ' تفاعل', 'pct') +
      '</div>' +

      '<div class="grid grid-2 mb">' +
        '<div class="panel"><div class="panel-head"><h3>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M20 6 9 17l-5-5"/></svg>المنجزات</h3></div>' +
          '<div class="panel-body">' + achHTML + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-3"/></svg>' +
          'الصرف مقابل العائد</h3></div>' +
          '<div class="panel-body">' + chartHTML(rows) + '</div></div>' +
      '</div>' +

      '<div class="panel mb"><div class="panel-head"><h3>تفصيل الأداء اليومي</h3></div>' +
        '<div class="table-wrap"><table><thead><tr>' +
          '<th>التاريخ</th><th>أنفقنا</th><th>العائد</th><th>الصافي</th>' +
          '<th>الوصول</th><th>التفاعلات</th><th>المنجزات</th>' +
        '</tr></thead><tbody>' +
        (rows.length ? tbl : '<tr><td colspan="7">' +
          emptyBox('لا توجد تقارير في هذه الفترة', 'ستظهر هنا بمجرد تسجيل أول تقرير.') + '</td></tr>') +
        '</tbody></table></div></div>' +

      '<div class="panel"><div class="panel-head"><h3>مستحقاتكم</h3>' +
        '<span class="hint">الإجمالي ' + F.money(totDue) + ' · المسدَّد ' + F.money(totPaid) +
        ' · المتبقي ' + F.money(rest) + ' ر.س</span></div>' +
        '<div class="table-wrap"><table><thead><tr>' +
          '<th>الشهر</th><th>المستحق</th><th>المسدَّد</th><th>المتبقي</th><th>الحالة</th><th>تاريخ السداد</th>' +
        '</tr></thead><tbody>' +
        (state.dues.length ? dueRows : '<tr><td colspan="6">' +
          emptyBox('لا توجد مستحقات مسجّلة', '') + '</td></tr>') +
        '</tbody></table></div></div>';
  }

  function emptyBox(title, msg) {
    return '<div class="empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>' +
      '<h4>' + F.esc(title) + '</h4>' + (msg ? '<p>' + F.esc(msg) + '</p>' : '') + '</div>';
  }

  /* رسم بسيط: أعمدة الصرف مقابل العائد لكل يوم */
  function chartHTML(rows) {
    if (!rows.length) return window.Charts.empty('لا توجد بيانات في هذه الفترة');
    var list = rows.slice().reverse().slice(-14);
    var max = 0;
    list.forEach(function (x) { max = Math.max(max, x.spend, x.revenue); });
    if (max <= 0) max = 1;
    return '<div class="bars">' + list.map(function (x) {
      return '<div class="bar-row">' +
        '<div class="bar-top"><span class="bar-label num">' + F.arDate(x.date) + '</span>' +
          '<span class="bar-value num">' + F.sarShort(x.revenue) + ' / ' + F.sarShort(x.spend) + '</span></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' +
          Math.max((x.revenue / max) * 100, 1.5) + '%;background:var(--green)"></div></div>' +
        '<div class="bar-track" style="margin-top:4px"><div class="bar-fill" style="width:' +
          Math.max((x.spend / max) * 100, 1.5) + '%;background:var(--brand)"></div></div>' +
      '</div>';
    }).join('') + '</div>' +
    '<div class="legend"><span><i class="dot" style="background:var(--green)"></i>العائد</span>' +
    '<span><i class="dot" style="background:var(--brand)"></i>الصرف</span></div>';
  }

  /* ---------- الجلسة ---------- */
  function showAuth(msg, isErr) {
    $('#bootScreen').hidden = true;
    $('#portalRoot').hidden = true;
    $('#authScreen').hidden = false;
    if (msg) {
      var m = $('#authMsg');
      m.textContent = msg;
      m.className = 'auth-msg' + (isErr ? '' : ' ok');
      m.hidden = false;
    }
  }

  async function enter() {
    $('#authScreen').hidden = true;
    $('#bootScreen').hidden = false;
    $('#bootMsg').textContent = 'جارٍ تحميل تقاريرك…';
    try {
      await loadAll();
      $('#clientName').textContent = state.client.name;
      $('#bootScreen').hidden = true;
      $('#portalRoot').hidden = false;
      render();
    } catch (e) {
      await client().auth.signOut();
      showAuth(e.message || 'تعذّر تحميل البيانات', true);
    }
  }

  async function boot() {
    if (!window.SUPA_READY) { showAuth('لم تُضبط مفاتيح الاتصال', true); return; }
    try {
      var s = await client().auth.getSession();
      if (s.data && s.data.session) { await enter(); return; }
    } catch (e) {}
    showAuth();
  }

  /* ---------- الأحداث ---------- */
  $('#authForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('#pSubmit');
    btn.disabled = true; btn.textContent = 'جارٍ الدخول…';
    $('#authMsg').hidden = true;
    try {
      var r = await client().auth.signInWithPassword({
        email: $('#pEmail').value.trim(), password: $('#pPass').value
      });
      if (r.error) throw new Error('البريد أو كلمة المرور غير صحيحة');
      await enter();
    } catch (err) {
      showAuth(err.message, true);
    } finally {
      btn.disabled = false; btn.textContent = 'تسجيل الدخول';
    }
  });

  $('#pLogout').addEventListener('click', async function () {
    await client().auth.signOut();
    state.client = null;
    location.reload();
  });

  $('#themeBtn').addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('afnad-theme', dark ? 'light' : 'dark'); } catch (e) {}
    if (state.client) render();
  });

  $('#pHost').addEventListener('click', function (e) {
    var c = e.target.closest('[data-range]');
    if (c) { state.range = c.dataset.range; render(); }
  });

  boot();
})();
