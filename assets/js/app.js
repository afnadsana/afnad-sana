/* ============================================================
   app.js — الموجّه والواجهات
   ============================================================ */
(function () {
  'use strict';

  var S = window.Store, F = window.Fmt, C = window.Charts;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  S.load();

  /* ---------- حالة الواجهة ---------- */
  var state = {
    view: 'dashboard',
    entityId: 'all',
    preset: 'thisMonth',
    from: null,
    to: null
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
      case 'thisMonth': return { from: S.iso(new Date(y, m, 1)), to: today };
      case 'prevMonth': return { from: S.iso(new Date(y, m - 1, 1)), to: S.iso(new Date(y, m, 0)) };
      case 'custom':    return { from: state.from, to: state.to };
      default:          return { from: S.iso(new Date(y, m, 1)), to: today };
    }
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
      ['today', 'اليوم'], ['yesterday', 'أمس'], ['last7', 'آخر 7 أيام'],
      ['thisMonth', 'الشهر الحالي'], ['prevMonth', 'الشهر السابق']
    ];
    return '<div class="filterbar">' +
      presets.map(function (p) {
        return '<button class="chip' + (state.preset === p[0] ? ' active' : '') +
               '" data-preset="' + p[0] + '">' + p[1] + '</button>';
      }).join('') +
      '<span class="spacer"></span>' +
      '<div class="date-range">' +
        '<input type="date" id="fromDate" value="' + (r.from || '') + '">' +
        '<span>إلى</span>' +
        '<input type="date" id="toDate" value="' + (r.to || '') + '">' +
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
    var pr = S.previousRange(r.from, r.to);
    var prev = S.query(pr.from, pr.to, state.entityId);

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
          '<div class="panel-body">' + C.line(S.byDay(cur, r.from, r.to)) + '</div>' +
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
             '<p>أهم المؤشرات دون الدخول في التفاصيل — مقارنة بالفترة السابقة (' +
               F.arDate(pr.from) + ' — ' + F.arDate(pr.to) + ')</p>' +
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
      money: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      pct:   '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
      trend: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>'
    };
    var good = d.dir === 'flat' ? 'flat' : (lowerIsBetter ? (d.dir === 'down' ? 'up' : 'down') : d.dir);
    return '<div class="kpi">' +
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
        field('التاريخ', '<input type="date" id="f_date" value="' + e.date + '" required>') +
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

        if (existing) { S.updateEntry(existing.id, rec); toast('تم تحديث الإدخال'); }
        else { S.addEntry(rec); toast('تمت إضافة الإدخال'); }
        closeModal();
        render();
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
        if (existing) { S.updateChannel(existing.id, { name: name, color: color, icon: ic }); toast('تم التحديث'); }
        else { S.addChannel(name, color, ic); toast('تمت الإضافة'); }
        closeModal(); render();
      });

    $('#modalBody').addEventListener('change', function (ev) {
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
    });
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
             '<p>كل إضافة أو تعديل أو حذف يُسجَّل هنا (آخر 500 عملية)</p></div></div>' +
           '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
             '<th>التاريخ والوقت</th><th>العملية</th><th>التفاصيل</th><th>المستخدم</th>' +
           '</tr></thead><tbody>' +
           (S.db.log.length ? rows : '<tr><td colspan="4">' + C.empty('السجل فارغ') + '</td></tr>') +
           '</tbody></table></div></div>';
  }

  /* ============================================================
     الإعدادات
     ============================================================ */
  function viewSettings() {
    var n = S.db.entries.length;
    return '<div class="page-head"><div><h2>الإعدادات والنسخ الاحتياطي</h2>' +
             '<p>بياناتك محفوظة داخل متصفحك فقط — احتفظ بنسخة احتياطية بانتظام</p></div></div>' +
      '<div class="grid grid-2">' +
        '<div class="panel"><div class="panel-head"><h3>النسخ الاحتياطي</h3></div><div class="panel-body">' +
          '<p style="color:var(--muted);margin-bottom:14px">حالياً لديك <strong class="num">' + n +
            '</strong> إدخال. نزّل نسخة JSON لاستعادتها لاحقاً أو نقلها لجهاز آخر.</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="btn btn-primary" id="dlJSON">تنزيل نسخة احتياطية</button>' +
            '<button class="btn" id="upJSON">استعادة من ملف</button>' +
            '<input type="file" id="fileJSON" accept=".json,application/json" style="display:none">' +
          '</div></div></div>' +
        '<div class="panel"><div class="panel-head"><h3>اسم المستخدم</h3></div><div class="panel-body">' +
          '<div class="field"><label>الاسم الظاهر في السجل</label>' +
            '<input id="userName" value="' + F.esc(S.db.user) + '"></div>' +
          '<button class="btn btn-primary" id="saveUser" style="margin-top:12px">حفظ</button>' +
        '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>بيانات تجريبية</h3></div><div class="panel-body">' +
          '<p style="color:var(--muted);margin-bottom:14px">توليد بيانات وهمية لآخر 75 يوماً لتجربة النظام. ' +
            '<strong>سيستبدل كل البيانات الحالية.</strong></p>' +
          '<button class="btn" id="seedBtn">توليد بيانات تجريبية</button></div></div>' +
        '<div class="panel" style="border-color:#f7d5dc"><div class="panel-head"><h3>منطقة الخطر</h3></div>' +
          '<div class="panel-body">' +
          '<p style="color:var(--muted);margin-bottom:14px">حذف كل الإدخالات والقنوات والسجل نهائياً. ' +
            'لا يمكن التراجع — نزّل نسخة احتياطية أولاً.</p>' +
          '<button class="btn btn-danger" id="resetBtn">حذف كل البيانات</button></div></div>' +
      '</div>';
  }

  /* ============================================================
     الموجّه
     ============================================================ */
  var VIEWS = {
    dashboard: viewDashboard, entries: viewEntries, monthly: viewMonthly,
    channels: viewChannels, entities: viewEntities, log: viewLog, settings: viewSettings
  };

  function render() {
    // قائمة المنشآت في الشريط العلوي
    var sel2 = $('#entityFilter');
    sel2.innerHTML = '<option value="all">كل المنشآت</option>' +
      S.db.entities.map(function (e) {
        return '<option value="' + e.id + '">' + F.esc(e.name) + '</option>';
      }).join('');
    sel2.value = state.entityId;

    $('#currentUser').textContent = S.db.user;
    $$('.nav-item').forEach(function (a) {
      a.classList.toggle('active', a.dataset.view === state.view);
    });

    $('#viewHost').innerHTML = (VIEWS[state.view] || viewDashboard)();
    window.scrollTo(0, 0);
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

  $('#logoutBtn').addEventListener('click', function () {
    toast('هذه نسخة محلية — لا يوجد تسجيل دخول فعلي');
  });

  // الشريط الجانبي على الجوال
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
  });

  /* --- أحداث المحتوى (تفويض) --- */
  $('#viewHost').addEventListener('click', function (e) {
    var t = e.target;

    // الفترات
    var chip = t.closest('[data-preset]');
    if (chip) { state.preset = chip.dataset.preset; render(); return; }

    if (t.closest('#applyRange')) {
      var f = $('#fromDate').value, to = $('#toDate').value;
      if (!f || !to) { toast('حدّد تاريخ البداية والنهاية', true); return; }
      if (f > to) { toast('تاريخ البداية بعد تاريخ النهاية', true); return; }
      state.preset = 'custom'; state.from = f; state.to = to;
      render(); return;
    }

    // الإدخالات
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
        S.deleteEntry(dl.dataset.del); toast('تم الحذف'); render();
      });
      return;
    }

    // التنقل من بطاقة القناة
    var dr = t.closest('[data-drill]');
    if (dr) { state.view = 'entries'; render(); return; }

    // القنوات
    if (t.closest('#addCh')) { channelForm(null); return; }
    var ce = t.closest('[data-ch-edit]');
    if (ce) {
      channelForm(S.db.channels.find(function (x) { return x.id === ce.dataset.chEdit; }));
      return;
    }
    var cd = t.closest('[data-ch-del]');
    if (cd) {
      var res = S.deleteChannel(cd.dataset.chDel);
      if (!res.ok) toast(res.reason, true); else { toast('تم حذف القناة'); render(); }
      return;
    }

    // المنشآت
    if (t.closest('#addEnt')) {
      openModal('منشأة جديدة',
        '<div class="field"><label>اسم المنشأة</label><input id="ent_name" placeholder="مثال: الفرع الثاني"></div>',
        '<button class="btn btn-primary" id="modalSave">حفظ</button>' +
        '<button class="btn" data-close>إلغاء</button>',
        function () {
          var v = $('#ent_name').value.trim();
          if (!v) { toast('الاسم مطلوب', true); return; }
          S.addEntity(v); toast('تمت الإضافة'); closeModal(); render();
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
          S.updateEntity(ent.id, v); toast('تم التحديث'); closeModal(); render();
        });
      return;
    }
    var edl = t.closest('[data-ent-del]');
    if (edl) {
      var r2 = S.deleteEntity(edl.dataset.entDel);
      if (!r2.ok) toast(r2.reason, true);
      else {
        if (state.entityId === edl.dataset.entDel) state.entityId = 'all';
        toast('تم حذف المنشأة'); render();
      }
      return;
    }

    // تصدير CSV
    if (t.closest('#expCSV')) {
      var rr = computeRange();
      var list = S.query(rr.from, rr.to, state.entityId);
      if (!list.length) { toast('لا توجد بيانات للتصدير', true); return; }
      download(S.exportCSV(list), 'تقرير-التسويق-' + rr.from + '-الى-' + rr.to + '.csv', 'text/csv;charset=utf-8');
      toast('تم تنزيل الملف');
      return;
    }

    // الإعدادات
    if (t.closest('#dlJSON')) {
      download(S.exportJSON(), 'نسخة-احتياطية-' + S.todayISO() + '.json', 'application/json');
      toast('تم تنزيل النسخة الاحتياطية');
      return;
    }
    if (t.closest('#upJSON')) { $('#fileJSON').click(); return; }
    if (t.closest('#saveUser')) {
      var nm = $('#userName').value.trim();
      if (!nm) { toast('الاسم مطلوب', true); return; }
      S.setUser(nm); toast('تم الحفظ'); render();
      return;
    }
    if (t.closest('#seedBtn')) {
      confirmBox('سيتم استبدال كل البيانات الحالية ببيانات تجريبية. هل تريد المتابعة؟', function () {
        var c = S.seedDemo(); toast('تم توليد ' + c + ' إدخال'); state.entityId = 'all'; render();
      });
      return;
    }
    if (t.closest('#resetBtn')) {
      confirmBox('سيتم حذف كل البيانات نهائياً ولا يمكن التراجع. هل أنت متأكد تماماً؟', function () {
        S.resetAll(); toast('تم حذف كل البيانات'); state.entityId = 'all'; render();
      });
      return;
    }
  });

  // استيراد ملف
  $('#viewHost').addEventListener('change', function (e) {
    if (e.target.id !== 'fileJSON') return;
    var f = e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var res = S.importJSON(rd.result);
      if (!res.ok) toast(res.reason, true);
      else { toast('تم استيراد ' + res.count + ' إدخال'); state.entityId = 'all'; render(); }
    };
    rd.readAsText(f);
  });

  function download(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- الإقلاع ---------- */
  render();

})();
