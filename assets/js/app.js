/* ============================================================
   app.js — الموجّه والواجهات
   ============================================================ */
(function () {
  'use strict';

  var S = window.Store, F = window.Fmt, C = window.Charts;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- حالة الواجهة ---------- */
  var state = {
    view: 'dashboard',
    entityId: 'all',
    preset: 'thisMonth',
    from: null,
    to: null,
    month: null,        // شهر محدد YYYY-MM عند preset='month'
    year: null,         // سنة محددة YYYY عند preset='year'
    clientMonth: null,      // شهر لوحة متابعة العملاء (YYYY-MM-01)
    clientPayFilter: 'all', // تصفية حالة السداد في اللوحة الشهرية
    clientShowArchive: false,
    orgRange: 'last30',     // فترة صفحة الجمعيات
    invDir: 'all',      // تصفية الفواتير: الكل / وارد / صادر
    invStatus: 'all',   // تصفية الفواتير: الكل / مسدّدة / معلّقة
    taxYear: S.todayISO().slice(0, 4)
  };

  /* ---------- حساب الفترة ---------- */
  function computeRange() {
    var today = S.todayISO();
    var d = new Date(today + 'T00:00:00');
    var y = d.getFullYear(), m = d.getMonth();

    switch (state.preset) {
      case 'today':     return { from: today, to: today };
      case 'yesterday': return { from: S.addDays(today, -1), to: S.addDays(today, -1) };
      case 'last7':     return { from: S.addDays(today, -6), to: today };
      case 'last30':    return { from: S.addDays(today, -29), to: today };
      case 'thisMonth': return { from: S.iso(new Date(y, m, 1)), to: today };
      case 'prevMonth': return { from: S.iso(new Date(y, m - 1, 1)), to: S.iso(new Date(y, m, 0)) };
      case 'thisQuarter':
        var q0 = Math.floor(m / 3) * 3;
        return { from: S.iso(new Date(y, q0, 1)), to: S.iso(new Date(y, q0 + 3, 0)) };
      case 'thisYear':  return { from: y + '-01-01', to: y + '-12-31' };
      case 'prevYear':  return { from: (y - 1) + '-01-01', to: (y - 1) + '-12-31' };
      case 'all':       return { from: null, to: null };
      case 'month':
        if (state.month) {
          var pm = state.month.split('-'), my = +pm[0], mm = +pm[1] - 1;
          return { from: S.iso(new Date(my, mm, 1)), to: S.iso(new Date(my, mm + 1, 0)) };
        }
        return { from: S.iso(new Date(y, m, 1)), to: today };
      case 'year':
        if (state.year) return { from: state.year + '-01-01', to: state.year + '-12-31' };
        return { from: y + '-01-01', to: y + '-12-31' };
      case 'custom':    return { from: state.from, to: state.to };
      default:          return { from: S.iso(new Date(y, m, 1)), to: today };
    }
  }

  /* الفترة السابقة — تتحمّل الفترات المفتوحة (كل الفترات) */
  function prevRange(r) {
    if (!r.from || !r.to) return { from: null, to: null, days: 0, open: true };
    return S.previousRange(r.from, r.to);
  }

  /* ------------------------------------------------------------
     حقل تاريخ بأرقام إنجليزية
     كروم يرسم <input type="date"> بلغة واجهة المتصفح (عربي هنا)
     فتظهر الأرقام هندية ولا تنفع سمة lang. لذلك نعرض حقلاً نصياً
     بصيغة يوم/شهر/سنة بأرقام لاتينية، ونُبقي حقل تاريخ أصلياً
     مخفياً لفتح نافذة اختيار التاريخ عند الضغط على الأيقونة.
     ------------------------------------------------------------ */
  function toDisplayDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function fromDisplayDate(str) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((str || '').trim());
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3];
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return S.iso(dt);
  }
  function dateField(id, iso) {
    return '<span class="dpick">' +
      '<input type="text" id="' + id + '" class="dp-text" dir="ltr" inputmode="numeric" ' +
        'placeholder="dd/mm/yyyy" maxlength="10" value="' + toDisplayDate(iso) + '">' +
      '<input type="date" class="dp-native" id="' + id + '_n" value="' + (iso || '') + '" ' +
        'tabindex="-1" aria-hidden="true">' +
      '<button type="button" class="dp-btn" data-dp="' + id + '" aria-label="اختيار تاريخ">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>' +
      '</button>' +
    '</span>';
  }

  /* الأشهر والسنوات الموجودة فعلاً في البيانات */
  function dataPeriods() {
    var mo = {}, yr = {};
    function scan(list) {
      list.forEach(function (x) {
        if (!x.date) return;
        mo[x.date.slice(0, 7)] = 1;
        yr[x.date.slice(0, 4)] = 1;
      });
    }
    scan(S.db.invoices); scan(S.db.entries);
    return {
      months: Object.keys(mo).sort().reverse(),
      years: Object.keys(yr).sort().reverse()
    };
  }

  /* ---------- التنبيهات ---------- */
  function toast(msg, isErr) {
    var el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    $('#toastHost').appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s';
      setTimeout(function () { el.remove(); }, 260);
    }, 2600);
  }

  /* ---------- النافذة المنبثقة ---------- */
  var modalOnSave = null;
  function openModal(title, bodyHTML, footHTML, onSave) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHTML;
    $('#modalFoot').innerHTML = footHTML || '';
    $('#modalRoot').classList.add('open');
    $('#modalRoot').setAttribute('aria-hidden', 'false');
    modalOnSave = onSave || null;
    var first = $('#modalBody input, #modalBody select, #modalBody textarea');
    if (first) setTimeout(function () { first.focus(); }, 40);
  }
  function closeModal() {
    $('#modalRoot').classList.remove('open');
    $('#modalRoot').setAttribute('aria-hidden', 'true');
    modalOnSave = null;
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) closeModal();
    if (e.target.id === 'modalSave' && modalOnSave) modalOnSave();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  function confirmBox(msg, onYes) {
    openModal('تأكيد',
      '<p style="font-size:14px;line-height:1.8">' + F.esc(msg) + '</p>',
      '<button class="btn btn-danger" id="modalSave">نعم، تأكيد</button>' +
      '<button class="btn" data-close>إلغاء</button>',
      function () { closeModal(); onYes(); });
  }

  /* ============================================================
     شريط الفترات المشترك
     ============================================================ */
  function filterbarHTML() {
    var r = computeRange();
    var presets = [
      ['today', 'اليوم'], ['yesterday', 'أمس'], ['last7', 'آخر 7 أيام'], ['last30', 'آخر 30 يوم'],
      ['thisMonth', 'الشهر الحالي'], ['prevMonth', 'الشهر السابق'], ['thisQuarter', 'الربع الحالي'],
      ['thisYear', 'هذا العام'], ['prevYear', 'العام السابق'], ['all', 'كل الفترات']
    ];
    var P = dataPeriods();

    var monthSel = '<select id="jumpMonth" title="انتقل إلى شهر محدد">' +
      '<option value="">شهر محدد…</option>' +
      P.months.map(function (ym) {
        return '<option value="' + ym + '"' +
               (state.preset === 'month' && state.month === ym ? ' selected' : '') + '>' +
               F.arMonth(ym) + '</option>';
      }).join('') + '</select>';

    var yearSel = '<select id="jumpYear" title="انتقل إلى سنة كاملة">' +
      '<option value="">سنة كاملة…</option>' +
      P.years.map(function (y) {
        return '<option value="' + y + '"' +
               (state.preset === 'year' && state.year === y ? ' selected' : '') + '>' + y + '</option>';
      }).join('') + '</select>';

    var label = r.from && r.to
      ? F.arDate(r.from) + ' — ' + F.arDate(r.to)
      : 'كل السجل';

    return '<div class="filterbar">' +
      presets.map(function (p) {
        return '<button class="chip' + (state.preset === p[0] ? ' active' : '') +
               '" data-preset="' + p[0] + '">' + p[1] + '</button>';
      }).join('') +
      '<span class="spacer"></span>' +
      '<div class="date-range">' +
        '<span class="range-label num">' + label + '</span>' +
        monthSel + yearSel +
        dateField('fromDate', r.from) +
        '<span>إلى</span>' +
        dateField('toDate', r.to) +
        '<button class="btn btn-primary btn-sm" id="applyRange">تطبيق</button>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     لوحة الإدارة الرئيسية
     ============================================================ */
  function viewDashboard() {
    var r = computeRange();
    var cur = S.query(r.from, r.to, state.entityId);
    var pr = prevRange(r);
    var prev = pr.open ? [] : S.query(pr.from, pr.to, state.entityId);

    /* المحور اليومي يحتاج حدّين فعليين — نشتقّهما من البيانات في الفترات المفتوحة */
    var span = r;
    if (!r.from || !r.to) {
      var ds = cur.map(function (e) { return e.date; }).sort();
      span = ds.length
        ? { from: ds[0], to: ds[ds.length - 1] }
        : { from: S.todayISO(), to: S.todayISO() };
    }

    var T = S.totals(cur), TP = S.totals(prev);
    var chCur = S.byChannel(cur), chPrev = S.byChannel(prev);
    var prevMap = {};
    chPrev.forEach(function (c) { prevMap[c.channelId] = c; });

    /* --- بطاقات القنوات (أعلى 4 صرفاً) --- */
    var cards = chCur.slice(0, 4).map(function (c) {
      var p = prevMap[c.channelId] || { cost: 0, orders: 0, roas: 0, sales: 0, profit: 0 };
      var rows = [
        ['التكلفة', F.money(c.cost), F.delta(c.cost, p.cost), false],
        ['عدد الطلبات', F.int(c.orders), F.delta(c.orders, p.orders), false],
        ['ROAS', F.roas(c.roas), F.delta(c.roas, p.roas), false],
        ['الربح', F.money(c.profit) + ' ر.س', F.delta(c.profit, p.profit), c.profit < 0]
      ];
      return '<div class="ch-card">' +
        '<div class="ch-top">' +
          '<span class="ch-name">' +
            '<span class="ch-badge" style="background:' + c.channel.color + '">' +
              F.icon(c.channel.icon) + '</span>' + F.esc(c.channel.name) +
          '</span>' +
          '<button class="ch-open" data-drill="' + c.channelId + '" title="عرض تفاصيل القناة">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M15 18l-6-6 6-6"/></svg></button>' +
        '</div>' +
        '<div class="ch-rows">' +
          rows.map(function (x) {
            return '<div class="ch-row">' +
              '<span class="lbl">' + x[0] + '</span>' +
              '<span style="display:flex;align-items:center;gap:8px">' +
                '<span class="delta ' + x[2].dir + '">' +
                  (x[2].dir === 'up' ? '▲' : x[2].dir === 'down' ? '▼' : '—') + ' ' + F.pct(x[2].v) +
                '</span>' +
                '<span class="val' + (x[3] ? ' neg' : '') + ' num">' + x[1] + '</span>' +
              '</span></div>';
          }).join('') +
        '</div></div>';
    }).join('');

    var cardsBlock = chCur.length
      ? '<div class="grid grid-4 mb">' + cards + '</div>'
      : '';

    /* --- بطاقات المؤشرات --- */
    var kpis =
      '<div class="grid grid-4 mb">' +
        kpiCard('عدد الطلبات', F.int(T.orders), 'إجمالي الطلبات في الفترة', 'cart',
                F.delta(T.orders, TP.orders)) +
        kpiCard('متوسط تكلفة الطلب', F.money(T.cpo) + ' ر.س', 'الصرف ÷ عدد الطلبات', 'money',
                F.delta(T.cpo, TP.cpo), true) +
        kpiCard('ROAS', F.roas(T.roas), 'المبيعات ÷ الصرف التسويقي', 'pct',
                F.delta(T.roas, TP.roas)) +
        kpiCard('إجمالي الربح', F.money(T.profit) + ' ر.س', 'المبيعات − الصرف − تكلفة البضاعة', 'trend',
                F.delta(T.profit, TP.profit)) +
      '</div>';

    /* --- شريط الملخص --- */
    var summary =
      '<div class="summary">' +
        '<div class="summary-right">' +
          '<div class="summary-ico">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>' +
            '<path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>' +
          '</div>' +
          '<div><div class="pct-l">نسبة التسويق</div><div class="pct num">' + F.pct(T.mktRatio) + '</div></div>' +
        '</div>' +
        '<div class="summary-left">' +
          '<div><div class="k">الصرف التسويقي الكلي</div><div class="v num">' + F.sar(T.cost) + '</div></div>' +
          '<div><div class="k">إجمالي المبيعات</div><div class="v num">' + F.sar(T.sales) + '</div></div>' +
          '<div><div class="k">تكلفة البضاعة</div><div class="v num">' + F.sar(T.cogs) + '</div></div>' +
        '</div>' +
      '</div>';

    /* --- الرسوم --- */
    var charts =
      '<div class="grid grid-2 mb">' +
        '<div class="panel"><div class="panel-head"><h3>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-3"/></svg>' +
          'صرف التسويق حسب الجهة</h3></div>' +
          '<div class="panel-body">' + C.bars(chCur, { valueKey: 'cost', fmt: F.sar }) + '</div>' +
        '</div>' +
        '<div class="panel"><div class="panel-head"><h3>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>' +
          'الصرف والمبيعات عبر الفترة</h3></div>' +
          '<div class="panel-body">' + C.line(S.byDay(cur, span.from, span.to)) + '</div>' +
        '</div>' +
      '</div>';

    /* --- جدول تفصيلي (النسخة الجدولية المطلوبة للوصول) --- */
    var table =
      '<div class="panel"><div class="panel-head">' +
        '<h3>تفصيل الأداء حسب القناة</h3>' +
        '<button class="btn btn-sm" id="expCSV">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>' +
          'تصدير CSV</button>' +
      '</div><div class="table-wrap"><table><thead><tr>' +
        '<th>القناة</th><th>الصرف</th><th>الطلبات</th><th>تكلفة الطلب</th>' +
        '<th>المبيعات</th><th>ROAS</th><th>الربح</th><th>نسبة التسويق</th>' +
      '</tr></thead><tbody>' +
      (chCur.length ? chCur.map(function (c) {
        return '<tr>' +
          '<td><span class="tag"><i class="dot" style="background:' + c.channel.color + '"></i>' +
            F.esc(c.channel.name) + '</span></td>' +
          '<td class="num">' + F.money(c.cost) + '</td>' +
          '<td class="num">' + F.int(c.orders) + '</td>' +
          '<td class="num">' + F.money(c.cpo) + '</td>' +
          '<td class="num">' + F.money(c.sales) + '</td>' +
          '<td class="num">' + F.roas(c.roas) + '</td>' +
          '<td class="num" style="color:' + (c.profit < 0 ? 'var(--red)' : 'var(--green)') + ';font-weight:700">' +
            F.money(c.profit) + '</td>' +
          '<td class="num">' + F.pct(c.mktRatio) + '</td>' +
        '</tr>';
      }).join('') : '<tr><td colspan="8">' + C.empty('لا توجد بيانات في هذه الفترة') + '</td></tr>') +
      '</tbody>' +
      (chCur.length ? '<tfoot><tr>' +
        '<td>الإجمالي</td><td class="num">' + F.money(T.cost) + '</td>' +
        '<td class="num">' + F.int(T.orders) + '</td><td class="num">' + F.money(T.cpo) + '</td>' +
        '<td class="num">' + F.money(T.sales) + '</td><td class="num">' + F.roas(T.roas) + '</td>' +
        '<td class="num">' + F.money(T.profit) + '</td><td class="num">' + F.pct(T.mktRatio) + '</td>' +
      '</tr></tfoot>' : '') +
      '</table></div></div>';

    return '<div class="page-head"><div>' +
             '<h2>لوحة الإدارة الرئيسية</h2>' +
             '<p>' + (pr.open
               ? 'أهم المؤشرات لكامل السجل — لا توجد فترة سابقة للمقارنة'
               : 'أهم المؤشرات دون الدخول في التفاصيل — مقارنة بالفترة السابقة (' +
                 F.arDate(pr.from) + ' — ' + F.arDate(pr.to) + ')') + '</p>' +
           '</div>' +
           '<button class="btn btn-primary" data-add-entry>' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M12 5v14M5 12h14"/></svg>إدخال جديد</button>' +
           '</div>' +
           filterbarHTML() + cardsBlock + kpis + summary + charts + table;
  }

  function kpiCard(title, big, sub, ico, d, lowerIsBetter) {
    var icons = {
      cart:  '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
      money: '<text x="12" y="17.5" text-anchor="middle" font-size="12.5" font-weight="800" ' +
             'fill="currentColor" stroke="none">ر.س</text>',
      pct:   '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
      trend: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>'
    };
    var good = d.dir === 'flat' ? 'flat' : (lowerIsBetter ? (d.dir === 'down' ? 'up' : 'down') : d.dir);
    return '<div class="kpi kpi--' + ico + '">' +
      '<div class="kpi-head"><span class="t">' + title + '</span>' +
        '<span class="kpi-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round">' + icons[ico] + '</svg></span></div>' +
      '<div class="kpi-big num">' + big + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:6px">' +
        '<span class="delta ' + good + '">' +
          (d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '—') + ' ' + F.pct(d.v) + '</span>' +
        '<span class="kpi-sub">' + sub + '</span>' +
      '</div></div>';
  }

  /* ============================================================
     الإدخالات اليومية
     ============================================================ */
  function viewEntries() {
    var r = computeRange();
    var list = S.query(r.from, r.to, state.entityId)
                .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var T = S.totals(list);

    var rows = list.map(function (e) {
      var ch = S.channel(e.channelId);
      var profit = e.sales - e.cost - e.cogs;
      var ro = e.cost > 0 ? e.sales / e.cost : 0;
      return '<tr>' +
        '<td class="num">' + F.arDate(e.date) + '</td>' +
        '<td>' + F.esc(S.entityName(e.entityId)) + '</td>' +
        '<td><span class="tag"><i class="dot" style="background:' + ch.color + '"></i>' +
          F.esc(ch.name) + '</span></td>' +
        '<td class="num">' + F.money(e.cost) + '</td>' +
        '<td class="num">' + F.int(e.orders) + '</td>' +
        '<td class="num">' + F.money(e.sales) + '</td>' +
        '<td class="num">' + F.money(e.cogs) + '</td>' +
        '<td class="num" style="color:' + (profit < 0 ? 'var(--red)' : 'var(--green)') + ';font-weight:700">' +
          F.money(profit) + '</td>' +
        '<td class="num">' + F.roas(ro) + '</td>' +
        '<td>' + F.esc(e.note || '—') + '</td>' +
        '<td><div class="t-actions">' +
          '<button class="btn btn-sm" data-edit="' + e.id + '">تعديل</button>' +
          '<button class="btn btn-sm btn-danger" data-del="' + e.id + '">حذف</button>' +
        '</div></td></tr>';
    }).join('');

    return '<div class="page-head"><div>' +
             '<h2>الإدخالات اليومية والمتابعة</h2>' +
             '<p>تسجيل الصرف والمبيعات يوماً بيوم لكل قناة — ' + list.length + ' إدخال في الفترة</p>' +
           '</div><div style="display:flex;gap:8px">' +
             '<button class="btn" id="expCSV">تصدير CSV</button>' +
             '<button class="btn btn-primary" data-add-entry>' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
               '<path d="M12 5v14M5 12h14"/></svg>إدخال جديد</button>' +
           '</div></div>' +
           filterbarHTML() +
           '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
             '<th>التاريخ</th><th>المنشأة</th><th>القناة</th><th>الصرف</th><th>الطلبات</th>' +
             '<th>المبيعات</th><th>تكلفة البضاعة</th><th>الربح</th><th>ROAS</th>' +
             '<th>ملاحظات</th><th></th>' +
           '</tr></thead><tbody>' +
           (list.length ? rows :
             '<tr><td colspan="11">' + emptyState('لا توجد إدخالات',
               'ابدأ بتسجيل أول عملية صرف في هذه الفترة.') + '</td></tr>') +
           '</tbody>' +
           (list.length ? '<tfoot><tr>' +
             '<td colspan="3">الإجمالي</td>' +
             '<td class="num">' + F.money(T.cost) + '</td>' +
             '<td class="num">' + F.int(T.orders) + '</td>' +
             '<td class="num">' + F.money(T.sales) + '</td>' +
             '<td class="num">' + F.money(T.cogs) + '</td>' +
             '<td class="num">' + F.money(T.profit) + '</td>' +
             '<td class="num">' + F.roas(T.roas) + '</td>' +
             '<td colspan="2"></td></tr></tfoot>' : '') +
           '</table></div></div>';
  }

  function emptyState(title, msg) {
    return '<div class="empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>' +
      '<h4>' + F.esc(title) + '</h4><p>' + F.esc(msg) + '</p>' +
      '<button class="btn btn-primary" data-add-entry>إضافة إدخال</button></div>';
  }

  /* ============================================================
     نموذج الإدخال
     ============================================================ */
  function entryForm(existing) {
    var e = existing || {
      date: S.todayISO(),
      entityId: state.entityId !== 'all' ? state.entityId : S.db.entities[0].id,
      channelId: S.db.channels[0].id,
      cost: '', orders: '', sales: '', cogs: '', note: ''
    };

    var body =
      '<div class="form-grid">' +
        field('التاريخ', '<input type="date" lang="en-GB" id="f_date" value="' + e.date + '" required>') +
        field('المنشأة', sel('f_entity', S.db.entities.map(function (x) {
          return [x.id, x.name]; }), e.entityId)) +
        field('القناة', sel('f_channel', S.db.channels.map(function (x) {
          return [x.id, x.name]; }), e.channelId)) +
        field('الصرف التسويقي (ر.س)',
          '<input type="number" id="f_cost" min="0" step="0.01" value="' + e.cost + '" placeholder="0.00">',
          'المبلغ المصروف على الإعلان') +
        field('عدد الطلبات',
          '<input type="number" id="f_orders" min="0" step="1" value="' + e.orders + '" placeholder="0">') +
        field('المبيعات (ر.س)',
          '<input type="number" id="f_sales" min="0" step="0.01" value="' + e.sales + '" placeholder="0.00">',
          'إجمالي قيمة الطلبات') +
        field('تكلفة البضاعة (ر.س)',
          '<input type="number" id="f_cogs" min="0" step="0.01" value="' + e.cogs + '" placeholder="0.00">',
          'اختياري — يُستخدم لحساب صافي الربح') +
        '<div class="field full"><label>ملاحظات</label>' +
          '<textarea id="f_note" rows="2" placeholder="اختياري">' + F.esc(e.note || '') + '</textarea></div>' +
        '<div class="field full" id="f_preview" style="background:var(--bg);padding:12px;border-radius:10px"></div>' +
      '</div>';

    openModal(existing ? 'تعديل إدخال' : 'إدخال جديد', body,
      '<button class="btn btn-primary" id="modalSave">حفظ</button>' +
      '<button class="btn" data-close>إلغاء</button>',
      function () {
        var rec = {
          date: $('#f_date').value,
          entityId: $('#f_entity').value,
          channelId: $('#f_channel').value,
          cost: $('#f_cost').value,
          orders: $('#f_orders').value,
          sales: $('#f_sales').value,
          cogs: $('#f_cogs').value,
          note: $('#f_note').value
        };
        if (!rec.date) { toast('التاريخ مطلوب', true); return; }
        if (!rec.cost && !rec.sales) { toast('أدخل الصرف أو المبيعات على الأقل', true); return; }

        closeModal();
        if (existing) { run(function () { return S.updateEntry(existing.id, rec); }, 'تم تحديث الإدخال'); }
        else { run(function () { return S.addEntry(rec); }, 'تمت إضافة الإدخال'); }
      });

    // معاينة حية للمؤشرات المحسوبة
    function preview() {
      var cost = parseFloat($('#f_cost').value) || 0;
      var sales = parseFloat($('#f_sales').value) || 0;
      var cogs = parseFloat($('#f_cogs').value) || 0;
      var orders = parseFloat($('#f_orders').value) || 0;
      var p = sales - cost - cogs;
      $('#f_preview').innerHTML =
        '<div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px">' +
          '<span>ROAS: <strong class="num">' + F.roas(cost > 0 ? sales / cost : 0) + '</strong></span>' +
          '<span>تكلفة الطلب: <strong class="num">' +
            F.money(orders > 0 ? cost / orders : 0) + ' ر.س</strong></span>' +
          '<span>الربح: <strong class="num" style="color:' +
            (p < 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(p) + ' ر.س</strong></span>' +
          '<span>نسبة التسويق: <strong class="num">' +
            F.pct(sales > 0 ? (cost / sales) * 100 : 0) + '</strong></span>' +
        '</div>';
    }
    ['f_cost', 'f_sales', 'f_cogs', 'f_orders'].forEach(function (id) {
      $('#' + id).addEventListener('input', preview);
    });
    preview();
  }

  function field(label, input, hint) {
    return '<div class="field"><label>' + label + '</label>' + input +
           (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
  }
  function sel(id, opts, val) {
    return '<select id="' + id + '">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' +
             F.esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }

  /* ============================================================
     الفواتير والحسابات — دفتر الحساب البنكي
     ============================================================ */
  function viewInvoices() {
    var r = computeRange();
    var T = S.treasury(r.from, r.to, state.entityId);

    var list = S.queryInvoices(r.from, r.to, state.entityId, state.invDir, state.invStatus)
                .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

    /* --- الرقم البطل: الرصيد الحالي --- */
    var hero =
      '<div class="hero-balance">' +
        '<div class="hero-main">' +
          '<div class="hero-label">الرصيد الحالي في الحساب البنكي</div>' +
          '<div class="hero-num' + (T.balance < 0 ? ' neg' : '') + '">' + F.money(T.balance) + ' ر.س</div>' +
          '<div class="hero-sub">الرصيد الافتتاحي ' + F.money(T.opening) + ' + الوارد ' +
            F.money(T.paidIn) + ' − المنصرف ' + F.money(T.paidOut) + '</div>' +
        '</div>' +
        '<div class="hero-side">' +
          '<div class="hs-item"><span class="k">إجمالي ما دخل لي</span>' +
            '<span class="v in num">+ ' + F.money(T.paidIn) + ' ر.س</span></div>' +
          '<div class="hs-item"><span class="k">إجمالي ما صرفته</span>' +
            '<span class="v out num">− ' + F.money(T.paidOut) + ' ر.س</span></div>' +
          '<div class="hs-item"><span class="k">الرصيد الافتتاحي</span>' +
            '<span class="v num">' + F.money(T.opening) + ' ر.س</span></div>' +
        '</div>' +
      '</div>';

    /* --- المعلّق والمتوقع --- */
    var pending = (T.countPendingIn + T.countPendingOut) ?
      '<div class="pending-bar">' +
        '<div class="pb-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>' +
        '<div class="pb-txt"><strong>فواتير معلّقة</strong>' +
          '<span>' + T.countPendingIn + ' بانتظار التحصيل (' + F.money(T.pendingIn) + ' ر.س) · ' +
          T.countPendingOut + ' بانتظار السداد (' + F.money(T.pendingOut) + ' ر.س)</span></div>' +
        '<div class="pb-proj"><span class="k">الرصيد المتوقع بعد التسوية</span>' +
          '<span class="v num' + (T.projected < 0 ? ' neg' : '') + '">' +
            F.money(T.projected) + ' ر.س</span></div>' +
      '</div>' : '';

    /* --- شريط الوضع الضريبي (يظهر بعد التسجيل فقط) --- */
    var vatBar = '';
    if (S.db.settings.vatRegistrationDate) {
      var today = S.todayISO();
      var yr = today.slice(0, 4);
      var q = S.quarterOf(today);
      var qRange = S.vatByQuarter(yr, state.entityId)[q - 1];
      vatBar =
        '<div class="vat-bar">' +
          '<div class="vb-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg></div>' +
          '<div class="vb-txt"><strong>الربع الضريبي الحالي (' + yr + ' — الربع ' + q + ')</strong>' +
            '<span>مخرجات ' + F.money(qRange.outputVat) + ' ر.س · مدخلات ' + F.money(qRange.inputVat) +
            ' ر.س</span></div>' +
          '<div class="vb-net"><span class="k">' +
            (qRange.netVat >= 0 ? 'صافي مستحق' : 'صافي قابل للاسترداد') + '</span>' +
            '<span class="v num' + (qRange.netVat > 0 ? ' neg' : '') + '">' +
            F.money(Math.abs(qRange.netVat)) + ' ر.س</span></div>' +
          '<a class="btn btn-sm" href="#" data-goto-tax>التقرير الضريبي الكامل</a>' +
        '</div>';
    }

    /* --- حركة الفترة --- */
    var period =
      '<div class="grid grid-3 mb">' +
        kpiCard('وارد الفترة', F.money(T.periodIn) + ' ر.س', 'المحصّل خلال الفترة المختارة',
                'money', { v: 0, dir: 'flat' }) +
        kpiCard('منصرف الفترة', F.money(T.periodOut) + ' ر.س', 'المدفوع خلال الفترة المختارة',
                'cart', { v: 0, dir: 'flat' }) +
        kpiCard('صافي الفترة', F.money(T.periodNet) + ' ر.س', 'الوارد − المنصرف',
                'trend', { v: 0, dir: 'flat' }) +
      '</div>';

    /* --- المصروفات حسب التصنيف --- */
    var outList = S.queryInvoices(r.from, r.to, state.entityId, 'out', 'paid');
    var cats = S.invoicesByCategory(outList);
    var maxCat = cats.length ? cats[0].amount : 1;
    var catBars = cats.length ? '<div class="bars">' + cats.map(function (c) {
      return '<div class="bar-row">' +
          '<div class="bar-top"><span class="bar-label">' + F.esc(c.category) + '</span>' +
          '<span class="bar-value num">' + F.sarShort(c.amount) + '</span></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' +
            Math.max((c.amount / maxCat) * 100, 1.5) + '%;background:var(--brand)"></div></div>' +
        '</div>';
    }).join('') + '</div>' : C.empty('لا توجد مصروفات في هذه الفترة');

    /* --- مطابقة الصرف التسويقي --- */
    var mkt = S.totals(S.query(r.from, r.to, state.entityId)).cost;
    var mktInv = outList.filter(function (v) { return v.category === 'تسويق'; })
                        .reduce(function (a, v) { return a + v.amount; }, 0);
    var diff = mkt - mktInv;
    var recon =
      '<div class="panel"><div class="panel-head"><h3>مطابقة الصرف التسويقي</h3></div>' +
      '<div class="panel-body">' +
        '<div class="recon">' +
          '<div><span class="k">مسجّل في مسار التسويق</span>' +
            '<span class="v num">' + F.money(mkt) + ' ر.س</span></div>' +
          '<div><span class="k">فواتير بتصنيف «تسويق»</span>' +
            '<span class="v num">' + F.money(mktInv) + ' ر.س</span></div>' +
          '<div><span class="k">الفرق</span>' +
            '<span class="v num" style="color:' +
              (Math.abs(diff) < 1 ? 'var(--green)' : 'var(--amber)') + '">' +
              F.money(Math.abs(diff)) + ' ر.س</span></div>' +
        '</div>' +
        '<p class="hint" style="margin-top:12px">' +
          (Math.abs(diff) < 1
            ? 'الأرقام مطابقة — كل الصرف التسويقي مسجّل كفواتير.'
            : 'الصرف المسجّل في مسار التسويق لا يطابق فواتير التسويق. ' +
              'الرصيد البنكي يعتمد على الفواتير فقط، فأضف الفرق كفاتورة صادرة إن كان قد خرج فعلاً من الحساب.') +
        '</p>' +
      '</div></div>';

    /* --- الجدول --- */
    var rows = list.map(function (v) {
      var isIn = v.dir === 'in';
      return '<tr>' +
        '<td class="num">' + F.arDate(v.date) + '</td>' +
        '<td><span class="tag" style="background:' + (isIn ? 'var(--green-bg)' : 'var(--red-bg)') +
          ';color:' + (isIn ? 'var(--green)' : 'var(--red)') + '">' +
          (isIn ? '▼ وارد' : '▲ صادر') + '</span></td>' +
        '<td class="num">' + F.esc(v.invoiceNo || '—') + '</td>' +
        '<td>' + F.esc(v.party || '—') + '</td>' +
        '<td>' + F.esc(v.category) + '</td>' +
        '<td class="num" style="font-weight:800;color:' + (isIn ? 'var(--green)' : 'var(--red)') + '">' +
          (isIn ? '+ ' : '− ') + F.money(v.amount) + '</td>' +
        '<td class="num">' + (v.vatAmount > 0
          ? F.money(v.vatAmount) + '<span class="hint" style="display:block">' +
            F.pct(v.vatRate * 100, 0) + '</span>'
          : '<span style="color:var(--muted)">—</span>') + '</td>' +
        '<td>' + F.esc(v.method) + '</td>' +
        '<td><span class="tag" style="background:' +
          (v.status === 'paid' ? 'var(--green-bg)' : '#fff4e0') + ';color:' +
          (v.status === 'paid' ? 'var(--green)' : '#b06f00') + '">' +
          (v.status === 'paid' ? 'مسدّدة' : 'معلّقة') + '</span></td>' +
        '<td>' + F.esc(v.note || '—') + '</td>' +
        '<td><div class="t-actions">' +
          (v.status === 'unpaid'
            ? '<button class="btn btn-sm" data-inv-pay="' + v.id + '">تسديد</button>' : '') +
          '<button class="btn btn-sm" data-inv-edit="' + v.id + '">تعديل</button>' +
          '<button class="btn btn-sm btn-danger" data-inv-del="' + v.id + '">حذف</button>' +
        '</div></td></tr>';
    }).join('');

    var dirChips = [['all', 'الكل'], ['in', 'وارد'], ['out', 'صادر']].map(function (x) {
      return '<button class="chip' + (state.invDir === x[0] ? ' active' : '') +
             '" data-invdir="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    var stChips = [['all', 'كل الحالات'], ['paid', 'مسدّدة'], ['unpaid', 'معلّقة']].map(function (x) {
      return '<button class="chip' + (state.invStatus === x[0] ? ' active' : '') +
             '" data-invst="' + x[0] + '">' + x[1] + '</button>';
    }).join('');

    return '<div class="page-head"><div>' +
             '<h2>الفواتير والحسابات</h2>' +
             '<p>كل مبلغ داخل أو خارج — والرصيد المتبقي في حسابك البنكي</p>' +
           '</div><div style="display:flex;gap:8px;flex-wrap:wrap">' +
             '<button class="btn" id="openingBtn">الرصيد الافتتاحي</button>' +
             '<button class="btn" id="expInvCSV">تصدير CSV</button>' +
             '<button class="btn btn-primary" data-add-inv>' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
               '<path d="M12 5v14M5 12h14"/></svg>فاتورة جديدة</button>' +
           '</div></div>' +
           hero + pending + vatBar +
           filterbarHTML() +
           period +
           '<div class="grid grid-2 mb">' +
             '<div class="panel"><div class="panel-head"><h3>المصروفات حسب التصنيف</h3></div>' +
               '<div class="panel-body">' + catBars + '</div></div>' +
             recon +
           '</div>' +
           '<div class="panel"><div class="panel-head">' +
             '<h3>سجل الفواتير (' + list.length + ')</h3>' +
             '<div style="display:flex;gap:6px;flex-wrap:wrap">' + dirChips + stChips + '</div>' +
           '</div><div class="table-wrap"><table><thead><tr>' +
             '<th>التاريخ</th><th>النوع</th><th>رقم الفاتورة</th><th>الجهة</th><th>التصنيف</th>' +
             '<th>المبلغ</th><th>الضريبة</th><th>طريقة الدفع</th><th>الحالة</th><th>ملاحظات</th><th></th>' +
           '</tr></thead><tbody>' +
           (list.length ? rows :
             '<tr><td colspan="11"><div class="empty">' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
               '<path d="M4 2v20l2.5-2 2.5 2 2.5-2 2.5 2 2.5-2 2.5 2V2l-2.5 2L14 2l-2.5 2L9 2 6.5 4z"/></svg>' +
               '<h4>لا توجد فواتير</h4><p>سجّل أول مبلغ وارد أو صادر.</p>' +
               '<button class="btn btn-primary" data-add-inv>إضافة فاتورة</button></div></td></tr>') +
           '</tbody></table></div></div>';
  }

  /* --- نموذج الفاتورة --- */
  function invoiceForm(existing) {
    var v = existing || {
      date: S.todayISO(), dir: 'out', amount: '', party: '', invoiceNo: '',
      category: 'أخرى', method: S.METHODS[0], status: 'paid',
      entityId: state.entityId !== 'all' ? state.entityId : S.db.entities[0].id, note: '',
      vatRate: S.db.settings.defaultVatRate, vatAmount: 0
    };
    var taxableDefault = existing ? v.vatAmount > 0 : S.isVatRegisteredOn(v.date);
    var rateDefault = (v.vatRate || S.db.settings.defaultVatRate || 0.15) * 100;

    function catOptions(dir, cur) {
      var arr = dir === 'in' ? S.CAT_IN : S.CAT_OUT;
      return arr.map(function (c) {
        return '<option value="' + F.esc(c) + '"' + (c === cur ? ' selected' : '') + '>' +
               F.esc(c) + '</option>';
      }).join('');
    }

    var body =
      '<div class="form-grid">' +
        '<div class="field full"><label>نوع الحركة</label>' +
          '<div class="seg">' +
            '<label class="seg-opt' + (v.dir === 'out' ? ' on out' : '') + '">' +
              '<input type="radio" name="invdir" value="out"' +
                (v.dir === 'out' ? ' checked' : '') + '><span>▲ صادر — مبلغ خرج مني</span></label>' +
            '<label class="seg-opt' + (v.dir === 'in' ? ' on in' : '') + '">' +
              '<input type="radio" name="invdir" value="in"' +
                (v.dir === 'in' ? ' checked' : '') + '><span>▼ وارد — مبلغ دخل لي</span></label>' +
          '</div></div>' +
        field('التاريخ', '<input type="date" lang="en-GB" id="v_date" value="' + v.date + '">') +
        field('المبلغ (ر.س)',
          '<input type="number" id="v_amount" min="0" step="0.01" value="' + v.amount + '" placeholder="0.00">') +
        field('الجهة (المورد / العميل)',
          '<input id="v_party" value="' + F.esc(v.party) + '" placeholder="مثال: مؤسسة الإمداد">') +
        field('رقم الفاتورة',
          '<input id="v_no" value="' + F.esc(v.invoiceNo) + '" placeholder="اختياري">') +
        '<div class="field"><label>التصنيف</label>' +
          '<select id="v_cat">' + catOptions(v.dir, v.category) + '</select></div>' +
        field('طريقة الدفع', sel('v_method', S.METHODS.map(function (m) {
          return [m, m]; }), v.method)) +
        field('المنشأة', sel('v_entity', S.db.entities.map(function (x) {
          return [x.id, x.name]; }), v.entityId)) +
        '<div class="field"><label>الحالة</label>' +
          '<select id="v_status">' +
            '<option value="paid"' + (v.status === 'paid' ? ' selected' : '') + '>مسدّدة — أثّرت على الرصيد</option>' +
            '<option value="unpaid"' + (v.status === 'unpaid' ? ' selected' : '') + '>معلّقة — لم تؤثر بعد</option>' +
          '</select></div>' +
        '<div class="field full"><label>ملاحظات</label>' +
          '<textarea id="v_note" rows="2" placeholder="اختياري">' + F.esc(v.note) + '</textarea></div>' +
        '<div class="field full"><label>ضريبة القيمة المضافة</label>' +
          '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer">' +
              '<input type="checkbox" id="v_taxable"' + (taxableDefault ? ' checked' : '') + '>' +
              'فاتورة خاضعة للضريبة</label>' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted)">النسبة' +
              '<input type="number" id="v_vatrate" min="0" max="100" step="0.1" value="' +
              rateDefault.toFixed(1) + '" style="width:78px" ' + (!taxableDefault ? 'disabled' : '') + '>%</label>' +
          '</div>' +
          '<span class="hint">المبلغ أعلاه شامل الضريبة — يُحسب المبلغ قبل الضريبة تلقائياً</span>' +
        '</div>' +
        '<div class="field full" id="v_preview" style="background:var(--bg);padding:12px;border-radius:10px"></div>' +
      '</div>';

    openModal(existing ? 'تعديل فاتورة' : 'فاتورة جديدة', body,
      '<button class="btn btn-primary" id="modalSave">حفظ</button>' +
      '<button class="btn" data-close>إلغاء</button>',
      function () {
        var taxable = $('#v_taxable').checked;
        var rate = taxable ? (parseFloat($('#v_vatrate').value) || 0) / 100 : 0;
        var amount = parseFloat($('#v_amount').value) || 0;
        var rec = {
          date: $('#v_date').value,
          dir: ($('input[name=invdir]:checked') || {}).value || 'out',
          amount: $('#v_amount').value,
          party: $('#v_party').value,
          invoiceNo: $('#v_no').value,
          category: $('#v_cat').value,
          method: $('#v_method').value,
          entityId: $('#v_entity').value,
          status: $('#v_status').value,
          note: $('#v_note').value,
          vatRate: rate,
          vatAmount: taxable ? S.vatFromInclusive(amount, rate) : 0
        };
        if (!rec.date) { toast('التاريخ مطلوب', true); return; }
        if (!(parseFloat(rec.amount) > 0)) { toast('أدخل مبلغاً أكبر من صفر', true); return; }

        closeModal();
        if (existing) { run(function () { return S.updateInvoice(existing.id, rec); }, 'تم تحديث الفاتورة'); }
        else { run(function () { return S.addInvoice(rec); }, 'تمت إضافة الفاتورة'); }
      });

    // تحديث التصنيفات والمعاينة عند تغيير النوع
    var userTouchedTaxable = false;
    function refresh(e) {
      var dir = ($('input[name=invdir]:checked') || {}).value || 'out';
      var cur = $('#v_cat').value;
      $('#v_cat').innerHTML = catOptions(dir, cur);
      $$('.seg-opt', $('#modalBody')).forEach(function (l) {
        var on = l.querySelector('input').checked;
        l.className = 'seg-opt' + (on ? ' on ' + l.querySelector('input').value : '');
      });

      // عند تغيير التاريخ (لفاتورة جديدة فقط) نحدّث افتراضياً حسب تاريخ التسجيل الضريبي
      if (!existing && e && e.target && e.target.id === 'v_date' && !userTouchedTaxable) {
        $('#v_taxable').checked = S.isVatRegisteredOn($('#v_date').value);
      }
      if (e && e.target && e.target.id === 'v_taxable') userTouchedTaxable = true;

      var taxable = $('#v_taxable').checked;
      $('#v_vatrate').disabled = !taxable;

      var amt = parseFloat($('#v_amount').value) || 0;
      var rate = (parseFloat($('#v_vatrate').value) || 0) / 100;
      var vat = taxable ? S.vatFromInclusive(amt, rate) : 0;
      var pretax = amt - vat;

      var st = $('#v_status').value;
      var cur2 = S.treasury(null, null, 'all').balance;
      var eff = existing
        ? cur2 // عند التعديل يصعب عرض الأثر بدقة قبل الحفظ
        : (st === 'paid' ? cur2 + (dir === 'in' ? amt : -amt) : cur2);
      $('#v_preview').innerHTML =
        '<div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px">' +
          '<span>الرصيد الحالي: <strong class="num">' + F.money(cur2) + ' ر.س</strong></span>' +
          (existing ? '' :
            '<span>الرصيد بعد الحفظ: <strong class="num" style="color:' +
            (eff < 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(eff) + ' ر.س</strong></span>') +
          (taxable ? '<span>قبل الضريبة: <strong class="num">' + F.money(pretax) + ' ر.س</strong></span>' +
            '<span>الضريبة: <strong class="num">' + F.money(vat) + ' ر.س</strong></span>' : '') +
          (st === 'unpaid' ? '<span style="color:var(--amber)">فاتورة معلّقة — لن تؤثر على الرصيد حتى تُسدَّد</span>' : '') +
        '</div>';
    }
    $('#modalBody').onchange = refresh;
    $('#v_amount').addEventListener('input', refresh);
    $('#v_vatrate').addEventListener('input', refresh);
    refresh();
  }

  /* ============================================================
     التقرير الشهري
     ============================================================ */
  function viewMonthly() {
    var all = S.query(null, null, state.entityId);
    var months = S.byMonth(all).reverse();

    var rows = months.map(function (m, i) {
      var p = months[i + 1];
      var d = F.delta(m.profit, p ? p.profit : 0);
      return '<tr>' +
        '<td>' + F.arMonth(m.month) + '</td>' +
        '<td class="num">' + F.money(m.cost) + '</td>' +
        '<td class="num">' + F.int(m.orders) + '</td>' +
        '<td class="num">' + F.money(m.sales) + '</td>' +
        '<td class="num">' + F.roas(m.roas) + '</td>' +
        '<td class="num">' + F.pct(m.mktRatio) + '</td>' +
        '<td class="num" style="color:' + (m.profit < 0 ? 'var(--red)' : 'var(--green)') + ';font-weight:700">' +
          F.money(m.profit) + '</td>' +
        '<td><span class="delta ' + d.dir + '">' +
          (d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '—') + ' ' + F.pct(d.v) + '</span></td>' +
      '</tr>';
    }).join('');

    var ent = S.byEntity(all);
    var entRows = ent.map(function (x) {
      return '<tr><td>' + F.esc(x.entityName) + '</td>' +
        '<td class="num">' + F.money(x.cost) + '</td>' +
        '<td class="num">' + F.money(x.sales) + '</td>' +
        '<td class="num">' + F.roas(x.roas) + '</td>' +
        '<td class="num">' + F.pct(x.mktRatio) + '</td>' +
        '<td class="num" style="font-weight:700">' + F.money(x.profit) + '</td></tr>';
    }).join('');

    return '<div class="page-head"><div>' +
             '<h2>التقرير الشهري</h2><p>ملخص الأداء شهراً بشهر لكامل السجل</p>' +
           '</div>' +
           '<button class="btn no-print" onclick="window.print()">' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>' +
             '<rect x="6" y="14" width="12" height="8"/></svg>طباعة</button></div>' +
           '<div class="panel mb"><div class="panel-head"><h3>الأداء الشهري</h3></div>' +
             '<div class="table-wrap"><table><thead><tr>' +
             '<th>الشهر</th><th>الصرف</th><th>الطلبات</th><th>المبيعات</th>' +
             '<th>ROAS</th><th>نسبة التسويق</th><th>الربح</th><th>مقارنة بالسابق</th>' +
             '</tr></thead><tbody>' +
             (months.length ? rows : '<tr><td colspan="8">' + C.empty('لا توجد بيانات بعد') + '</td></tr>') +
             '</tbody></table></div></div>' +
           '<div class="panel"><div class="panel-head"><h3>الأداء حسب المنشأة</h3></div>' +
             '<div class="table-wrap"><table><thead><tr>' +
             '<th>المنشأة</th><th>الصرف</th><th>المبيعات</th><th>ROAS</th>' +
             '<th>نسبة التسويق</th><th>الربح</th>' +
             '</tr></thead><tbody>' +
             (ent.length ? entRows : '<tr><td colspan="6">' + C.empty('لا توجد بيانات بعد') + '</td></tr>') +
             '</tbody></table></div></div>';
  }

  /* ============================================================
     القنوات
     ============================================================ */
  function viewChannels() {
    var all = S.query(null, null, 'all');
    var used = {};
    all.forEach(function (e) { used[e.channelId] = (used[e.channelId] || 0) + 1; });

    var rows = S.db.channels.map(function (c) {
      return '<tr>' +
        '<td><span class="tag"><i class="dot" style="background:' + c.color + '"></i>' +
          F.esc(c.name) + '</span></td>' +
        '<td><span class="num" style="font-family:monospace">' + c.color + '</span></td>' +
        '<td class="num">' + F.int(used[c.id] || 0) + '</td>' +
        '<td><div class="t-actions">' +
          '<button class="btn btn-sm" data-ch-edit="' + c.id + '">تعديل</button>' +
          '<button class="btn btn-sm btn-danger" data-ch-del="' + c.id + '">حذف</button>' +
        '</div></td></tr>';
    }).join('');

    return '<div class="page-head"><div>' +
             '<h2>القنوات والمنصات</h2>' +
             '<p>قنوات الصرف التسويقي — الألوان مأخوذة من لوحة مُتحقَّق منها لإمكانية الوصول</p>' +
           '</div><button class="btn btn-primary" id="addCh">' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M12 5v14M5 12h14"/></svg>قناة جديدة</button></div>' +
           '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
             '<th>القناة</th><th>اللون</th><th>عدد الإدخالات</th><th></th>' +
           '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function channelForm(existing) {
    var c = existing || { name: '', color: S.PALETTE[0], icon: 'dot' };
    var swatches = S.PALETTE.map(function (hex, i) {
      return '<label style="cursor:pointer">' +
        '<input type="radio" name="chcolor" value="' + hex + '"' +
          (hex === c.color ? ' checked' : '') + ' style="display:none">' +
        '<span class="sw" data-hex="' + hex + '" style="display:block;width:34px;height:34px;' +
          'border-radius:9px;background:' + hex + ';border:3px solid ' +
          (hex === c.color ? '#1f2135' : 'transparent') + '"></span></label>';
    }).join('');

    var icons = ['send', 'users', 'chat', 'music', 'ghost', 'camera', 'search', 'dot'];
    var iconOpts = icons.map(function (n) {
      return '<label style="cursor:pointer">' +
        '<input type="radio" name="chicon" value="' + n + '"' +
          (n === c.icon ? ' checked' : '') + ' style="display:none">' +
        '<span class="ic" data-ic="' + n + '" style="display:grid;place-items:center;width:34px;height:34px;' +
          'border-radius:9px;background:#fff;border:2px solid ' +
          (n === c.icon ? 'var(--brand)' : 'var(--line)') + '">' + F.icon(n) + '</span></label>';
    }).join('');

    openModal(existing ? 'تعديل قناة' : 'قناة جديدة',
      '<div class="form-grid">' +
        '<div class="field full"><label>اسم القناة</label>' +
          '<input id="ch_name" value="' + F.esc(c.name) + '" placeholder="مثال: سناب شات"></div>' +
        '<div class="field full"><label>اللون</label>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' + swatches + '</div>' +
          '<span class="hint">ألوان مختارة ومُختبَرة للتمييز البصري وعمى الألوان</span></div>' +
        '<div class="field full"><label>الأيقونة</label>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' + iconOpts + '</div></div>' +
      '</div>',
      '<button class="btn btn-primary" id="modalSave">حفظ</button>' +
      '<button class="btn" data-close>إلغاء</button>',
      function () {
        var name = $('#ch_name').value.trim();
        if (!name) { toast('اسم القناة مطلوب', true); return; }
        var color = ($('input[name=chcolor]:checked') || {}).value || S.PALETTE[0];
        var ic = ($('input[name=chicon]:checked') || {}).value || 'dot';
        closeModal();
        if (existing) {
          run(function () { return S.updateChannel(existing.id, { name: name, color: color, icon: ic }); }, 'تم التحديث');
        } else {
          run(function () { return S.addChannel(name, color, ic); }, 'تمت الإضافة');
        }
      });

    $('#modalBody').onchange = function (ev) {
      if (ev.target.name === 'chcolor') {
        $$('.sw', $('#modalBody')).forEach(function (s) {
          s.style.borderColor = s.dataset.hex === ev.target.value ? '#1f2135' : 'transparent';
        });
      }
      if (ev.target.name === 'chicon') {
        $$('.ic', $('#modalBody')).forEach(function (s) {
          s.style.borderColor = s.dataset.ic === ev.target.value ? 'var(--brand)' : 'var(--line)';
        });
      }
    };
  }

  /* ============================================================
     المنشآت
     ============================================================ */
  function viewEntities() {
    var all = S.query(null, null, 'all');
    var used = {};
    all.forEach(function (e) { used[e.entityId] = (used[e.entityId] || 0) + 1; });

    var rows = S.db.entities.map(function (x) {
      return '<tr><td style="font-weight:600">' + F.esc(x.name) + '</td>' +
        '<td class="num">' + F.int(used[x.id] || 0) + '</td>' +
        '<td><div class="t-actions">' +
          '<button class="btn btn-sm" data-ent-edit="' + x.id + '">تعديل</button>' +
          '<button class="btn btn-sm btn-danger" data-ent-del="' + x.id + '">حذف</button>' +
        '</div></td></tr>';
    }).join('');

    return '<div class="page-head"><div><h2>المنشآت</h2>' +
             '<p>الجهات أو الفروع التي تُسجَّل مصروفاتها في النظام</p></div>' +
           '<button class="btn btn-primary" id="addEnt">' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M12 5v14M5 12h14"/></svg>منشأة جديدة</button></div>' +
           '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
             '<th>المنشأة</th><th>عدد الإدخالات</th><th></th>' +
           '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ============================================================
     سجل التعديلات
     ============================================================ */
  function viewLog() {
    var rows = S.db.log.map(function (l) {
      var d = new Date(l.ts);
      var colors = { 'إضافة': 'var(--green)', 'تعديل': 'var(--amber)', 'حذف': 'var(--red)' };
      return '<tr>' +
        '<td class="num">' + F.arDate(S.iso(d)) + ' — ' +
          String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '</td>' +
        '<td><span class="tag" style="background:var(--bg)">' +
          '<i class="dot" style="background:' + (colors[l.action] || 'var(--muted)') + '"></i>' +
          F.esc(l.action) + '</span></td>' +
        '<td>' + F.esc(l.detail) + '</td>' +
        '<td>' + F.esc(l.user) + '</td></tr>';
    }).join('');

    return '<div class="page-head"><div><h2>سجل التعديلات</h2>' +
             '<p>كل إضافة أو تعديل أو حذف يُسجَّل هنا (آخر 300 عملية)</p></div></div>' +
           '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
             '<th>التاريخ والوقت</th><th>العملية</th><th>التفاصيل</th><th>المستخدم</th>' +
           '</tr></thead><tbody>' +
           (S.db.log.length ? rows : '<tr><td colspan="4">' + C.empty('السجل فارغ') + '</td></tr>') +
           '</tbody></table></div></div>';
  }

  /* ============================================================
     الفريق والصلاحيات
     ============================================================ */
  function viewTeam() {
    var canManage = ['owner', 'admin'].indexOf(S.me.role) >= 0;

    var rows = S.db.members.map(function (m) {
      return '<tr>' +
        '<td>' + (m.isMe ? '<strong>أنت</strong>' : '<span class="num" style="font-family:monospace;font-size:12px">' +
          F.esc(m.userId.slice(0, 8)) + '…</span>') + '</td>' +
        '<td><span class="tag" style="background:var(--brand-50);color:var(--brand)">' +
          F.esc(S.roleName(m.role)) + '</span></td>' +
        '<td>' + (canManage && !m.isMe
          ? '<button class="btn btn-sm btn-danger" data-mem-del="' + m.userId + '">إزالة</button>'
          : '<span style="color:var(--muted)">—</span>') + '</td></tr>';
    }).join('');

    var link = window.location.origin + window.location.pathname;

    return '<div class="page-head"><div>' +
             '<h2>الفريق والصلاحيات</h2>' +
             '<p>منشأة «' + F.esc(S.db.orgName) + '» — ' + S.db.members.length + ' عضو</p>' +
           '</div>' +
           (canManage ? '<button class="btn btn-primary" id="inviteBtn">' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M12 5v14M5 12h14"/></svg>دعوة عضو</button>' : '') +
           '</div>' +
           '<div class="panel mb"><div class="panel-head"><h3>رابط النظام</h3></div>' +
             '<div class="panel-body">' +
               '<p style="color:var(--muted);margin-bottom:12px">شارك هذا الرابط مع فريقك. ' +
                 'كل واحد ينشئ حسابه، وبعد ما تدعوه يشوف بيانات المنشأة ويقدر يدخّل.</p>' +
               '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
                 '<input readonly id="shareLink" value="' + F.esc(link) +
                   '" dir="ltr" style="flex:1;min-width:240px;border:1px solid var(--line);' +
                   'border-radius:10px;padding:10px 12px;background:var(--bg);font-size:13px">' +
                 '<button class="btn" id="copyLink">نسخ الرابط</button>' +
               '</div></div></div>' +
           '<div class="panel mb"><div class="panel-head"><h3>الأعضاء</h3></div>' +
             '<div class="table-wrap"><table><thead><tr>' +
               '<th>العضو</th><th>الصلاحية</th><th></th>' +
             '</tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
           '<div class="panel"><div class="panel-head"><h3>معنى الصلاحيات</h3></div>' +
             '<div class="table-wrap"><table><thead><tr>' +
               '<th>الصلاحية</th><th>يقدر يسوي</th>' +
             '</tr></thead><tbody>' +
               '<tr><td><strong>مالك</strong></td><td>كل شي — بما فيه إدارة الفريق</td></tr>' +
               '<tr><td><strong>مدير</strong></td><td>إدخال وتعديل وحذف + دعوة أعضاء</td></tr>' +
               '<tr><td><strong>عضو</strong></td><td>إدخال وتعديل وحذف البيانات</td></tr>' +
               '<tr><td><strong>مشاهد فقط</strong></td><td>الاطلاع على التقارير دون أي تعديل</td></tr>' +
             '</tbody></table></div></div>';
  }

  /* ============================================================
     الإعدادات
     ============================================================ */
  function viewSettings() {
    var s = S.db.settings;
    return '<div class="page-head"><div><h2>الإعدادات</h2>' +
             '<p>الحساب البنكي والنسخ الاحتياطي</p></div></div>' +
      '<div class="grid grid-2">' +
        '<div class="panel"><div class="panel-head"><h3>الحساب البنكي</h3></div><div class="panel-body">' +
          '<div class="field" style="margin-bottom:12px"><label>اسم الحساب</label>' +
            '<input id="setBank" value="' + F.esc(s.bankName || '') +
            '" placeholder="مثال: الحساب الرئيسي — الراجحي"></div>' +
          '<div class="field"><label>الرصيد الافتتاحي (ر.س)</label>' +
            '<input type="number" id="setOpening" step="0.01" value="' + (s.openingBalance || 0) + '">' +
            '<span class="hint">الرصيد قبل تسجيل أي فاتورة — كل الحسابات تُبنى عليه</span></div>' +
          '<button class="btn btn-primary" id="saveSet" style="margin-top:12px">حفظ</button>' +
        '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>النسخ الاحتياطي</h3></div><div class="panel-body">' +
          '<p style="color:var(--muted);margin-bottom:14px">بياناتك محفوظة في القاعدة السحابية ومنسوخة تلقائياً. ' +
            'تقدر تنزّل نسخة إضافية عندك متى ما حبيت.</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="btn" id="dlJSON">تنزيل نسخة JSON</button>' +
          '</div></div></div>' +
        '<div class="panel"><div class="panel-head"><h3>حسابك</h3></div><div class="panel-body">' +
          '<div style="display:flex;flex-direction:column;gap:8px;font-size:13.5px">' +
            '<div><span style="color:var(--muted)">البريد: </span><strong dir="ltr">' +
              F.esc(S.me.email) + '</strong></div>' +
            '<div><span style="color:var(--muted)">الصلاحية: </span><strong>' +
              F.esc(S.roleName(S.me.role)) + '</strong></div>' +
            '<div><span style="color:var(--muted)">المنشأة: </span><strong>' +
              F.esc(S.db.orgName) + '</strong></div>' +
          '</div>' +
          '<button class="btn btn-danger" id="logoutBtn2" style="margin-top:14px">تسجيل الخروج</button>' +
        '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>ضريبة القيمة المضافة</h3></div><div class="panel-body">' +
          '<div class="field" style="margin-bottom:12px"><label>تاريخ التسجيل الضريبي</label>' +
            '<input type="date" lang="en-GB" id="setVatDate" value="' + (s.vatRegistrationDate || '') + '">' +
            '<span class="hint">من هذا التاريخ فأحدث تُحتسب الضريبة افتراضياً على الفواتير الجديدة</span></div>' +
          '<div class="field"><label>نسبة الضريبة الافتراضية (%)</label>' +
            '<input type="number" id="setVatRate" min="0" max="100" step="0.1" value="' +
            ((s.defaultVatRate || 0.15) * 100).toFixed(1) + '"></div>' +
          '<button class="btn btn-primary" id="saveVat" style="margin-top:12px">حفظ</button>' +
        '</div></div>' +
      '</div>';
  }

  /* ============================================================
     التقرير الضريبي (ضريبة القيمة المضافة)
     ============================================================ */
  function viewTaxReport() {
    var s = S.db.settings;
    if (!s.vatRegistrationDate) {
      return '<div class="page-head"><div><h2>التقرير الضريبي</h2>' +
               '<p>ضريبة القيمة المضافة — المخرجات والمدخلات وصافي الضريبة</p></div></div>' +
             '<div class="panel"><div class="panel-body">' +
               '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                 '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>' +
                 '<h4>لم يُضبط تاريخ التسجيل الضريبي</h4>' +
                 '<p>حدّد تاريخ تسجيل منشأتك في ضريبة القيمة المضافة من الإعدادات لتفعيل هذا التقرير.</p>' +
                 '<button class="btn btn-primary" data-goto-settings>الذهاب للإعدادات</button>' +
               '</div></div></div>';
    }

    var years = S.invoiceYears();
    if (years.indexOf(state.taxYear) < 0) state.taxYear = years[years.length - 1];
    var year = state.taxYear;

    var quarters = S.vatByQuarter(year, state.entityId);
    var months = S.vatByMonth(year, state.entityId);
    var curQ = S.quarterOf(S.todayISO());
    var curYear = S.todayISO().slice(0, 4);

    var yearChips = years.map(function (y) {
      return '<button class="chip' + (y === year ? ' active' : '') + '" data-tax-year="' + y + '">' + y + '</button>';
    }).join('');

    var qCards = quarters.map(function (q) {
      var isCurrent = (year === curYear && q.quarter === curQ);
      var payable = q.netVat > 0;
      return '<div class="q-card' + (isCurrent ? ' current' : '') + '">' +
        '<div class="q-top"><span class="q-name">الربع ' + q.quarter + '</span>' +
          (isCurrent ? '<span class="badge on">الحالي</span>' : '') + '</div>' +
        '<div class="q-range">' + F.arDate(q.from) + ' — ' + F.arDate(q.to) + '</div>' +
        '<div class="q-rows">' +
          '<div class="q-row"><span class="lbl">ضريبة المخرجات (وارد)</span>' +
            '<span class="val num">' + F.money(q.outputVat) + '</span></div>' +
          '<div class="q-row"><span class="lbl">ضريبة المدخلات (صادر)</span>' +
            '<span class="val num">' + F.money(q.inputVat) + '</span></div>' +
        '</div>' +
        '<div class="q-net' + (payable ? ' payable' : q.netVat < 0 ? ' refund' : '') + '">' +
          '<span class="lbl">' + (payable ? 'صافي مستحق السداد' : q.netVat < 0 ? 'صافي قابل للاسترداد' : 'لا يوجد فرق') + '</span>' +
          '<span class="val num">' + F.money(Math.abs(q.netVat)) + ' ر.س</span>' +
        '</div></div>';
    }).join('');

    var yearTotal = quarters.reduce(function (a, q) {
      a.outputVat += q.outputVat; a.inputVat += q.inputVat; a.netVat += q.netVat; return a;
    }, { outputVat: 0, inputVat: 0, netVat: 0 });

    var monthRows = months.map(function (m) {
      if (!m.outputVat && !m.inputVat) return '';
      return '<tr>' +
        '<td>' + F.MONTHS[m.month - 1] + '</td>' +
        '<td class="num">' + F.money(m.outputVat) + '</td>' +
        '<td class="num">' + F.money(m.inputVat) + '</td>' +
        '<td class="num" style="font-weight:700;color:' + (m.netVat > 0 ? 'var(--red)' : 'var(--green)') + '">' +
          F.money(m.netVat) + '</td>' +
      '</tr>';
    }).join('');
    var hasMonthly = months.some(function (m) { return m.outputVat || m.inputVat; });

    return '<div class="page-head"><div>' +
             '<h2>التقرير الضريبي</h2>' +
             '<p>مسجَّل في ضريبة القيمة المضافة منذ ' + F.arDate(s.vatRegistrationDate) +
               ' — نسبة ' + F.pct((s.defaultVatRate || 0.15) * 100, 0) + '</p>' +
           '</div></div>' +
           '<div class="filterbar"><span class="hint" style="margin-inline-end:6px">السنة</span>' + yearChips + '</div>' +
           '<div class="grid grid-4 mb">' + qCards + '</div>' +
           '<div class="panel mb"><div class="panel-head"><h3>إجمالي السنة ' + year + '</h3></div>' +
             '<div class="panel-body"><div class="recon">' +
               '<div><span class="k">إجمالي ضريبة المخرجات</span><span class="v num">' +
                 F.money(yearTotal.outputVat) + ' ر.س</span></div>' +
               '<div><span class="k">إجمالي ضريبة المدخلات</span><span class="v num">' +
                 F.money(yearTotal.inputVat) + ' ر.س</span></div>' +
               '<div><span class="k">صافي الضريبة</span><span class="v num" style="color:' +
                 (yearTotal.netVat > 0 ? 'var(--red)' : 'var(--green)') + '">' +
                 F.money(yearTotal.netVat) + ' ر.س</span></div>' +
             '</div></div></div>' +
           '<div class="panel"><div class="panel-head"><h3>التفصيل الشهري</h3></div>' +
             '<div class="table-wrap"><table><thead><tr>' +
               '<th>الشهر</th><th>ضريبة المخرجات</th><th>ضريبة المدخلات</th><th>صافي الضريبة</th>' +
             '</tr></thead><tbody>' +
             (hasMonthly ? monthRows : '<tr><td colspan="4">' + C.empty('لا توجد فواتير خاضعة للضريبة في هذه السنة') + '</td></tr>') +
             '</tbody></table></div></div>';
  }

  /* ============================================================
     متابعة العملاء (العقود والمستحقات الشهرية المتكررة)
     ============================================================ */
  var STATUS_LABEL = { active: 'ساري', ended: 'منتهي', paused: 'موقوف', pending: 'قيد توقيع العقد' };
  var STATUS_COLOR = {
    active:  ['var(--green-bg)', 'var(--green)'],
    ended:   ['var(--red-bg)', 'var(--red)'],
    paused:  ['#fff4e0', '#b06f00'],
    pending: ['#e8ecff', '#3b45c9']
  };
  var FEE_LABEL = { fixed: 'مبلغ ثابت', percent: 'نسبة من الإيراد', net_markup: 'خصم ثم هامش' };
  var EVENT_KIND = {
    campaign_new:  'إنشاء حملة جديدة',
    campaign_edit: 'تعديل حملة',
    video:         'مونتاج مقطع',
    design:        'تصميم جديد',
    content:       'كتابة محتوى',
    report:        'تقرير أداء',
    meeting:       'اجتماع',
    general:       'منجز آخر'
  };
  /** وصف نموذج الأتعاب بصيغة مقروءة */
  function feeDesc(c) {
    if (c.feeType === 'percent') return F.pct(c.feePercent, 1) + ' من الإيراد + ضريبة';
    if (c.feeType === 'net_markup') {
      return '− ' + F.pct(c.feeDeductPercent, 1) + ' ثم + ' + F.pct(c.feeMarkupPercent, 1) + ' + ضريبة';
    }
    return F.money(c.monthlyAmount) + ' ر.س شهرياً';
  }
  var DUE_LABEL = { paid: 'تم السداد', partial: 'سداد جزئي', unpaid: 'لم يُسدَّد', none: 'لا يوجد مستحق' };
  var DUE_COLOR = {
    paid: ['var(--green-bg)', 'var(--green)'], partial: ['#fff4e0', '#b06f00'],
    unpaid: ['var(--red-bg)', 'var(--red)'], none: ['var(--bg)', 'var(--muted)']
  };
  function badge(text, colors) {
    return '<span class="tag" style="background:' + colors[0] + ';color:' + colors[1] + '">' + text + '</span>';
  }

  /* ---------- متابعة العملاء: لوحة شهرية ---------- */
  function viewClients() {
    if (state.clientMonth === 'all') return viewClientsAll();
    var period = state.clientMonth || S.currentPeriod();
    var ym = period.slice(0, 7);
    var year = ym.slice(0, 4);
    var clients = S.db.clients;

    /* شريط الأشهر — كل شهور السنة، والشهور القادمة معطّلة بصرياً */
    var today = S.todayISO();
    var monthChips = '';
    for (var m = 1; m <= 12; m++) {
      var mk = year + '-' + String(m).padStart(2, '0');
      var isFuture = mk > today.slice(0, 7);
      var n = clients.filter(function (c) { return S.clientActiveInPeriod(c, mk + '-01'); }).length;
      monthChips += '<button class="chip' + (mk === ym ? ' active' : '') +
        (isFuture ? ' chip-future' : '') + '" data-cl-month="' + mk + '-01">' +
        F.MONTHS[m - 1] + (n ? '<span class="chip-n">' + n + '</span>' : '') + '</button>';
    }

    var years = {};
    clients.forEach(function (c) { if (c.contractStart) years[c.contractStart.slice(0, 4)] = 1; });
    years[S.todayISO().slice(0, 4)] = 1;
    var yearChips = Object.keys(years).sort().map(function (y) {
      return '<button class="chip' + (y === year ? ' active' : '') + '" data-cl-year="' + y + '">' + y + '</button>';
    }).join('');
    var allChip = '<button class="chip" data-cl-month="all">كل الفترات</button><span class="fb-sep"></span>';

    /* تقسيم الجهات: سارية في هذا الشهر ← اللوحة، وغيرها ← الأرشيف */
    var live = [], archived = [];
    clients.forEach(function (c) {
      (S.clientActiveInPeriod(c, period) ? live : archived).push(c);
    });

    var filt = state.clientPayFilter || 'all';
    var totDue = 0, totPaid = 0, cnt = { paid: 0, partial: 0, unpaid: 0, none: 0 };

    var liveRows = live.map(function (c) {
      var d = S.dueOf(c.id, period);
      var st = S.dueState(d);
      cnt[st]++;
      var due = d ? d.amountDue : 0, paid = d ? d.amountPaid : 0;
      totDue += due; totPaid += paid;
      var rest = Math.round((due - paid) * 100) / 100;
      if (filt !== 'all' && filt !== st) return '';

      var expected = c.feeType === 'fixed' ? S.computeFee(c, 0).total : 0;
      return '<tr>' +
        '<td style="font-weight:600">' + F.esc(c.name) +
          '<span class="hint" style="display:block">' + F.esc(feeDesc(c)) + '</span></td>' +
        '<td class="num">' + (d ? F.money(due)
          : '<span style="color:var(--muted)">— ' +
            (expected > 0 ? '<span class="hint">متوقع ' + F.money(expected) + '</span>' : '') + '</span>') + '</td>' +
        '<td class="num">' + (d ? F.money(paid) : '—') + '</td>' +
        '<td class="num" style="font-weight:700;color:' +
          (rest > 0 ? 'var(--red)' : d ? 'var(--green)' : 'var(--muted)') + '">' +
          (d ? F.money(rest) : '—') + '</td>' +
        '<td>' + badge(DUE_LABEL[st], DUE_COLOR[st]) + '</td>' +
        '<td><div class="t-actions">' +
          '<button class="btn btn-sm btn-primary" data-pay="' + c.id + '">' +
            (d ? 'تحديث السداد' : 'تسجيل المستحق') + '</button>' +
          '<button class="btn btn-sm" data-report="' + c.id + '">تقارير الأداء</button>' +
          '<button class="btn btn-sm" data-portal="' + c.id + '"' +
            (S.portalUsersOf(c.id).length ? ' title="يوجد حساب دخول"' : '') + '>البوابة' +
            (S.portalUsersOf(c.id).length ? ' ✓' : '') + '</button>' +
          '<button class="btn btn-sm" data-client-detail="' + c.id + '">كل الشهور</button>' +
        '</div></td></tr>';
    }).join('');

    var archRows = archived.map(function (c) {
      var why = c.contractStatus === 'pending' ? 'قيد توقيع العقد'
        : c.contractStatus === 'paused' ? 'موقوف مؤقتاً'
        : c.contractStart && c.contractStart > S.periodEnd(period)
          ? 'يبدأ ' + F.arMonth(c.contractStart.slice(0, 7))
          : 'انتهى العقد';
      return '<tr>' +
        '<td style="font-weight:600">' + F.esc(c.name) + '</td>' +
        '<td>' + badge(STATUS_LABEL[S.clientEffectiveStatus(c)], STATUS_COLOR[S.clientEffectiveStatus(c)]) + '</td>' +
        '<td><span class="hint">' + F.esc(why) + '</span></td>' +
        '<td class="num">' + (c.contractStart ? F.arDate(c.contractStart) : '—') + '</td>' +
        '<td><div class="t-actions">' +
          '<button class="btn btn-sm" data-client-detail="' + c.id + '">كل الشهور</button>' +
          '<button class="btn btn-sm" data-edit-client="' + c.id + '">تعديل</button>' +
          '<button class="btn btn-sm btn-danger" data-client-del="' + c.id + '">حذف</button>' +
        '</div></td></tr>';
    }).join('');

    var payChips = [['all', 'الكل'], ['unpaid', 'لم يُسدَّد'], ['partial', 'جزئي'],
                    ['paid', 'مسدَّد'], ['none', 'بلا مستحق']].map(function (x) {
      var n = x[0] === 'all' ? live.length : cnt[x[0]];
      return '<button class="chip' + (filt === x[0] ? ' active' : '') + '" data-cl-filter="' + x[0] + '">' +
             x[1] + (n ? '<span class="chip-n">' + n + '</span>' : '') + '</button>';
    }).join('');

    var showArch = !!state.clientShowArchive;
    var restTot = Math.round((totDue - totPaid) * 100) / 100;

    return '<div class="page-head"><div>' +
             '<h2>متابعة العملاء</h2>' +
             '<p>لوحة شهرية — اختر الشهر لترى مستحق كل جهة وحالة سدادها فيه</p>' +
           '</div><div style="display:flex;gap:8px;flex-wrap:wrap">' +
             '<button class="btn" data-gen-dues>توليد مستحقات ' + F.arMonth(ym) + '</button>' +
             '<button class="btn btn-primary" data-add-client>' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
               '<path d="M12 5v14M5 12h14"/></svg>جهة جديدة</button>' +
           '</div></div>' +

           '<div class="filterbar">' + allChip +
             (Object.keys(years).length > 1 ? yearChips + '<span class="fb-sep"></span>' : '') +
             monthChips + '</div>' +

           '<div class="grid grid-4 mb">' +
             kpiCard('مستحق ' + F.arMonth(ym), F.money(totDue) + ' ر.س',
                     live.length + ' جهة سارية هذا الشهر', 'money', { v: 0, dir: 'flat' }) +
             kpiCard('المحصَّل', F.money(totPaid) + ' ر.س', 'ما تم سداده من مستحق الشهر',
                     'cart', { v: 0, dir: 'flat' }) +
             kpiCard('المتبقي', F.money(restTot) + ' ر.س', 'غير المسدَّد من هذا الشهر',
                     'trend', { v: 0, dir: 'flat' }) +
             kpiCard('في الأرشيف', F.int(archived.length), 'عقود غير سارية في هذا الشهر',
                     'pct', { v: 0, dir: 'flat' }) +
           '</div>' +

           '<div class="panel mb"><div class="panel-head">' +
             '<h3>' + F.arMonth(ym) + ' — الجهات السارية</h3>' +
             '<div style="display:flex;gap:6px;flex-wrap:wrap">' + payChips + '</div>' +
           '</div><div class="table-wrap"><table><thead><tr>' +
             '<th>الجهة</th><th>المستحق</th><th>المسدَّد</th><th>المتبقي</th><th>الحالة</th><th></th>' +
           '</tr></thead><tbody>' +
           (live.length && liveRows ? liveRows
             : '<tr><td colspan="6">' + C.empty(live.length
                 ? 'لا توجد جهات تطابق هذه التصفية'
                 : 'لا توجد جهات سارية في ' + F.arMonth(ym)) + '</td></tr>') +
           '</tbody></table></div></div>' +

           '<div class="panel"><div class="panel-head">' +
             '<h3>الأرشيف (' + archived.length + ')</h3>' +
             '<button class="btn btn-sm" data-cl-arch>' +
               (showArch ? 'إخفاء الأرشيف' : 'إظهار الأرشيف') + '</button>' +
           '</div>' +
           (showArch
             ? '<div class="table-wrap"><table><thead><tr>' +
                 '<th>الجهة</th><th>الحالة</th><th>السبب</th><th>بداية العقد</th><th></th>' +
               '</tr></thead><tbody>' +
               (archived.length ? archRows
                 : '<tr><td colspan="5">' + C.empty('الأرشيف فارغ') + '</td></tr>') +
               '</tbody></table></div>'
             : '<div class="panel-body"><p class="hint">' + archived.length +
               ' جهة غير سارية في ' + F.arMonth(ym) +
               ' (لم تبدأ بعد، أو موقوفة، أو منتهية، أو قيد توقيع العقد).</p></div>') +
           arrearsHTML() +
           '</div>';
  }

  /**
   * ملاحظة أسفل الأرشيف: إجمالي المستحقات المتأخرة على الجهات المتعثرة.
   * المتعثرة = جهة عليها شهر منقضٍ أو أكثر لم يُسدَّد بالكامل.
   */
  function arrearsHTML() {
    var late = S.db.clients.map(function (c) {
      return { c: c, s: S.clientSummary(c) };
    }).filter(function (x) { return x.s.overdue > 0; })
      .sort(function (a, b) { return b.s.overdue - a.s.overdue; });

    if (!late.length) {
      return '<div class="arrears" style="background:linear-gradient(90deg,var(--green-bg),transparent)">' +
        '<div class="arrears-ico" style="background:var(--green)">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
          '<path d="M20 6 9 17l-5-5"/></svg></div>' +
        '<div class="arrears-txt"><strong>لا توجد جهات متعثرة</strong>' +
          '<span>كل الأشهر المنقضية مسدَّدة بالكامل</span></div>' +
      '</div>';
    }

    var total = late.reduce(function (a, x) { return a + x.s.overdue; }, 0);
    var months = late.reduce(function (a, x) { return a + x.s.overdueCount; }, 0);

    return '<div class="arrears">' +
      '<div class="arrears-ico">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' +
        '<path d="M12 9v4M12 17h.01"/></svg></div>' +
      '<div class="arrears-txt"><strong>الجهات المتعثرة — ' + late.length + ' جهة</strong>' +
        '<span>عليها ' + months + ' شهر غير مسدَّد بالكامل من الأشهر المنقضية</span></div>' +
      '<div class="arrears-total"><span class="k">إجمالي المستحقات المتأخرة</span>' +
        '<span class="v num">' + F.money(total) + ' ر.س</span></div>' +
      '<div class="arrears-list">' + late.map(function (x) {
        return '<span class="arrears-pill">' + F.esc(x.c.name) +
               ' <b class="num">' + F.money(x.s.overdue) + '</b>' +
               ' <span class="hint">(' + x.s.overdueCount + ' شهر)</span></span>';
      }).join('') + '</div>' +
    '</div>';
  }

  /* ---------- متابعة العملاء: كل الفترات مجمّعة ---------- */
  function viewClientsAll() {
    var clients = S.db.clients;
    var rows = clients.map(function (c) {
      var s = S.clientSummary(c);
      var rest = Math.round((s.totalDue - s.totalPaid) * 100) / 100;
      var months = S.clientDuesOf(c.id).length;
      return { c: c, s: s, rest: rest, months: months };
    });

    var filt = state.clientPayFilter || 'all';
    var shown = rows.filter(function (r) {
      if (filt === 'unpaid') return r.s.overdue > 0;
      if (filt === 'paid') return r.s.totalDue > 0 && r.rest <= 0;
      if (filt === 'partial') return r.s.totalPaid > 0 && r.rest > 0;
      if (filt === 'none') return r.months === 0;
      return true;
    });

    var totDue = rows.reduce(function (a, r) { return a + r.s.totalDue; }, 0);
    var totPaid = rows.reduce(function (a, r) { return a + r.s.totalPaid; }, 0);
    var totRest = Math.round((totDue - totPaid) * 100) / 100;

    var body = shown.map(function (r) {
      var st = r.months === 0 ? 'none' : r.rest <= 0 ? 'paid' : r.s.totalPaid > 0 ? 'partial' : 'unpaid';
      return '<tr>' +
        '<td style="font-weight:600">' + F.esc(r.c.name) +
          '<span class="hint" style="display:block">' + F.esc(feeDesc(r.c)) + '</span></td>' +
        '<td>' + badge(STATUS_LABEL[S.clientEffectiveStatus(r.c)],
                       STATUS_COLOR[S.clientEffectiveStatus(r.c)]) + '</td>' +
        '<td class="num">' + (r.c.contractStart ? F.arMonth(r.c.contractStart.slice(0, 7)) : '—') + '</td>' +
        '<td class="num">' + F.int(r.months) + '</td>' +
        '<td class="num">' + F.money(r.s.totalDue) + '</td>' +
        '<td class="num">' + F.money(r.s.totalPaid) + '</td>' +
        '<td class="num" style="font-weight:700;color:' +
          (r.rest > 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(r.rest) + '</td>' +
        '<td>' + badge(DUE_LABEL[st], DUE_COLOR[st]) + '</td>' +
        '<td><div class="t-actions">' +
          '<button class="btn btn-sm" data-client-detail="' + r.c.id + '">كل الشهور</button>' +
          '<button class="btn btn-sm btn-danger" data-client-del="' + r.c.id + '">حذف</button>' +
        '</div></td></tr>';
    }).join('');

    var payChips = [['all', 'الكل'], ['unpaid', 'عليها متأخر'], ['partial', 'سداد جزئي'],
                    ['paid', 'مكتملة السداد'], ['none', 'بلا مستحقات']].map(function (x) {
      return '<button class="chip' + (filt === x[0] ? ' active' : '') + '" data-cl-filter="' + x[0] + '">' +
             x[1] + '</button>';
    }).join('');

    var years = {};
    clients.forEach(function (c) { if (c.contractStart) years[c.contractStart.slice(0, 4)] = 1; });
    years[S.todayISO().slice(0, 4)] = 1;
    var backChips = Object.keys(years).sort().map(function (y) {
      return '<button class="chip" data-cl-year="' + y + '">' + y + '</button>';
    }).join('');

    return '<div class="page-head"><div>' +
             '<h2>متابعة العملاء</h2>' +
             '<p>كل الفترات — الإجمالي التراكمي لكل جهة عبر كامل السجل</p>' +
           '</div><div style="display:flex;gap:8px;flex-wrap:wrap">' +
             '<button class="btn btn-primary" data-add-client>' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
               '<path d="M12 5v14M5 12h14"/></svg>جهة جديدة</button>' +
           '</div></div>' +

           '<div class="filterbar">' +
             '<button class="chip active" data-cl-month="all">كل الفترات</button>' +
             '<span class="fb-sep"></span>' + backChips +
             '<span class="hint" style="margin-inline-start:8px">اختر سنة للعودة إلى العرض الشهري</span>' +
           '</div>' +

           '<div class="grid grid-4 mb">' +
             kpiCard('إجمالي المستحق', F.money(totDue) + ' ر.س', 'كل الأشهر المسجّلة',
                     'money', { v: 0, dir: 'flat' }) +
             kpiCard('إجمالي المحصَّل', F.money(totPaid) + ' ر.س', 'ما تم سداده فعلاً',
                     'cart', { v: 0, dir: 'flat' }) +
             kpiCard('المتبقي', F.money(totRest) + ' ر.س', 'غير المسدَّد من كل الفترات',
                     'trend', { v: 0, dir: 'flat' }) +
             kpiCard('عدد الجهات', F.int(clients.length), 'المسجّلة في المتابعة',
                     'pct', { v: 0, dir: 'flat' }) +
           '</div>' +

           '<div class="panel"><div class="panel-head">' +
             '<h3>كل الجهات — إجمالي تراكمي</h3>' +
             '<div style="display:flex;gap:6px;flex-wrap:wrap">' + payChips + '</div>' +
           '</div><div class="table-wrap"><table><thead><tr>' +
             '<th>الجهة</th><th>حالة العقد</th><th>بداية التعاقد</th><th>الأشهر</th>' +
             '<th>إجمالي المستحق</th><th>المحصَّل</th><th>المتبقي</th><th>الحالة</th><th></th>' +
           '</tr></thead><tbody>' +
           (shown.length ? body
             : '<tr><td colspan="9">' + C.empty('لا توجد جهات تطابق هذه التصفية') + '</td></tr>') +
           '</tbody></table>' +
           arrearsHTML() +
           '</div></div>';
  }

  /* ============================================================
     الجمعيات — إدارة حسابات بوابة الجهات
     ============================================================ */
  function viewOrgs() {
    var clients = S.db.clients;
    var canEdit = S.canWrite();
    var portalUrl = location.origin + location.pathname.replace(/[^/]*$/, '') + 'portal.html';

    /* قائمة تحديد الفترة — تحكم أرقام الأداء المعروضة */
    var rr = orgRange();
    var presets = [['today', 'اليوم'], ['yesterday', 'أمس'], ['last7', 'آخر 7 أيام'],
                   ['last30', 'آخر 30 يوم'], ['thisMonth', 'هذا الشهر'],
                   ['prevMonth', 'الشهر السابق'], ['all', 'كل الفترات']];
    var rangeChips = presets.map(function (p) {
      return '<button class="chip' + (state.orgRange === p[0] ? ' active' : '') +
             '" data-org-range="' + p[0] + '">' + p[1] + '</button>';
    }).join('');
    var rangeLabel = rr.from && rr.to
      ? F.arDate(rr.from) + ' — ' + F.arDate(rr.to) : 'كل السجل';

    function inR(d) {
      if (rr.from && d < rr.from) return false;
      if (rr.to && d > rr.to) return false;
      return true;
    }

    var totSpend = 0, totRev = 0, totDon = 0;

    var rows = clients.map(function (c) {
      var accts = S.portalUsersOf(c.id);
      var reps = S.reportsOf(c.id).filter(function (x) { return inR(x.date); });
      var last = reps.length ? reps[0].date : null;
      var sp = reps.reduce(function (a, x) { return a + x.spend; }, 0);
      var rv = reps.reduce(function (a, x) { return a + x.revenue; }, 0);
      var dn = reps.reduce(function (a, x) { return a + x.donations; }, 0);
      totSpend += sp; totRev += rv; totDon += dn;
      var roas = sp > 0 ? rv / sp : 0;
      return '<tr>' +
        '<td style="font-weight:600">' + F.esc(c.name) +
          '<span class="hint" style="display:block">' +
            badge(STATUS_LABEL[S.clientEffectiveStatus(c)], STATUS_COLOR[S.clientEffectiveStatus(c)]) +
          '</span></td>' +
        '<td>' + (accts.length
          ? accts.map(function (a) {
              return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">' +
                '<span class="num" dir="ltr" style="font-size:12.5px">' + F.esc(a.email) + '</span>' +
                (canEdit ? '<button class="btn btn-sm btn-danger" data-pu-del="' + a.id + '">إلغاء</button>' : '') +
              '</div>';
            }).join('')
          : '<span style="color:var(--muted)">لا يوجد حساب</span>') + '</td>' +
        '<td>' + (c.portalCode
          ? '<span class="code-pill num" dir="ltr">' + F.esc(c.portalCode) + '</span>'
          : '<span style="color:var(--muted)">—</span>') + '</td>' +
        '<td class="num">' + F.money(sp) + '</td>' +
        '<td class="num" style="font-weight:700">' + F.int(dn) + '</td>' +
        '<td class="num">' + F.money(rv) + '</td>' +
        '<td class="num" style="font-weight:800;color:' +
          (sp <= 0 ? 'var(--muted)' : roas >= 1 ? 'var(--green)' : 'var(--red)') + '">' +
          (sp > 0 ? roas.toFixed(2) + 'x' : '—') + '</td>' +
        '<td class="num">' + (last ? F.arDate(last) : '<span style="color:var(--muted)">—</span>') +
          '<span class="hint" style="display:block">' + reps.length + ' تقرير</span></td>' +
        '<td><div class="t-actions">' +
          (canEdit ? '<button class="btn btn-sm btn-primary" data-acct="' + c.id + '">إنشاء حساب</button>' : '') +
          (canEdit ? '<button class="btn btn-sm" data-code="' + c.id + '">' +
            (c.portalCode ? 'رمز جديد' : 'توليد رمز') + '</button>' : '') +
          '<button class="btn btn-sm" data-report="' + c.id + '">تقارير الأداء</button>' +
        '</div></td></tr>';
    }).join('');

    var withAcct = clients.filter(function (c) { return S.portalUsersOf(c.id).length; }).length;

    return '<div class="page-head"><div>' +
             '<h2>الجمعيات</h2>' +
             '<p>حسابات دخول الجهات إلى بوابة الأداء — تُنشئها أنت، أو تُنشئها الجهة برمز دعوة</p>' +
           '</div>' +
           '<button class="btn btn-primary" data-add-client>' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M12 5v14M5 12h14"/></svg>جهة جديدة</button>' +
           '</div>' +

           '<div class="vat-bar mb">' +
             '<div class="vb-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
               '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/>' +
               '<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg></div>' +
             '<div class="vb-txt"><strong>رابط البوابة</strong>' +
               '<span class="num" dir="ltr">' + F.esc(portalUrl) + '</span></div>' +
             '<a class="btn btn-sm" href="' + portalUrl + '" target="_blank" rel="noopener">فتح البوابة</a>' +
           '</div>' +

           '<div class="filterbar">' + rangeChips +
             '<span class="spacer"></span>' +
             '<span class="range-label num">' + rangeLabel + '</span></div>' +

           '<div class="grid grid-4 mb">' +
             kpiCard('الإنفاق', F.money(totSpend) + ' ر.س', 'على كل الجمعيات في الفترة',
                     'money', { v: 0, dir: 'flat' }) +
             kpiCard('العائد', F.money(totRev) + ' ر.س', 'إجمالي التبرعات المحصّلة',
                     'cart', { v: 0, dir: 'flat' }) +
             kpiCard('عدد التبرعات', F.int(totDon), 'عملية تبرع في الفترة',
                     'pct', { v: 0, dir: 'flat' }) +
             kpiCard('ROAS', (totSpend > 0 ? (totRev / totSpend).toFixed(2) : '0.00') + 'x',
                     withAcct + ' من ' + clients.length + ' جهة لديها حساب دخول',
                     'trend', { v: 0, dir: 'flat' }) +
           '</div>' +

           '<div class="panel"><div class="panel-head"><h3>الجهات وحساباتها</h3>' +
             '<span class="hint">الجهة ترى أداء حملاتها فقط — لا فواتير ولا مستحقات</span></div>' +
           '<div class="table-wrap"><table><thead><tr>' +
             '<th>الجهة</th><th>حساب الدخول</th><th>رمز الدعوة</th>' +
             '<th>الإنفاق</th><th>التبرعات</th><th>العائد</th><th>ROAS</th>' +
             '<th>آخر تقرير</th><th></th>' +
           '</tr></thead><tbody>' +
           (clients.length ? rows : '<tr><td colspan="9"><div class="empty">' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
             '<path d="M3 21h18M5 21V7l7-4 7 4v14"/></svg>' +
             '<h4>لا توجد جهات بعد</h4><p>أضف أول جهة لتنشئ لها حساب بوابة.</p>' +
             '<button class="btn btn-primary" data-add-client>إضافة جهة</button></div></td></tr>') +
           '</tbody></table></div></div>';
  }

  /* مدى فترة صفحة الجمعيات */
  function orgRange() {
    var t = S.todayISO();
    var d = new Date(t + 'T00:00:00'), y = d.getFullYear(), m = d.getMonth();
    switch (state.orgRange) {
      case 'today':     return { from: t, to: t };
      case 'yesterday': return { from: S.addDays(t, -1), to: S.addDays(t, -1) };
      case 'last7':     return { from: S.addDays(t, -6), to: t };
      case 'thisMonth': return { from: t.slice(0, 8) + '01', to: t };
      case 'prevMonth': return { from: S.iso(new Date(y, m - 1, 1)), to: S.iso(new Date(y, m, 0)) };
      case 'all':       return { from: null, to: null };
      default:          return { from: S.addDays(t, -29), to: t };
    }
  }

  /* إنشاء حساب دخول لجهة */
  function accountForm(clientId) {
    var c = S.db.clients.find(function (x) { return x.id === clientId; });
    if (!c) return;

    openModal('إنشاء حساب دخول: ' + c.name,
      '<div class="form-grid">' +
        field('البريد الإلكتروني', '<input type="email" id="ac_email" dir="ltr" placeholder="name@jamiya.org">') +
        '<div class="field"><label>كلمة المرور</label>' +
          '<input type="text" id="ac_pass" dir="ltr" placeholder="٦ أحرف على الأقل">' +
          '<span class="hint"><a href="#" id="ac_gen">توليد كلمة مرور قوية</a></span></div>' +
        '<div class="field full"><span class="hint">' +
          'سلّم الجهة البريد وكلمة المرور، وتدخل من رابط البوابة. ' +
          'تعرض لها أداء الحملات فقط.</span></div>' +
      '</div>',
      '<button class="btn btn-primary" id="modalSave">إنشاء</button>' +
      '<button class="btn" data-close>إلغاء</button>',
      function () {
        var email = $('#ac_email').value.trim();
        var pass = $('#ac_pass').value;
        if (!email) { toast('البريد مطلوب', true); return; }
        if (!pass || pass.length < 6) { toast('كلمة المرور ٦ أحرف على الأقل', true); return; }
        closeModal();
        run(function () { return S.createPortalAccount(c.id, email, pass); }, 'تم إنشاء الحساب');
      });

    $('#ac_gen').onclick = function (e) {
      e.preventDefault();
      $('#ac_pass').value = randomCode(12);
      $('#ac_pass').select();
    };
  }

  function randomCode(n) {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var a = new Uint32Array(n); crypto.getRandomValues(a);
    var out = '';
    for (var i = 0; i < n; i++) out += abc[a[i] % abc.length];
    return out;
  }

  /* ---------- تقرير الأداء اليومي لجهة ---------- */
  function reportForm(clientId) {
    var c = S.db.clients.find(function (x) { return x.id === clientId; });
    if (!c) return;
    var list = S.reportsOf(clientId);
    var canEdit = S.canWrite();

    var rows = list.slice(0, 60).map(function (r) {
      return '<tr>' +
        '<td class="num">' + F.arDate(r.date) + '</td>' +
        '<td>' + F.esc(S.PLATFORM_AR[r.platform] || r.platform) +
          (r.source === 'auto' ? '<span class="hint" style="display:block">تلقائي</span>' : '') + '</td>' +
        '<td class="num">' + F.money(r.spend) + '</td>' +
        '<td class="num" style="font-weight:700">' + F.int(r.donations) + '</td>' +
        '<td class="num">' + F.money(r.revenue) + '</td>' +
        '<td class="num" style="font-weight:800;color:' +
          (r.roas >= 1 ? 'var(--green)' : 'var(--red)') + '">' + r.roas.toFixed(2) + 'x</td>' +
        '<td>' + (canEdit ? '<div class="t-actions">' +
          '<button class="btn btn-sm" data-rep-edit="' + r.id + '">تعديل</button>' +
          '<button class="btn btn-sm btn-danger" data-rep-del="' + r.id + '">حذف</button>' +
        '</div>' : '—') + '</td></tr>';
    }).join('');

    var evs = S.eventsOf(clientId);
    var evRows = evs.slice(0, 40).map(function (e) {
      return '<tr>' +
        '<td class="num">' + F.arDate(e.date) + '</td>' +
        '<td>' + F.esc(EVENT_KIND[e.kind] || 'حدث') + '</td>' +
        '<td style="font-weight:600">' + F.esc(e.title) + '</td>' +
        '<td>' + F.esc(e.note || '—') + '</td>' +
        '<td>' + (canEdit ? '<div class="t-actions">' +
          '<button class="btn btn-sm" data-ev-edit="' + e.id + '">تعديل</button>' +
          '<button class="btn btn-sm btn-danger" data-ev-del="' + e.id + '">حذف</button>' +
        '</div>' : '—') + '</td></tr>';
    }).join('');

    var body =
      (canEdit ?
      '<div class="form-grid mb" style="padding:14px;border:1px dashed var(--line);border-radius:12px">' +
        '<div class="field full"><label>تسجيل تقرير يوم</label>' +
          '<span class="hint">المنصات الإعلانية (ميتا/سناب/تيك توك/جوجل) = الإنفاق فقط · ' +
          'منصة نمو = عدد التبرعات والعائد</span></div>' +
        '<div class="field"><label>التاريخ</label>' + dateField('rp_date', S.todayISO()) + '</div>' +
        '<div class="field"><label>المنصة</label><select id="rp_plat">' +
          S.PLATFORMS.map(function (p) {
            return '<option value="' + p + '">' + F.esc(S.PLATFORM_AR[p]) + '</option>';
          }).join('') + '</select></div>' +
        field('الإنفاق (ر.س)', '<input type="number" id="rp_spend" min="0" step="0.01" value="" placeholder="0.00">') +
        field('عدد التبرعات', '<input type="number" id="rp_don" min="0" step="1" value="" placeholder="0">') +
        field('العائد (ر.س)', '<input type="number" id="rp_rev" min="0" step="0.01" value="" placeholder="0.00">') +
        '<div class="field"><label>ROAS</label>' +
          '<input id="rp_roas" value="—" disabled style="font-weight:800">' +
          '<span class="hint">يُحسب: العائد ÷ الإنفاق</span></div>' +
        '<div class="field full"><label>ملاحظة داخلية (لا تظهر للجهة)</label>' +
          '<input id="rp_note" value="" placeholder="اختياري"></div>' +
        '<div class="field full"><button class="btn btn-primary" id="rpSave" type="button">حفظ التقرير</button>' +
          '<button class="btn" id="rpReset" type="button" style="margin-inline-start:8px">تفريغ</button></div>' +
      '</div>' : '') +
      '<div class="table-wrap mb"><table><thead><tr>' +
        '<th>التاريخ</th><th>المنصة</th><th>الإنفاق</th><th>التبرعات</th>' +
        '<th>العائد</th><th>ROAS</th><th></th>' +
      '</tr></thead><tbody>' +
      (list.length ? rows : '<tr><td colspan="7">' + C.empty('لا توجد تقارير بعد') + '</td></tr>') +
      '</tbody></table></div>' +

      '<h3 style="font-size:15px;font-weight:700;margin:18px 0 10px">سير العمل</h3>' +
      (canEdit ?
      '<div class="form-grid mb" style="padding:14px;border:1px dashed var(--line);border-radius:12px">' +
        '<div class="field"><label>تاريخ الحدث</label>' + dateField('ev_date', S.todayISO()) + '</div>' +
        '<div class="field"><label>النوع</label><select id="ev_kind">' +
          Object.keys(EVENT_KIND).map(function (k) {
            return '<option value="' + k + '">' + EVENT_KIND[k] + '</option>';
          }).join('') + '</select></div>' +
        '<div class="field full"><label>ماذا أنجزنا؟</label>' +
          '<input id="ev_title" placeholder="مثال: تم إنشاء حملة جديدة لجمع التبرعات، تم مونتاج مقطع تعريفي"></div>' +
        '<div class="field full"><label>تفصيل (يظهر للجهة)</label>' +
          '<input id="ev_note" placeholder="اختياري"></div>' +
        '<div class="field full"><button class="btn btn-primary" id="evSave" type="button">إضافة الحدث</button>' +
          '<button class="btn" id="evReset" type="button" style="margin-inline-start:8px">تفريغ</button></div>' +
      '</div>' : '') +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>التاريخ</th><th>النوع</th><th>العنوان</th><th>التفصيل</th><th></th>' +
      '</tr></thead><tbody>' +
      (evs.length ? evRows : '<tr><td colspan="5">' + C.empty('لا توجد أحداث بعد') + '</td></tr>') +
      '</tbody></table></div>';

    openModal('تقارير الأداء: ' + c.name, body,
      '<button class="btn" data-close>إغلاق</button>', null);

    if (!canEdit) return;

    function fill(r) {
      $('#rp_date').value = toDisplayDate(r ? r.date : S.todayISO());
      $('#rp_plat').value = r ? r.platform : 'meta';
      $('#rp_spend').value = r ? r.spend : '';
      $('#rp_don').value = r ? r.donations : '';
      $('#rp_rev').value = r ? r.revenue : '';
      $('#rp_note').value = r ? r.note : '';
      syncRoas();
    }
    function syncRoas() {
      var s = parseFloat($('#rp_spend').value) || 0;
      var v = parseFloat($('#rp_rev').value) || 0;
      $('#rp_roas').value = s > 0 ? (v / s).toFixed(2) + 'x' : '—';
    }
    ['rp_spend', 'rp_rev'].forEach(function (id) {
      $('#' + id).addEventListener('input', syncRoas);
    });

    $('#rpSave').onclick = function () {
      var d = fromDisplayDate($('#rp_date').value);
      if (!d) { toast('اكتب التاريخ بصيغة يوم/شهر/سنة', true); return; }
      run(function () {
        return S.saveReport({
          clientId: c.id, date: d, platform: $('#rp_plat').value,
          spend: $('#rp_spend').value, revenue: $('#rp_rev').value,
          donations: $('#rp_don').value, note: $('#rp_note').value, source: 'manual'
        });
      }, 'تم حفظ التقرير').then(function () { reportForm(c.id); });
    };
    $('#rpReset').onclick = function () { fill(null); };

    function evFill(e) {
      $('#ev_date').value = toDisplayDate(e ? e.date : S.todayISO());
      $('#ev_kind').value = e ? e.kind : 'campaign_new';
      $('#ev_title').value = e ? e.title : '';
      $('#ev_note').value = e ? e.note : '';
      editingEvent = e ? e.id : null;
    }
    var editingEvent = null;
    $('#evSave').onclick = function () {
      var d = fromDisplayDate($('#ev_date').value);
      if (!d) { toast('اكتب تاريخ الحدث بصيغة يوم/شهر/سنة', true); return; }
      if (!$('#ev_title').value.trim()) { toast('عنوان الحدث مطلوب', true); return; }
      run(function () {
        return S.saveEvent({
          id: editingEvent, clientId: c.id, date: d, kind: $('#ev_kind').value,
          title: $('#ev_title').value, note: $('#ev_note').value
        });
      }, 'تم حفظ الحدث').then(function () { reportForm(c.id); });
    };
    $('#evReset').onclick = function () { evFill(null); };

    $('#modalBody').onclick = function (ev) {
      var dp = ev.target.closest('[data-dp]');
      if (dp) {
        var nat = $('#' + dp.dataset.dp + '_n');
        if (nat.showPicker) { try { nat.showPicker(); } catch (e) {} } else { nat.focus(); }
        return;
      }
      var ed = ev.target.closest('[data-rep-edit]');
      if (ed) {
        var r = list.find(function (x) { return x.id === ed.dataset.repEdit; });
        if (r) { fill(r); $('#rp_date').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      }
      var dl = ev.target.closest('[data-rep-del]');
      if (dl) {
        confirmBox('حذف هذا الصف؟', function () {
          run(function () { return S.deleteReport(dl.dataset.repDel); }, 'تم الحذف')
            .then(function () { reportForm(c.id); });
        });
        return;
      }
      var ee = ev.target.closest('[data-ev-edit]');
      if (ee) {
        var e2 = evs.find(function (x) { return x.id === ee.dataset.evEdit; });
        if (e2) { evFill(e2); $('#ev_title').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      }
      var edl = ev.target.closest('[data-ev-del]');
      if (edl) {
        confirmBox('حذف هذا الحدث؟', function () {
          run(function () { return S.deleteEvent(edl.dataset.evDel); }, 'تم الحذف')
            .then(function () { reportForm(c.id); });
        });
      }
    };
  }

  /* ---------- حسابات بوابة الجهة ---------- */
  function portalForm(clientId) {
    var c = S.db.clients.find(function (x) { return x.id === clientId; });
    if (!c) return;
    var accounts = S.portalUsersOf(clientId);
    var canEdit = S.canWrite();
    var portalUrl = location.origin + location.pathname.replace(/[^/]*$/, '') + 'portal.html';

    var rows = accounts.map(function (a) {
      return '<tr>' +
        '<td dir="ltr" style="font-weight:600">' + F.esc(a.email) + '</td>' +
        '<td class="num">' + F.arDate((a.createdAt || '').slice(0, 10)) + '</td>' +
        '<td>' + (canEdit
          ? '<button class="btn btn-sm btn-danger" data-pu-del="' + a.id + '">إلغاء الوصول</button>'
          : '—') + '</td></tr>';
    }).join('');

    var body =
      '<div class="recon mb" style="padding:14px;background:var(--bg);border-radius:12px">' +
        '<div><span class="k">رابط البوابة</span>' +
          '<span class="v num" style="font-size:12.5px" dir="ltr">' + F.esc(portalUrl) + '</span></div>' +
      '</div>' +
      '<p class="hint" style="margin-bottom:14px">' +
        'الجهة تدخل من هذا الرابط ببريدها وكلمة مرورها، وترى تقارير أدائها ومستحقاتها فقط — ' +
        'لا ترى الفواتير ولا بيانات أي جهة أخرى، ولا تستطيع التعديل.</p>' +
      (canEdit ?
      '<div class="form-grid mb" style="padding:14px;border:1px dashed var(--line);border-radius:12px">' +
        '<div class="field full"><label>إنشاء حساب دخول للجهة</label></div>' +
        field('البريد الإلكتروني', '<input type="email" id="pu_email" dir="ltr" placeholder="name@jamiya.org">') +
        '<div class="field"><label>كلمة المرور</label>' +
          '<input type="text" id="pu_pass" dir="ltr" placeholder="٦ أحرف على الأقل">' +
          '<span class="hint"><a href="#" id="pu_gen">توليد كلمة مرور قوية</a></span></div>' +
        '<div class="field full"><button class="btn btn-primary" id="puSave" type="button">إنشاء الحساب</button></div>' +
      '</div>' : '') +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>البريد</th><th>أُنشئ في</th><th></th>' +
      '</tr></thead><tbody>' +
      (accounts.length ? rows : '<tr><td colspan="3">' +
        C.empty('لا يوجد حساب دخول لهذه الجهة بعد') + '</td></tr>') +
      '</tbody></table></div>';

    openModal('بوابة الجهة: ' + c.name, body,
      '<button class="btn" data-close>إغلاق</button>', null);

    if (!canEdit) return;

    $('#pu_gen').onclick = function (e) {
      e.preventDefault();
      var abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      var out = '';
      var arr = new Uint32Array(12);
      crypto.getRandomValues(arr);
      for (var i = 0; i < 12; i++) out += abc[arr[i] % abc.length];
      $('#pu_pass').value = out;
      $('#pu_pass').select();
    };

    $('#puSave').onclick = function () {
      var email = $('#pu_email').value.trim();
      var pass = $('#pu_pass').value;
      if (!email) { toast('البريد مطلوب', true); return; }
      if (!pass || pass.length < 6) { toast('كلمة المرور ٦ أحرف على الأقل', true); return; }
      run(function () { return S.createPortalAccount(c.id, email, pass); }, 'تم إنشاء الحساب')
        .then(function () { portalForm(c.id); });
    };

    $('#modalBody').onclick = function (ev) {
      var d = ev.target.closest('[data-pu-del]');
      if (d) {
        confirmBox('إلغاء وصول هذا الحساب إلى بوابة الجهة؟', function () {
          run(function () { return S.removePortalAccount(d.dataset.puDel); }, 'تم الإلغاء')
            .then(function () { portalForm(c.id); });
        });
      }
    };
  }

  /* نافذة سريعة: كم المستحق؟ وهل تم السداد؟ — لجهة وشهر محددين */
  function payDueForm(clientId, period) {
    var c = S.db.clients.find(function (x) { return x.id === clientId; });
    if (!c) return;
    var d = S.dueOf(c.id, period);
    var computed = c.feeType && c.feeType !== 'fixed';
    var defAmount = d ? d.amountDue : (computed ? '' : S.computeFee(c, 0).total);
    var st = S.dueState(d);
    var stateVal = st === 'paid' ? 'full' : st === 'partial' ? 'partial' : 'no';

    var body =
      '<div class="form-grid">' +
        '<div class="field full"><label>' + F.esc(c.name) + ' — ' + F.arMonth(period.slice(0, 7)) + '</label>' +
          '<span class="hint">نموذج الأتعاب: ' + F.esc(feeDesc(c)) + '</span></div>' +
        (computed
          ? field('إيراد الشهر (ر.س)',
              '<input type="number" id="p_rev" min="0" step="0.01" value="' +
              (d && d.revenueBase ? d.revenueBase : '') + '" placeholder="0.00">',
              'أدخل الإيراد المحقق ويُحسب المستحق تلقائياً')
          : '') +
        field('كم المستحق؟ (شامل الضريبة)',
          '<input type="number" id="p_amount" min="0" step="0.01" value="' + defAmount + '">') +
        '<div class="field"><label>هل تم السداد؟</label><select id="p_state">' +
          '<option value="no"' + (stateVal === 'no' ? ' selected' : '') + '>لا — لم يُسدَّد</option>' +
          '<option value="full"' + (stateVal === 'full' ? ' selected' : '') + '>نعم — بالكامل</option>' +
          '<option value="partial"' + (stateVal === 'partial' ? ' selected' : '') + '>سداد جزئي</option>' +
        '</select></div>' +
        '<div class="field" id="p_wrap_paid"><label>المبلغ المسدَّد (ر.س)</label>' +
          '<input type="number" id="p_paid" min="0" step="0.01" value="' + (d ? d.amountPaid : 0) + '"></div>' +
        '<div class="field" id="p_wrap_date"><label>تاريخ السداد</label>' +
          dateField('p_date', d && d.paidDate ? d.paidDate : '') + '</div>' +
        '<div class="field full"><label>ملاحظة</label>' +
          '<input id="p_note" value="' + F.esc(d ? d.note : '') + '" placeholder="اختياري"></div>' +
        '<div class="field full" id="p_prev" style="background:var(--bg);padding:12px;border-radius:10px"></div>' +
      '</div>';

    openModal('سداد ' + F.arMonth(period.slice(0, 7)), body,
      '<button class="btn btn-primary" id="modalSave">حفظ</button>' +
      (d ? '<button class="btn btn-danger" id="p_del">حذف مستحق الشهر</button>' : '') +
      '<button class="btn" data-close>إلغاء</button>',
      function () {
        var amount = parseFloat($('#p_amount').value) || 0;
        if (!(amount > 0)) { toast('أدخل المستحق', true); return; }
        var sv = $('#p_state').value;
        var paid = sv === 'full' ? amount : sv === 'no' ? 0 : (parseFloat($('#p_paid').value) || 0);
        if (paid > amount) { toast('المبلغ المسدَّد أكبر من المستحق', true); return; }
        var pd = fromDisplayDate($('#p_date').value);
        if (sv !== 'no' && !pd) pd = S.todayISO();
        closeModal();
        run(function () {
          return S.saveDue({
            clientId: c.id, period: period,
            amountDue: amount, amountPaid: paid,
            revenueBase: computed ? (parseFloat($('#p_rev') && $('#p_rev').value) || 0) : 0,
            paidDate: sv === 'no' ? null : pd,
            note: $('#p_note').value
          });
        }, 'تم حفظ سداد ' + F.arMonth(period.slice(0, 7)));
      });

    function sync() {
      var sv = $('#p_state').value;
      var amount = parseFloat($('#p_amount').value) || 0;
      if (computed) {
        var rev = parseFloat($('#p_rev').value) || 0;
        if (rev > 0) {
          var f = S.computeFee(c, rev);
          $('#p_amount').value = f.total.toFixed(2);
          amount = f.total;
        }
      }
      $('#p_wrap_paid').style.display = sv === 'partial' ? '' : 'none';
      $('#p_wrap_date').style.display = sv === 'no' ? 'none' : '';
      if (sv === 'full') $('#p_paid').value = amount.toFixed(2);
      if (sv === 'no') $('#p_paid').value = '0';
      var paid = sv === 'full' ? amount : sv === 'no' ? 0 : (parseFloat($('#p_paid').value) || 0);
      var rest = Math.round((amount - paid) * 100) / 100;
      $('#p_prev').innerHTML = '<div style="font-size:12.5px">المستحق <strong class="num">' +
        F.money(amount) + '</strong> · المسدَّد <strong class="num">' + F.money(paid) +
        '</strong> · المتبقي <strong class="num" style="color:' +
        (rest > 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(rest) + ' ر.س</strong></div>';
    }
    $('#modalBody').onchange = sync;
    ['p_amount', 'p_paid'].forEach(function (id) { $('#' + id).addEventListener('input', sync); });
    if (computed) $('#p_rev').addEventListener('input', sync);
    sync();

    $('#modalBody').onclick = function (ev) {
      var dp = ev.target.closest('[data-dp]');
      if (dp) {
        var nat = $('#' + dp.dataset.dp + '_n');
        if (nat.showPicker) { try { nat.showPicker(); } catch (e) { nat.focus(); } }
        else { nat.focus(); nat.click(); }
      }
    };
    if (d) {
      $('#p_del').onclick = function () {
        closeModal();
        confirmBox('حذف مستحق ' + F.arMonth(period.slice(0, 7)) + ' لهذه الجهة؟', function () {
          run(function () { return S.deleteDue(d.id); }, 'تم الحذف');
        });
      };
    }
  }

  function clientForm(existing) {
    var c = existing || {
      entityId: '', name: '', contractStatus: 'active',
      contractStart: '', contractEnd: '', monthlyAmount: '', note: '',
      feeType: 'fixed', feePercent: '', feeDeductPercent: '', feeMarkupPercent: ''
    };
    var ft = c.feeType || 'fixed';
    var body =
      '<div class="form-grid">' +
        field('اسم الجهة', '<input id="cl_name" value="' + F.esc(c.name) + '" placeholder="مثال: جمعية الرأفة الطبية">') +
        '<div class="field"><label>طريقة احتساب الأتعاب</label><select id="cl_feetype">' +
          '<option value="fixed"' + (ft === 'fixed' ? ' selected' : '') + '>مبلغ شهري ثابت</option>' +
          '<option value="percent"' + (ft === 'percent' ? ' selected' : '') + '>نسبة من الإيراد</option>' +
          '<option value="net_markup"' + (ft === 'net_markup' ? ' selected' : '') + '>خصم ثم هامش على الإيراد</option>' +
        '</select><span class="hint">الضريبة تُضاف تلقائياً على الناتج</span></div>' +
        '<div class="field" id="wrap_fixed">' +
          '<label>المبلغ الشهري (ر.س)</label>' +
          '<input type="number" id="cl_amount" min="0" step="0.01" value="' + c.monthlyAmount + '" placeholder="0.00">' +
          '<span class="hint">قبل الضريبة</span></div>' +
        '<div class="field" id="wrap_pct">' +
          '<label>النسبة من الإيراد (%)</label>' +
          '<input type="number" id="cl_pct" min="0" max="100" step="0.1" value="' + c.feePercent + '" placeholder="20">' +
        '</div>' +
        '<div class="field" id="wrap_ded">' +
          '<label>يُخصم من الإجمالي (%)</label>' +
          '<input type="number" id="cl_ded" min="0" max="100" step="0.1" value="' + c.feeDeductPercent + '" placeholder="2.5">' +
        '</div>' +
        '<div class="field" id="wrap_mk">' +
          '<label>ثم يُضاف هامش (%)</label>' +
          '<input type="number" id="cl_mk" min="0" max="1000" step="0.1" value="' + c.feeMarkupPercent + '" placeholder="28">' +
        '</div>' +
        '<div class="field full" id="feePreview" style="background:var(--bg);padding:12px;border-radius:10px"></div>' +
        '<div class="field"><label>حالة العقد</label><select id="cl_status">' +
          '<option value="active"' + (c.contractStatus === 'active' ? ' selected' : '') + '>ساري</option>' +
          '<option value="pending"' + (c.contractStatus === 'pending' ? ' selected' : '') + '>قيد توقيع العقد</option>' +
          '<option value="paused"' + (c.contractStatus === 'paused' ? ' selected' : '') + '>موقوف مؤقتاً</option>' +
          '<option value="ended"' + (c.contractStatus === 'ended' ? ' selected' : '') + '>منتهي</option>' +
        '</select></div>' +
        field('ربط بمنشأة (اختياري)', sel('cl_entity',
          [['', '— بدون ربط —']].concat(S.db.entities.map(function (x) { return [x.id, x.name]; })),
          c.entityId || '')) +
        field('بداية العقد', '<input type="date" lang="en-GB" id="cl_start" value="' + (c.contractStart || '') + '">') +
        field('نهاية العقد', '<input type="date" lang="en-GB" id="cl_end" value="' + (c.contractEnd || '') + '">') +
        '<div class="field full"><label>ملاحظات</label>' +
          '<textarea id="cl_note" rows="2" placeholder="اختياري">' + F.esc(c.note || '') + '</textarea></div>' +
      '</div>';

    openModal(existing ? 'تعديل عميل' : 'عميل جديد', body,
      '<button class="btn btn-primary" id="modalSave">حفظ</button>' +
      '<button class="btn" data-close>إلغاء</button>',
      function () {
        var name = $('#cl_name').value.trim();
        if (!name) { toast('اسم الجهة مطلوب', true); return; }
        var rec = {
          name: name, monthlyAmount: $('#cl_amount').value, contractStatus: $('#cl_status').value,
          entityId: $('#cl_entity').value || null,
          contractStart: $('#cl_start').value || null, contractEnd: $('#cl_end').value || null,
          note: $('#cl_note').value,
          feeType: $('#cl_feetype').value,
          feePercent: $('#cl_pct').value || 0,
          feeDeductPercent: $('#cl_ded').value || 0,
          feeMarkupPercent: $('#cl_mk').value || 0
        };
        closeModal();
        if (existing) { run(function () { return S.updateClient(existing.id, rec); }, 'تم تحديث العميل'); }
        else { run(function () { return S.addClient(rec); }, 'تمت إضافة العميل'); }
      });

    /* إظهار الحقول المناسبة لنموذج الأتعاب + معاينة حية على مبلغ افتراضي */
    function syncFee() {
      var t = $('#cl_feetype').value;
      $('#wrap_fixed').style.display = t === 'fixed' ? '' : 'none';
      $('#wrap_pct').style.display   = t === 'percent' ? '' : 'none';
      $('#wrap_ded').style.display   = t === 'net_markup' ? '' : 'none';
      $('#wrap_mk').style.display    = t === 'net_markup' ? '' : 'none';

      var draft = {
        feeType: t, monthlyAmount: $('#cl_amount').value,
        feePercent: $('#cl_pct').value, feeDeductPercent: $('#cl_ded').value,
        feeMarkupPercent: $('#cl_mk').value
      };
      if (t === 'fixed') {
        var f = S.computeFee(draft, 0);
        $('#feePreview').innerHTML = '<div style="font-size:12.5px">المطلوب شهرياً: <strong class="num">' +
          F.money(f.total) + ' ر.س</strong> <span class="hint">(' + F.money(f.base) +
          ' + ضريبة ' + F.money(f.vat) + ')</span></div>';
      } else {
        var sample = 10000;
        var r = S.computeFee(draft, sample);
        $('#feePreview').innerHTML = '<div style="font-size:12.5px">مثال: لو كان إيراد الشهر <strong class="num">' +
          F.money(sample) + ' ر.س</strong> → المطلوب <strong class="num">' + F.money(r.total) +
          ' ر.س</strong> <span class="hint">(' + F.money(r.base) + ' + ضريبة ' + F.money(r.vat) + ')</span></div>';
      }
    }
    $('#modalBody').onchange = syncFee;
    ['cl_amount', 'cl_pct', 'cl_ded', 'cl_mk'].forEach(function (id) {
      $('#' + id).addEventListener('input', syncFee);
    });
    syncFee();
  }

  /** نافذة تفاصيل عميل: تبقى مفتوحة وتُحدَّث ذاتياً بعد كل عملية */
  function openClientDetail(clientId) {
    var c = S.db.clients.find(function (x) { return x.id === clientId; });
    if (!c) { closeModal(); return; }
    var s = S.clientSummary(c);
    var dues = S.clientDuesOf(c.id);
    var canEdit = S.canWrite();

    var computed = c.feeType && c.feeType !== 'fixed';

    var dueRows = dues.map(function (d) {
      var st = d.amountPaid >= d.amountDue && d.amountDue > 0 ? 'paid'
             : d.amountPaid > 0 ? 'partial' : 'unpaid';
      var rest = Math.round((d.amountDue - d.amountPaid) * 100) / 100;
      return '<tr>' +
        '<td>' + F.arMonth(d.period.slice(0, 7)) + '</td>' +
        (computed ? '<td class="num">' + (d.revenueBase > 0 ? F.money(d.revenueBase) : '—') + '</td>' : '') +
        '<td class="num">' + F.money(d.amountDue) + '</td>' +
        '<td class="num">' + F.money(d.amountPaid) + '</td>' +
        '<td class="num" style="font-weight:700;color:' +
          (rest > 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(rest) + '</td>' +
        '<td>' + badge(DUE_LABEL[st], DUE_COLOR[st]) + '</td>' +
        '<td class="num">' + (d.paidDate ? F.arDate(d.paidDate) : '—') + '</td>' +
        '<td>' + (canEdit ? '<div class="t-actions">' +
          (rest > 0 ? '<button class="btn btn-sm btn-primary" data-due-pay="' + d.id + '">تم السداد</button>' : '') +
          '<button class="btn btn-sm" data-due-edit="' + d.id + '">تعديل</button>' +
          '<button class="btn btn-sm btn-danger" data-due-del="' + d.id + '">حذف</button>' +
        '</div>' : '—') + '</td></tr>';
    }).join('');

    var body =
      '<div class="recon mb" style="padding:14px;background:var(--bg);border-radius:12px">' +
        '<div><span class="k">إجمالي المطلوب</span><span class="v num">' + F.money(s.totalDue) + ' ر.س</span></div>' +
        '<div><span class="k">إجمالي المدفوع</span><span class="v num">' + F.money(s.totalPaid) + ' ر.س</span></div>' +
        '<div><span class="k">المتأخر</span><span class="v num" style="color:' +
          (s.overdue > 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(s.overdue) + ' ر.س</span></div>' +
        '<div><span class="k">حالة العقد</span><span class="v">' +
          badge(STATUS_LABEL[s.effectiveStatus], STATUS_COLOR[s.effectiveStatus]) + '</span></div>' +
      '</div>' +
      (canEdit ?
        '<div class="form-grid mb" style="padding:14px;border:1px dashed var(--line);border-radius:12px">' +
          '<div class="field full"><label>تسجيل / تحديث مستحق شهر</label>' +
            '<span class="hint">نموذج الأتعاب: ' + F.esc(feeDesc(c)) + '</span></div>' +
          field('الشهر', '<input type="month" id="due_period" value="' + S.currentPeriod().slice(0, 7) + '">') +
          (computed
            ? field('إيراد الشهر (ر.س)',
                '<input type="number" id="due_revenue" min="0" step="0.01" value="" placeholder="0.00">',
                'أدخل الإيراد المحقق ويُحسب المطلوب تلقائياً')
            : '') +
          field('المطلوب شامل الضريبة (ر.س)',
            '<input type="number" id="due_amount" min="0" step="0.01" value="">') +
          '<div class="field"><label>هل تم السداد؟</label><select id="due_state">' +
            '<option value="no">لا — لم يُسدَّد</option>' +
            '<option value="full">نعم — سُدِّد بالكامل</option>' +
            '<option value="partial">سداد جزئي</option>' +
          '</select></div>' +
          '<div class="field" id="wrap_paid"><label>المبلغ المسدَّد (ر.س)</label>' +
            '<input type="number" id="due_paid" min="0" step="0.01" value="0"></div>' +
          '<div class="field" id="wrap_paiddate"><label>تاريخ السداد</label>' +
            dateField('due_paiddate', '') + '</div>' +
          '<div class="field full" id="duePreview" style="background:var(--bg);padding:12px;border-radius:10px"></div>' +
          '<div class="field full"><button class="btn btn-primary" id="dueSaveBtn" type="button">حفظ المستحق</button>' +
            '<button class="btn" id="dueResetBtn" type="button" style="margin-inline-start:8px">تفريغ الحقول</button></div>' +
        '</div>' : '') +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>الشهر</th>' + (computed ? '<th>الإيراد</th>' : '') +
        '<th>المطلوب</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>تاريخ السداد</th><th></th>' +
      '</tr></thead><tbody>' +
      (dues.length ? dueRows
        : '<tr><td colspan="' + (computed ? 8 : 7) + '">' +
          C.empty('لا توجد مستحقات مسجّلة بعد') + '</td></tr>') +
      '</tbody></table></div>';

    openModal('تفاصيل: ' + c.name, body,
      (canEdit ? '<button class="btn" data-edit-client="' + c.id + '">تعديل بيانات العميل</button>' : '') +
      '<button class="btn" data-close>إغلاق</button>',
      null);

    if (!canEdit) return;

    /* الإيراد يحسب المطلوب تلقائياً، وحالة السداد تتحكم بحقلَي المبلغ والتاريخ */
    function syncDue() {
      var state = $('#due_state').value;
      var amount = parseFloat($('#due_amount').value) || 0;

      if (computed) {
        var rev = parseFloat($('#due_revenue').value) || 0;
        if (rev > 0) {
          var f = S.computeFee(c, rev);
          $('#due_amount').value = f.total.toFixed(2);
          amount = f.total;
          $('#duePreview').innerHTML =
            '<div style="font-size:12.5px">إيراد ' + F.money(rev) + ' ر.س → أتعاب ' +
            '<strong class="num">' + F.money(f.base) + '</strong> + ضريبة ' +
            '<strong class="num">' + F.money(f.vat) + '</strong> = المطلوب ' +
            '<strong class="num">' + F.money(f.total) + ' ر.س</strong></div>';
        }
      }

      $('#wrap_paid').style.display = state === 'partial' ? '' : 'none';
      $('#wrap_paiddate').style.display = state === 'no' ? 'none' : '';
      if (state === 'full') $('#due_paid').value = amount.toFixed(2);
      if (state === 'no') $('#due_paid').value = '0';

      if (!computed || !(parseFloat($('#due_revenue') && $('#due_revenue').value) > 0)) {
        var paid = state === 'full' ? amount
                 : state === 'no' ? 0 : (parseFloat($('#due_paid').value) || 0);
        var rest = Math.round((amount - paid) * 100) / 100;
        $('#duePreview').innerHTML =
          '<div style="font-size:12.5px">المطلوب <strong class="num">' + F.money(amount) +
          '</strong> · المسدَّد <strong class="num">' + F.money(paid) +
          '</strong> · المتبقي <strong class="num" style="color:' +
          (rest > 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(rest) + ' ر.س</strong></div>';
      }
    }

    $('#dueSaveBtn').onclick = function () {
      var period = $('#due_period').value;
      if (!period) { toast('حدّد الشهر', true); return; }
      var amount = parseFloat($('#due_amount').value) || 0;
      if (!(amount > 0)) { toast('أدخل المبلغ المطلوب', true); return; }

      var state = $('#due_state').value;
      var paid = state === 'full' ? amount
               : state === 'no' ? 0 : (parseFloat($('#due_paid').value) || 0);
      if (paid > amount) { toast('المبلغ المسدَّد أكبر من المطلوب', true); return; }

      var pd = fromDisplayDate($('#due_paiddate').value);
      if (state !== 'no' && !pd) pd = S.todayISO();

      run(function () {
        return S.saveDue({
          clientId: c.id, period: period + '-01',
          amountDue: amount, amountPaid: paid,
          revenueBase: computed ? ($('#due_revenue').value || 0) : 0,
          paidDate: state === 'no' ? null : pd
        });
      }, 'تم حفظ المستحق').then(function () { openClientDetail(c.id); });
    };

    $('#dueResetBtn').onclick = function () {
      $('#due_period').value = S.currentPeriod().slice(0, 7);
      $('#due_amount').value = '';
      $('#due_paid').value = '0';
      $('#due_paiddate').value = '';
      $('#due_state').value = 'no';
      if (computed) $('#due_revenue').value = '';
      syncDue();
    };

    $('#modalBody').onchange = syncDue;
    ['due_amount', 'due_paid'].forEach(function (id) {
      $('#' + id).addEventListener('input', syncDue);
    });
    if (computed) $('#due_revenue').addEventListener('input', syncDue);
    syncDue();

    $('#modalBody').onclick = function (ev) {
      /* زر التقويم داخل النافذة */
      var dp = ev.target.closest('[data-dp]');
      if (dp) {
        var nat = $('#' + dp.dataset.dp + '_n');
        if (nat.showPicker) { try { nat.showPicker(); } catch (err) { nat.focus(); } }
        else { nat.focus(); nat.click(); }
        return;
      }

      /* تسجيل سداد كامل بضغطة واحدة */
      var dp2 = ev.target.closest('[data-due-pay]');
      if (dp2) {
        var dd2 = dues.find(function (x) { return x.id === dp2.dataset.duePay; });
        if (dd2) {
          run(function () {
            return S.saveDue({
              clientId: c.id, period: dd2.period,
              amountDue: dd2.amountDue, amountPaid: dd2.amountDue,
              revenueBase: dd2.revenueBase, paidDate: S.todayISO(),
              note: dd2.note
            });
          }, 'تم تسجيل السداد بالكامل').then(function () { openClientDetail(c.id); });
        }
        return;
      }

      var de = ev.target.closest('[data-due-edit]');
      if (de) {
        var d = dues.find(function (x) { return x.id === de.dataset.dueEdit; });
        if (d) {
          $('#due_period').value = d.period.slice(0, 7);
          $('#due_amount').value = d.amountDue;
          $('#due_paid').value = d.amountPaid;
          $('#due_paiddate').value = toDisplayDate(d.paidDate);
          if (computed) $('#due_revenue').value = d.revenueBase || '';
          $('#due_state').value = d.amountPaid <= 0 ? 'no'
            : d.amountPaid >= d.amountDue ? 'full' : 'partial';
          syncDue();
          $('#due_period').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      var dd = ev.target.closest('[data-due-del]');
      if (dd) {
        confirmBox('حذف مستحق هذا الشهر نهائياً؟', function () {
          run(function () { return S.deleteDue(dd.dataset.dueDel); }, 'تم الحذف')
            .then(function () { openClientDetail(c.id); });
        });
        return;
      }
    };

    $('#modalFoot').onclick = function (ev) {
      if (ev.target.closest('[data-edit-client]')) { closeModal(); clientForm(c); }
    };
  }

  /* ============================================================
     الموجّه
     ============================================================ */
  var VIEWS = {
    dashboard: viewDashboard, entries: viewEntries, invoices: viewInvoices,
    monthly: viewMonthly, channels: viewChannels, entities: viewEntities,
    team: viewTeam, tax: viewTaxReport, clients: viewClients, orgs: viewOrgs,
    log: viewLog, settings: viewSettings
  };

  function render() {
    var sel2 = $('#entityFilter');
    sel2.innerHTML = '<option value="all">كل المنشآت</option>' +
      S.db.entities.map(function (e) {
        return '<option value="' + e.id + '">' + F.esc(e.name) + '</option>';
      }).join('');
    sel2.value = state.entityId;

    $('#currentUser').innerHTML = F.esc(S.me.email) +
      '<span class="role-badge">' + F.esc(S.roleName(S.me.role)) + '</span>';
    $$('.nav-item').forEach(function (a) {
      a.classList.toggle('active', a.dataset.view === state.view);
    });

    var banner = S.canWrite() ? '' :
      '<div class="readonly-bar">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'style="width:17px;height:17px"><rect x="3" y="11" width="18" height="11" rx="2"/>' +
        '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
        'صلاحيتك «مشاهد فقط» — تقدر تطّلع على كل التقارير لكن لا يمكنك الإضافة أو التعديل.' +
      '</div>';

    $('#viewHost').innerHTML = banner + (VIEWS[state.view] || viewDashboard)();
    window.scrollTo(0, 0);
  }

  /** يغلّف عملية غير متزامنة برسالة خطأ موحّدة */
  async function run(fn, okMsg) {
    try {
      await fn();
      if (okMsg) toast(okMsg);
      render();
      return true;
    } catch (e) {
      toast(e.message || 'تعذّر إتمام العملية', true);
      return false;
    }
  }


  /* ============================================================
     الأحداث
     ============================================================ */
  $('#nav').addEventListener('click', function (e) {
    var it = e.target.closest('.nav-item');
    if (!it) return;
    state.view = it.dataset.view;
    closeSidebar();
    render();
  });

  $('#entityFilter').addEventListener('change', function (e) {
    state.entityId = e.target.value;
    render();
  });

  /* تبديل الوضع الليلي — يُحفظ محلياً لكل متصفح */
  $('#themeBtn').addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('afnad-theme', dark ? 'light' : 'dark'); } catch (e) {}
    // الرسوم البيانية تُبنى بألوان محسوبة، فنعيد رسم الواجهة
    render();
  });

  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#backdrop').classList.remove('show');
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('#menuBtn')) {
      $('#sidebar').classList.add('open');
      $('#backdrop').classList.add('show');
    }
    if (e.target.id === 'backdrop') closeSidebar();
    if (e.target.closest('#logoutBtn') || e.target.closest('#logoutBtn2')) doLogout();
  });

  async function doLogout() {
    await S.signOut();
    $('#appRoot').hidden = true;
    showAuth();
  }

  /* --- اختيار شهر أو سنة محددة (تفويض) --- */
  $('#viewHost').addEventListener('change', function (e) {
    /* اختيار تاريخ من النافذة الأصلية ينعكس على الحقل النصي */
    if (e.target.classList.contains('dp-native')) {
      var txt = $('#' + e.target.id.replace(/_n$/, ''));
      if (txt) txt.value = toDisplayDate(e.target.value);
      return;
    }
    if (e.target.id === 'jumpMonth') {
      if (!e.target.value) return;
      state.preset = 'month'; state.month = e.target.value;
      render(); return;
    }
    if (e.target.id === 'jumpYear') {
      if (!e.target.value) return;
      state.preset = 'year'; state.year = e.target.value;
      render(); return;
    }
  });

  /* --- أحداث المحتوى (تفويض) --- */
  $('#viewHost').addEventListener('click', async function (e) {
    var t = e.target;

    /* ---------- الفترات ---------- */
    var chip = t.closest('[data-preset]');
    if (chip) { state.preset = chip.dataset.preset; render(); return; }

    var dpBtn = t.closest('[data-dp]');
    if (dpBtn) {
      var nat = $('#' + dpBtn.dataset.dp + '_n');
      if (nat.showPicker) { try { nat.showPicker(); } catch (err) { nat.focus(); } }
      else { nat.focus(); nat.click(); }
      return;
    }

    if (t.closest('#applyRange')) {
      var f = fromDisplayDate($('#fromDate').value), to = fromDisplayDate($('#toDate').value);
      if (!f || !to) { toast('اكتب التاريخ بصيغة يوم/شهر/سنة — مثال 01/09/2026', true); return; }
      if (f > to) { toast('تاريخ البداية بعد تاريخ النهاية', true); return; }
      state.preset = 'custom'; state.from = f; state.to = to;
      render(); return;
    }

    /* ---------- الإدخالات ---------- */
    if (t.closest('[data-add-entry]')) { entryForm(null); return; }

    var ed = t.closest('[data-edit]');
    if (ed) {
      var rec = S.db.entries.find(function (x) { return x.id === ed.dataset.edit; });
      if (rec) entryForm(rec);
      return;
    }

    var dl = t.closest('[data-del]');
    if (dl) {
      confirmBox('سيتم حذف هذا الإدخال نهائياً. هل أنت متأكد؟', function () {
        run(function () { return S.deleteEntry(dl.dataset.del); }, 'تم الحذف');
      });
      return;
    }

    var dr = t.closest('[data-drill]');
    if (dr) { state.view = 'entries'; render(); return; }

    /* ---------- الفواتير ---------- */
    if (t.closest('[data-add-inv]')) { invoiceForm(null); return; }

    var idc = t.closest('[data-invdir]');
    if (idc) { state.invDir = idc.dataset.invdir; render(); return; }
    var isc = t.closest('[data-invst]');
    if (isc) { state.invStatus = isc.dataset.invst; render(); return; }

    var ive = t.closest('[data-inv-edit]');
    if (ive) {
      var iv = S.db.invoices.find(function (x) { return x.id === ive.dataset.invEdit; });
      if (iv) invoiceForm(iv);
      return;
    }
    var ivp = t.closest('[data-inv-pay]');
    if (ivp) {
      run(function () { return S.updateInvoice(ivp.dataset.invPay, { status: 'paid' }); },
          'تم تسجيل الفاتورة كمسدّدة');
      return;
    }
    var ivd = t.closest('[data-inv-del]');
    if (ivd) {
      confirmBox('سيتم حذف هذه الفاتورة نهائياً وسيتغيّر الرصيد. هل أنت متأكد؟', function () {
        run(function () { return S.deleteInvoice(ivd.dataset.invDel); }, 'تم الحذف');
      });
      return;
    }
    if (t.closest('#openingBtn')) {
      openModal('الرصيد الافتتاحي',
        '<div class="form-grid">' +
          '<div class="field full"><label>اسم الحساب البنكي</label>' +
            '<input id="o_bank" value="' + F.esc(S.db.settings.bankName || '') +
            '" placeholder="مثال: الحساب الرئيسي — الراجحي"></div>' +
          '<div class="field full"><label>الرصيد الافتتاحي (ر.س)</label>' +
            '<input type="number" id="o_open" step="0.01" value="' +
            (S.db.settings.openingBalance || 0) + '">' +
            '<span class="hint">الرصيد الموجود في حسابك قبل تسجيل أي فاتورة. ' +
            'كل الحسابات تُبنى عليه.</span></div>' +
        '</div>',
        '<button class="btn btn-primary" id="modalSave">حفظ</button>' +
        '<button class="btn" data-close>إلغاء</button>',
        function () {
          var bank = $('#o_bank').value, open = $('#o_open').value;
          closeModal();
          run(function () { return S.saveSettings(open, bank); }, 'تم حفظ الرصيد الافتتاحي');
        });
      return;
    }
    if (t.closest('#expInvCSV')) {
      var rI = computeRange();
      var li = S.queryInvoices(rI.from, rI.to, state.entityId, state.invDir, state.invStatus);
      if (!li.length) { toast('لا توجد فواتير للتصدير', true); return; }
      download(S.exportInvoicesCSV(li),
        'الفواتير-' + rI.from + '-الى-' + rI.to + '.csv', 'text/csv;charset=utf-8');
      toast('تم تنزيل الملف');
      return;
    }

    /* ---------- القنوات ---------- */
    if (t.closest('#addCh')) { channelForm(null); return; }
    var ce = t.closest('[data-ch-edit]');
    if (ce) {
      channelForm(S.db.channels.find(function (x) { return x.id === ce.dataset.chEdit; }));
      return;
    }
    var cd = t.closest('[data-ch-del]');
    if (cd) {
      try {
        var res = await S.deleteChannel(cd.dataset.chDel);
        if (!res.ok) toast(res.reason, true); else { toast('تم حذف القناة'); render(); }
      } catch (err) { toast(err.message, true); }
      return;
    }

    /* ---------- المنشآت ---------- */
    if (t.closest('#addEnt')) {
      openModal('منشأة جديدة',
        '<div class="field"><label>اسم المنشأة</label>' +
        '<input id="ent_name" placeholder="مثال: الفرع الثاني"></div>',
        '<button class="btn btn-primary" id="modalSave">حفظ</button>' +
        '<button class="btn" data-close>إلغاء</button>',
        function () {
          var v = $('#ent_name').value.trim();
          if (!v) { toast('الاسم مطلوب', true); return; }
          closeModal();
          run(function () { return S.addEntity(v); }, 'تمت الإضافة');
        });
      return;
    }
    var ee = t.closest('[data-ent-edit]');
    if (ee) {
      var ent = S.db.entities.find(function (x) { return x.id === ee.dataset.entEdit; });
      openModal('تعديل منشأة',
        '<div class="field"><label>اسم المنشأة</label><input id="ent_name" value="' +
          F.esc(ent.name) + '"></div>',
        '<button class="btn btn-primary" id="modalSave">حفظ</button>' +
        '<button class="btn" data-close>إلغاء</button>',
        function () {
          var v = $('#ent_name').value.trim();
          if (!v) { toast('الاسم مطلوب', true); return; }
          closeModal();
          run(function () { return S.updateEntity(ent.id, v); }, 'تم التحديث');
        });
      return;
    }
    var edl = t.closest('[data-ent-del]');
    if (edl) {
      try {
        var r2 = await S.deleteEntity(edl.dataset.entDel);
        if (!r2.ok) toast(r2.reason, true);
        else {
          if (state.entityId === edl.dataset.entDel) state.entityId = 'all';
          toast('تم حذف المنشأة'); render();
        }
      } catch (err2) { toast(err2.message, true); }
      return;
    }

    /* ---------- الفريق ---------- */
    if (t.closest('#inviteBtn')) {
      openModal('دعوة عضو للفريق',
        '<div class="form-grid">' +
          '<div class="field full"><label>البريد الإلكتروني للعضو</label>' +
            '<input type="email" id="inv_email" dir="ltr" placeholder="name@company.com">' +
            '<span class="hint">لازم يكون عنده حساب في النظام مسبقاً — ' +
            'اطلب منه يفتح الرابط وينشئ حساب أولاً.</span></div>' +
          '<div class="field full"><label>الصلاحية</label>' +
            '<select id="inv_role">' +
              '<option value="member">عضو — إدخال وتعديل وحذف</option>' +
              '<option value="admin">مدير — كل شي + دعوة أعضاء</option>' +
              '<option value="viewer">مشاهد فقط — اطّلاع بدون تعديل</option>' +
            '</select></div>' +
        '</div>',
        '<button class="btn btn-primary" id="modalSave">إضافة</button>' +
        '<button class="btn" data-close>إلغاء</button>',
        async function () {
          var em = $('#inv_email').value.trim(), rl = $('#inv_role').value;
          if (!em) { toast('البريد مطلوب', true); return; }
          var r = await S.inviteMember(em, rl);
          if (!r.ok) { toast(r.reason, true); return; }
          closeModal();
          run(function () { return S.sync(); }, 'تمت إضافة العضو');
        });
      return;
    }
    var md = t.closest('[data-mem-del]');
    if (md) {
      confirmBox('سيتم إزالة هذا العضو من المنشأة ولن يعود يشوف البيانات. متأكد؟', async function () {
        var r = await S.removeMember(md.dataset.memDel);
        if (!r.ok) toast(r.reason, true); else { toast('تمت الإزالة'); render(); }
      });
      return;
    }
    if (t.closest('#copyLink')) {
      var inp = $('#shareLink');
      inp.select();
      navigator.clipboard.writeText(inp.value).then(function () {
        toast('تم نسخ الرابط');
      }, function () { toast('انسخ الرابط يدوياً', true); });
      return;
    }

    /* ---------- التصدير والإعدادات ---------- */
    if (t.closest('#expCSV')) {
      var rr = computeRange();
      var list = S.query(rr.from, rr.to, state.entityId);
      if (!list.length) { toast('لا توجد بيانات للتصدير', true); return; }
      download(S.exportCSV(list),
        'تقرير-التسويق-' + rr.from + '-الى-' + rr.to + '.csv', 'text/csv;charset=utf-8');
      toast('تم تنزيل الملف');
      return;
    }
    if (t.closest('#dlJSON')) {
      download(S.exportJSON(), 'نسخة-احتياطية-' + S.todayISO() + '.json', 'application/json');
      toast('تم تنزيل النسخة الاحتياطية');
      return;
    }
    if (t.closest('#saveSet')) {
      var b = $('#setBank').value, o = $('#setOpening').value;
      run(function () { return S.saveSettings(o, b); }, 'تم الحفظ');
      return;
    }
    if (t.closest('#saveVat')) {
      var vd = $('#setVatDate').value || null;
      var vr = (parseFloat($('#setVatRate').value) || 0) / 100;
      run(function () {
        return S.saveSettings(S.db.settings.openingBalance, S.db.settings.bankName, vd, vr);
      }, 'تم حفظ إعدادات الضريبة');
      return;
    }

    /* ---------- التقرير الضريبي ---------- */
    var ty = t.closest('[data-tax-year]');
    if (ty) { state.taxYear = ty.dataset.taxYear; render(); return; }
    if (t.closest('[data-goto-tax]')) {
      e.preventDefault(); state.view = 'tax'; render(); return;
    }
    if (t.closest('[data-goto-settings]')) {
      state.view = 'settings'; render(); return;
    }

    /* ---------- متابعة العملاء ---------- */
    if (t.closest('[data-add-client]')) { clientForm(null); return; }

    var cm = t.closest('[data-cl-month]');
    if (cm) { state.clientMonth = cm.dataset.clMonth; render(); return; }
    var cy = t.closest('[data-cl-year]');
    if (cy) {
      // عند القدوم من "كل الفترات" لا يوجد شهر حالي، فنرجع لشهر اليوم
      var src = state.clientMonth && state.clientMonth !== 'all'
        ? state.clientMonth : S.currentPeriod();
      state.clientMonth = cy.dataset.clYear + '-' + src.slice(5, 7) + '-01';
      render(); return;
    }
    var cf = t.closest('[data-cl-filter]');
    if (cf) { state.clientPayFilter = cf.dataset.clFilter; render(); return; }
    if (t.closest('[data-cl-arch]')) {
      state.clientShowArchive = !state.clientShowArchive; render(); return;
    }
    var pay = t.closest('[data-pay]');
    if (pay) { payDueForm(pay.dataset.pay, state.clientMonth || S.currentPeriod()); return; }
    var rep = t.closest('[data-report]');
    if (rep) { reportForm(rep.dataset.report); return; }
    var prt = t.closest('[data-portal]');
    if (prt) { portalForm(prt.dataset.portal); return; }
    var orr = t.closest('[data-org-range]');
    if (orr) { state.orgRange = orr.dataset.orgRange; render(); return; }
    var act = t.closest('[data-acct]');
    if (act) { accountForm(act.dataset.acct); return; }
    var cod = t.closest('[data-code]');
    if (cod) {
      var cl = S.db.clients.find(function (x) { return x.id === cod.dataset.code; });
      var msg = cl && cl.portalCode
        ? 'توليد رمز جديد لـ«' + cl.name + '» سيُبطل الرمز الحالي. متابعة؟'
        : null;
      var doGen = function () {
        run(function () {
          return S.updateClient(cod.dataset.code, { portalCode: randomCode(8) });
        }, 'تم توليد الرمز');
      };
      if (msg) confirmBox(msg, doGen); else doGen();
      return;
    }
    var pud = t.closest('[data-pu-del]');
    if (pud && !t.closest('#modalBody')) {
      confirmBox('إلغاء وصول هذا الحساب إلى البوابة؟', function () {
        run(function () { return S.removePortalAccount(pud.dataset.puDel); }, 'تم الإلغاء');
      });
      return;
    }

    var ced = t.closest('[data-edit-client]');
    if (ced && !t.closest('#modalFoot')) {
      var ce = S.db.clients.find(function (x) { return x.id === ced.dataset.editClient; });
      if (ce) clientForm(ce);
      return;
    }

    var cdt = t.closest('[data-client-detail]');
    if (cdt) { openClientDetail(cdt.dataset.clientDetail); return; }
    var cdl = t.closest('[data-client-del]');
    if (cdl) {
      confirmBox('سيُحذف هذا العميل وكل سجل مستحقاته الشهرية نهائياً. هل أنت متأكد؟', function () {
        run(function () { return S.deleteClient(cdl.dataset.clientDel); }, 'تم حذف العميل');
      });
      return;
    }
    if (t.closest('[data-gen-dues]')) {
      var genPeriod = state.clientMonth || S.currentPeriod();
      try {
        var n = await S.generateDuesForPeriod(genPeriod);
        toast(n > 0 ? 'تم توليد ' + n + ' مستحق جديد' : 'كل الجهات السارية لديها مستحق لهذا الشهر بالفعل');
        render();
      } catch (genErr) { toast(genErr.message || 'تعذّر التوليد', true); }
      return;
    }
  });

  function download(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ============================================================
     تسجيل الدخول والإقلاع
     ============================================================ */
  var authMode = 'signin';

  function showAuth() {
    $('#bootScreen').hidden = true;
    $('#authScreen').hidden = false;
    $('#authMsg').hidden = true;
  }

  function authError(msg, ok) {
    var el = $('#authMsg');
    el.textContent = msg;
    el.className = 'auth-msg' + (ok ? ' ok' : '');
    el.hidden = false;
  }

  $$('.auth-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      authMode = tab.dataset.authTab;
      $$('.auth-tab').forEach(function (x) { x.classList.toggle('active', x === tab); });
      $('#authSubmit').textContent = authMode === 'signin' ? 'تسجيل الدخول' : 'إنشاء الحساب';
      $('#authPass').autocomplete = authMode === 'signin' ? 'current-password' : 'new-password';
      $('#passHint').textContent = authMode === 'signin'
        ? '٦ أحرف على الأقل' : 'اختر كلمة مرور قوية — ٦ أحرف على الأقل';
      $('#authMsg').hidden = true;
    });
  });

  $('#authForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('#authSubmit');
    var email = $('#authEmail').value.trim();
    var pass = $('#authPass').value;
    if (!email || pass.length < 6) {
      authError('أدخل بريداً صحيحاً وكلمة مرور من ٦ أحرف على الأقل');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'جارٍ…';
    $('#authMsg').hidden = true;

    try {
      var r = authMode === 'signin'
        ? await S.signIn(email, pass)
        : await S.signUp(email, pass);

      if (!r.ok) { authError(r.reason); return; }
      if (r.needsConfirm) {
        authError('أُنشئ حسابك — افتح بريدك واضغط رابط التأكيد، ثم سجّل الدخول.', true);
        return;
      }
      await boot();
    } catch (err) {
      authError(err.message || 'تعذّر تسجيل الدخول');
    } finally {
      btn.disabled = false;
      btn.textContent = authMode === 'signin' ? 'تسجيل الدخول' : 'إنشاء الحساب';
    }
  });

  async function boot() {
    $('#authScreen').hidden = true;
    $('#bootScreen').hidden = false;
    $('#bootMsg').textContent = 'جارٍ تحميل بياناتك…';
    try {
      await S.sync();
      // فتح شاشة محددة عند القدوم من بوابة المسارات (مثل marketing.html#invoices)
      var wanted = (location.hash || '').replace('#', '');
      if (wanted && VIEWS[wanted]) state.view = wanted;
      $('#bootScreen').hidden = true;
      $('#appRoot').hidden = false;
      render();
    } catch (err) {
      $('#bootScreen').hidden = true;
      showAuth();
      authError('تعذّر تحميل البيانات: ' + (err.message || ''));
    }
  }

  (async function start() {
    if (!window.SUPA_READY) {
      $('#bootMsg').innerHTML =
        'لم تُضبط مفاتيح الاتصال.<br>افتح <code>assets/js/config.js</code> وأضف Project URL و anon key.';
      return;
    }
    try {
      var u = await S.currentUser();
      if (u) await boot(); else showAuth();
    } catch (err) {
      showAuth();
    }
  })();

})();
