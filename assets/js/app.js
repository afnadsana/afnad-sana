/* ============================================================
   app.js â€” ط§ظ„ظ…ظˆط¬ظ‘ظ‡ ظˆط§ظ„ظˆط§ط¬ظ‡ط§طھ
   ============================================================ */
(function () {
  'use strict';

  var S = window.Store, F = window.Fmt, C = window.Charts;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- ط­ط§ظ„ط© ط§ظ„ظˆط§ط¬ظ‡ط© ---------- */
  var state = {
    view: 'dashboard',
    entityId: 'all',
    preset: 'thisMonth',
    from: null,
    to: null,
    invDir: 'all',      // طھطµظپظٹط© ط§ظ„ظپظˆط§طھظٹط±: ط§ظ„ظƒظ„ / ظˆط§ط±ط¯ / طµط§ط¯ط±
    invStatus: 'all'    // طھطµظپظٹط© ط§ظ„ظپظˆط§طھظٹط±: ط§ظ„ظƒظ„ / ظ…ط³ط¯ظ‘ط¯ط© / ظ…ط¹ظ„ظ‘ظ‚ط©
  };

  /* ---------- ط­ط³ط§ط¨ ط§ظ„ظپطھط±ط© ---------- */
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

  /* ---------- ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ ---------- */
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

  /* ---------- ط§ظ„ظ†ط§ظپط°ط© ط§ظ„ظ…ظ†ط¨ط«ظ‚ط© ---------- */
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
    openModal('طھط£ظƒظٹط¯',
      '<p style="font-size:14px;line-height:1.8">' + F.esc(msg) + '</p>',
      '<button class="btn btn-danger" id="modalSave">ظ†ط¹ظ…طŒ طھط£ظƒظٹط¯</button>' +
      '<button class="btn" data-close>ط¥ظ„ط؛ط§ط،</button>',
      function () { closeModal(); onYes(); });
  }

  /* ============================================================
     ط´ط±ظٹط· ط§ظ„ظپطھط±ط§طھ ط§ظ„ظ…ط´طھط±ظƒ
     ============================================================ */
  function filterbarHTML() {
    var r = computeRange();
    var presets = [
      ['today', 'ط§ظ„ظٹظˆظ…'], ['yesterday', 'ط£ظ…ط³'], ['last7', 'ط¢ط®ط± 7 ط£ظٹط§ظ…'],
      ['thisMonth', 'ط§ظ„ط´ظ‡ط± ط§ظ„ط­ط§ظ„ظٹ'], ['prevMonth', 'ط§ظ„ط´ظ‡ط± ط§ظ„ط³ط§ط¨ظ‚']
    ];
    return '<div class="filterbar">' +
      presets.map(function (p) {
        return '<button class="chip' + (state.preset === p[0] ? ' active' : '') +
               '" data-preset="' + p[0] + '">' + p[1] + '</button>';
      }).join('') +
      '<span class="spacer"></span>' +
      '<div class="date-range">' +
        '<input type="date" id="fromDate" value="' + (r.from || '') + '">' +
        '<span>ط¥ظ„ظ‰</span>' +
        '<input type="date" id="toDate" value="' + (r.to || '') + '">' +
        '<button class="btn btn-primary btn-sm" id="applyRange">طھط·ط¨ظٹظ‚</button>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     ظ„ظˆط­ط© ط§ظ„ط¥ط¯ط§ط±ط© ط§ظ„ط±ط¦ظٹط³ظٹط©
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

    /* --- ط¨ط·ط§ظ‚ط§طھ ط§ظ„ظ‚ظ†ظˆط§طھ (ط£ط¹ظ„ظ‰ 4 طµط±ظپط§ظ‹) --- */
    var cards = chCur.slice(0, 4).map(function (c) {
      var p = prevMap[c.channelId] || { cost: 0, orders: 0, roas: 0, sales: 0, profit: 0 };
      var rows = [
        ['ط§ظ„طھظƒظ„ظپط©', F.money(c.cost), F.delta(c.cost, p.cost), false],
        ['ط¹ط¯ط¯ ط§ظ„ط·ظ„ط¨ط§طھ', F.int(c.orders), F.delta(c.orders, p.orders), false],
        ['ROAS', F.roas(c.roas), F.delta(c.roas, p.roas), false],
        ['ط§ظ„ط±ط¨ط­', F.money(c.profit) + ' ط±.ط³', F.delta(c.profit, p.profit), c.profit < 0]
      ];
      return '<div class="ch-card">' +
        '<div class="ch-top">' +
          '<span class="ch-name">' +
            '<span class="ch-badge" style="background:' + c.channel.color + '">' +
              F.icon(c.channel.icon) + '</span>' + F.esc(c.channel.name) +
          '</span>' +
          '<button class="ch-open" data-drill="' + c.channelId + '" title="ط¹ط±ط¶ طھظپط§طµظٹظ„ ط§ظ„ظ‚ظ†ط§ط©">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M15 18l-6-6 6-6"/></svg></button>' +
        '</div>' +
        '<div class="ch-rows">' +
          rows.map(function (x) {
            return '<div class="ch-row">' +
              '<span class="lbl">' + x[0] + '</span>' +
              '<span style="display:flex;align-items:center;gap:8px">' +
                '<span class="delta ' + x[2].dir + '">' +
                  (x[2].dir === 'up' ? 'â–²' : x[2].dir === 'down' ? 'â–¼' : 'â€”') + ' ' + F.pct(x[2].v) +
                '</span>' +
                '<span class="val' + (x[3] ? ' neg' : '') + ' num">' + x[1] + '</span>' +
              '</span></div>';
          }).join('') +
        '</div></div>';
    }).join('');

    var cardsBlock = chCur.length
      ? '<div class="grid grid-4 mb">' + cards + '</div>'
      : '';

    /* --- ط¨ط·ط§ظ‚ط§طھ ط§ظ„ظ…ط¤ط´ط±ط§طھ --- */
    var kpis =
      '<div class="grid grid-4 mb">' +
        kpiCard('ط¹ط¯ط¯ ط§ظ„ط·ظ„ط¨ط§طھ', F.int(T.orders), 'ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط·ظ„ط¨ط§طھ ظپظٹ ط§ظ„ظپطھط±ط©', 'cart',
                F.delta(T.orders, TP.orders)) +
        kpiCard('ظ…طھظˆط³ط· طھظƒظ„ظپط© ط§ظ„ط·ظ„ط¨', F.money(T.cpo) + ' ط±.ط³', 'ط§ظ„طµط±ظپ أ· ط¹ط¯ط¯ ط§ظ„ط·ظ„ط¨ط§طھ', 'money',
                F.delta(T.cpo, TP.cpo), true) +
        kpiCard('ROAS', F.roas(T.roas), 'ط§ظ„ظ…ط¨ظٹط¹ط§طھ أ· ط§ظ„طµط±ظپ ط§ظ„طھط³ظˆظٹظ‚ظٹ', 'pct',
                F.delta(T.roas, TP.roas)) +
        kpiCard('ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط±ط¨ط­', F.money(T.profit) + ' ط±.ط³', 'ط§ظ„ظ…ط¨ظٹط¹ط§طھ âˆ’ ط§ظ„طµط±ظپ âˆ’ طھظƒظ„ظپط© ط§ظ„ط¨ط¶ط§ط¹ط©', 'trend',
                F.delta(T.profit, TP.profit)) +
      '</div>';

    /* --- ط´ط±ظٹط· ط§ظ„ظ…ظ„ط®طµ --- */
    var summary =
      '<div class="summary">' +
        '<div class="summary-right">' +
          '<div class="summary-ico">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>' +
            '<path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>' +
          '</div>' +
          '<div><div class="pct-l">ظ†ط³ط¨ط© ط§ظ„طھط³ظˆظٹظ‚</div><div class="pct num">' + F.pct(T.mktRatio) + '</div></div>' +
        '</div>' +
        '<div class="summary-left">' +
          '<div><div class="k">ط§ظ„طµط±ظپ ط§ظ„طھط³ظˆظٹظ‚ظٹ ط§ظ„ظƒظ„ظٹ</div><div class="v num">' + F.sar(T.cost) + '</div></div>' +
          '<div><div class="k">ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ط¨ظٹط¹ط§طھ</div><div class="v num">' + F.sar(T.sales) + '</div></div>' +
          '<div><div class="k">طھظƒظ„ظپط© ط§ظ„ط¨ط¶ط§ط¹ط©</div><div class="v num">' + F.sar(T.cogs) + '</div></div>' +
        '</div>' +
      '</div>';

    /* --- ط§ظ„ط±ط³ظˆظ… --- */
    var charts =
      '<div class="grid grid-2 mb">' +
        '<div class="panel"><div class="panel-head"><h3>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-3"/></svg>' +
          'طµط±ظپ ط§ظ„طھط³ظˆظٹظ‚ ط­ط³ط¨ ط§ظ„ط¬ظ‡ط©</h3></div>' +
          '<div class="panel-body">' + C.bars(chCur, { valueKey: 'cost', fmt: F.sar }) + '</div>' +
        '</div>' +
        '<div class="panel"><div class="panel-head"><h3>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>' +
          'ط§ظ„طµط±ظپ ظˆط§ظ„ظ…ط¨ظٹط¹ط§طھ ط¹ط¨ط± ط§ظ„ظپطھط±ط©</h3></div>' +
          '<div class="panel-body">' + C.line(S.byDay(cur, r.from, r.to)) + '</div>' +
        '</div>' +
      '</div>';

    /* --- ط¬ط¯ظˆظ„ طھظپطµظٹظ„ظٹ (ط§ظ„ظ†ط³ط®ط© ط§ظ„ط¬ط¯ظˆظ„ظٹط© ط§ظ„ظ…ط·ظ„ظˆط¨ط© ظ„ظ„ظˆطµظˆظ„) --- */
    var table =
      '<div class="panel"><div class="panel-head">' +
        '<h3>طھظپطµظٹظ„ ط§ظ„ط£ط¯ط§ط، ط­ط³ط¨ ط§ظ„ظ‚ظ†ط§ط©</h3>' +
        '<button class="btn btn-sm" id="expCSV">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>' +
          'طھطµط¯ظٹط± CSV</button>' +
      '</div><div class="table-wrap"><table><thead><tr>' +
        '<th>ط§ظ„ظ‚ظ†ط§ط©</th><th>ط§ظ„طµط±ظپ</th><th>ط§ظ„ط·ظ„ط¨ط§طھ</th><th>طھظƒظ„ظپط© ط§ظ„ط·ظ„ط¨</th>' +
        '<th>ط§ظ„ظ…ط¨ظٹط¹ط§طھ</th><th>ROAS</th><th>ط§ظ„ط±ط¨ط­</th><th>ظ†ط³ط¨ط© ط§ظ„طھط³ظˆظٹظ‚</th>' +
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
      }).join('') : '<tr><td colspan="8">' + C.empty('ظ„ط§ طھظˆط¬ط¯ ط¨ظٹط§ظ†ط§طھ ظپظٹ ظ‡ط°ظ‡ ط§ظ„ظپطھط±ط©') + '</td></tr>') +
      '</tbody>' +
      (chCur.length ? '<tfoot><tr>' +
        '<td>ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ</td><td class="num">' + F.money(T.cost) + '</td>' +
        '<td class="num">' + F.int(T.orders) + '</td><td class="num">' + F.money(T.cpo) + '</td>' +
        '<td class="num">' + F.money(T.sales) + '</td><td class="num">' + F.roas(T.roas) + '</td>' +
        '<td class="num">' + F.money(T.profit) + '</td><td class="num">' + F.pct(T.mktRatio) + '</td>' +
      '</tr></tfoot>' : '') +
      '</table></div></div>';

    return '<div class="page-head"><div>' +
             '<h2>ظ„ظˆط­ط© ط§ظ„ط¥ط¯ط§ط±ط© ط§ظ„ط±ط¦ظٹط³ظٹط©</h2>' +
             '<p>ط£ظ‡ظ… ط§ظ„ظ…ط¤ط´ط±ط§طھ ط¯ظˆظ† ط§ظ„ط¯ط®ظˆظ„ ظپظٹ ط§ظ„طھظپط§طµظٹظ„ â€” ظ…ظ‚ط§ط±ظ†ط© ط¨ط§ظ„ظپطھط±ط© ط§ظ„ط³ط§ط¨ظ‚ط© (' +
               F.arDate(pr.from) + ' â€” ' + F.arDate(pr.to) + ')</p>' +
           '</div>' +
           '<button class="btn btn-primary" data-add-entry>' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M12 5v14M5 12h14"/></svg>ط¥ط¯ط®ط§ظ„ ط¬ط¯ظٹط¯</button>' +
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
          (d.dir === 'up' ? 'â–²' : d.dir === 'down' ? 'â–¼' : 'â€”') + ' ' + F.pct(d.v) + '</span>' +
        '<span class="kpi-sub">' + sub + '</span>' +
      '</div></div>';
  }

  /* ============================================================
     ط§ظ„ط¥ط¯ط®ط§ظ„ط§طھ ط§ظ„ظٹظˆظ…ظٹط©
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
        '<td>' + F.esc(e.note || 'â€”') + '</td>' +
        '<td><div class="t-actions">' +
          '<button class="btn btn-sm" data-edit="' + e.id + '">طھط¹ط¯ظٹظ„</button>' +
          '<button class="btn btn-sm btn-danger" data-del="' + e.id + '">ط­ط°ظپ</button>' +
        '</div></td></tr>';
    }).join('');

    return '<div class="page-head"><div>' +
             '<h2>ط§ظ„ط¥ط¯ط®ط§ظ„ط§طھ ط§ظ„ظٹظˆظ…ظٹط© ظˆط§ظ„ظ…طھط§ط¨ط¹ط©</h2>' +
             '<p>طھط³ط¬ظٹظ„ ط§ظ„طµط±ظپ ظˆط§ظ„ظ…ط¨ظٹط¹ط§طھ ظٹظˆظ…ط§ظ‹ ط¨ظٹظˆظ… ظ„ظƒظ„ ظ‚ظ†ط§ط© â€” ' + list.length + ' ط¥ط¯ط®ط§ظ„ ظپظٹ ط§ظ„ظپطھط±ط©</p>' +
           '</div><div style="display:flex;gap:8px">' +
             '<button class="btn" id="expCSV">طھطµط¯ظٹط± CSV</button>' +
             '<button class="btn btn-primary" data-add-entry>' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
               '<path d="M12 5v14M5 12h14"/></svg>ط¥ط¯ط®ط§ظ„ ط¬ط¯ظٹط¯</button>' +
           '</div></div>' +
           filterbarHTML() +
           '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
             '<th>ط§ظ„طھط§ط±ظٹط®</th><th>ط§ظ„ظ…ظ†ط´ط£ط©</th><th>ط§ظ„ظ‚ظ†ط§ط©</th><th>ط§ظ„طµط±ظپ</th><th>ط§ظ„ط·ظ„ط¨ط§طھ</th>' +
             '<th>ط§ظ„ظ…ط¨ظٹط¹ط§طھ</th><th>طھظƒظ„ظپط© ط§ظ„ط¨ط¶ط§ط¹ط©</th><th>ط§ظ„ط±ط¨ط­</th><th>ROAS</th>' +
             '<th>ظ…ظ„ط§ط­ط¸ط§طھ</th><th></th>' +
           '</tr></thead><tbody>' +
           (list.length ? rows :
             '<tr><td colspan="11">' + emptyState('ظ„ط§ طھظˆط¬ط¯ ط¥ط¯ط®ط§ظ„ط§طھ',
               'ط§ط¨ط¯ط£ ط¨طھط³ط¬ظٹظ„ ط£ظˆظ„ ط¹ظ…ظ„ظٹط© طµط±ظپ ظپظٹ ظ‡ط°ظ‡ ط§ظ„ظپطھط±ط©.') + '</td></tr>') +
           '</tbody>' +
           (list.length ? '<tfoot><tr>' +
             '<td colspan="3">ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ</td>' +
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
      '<button class="btn btn-primary" data-add-entry>ط¥ط¶ط§ظپط© ط¥ط¯ط®ط§ظ„</button></div>';
  }

  /* ============================================================
     ظ†ظ…ظˆط°ط¬ ط§ظ„ط¥ط¯ط®ط§ظ„
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
        field('ط§ظ„طھط§ط±ظٹط®', '<input type="date" id="f_date" value="' + e.date + '" required>') +
        field('ط§ظ„ظ…ظ†ط´ط£ط©', sel('f_entity', S.db.entities.map(function (x) {
          return [x.id, x.name]; }), e.entityId)) +
        field('ط§ظ„ظ‚ظ†ط§ط©', sel('f_channel', S.db.channels.map(function (x) {
          return [x.id, x.name]; }), e.channelId)) +
        field('ط§ظ„طµط±ظپ ط§ظ„طھط³ظˆظٹظ‚ظٹ (ط±.ط³)',
          '<input type="number" id="f_cost" min="0" step="0.01" value="' + e.cost + '" placeholder="0.00">',
          'ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„ظ…طµط±ظˆظپ ط¹ظ„ظ‰ ط§ظ„ط¥ط¹ظ„ط§ظ†') +
        field('ط¹ط¯ط¯ ط§ظ„ط·ظ„ط¨ط§طھ',
          '<input type="number" id="f_orders" min="0" step="1" value="' + e.orders + '" placeholder="0">') +
        field('ط§ظ„ظ…ط¨ظٹط¹ط§طھ (ط±.ط³)',
          '<input type="number" id="f_sales" min="0" step="0.01" value="' + e.sales + '" placeholder="0.00">',
          'ط¥ط¬ظ…ط§ظ„ظٹ ظ‚ظٹظ…ط© ط§ظ„ط·ظ„ط¨ط§طھ') +
        field('طھظƒظ„ظپط© ط§ظ„ط¨ط¶ط§ط¹ط© (ط±.ط³)',
          '<input type="number" id="f_cogs" min="0" step="0.01" value="' + e.cogs + '" placeholder="0.00">',
          'ط§ط®طھظٹط§ط±ظٹ â€” ظٹظڈط³طھط®ط¯ظ… ظ„ط­ط³ط§ط¨ طµط§ظپظٹ ط§ظ„ط±ط¨ط­') +
        '<div class="field full"><label>ظ…ظ„ط§ط­ط¸ط§طھ</label>' +
          '<textarea id="f_note" rows="2" placeholder="ط§ط®طھظٹط§ط±ظٹ">' + F.esc(e.note || '') + '</textarea></div>' +
        '<div class="field full" id="f_preview" style="background:var(--bg);padding:12px;border-radius:10px"></div>' +
      '</div>';

    openModal(existing ? 'طھط¹ط¯ظٹظ„ ط¥ط¯ط®ط§ظ„' : 'ط¥ط¯ط®ط§ظ„ ط¬ط¯ظٹط¯', body,
      '<button class="btn btn-primary" id="modalSave">ط­ظپط¸</button>' +
      '<button class="btn" data-close>ط¥ظ„ط؛ط§ط،</button>',
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
        if (!rec.date) { toast('ط§ظ„طھط§ط±ظٹط® ظ…ط·ظ„ظˆط¨', true); return; }
        if (!rec.cost && !rec.sales) { toast('ط£ط¯ط®ظ„ ط§ظ„طµط±ظپ ط£ظˆ ط§ظ„ظ…ط¨ظٹط¹ط§طھ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„', true); return; }

        if (existing) { S.updateEntry(existing.id, rec); toast('طھظ… طھط­ط¯ظٹط« ط§ظ„ط¥ط¯ط®ط§ظ„'); }
        else { S.addEntry(rec); toast('طھظ…طھ ط¥ط¶ط§ظپط© ط§ظ„ط¥ط¯ط®ط§ظ„'); }
        closeModal();
        render();
      });

    // ظ…ط¹ط§ظٹظ†ط© ط­ظٹط© ظ„ظ„ظ…ط¤ط´ط±ط§طھ ط§ظ„ظ…ط­ط³ظˆط¨ط©
    function preview() {
      var cost = parseFloat($('#f_cost').value) || 0;
      var sales = parseFloat($('#f_sales').value) || 0;
      var cogs = parseFloat($('#f_cogs').value) || 0;
      var orders = parseFloat($('#f_orders').value) || 0;
      var p = sales - cost - cogs;
      $('#f_preview').innerHTML =
        '<div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px">' +
          '<span>ROAS: <strong class="num">' + F.roas(cost > 0 ? sales / cost : 0) + '</strong></span>' +
          '<span>طھظƒظ„ظپط© ط§ظ„ط·ظ„ط¨: <strong class="num">' +
            F.money(orders > 0 ? cost / orders : 0) + ' ط±.ط³</strong></span>' +
          '<span>ط§ظ„ط±ط¨ط­: <strong class="num" style="color:' +
            (p < 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(p) + ' ط±.ط³</strong></span>' +
          '<span>ظ†ط³ط¨ط© ط§ظ„طھط³ظˆظٹظ‚: <strong class="num">' +
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
     ط§ظ„ظپظˆط§طھظٹط± ظˆط§ظ„ط­ط³ط§ط¨ط§طھ â€” ط¯ظپطھط± ط§ظ„ط­ط³ط§ط¨ ط§ظ„ط¨ظ†ظƒظٹ
     ============================================================ */
  function viewInvoices() {
    var r = computeRange();
    var T = S.treasury(r.from, r.to, state.entityId);

    var list = S.queryInvoices(r.from, r.to, state.entityId, state.invDir, state.invStatus)
                .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

    /* --- ط§ظ„ط±ظ‚ظ… ط§ظ„ط¨ط·ظ„: ط§ظ„ط±طµظٹط¯ ط§ظ„ط­ط§ظ„ظٹ --- */
    var hero =
      '<div class="hero-balance">' +
        '<div class="hero-main">' +
          '<div class="hero-label">ط§ظ„ط±طµظٹط¯ ط§ظ„ط­ط§ظ„ظٹ ظپظٹ ط§ظ„ط­ط³ط§ط¨ ط§ظ„ط¨ظ†ظƒظٹ</div>' +
          '<div class="hero-num' + (T.balance < 0 ? ' neg' : '') + '">' + F.money(T.balance) + ' ط±.ط³</div>' +
          '<div class="hero-sub">ط§ظ„ط±طµظٹط¯ ط§ظ„ط§ظپطھطھط§ط­ظٹ ' + F.money(T.opening) + ' + ط§ظ„ظˆط§ط±ط¯ ' +
            F.money(T.paidIn) + ' âˆ’ ط§ظ„ظ…ظ†طµط±ظپ ' + F.money(T.paidOut) + '</div>' +
        '</div>' +
        '<div class="hero-side">' +
          '<div class="hs-item"><span class="k">ط¥ط¬ظ…ط§ظ„ظٹ ظ…ط§ ط¯ط®ظ„ ظ„ظٹ</span>' +
            '<span class="v in num">+ ' + F.money(T.paidIn) + ' ط±.ط³</span></div>' +
          '<div class="hs-item"><span class="k">ط¥ط¬ظ…ط§ظ„ظٹ ظ…ط§ طµط±ظپطھظ‡</span>' +
            '<span class="v out num">âˆ’ ' + F.money(T.paidOut) + ' ط±.ط³</span></div>' +
          '<div class="hs-item"><span class="k">ط§ظ„ط±طµظٹط¯ ط§ظ„ط§ظپطھطھط§ط­ظٹ</span>' +
            '<span class="v num">' + F.money(T.opening) + ' ط±.ط³</span></div>' +
        '</div>' +
      '</div>';

    /* --- ط§ظ„ظ…ط¹ظ„ظ‘ظ‚ ظˆط§ظ„ظ…طھظˆظ‚ط¹ --- */
    var pending = (T.countPendingIn + T.countPendingOut) ?
      '<div class="pending-bar">' +
        '<div class="pb-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>' +
        '<div class="pb-txt"><strong>ظپظˆط§طھظٹط± ظ…ط¹ظ„ظ‘ظ‚ط©</strong>' +
          '<span>' + T.countPendingIn + ' ط¨ط§ظ†طھط¸ط§ط± ط§ظ„طھط­طµظٹظ„ (' + F.money(T.pendingIn) + ' ط±.ط³) آ· ' +
          T.countPendingOut + ' ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط³ط¯ط§ط¯ (' + F.money(T.pendingOut) + ' ط±.ط³)</span></div>' +
        '<div class="pb-proj"><span class="k">ط§ظ„ط±طµظٹط¯ ط§ظ„ظ…طھظˆظ‚ط¹ ط¨ط¹ط¯ ط§ظ„طھط³ظˆظٹط©</span>' +
          '<span class="v num' + (T.projected < 0 ? ' neg' : '') + '">' +
            F.money(T.projected) + ' ط±.ط³</span></div>' +
      '</div>' : '';

    /* --- ط­ط±ظƒط© ط§ظ„ظپطھط±ط© --- */
    var period =
      '<div class="grid grid-3 mb">' +
        kpiCard('ظˆط§ط±ط¯ ط§ظ„ظپطھط±ط©', F.money(T.periodIn) + ' ط±.ط³', 'ط§ظ„ظ…ط­طµظ‘ظ„ ط®ظ„ط§ظ„ ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط®طھط§ط±ط©',
                'money', { v: 0, dir: 'flat' }) +
        kpiCard('ظ…ظ†طµط±ظپ ط§ظ„ظپطھط±ط©', F.money(T.periodOut) + ' ط±.ط³', 'ط§ظ„ظ…ط¯ظپظˆط¹ ط®ظ„ط§ظ„ ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط®طھط§ط±ط©',
                'cart', { v: 0, dir: 'flat' }) +
        kpiCard('طµط§ظپظٹ ط§ظ„ظپطھط±ط©', F.money(T.periodNet) + ' ط±.ط³', 'ط§ظ„ظˆط§ط±ط¯ âˆ’ ط§ظ„ظ…ظ†طµط±ظپ',
                'trend', { v: 0, dir: 'flat' }) +
      '</div>';

    /* --- ط§ظ„ظ…طµط±ظˆظپط§طھ ط­ط³ط¨ ط§ظ„طھطµظ†ظٹظپ --- */
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
    }).join('') + '</div>' : C.empty('ظ„ط§ طھظˆط¬ط¯ ظ…طµط±ظˆظپط§طھ ظپظٹ ظ‡ط°ظ‡ ط§ظ„ظپطھط±ط©');

    /* --- ظ…ط·ط§ط¨ظ‚ط© ط§ظ„طµط±ظپ ط§ظ„طھط³ظˆظٹظ‚ظٹ --- */
    var mkt = S.totals(S.query(r.from, r.to, state.entityId)).cost;
    var mktInv = outList.filter(function (v) { return v.category === 'طھط³ظˆظٹظ‚'; })
                        .reduce(function (a, v) { return a + v.amount; }, 0);
    var diff = mkt - mktInv;
    var recon =
      '<div class="panel"><div class="panel-head"><h3>ظ…ط·ط§ط¨ظ‚ط© ط§ظ„طµط±ظپ ط§ظ„طھط³ظˆظٹظ‚ظٹ</h3></div>' +
      '<div class="panel-body">' +
        '<div class="recon">' +
          '<div><span class="k">ظ…ط³ط¬ظ‘ظ„ ظپظٹ ظ…ط³ط§ط± ط§ظ„طھط³ظˆظٹظ‚</span>' +
            '<span class="v num">' + F.money(mkt) + ' ط±.ط³</span></div>' +
          '<div><span class="k">ظپظˆط§طھظٹط± ط¨طھطµظ†ظٹظپ آ«طھط³ظˆظٹظ‚آ»</span>' +
            '<span class="v num">' + F.money(mktInv) + ' ط±.ط³</span></div>' +
          '<div><span class="k">ط§ظ„ظپط±ظ‚</span>' +
            '<span class="v num" style="color:' +
              (Math.abs(diff) < 1 ? 'var(--green)' : 'var(--amber)') + '">' +
              F.money(Math.abs(diff)) + ' ط±.ط³</span></div>' +
        '</div>' +
        '<p class="hint" style="margin-top:12px">' +
          (Math.abs(diff) < 1
            ? 'ط§ظ„ط£ط±ظ‚ط§ظ… ظ…ط·ط§ط¨ظ‚ط© â€” ظƒظ„ ط§ظ„طµط±ظپ ط§ظ„طھط³ظˆظٹظ‚ظٹ ظ…ط³ط¬ظ‘ظ„ ظƒظپظˆط§طھظٹط±.'
            : 'ط§ظ„طµط±ظپ ط§ظ„ظ…ط³ط¬ظ‘ظ„ ظپظٹ ظ…ط³ط§ط± ط§ظ„طھط³ظˆظٹظ‚ ظ„ط§ ظٹط·ط§ط¨ظ‚ ظپظˆط§طھظٹط± ط§ظ„طھط³ظˆظٹظ‚. ' +
              'ط§ظ„ط±طµظٹط¯ ط§ظ„ط¨ظ†ظƒظٹ ظٹط¹طھظ…ط¯ ط¹ظ„ظ‰ ط§ظ„ظپظˆط§طھظٹط± ظپظ‚ط·طŒ ظپط£ط¶ظپ ط§ظ„ظپط±ظ‚ ظƒظپط§طھظˆط±ط© طµط§ط¯ط±ط© ط¥ظ† ظƒط§ظ† ظ‚ط¯ ط®ط±ط¬ ظپط¹ظ„ط§ظ‹ ظ…ظ† ط§ظ„ط­ط³ط§ط¨.') +
        '</p>' +
      '</div></div>';

    /* --- ط§ظ„ط¬ط¯ظˆظ„ --- */
    var rows = list.map(function (v) {
      var isIn = v.dir === 'in';
      return '<tr>' +
        '<td class="num">' + F.arDate(v.date) + '</td>' +
        '<td><span class="tag" style="background:' + (isIn ? 'var(--green-bg)' : 'var(--red-bg)') +
          ';color:' + (isIn ? 'var(--green)' : 'var(--red)') + '">' +
          (isIn ? 'â–¼ ظˆط§ط±ط¯' : 'â–² طµط§ط¯ط±') + '</span></td>' +
        '<td class="num">' + F.esc(v.invoiceNo || 'â€”') + '</td>' +
        '<td>' + F.esc(v.party || 'â€”') + '</td>' +
        '<td>' + F.esc(v.category) + '</td>' +
        '<td class="num" style="font-weight:800;color:' + (isIn ? 'var(--green)' : 'var(--red)') + '">' +
          (isIn ? '+ ' : 'âˆ’ ') + F.money(v.amount) + '</td>' +
        '<td>' + F.esc(v.method) + '</td>' +
        '<td><span class="tag" style="background:' +
          (v.status === 'paid' ? 'var(--green-bg)' : '#fff4e0') + ';color:' +
          (v.status === 'paid' ? 'var(--green)' : '#b06f00') + '">' +
          (v.status === 'paid' ? 'ظ…ط³ط¯ظ‘ط¯ط©' : 'ظ…ط¹ظ„ظ‘ظ‚ط©') + '</span></td>' +
        '<td>' + F.esc(v.note || 'â€”') + '</td>' +
        '<td><div class="t-actions">' +
          (v.status === 'unpaid'
            ? '<button class="btn btn-sm" data-inv-pay="' + v.id + '">طھط³ط¯ظٹط¯</button>' : '') +
          '<button class="btn btn-sm" data-inv-edit="' + v.id + '">طھط¹ط¯ظٹظ„</button>' +
          '<button class="btn btn-sm btn-danger" data-inv-del="' + v.id + '">ط­ط°ظپ</button>' +
        '</div></td></tr>';
    }).join('');

    var dirChips = [['all', 'ط§ظ„ظƒظ„'], ['in', 'ظˆط§ط±ط¯'], ['out', 'طµط§ط¯ط±']].map(function (x) {
      return '<button class="chip' + (state.invDir === x[0] ? ' active' : '') +
             '" data-invdir="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    var stChips = [['all', 'ظƒظ„ ط§ظ„ط­ط§ظ„ط§طھ'], ['paid', 'ظ…ط³ط¯ظ‘ط¯ط©'], ['unpaid', 'ظ…ط¹ظ„ظ‘ظ‚ط©']].map(function (x) {
      return '<button class="chip' + (state.invStatus === x[0] ? ' active' : '') +
             '" data-invst="' + x[0] + '">' + x[1] + '</button>';
    }).join('');

    return '<div class="page-head"><div>' +
             '<h2>ط§ظ„ظپظˆط§طھظٹط± ظˆط§ظ„ط­ط³ط§ط¨ط§طھ</h2>' +
             '<p>ظƒظ„ ظ…ط¨ظ„ط؛ ط¯ط§ط®ظ„ ط£ظˆ ط®ط§ط±ط¬ â€” ظˆط§ظ„ط±طµظٹط¯ ط§ظ„ظ…طھط¨ظ‚ظٹ ظپظٹ ط­ط³ط§ط¨ظƒ ط§ظ„ط¨ظ†ظƒظٹ</p>' +
           '</div><div style="display:flex;gap:8px;flex-wrap:wrap">' +
             '<button class="btn" id="openingBtn">ط§ظ„ط±طµظٹط¯ ط§ظ„ط§ظپطھطھط§ط­ظٹ</button>' +
             '<button class="btn" id="expInvCSV">طھطµط¯ظٹط± CSV</button>' +
             '<button class="btn btn-primary" data-add-inv>' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
               '<path d="M12 5v14M5 12h14"/></svg>ظپط§طھظˆط±ط© ط¬ط¯ظٹط¯ط©</button>' +
           '</div></div>' +
           hero + pending +
           filterbarHTML() +
           period +
           '<div class="grid grid-2 mb">' +
             '<div class="panel"><div class="panel-head"><h3>ط§ظ„ظ…طµط±ظˆظپط§طھ ط­ط³ط¨ ط§ظ„طھطµظ†ظٹظپ</h3></div>' +
               '<div class="panel-body">' + catBars + '</div></div>' +
             recon +
           '</div>' +
           '<div class="panel"><div class="panel-head">' +
             '<h3>ط³ط¬ظ„ ط§ظ„ظپظˆط§طھظٹط± (' + list.length + ')</h3>' +
             '<div style="display:flex;gap:6px;flex-wrap:wrap">' + dirChips + stChips + '</div>' +
           '</div><div class="table-wrap"><table><thead><tr>' +
             '<th>ط§ظ„طھط§ط±ظٹط®</th><th>ط§ظ„ظ†ظˆط¹</th><th>ط±ظ‚ظ… ط§ظ„ظپط§طھظˆط±ط©</th><th>ط§ظ„ط¬ظ‡ط©</th><th>ط§ظ„طھطµظ†ظٹظپ</th>' +
             '<th>ط§ظ„ظ…ط¨ظ„ط؛</th><th>ط·ط±ظٹظ‚ط© ط§ظ„ط¯ظپط¹</th><th>ط§ظ„ط­ط§ظ„ط©</th><th>ظ…ظ„ط§ط­ط¸ط§طھ</th><th></th>' +
           '</tr></thead><tbody>' +
           (list.length ? rows :
             '<tr><td colspan="10"><div class="empty">' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
               '<path d="M4 2v20l2.5-2 2.5 2 2.5-2 2.5 2 2.5-2 2.5 2V2l-2.5 2L14 2l-2.5 2L9 2 6.5 4z"/></svg>' +
               '<h4>ظ„ط§ طھظˆط¬ط¯ ظپظˆط§طھظٹط±</h4><p>ط³ط¬ظ‘ظ„ ط£ظˆظ„ ظ…ط¨ظ„ط؛ ظˆط§ط±ط¯ ط£ظˆ طµط§ط¯ط±.</p>' +
               '<button class="btn btn-primary" data-add-inv>ط¥ط¶ط§ظپط© ظپط§طھظˆط±ط©</button></div></td></tr>') +
           '</tbody></table></div></div>';
  }

  /* --- ظ†ظ…ظˆط°ط¬ ط§ظ„ظپط§طھظˆط±ط© --- */
  function invoiceForm(existing) {
    var v = existing || {
      date: S.todayISO(), dir: 'out', amount: '', party: '', invoiceNo: '',
      category: 'ط£ط®ط±ظ‰', method: S.METHODS[0], status: 'paid',
      entityId: state.entityId !== 'all' ? state.entityId : S.db.entities[0].id, note: ''
    };

    function catOptions(dir, cur) {
      var arr = dir === 'in' ? S.CAT_IN : S.CAT_OUT;
      return arr.map(function (c) {
        return '<option value="' + F.esc(c) + '"' + (c === cur ? ' selected' : '') + '>' +
               F.esc(c) + '</option>';
      }).join('');
    }

    var body =
      '<div class="form-grid">' +
        '<div class="field full"><label>ظ†ظˆط¹ ط§ظ„ط­ط±ظƒط©</label>' +
          '<div class="seg">' +
            '<label class="seg-opt' + (v.dir === 'out' ? ' on out' : '') + '">' +
              '<input type="radio" name="invdir" value="out"' +
                (v.dir === 'out' ? ' checked' : '') + '><span>â–² طµط§ط¯ط± â€” ظ…ط¨ظ„ط؛ ط®ط±ط¬ ظ…ظ†ظٹ</span></label>' +
            '<label class="seg-opt' + (v.dir === 'in' ? ' on in' : '') + '">' +
              '<input type="radio" name="invdir" value="in"' +
                (v.dir === 'in' ? ' checked' : '') + '><span>â–¼ ظˆط§ط±ط¯ â€” ظ…ط¨ظ„ط؛ ط¯ط®ظ„ ظ„ظٹ</span></label>' +
          '</div></div>' +
        field('ط§ظ„طھط§ط±ظٹط®', '<input type="date" id="v_date" value="' + v.date + '">') +
        field('ط§ظ„ظ…ط¨ظ„ط؛ (ط±.ط³)',
          '<input type="number" id="v_amount" min="0" step="0.01" value="' + v.amount + '" placeholder="0.00">') +
        field('ط§ظ„ط¬ظ‡ط© (ط§ظ„ظ…ظˆط±ط¯ / ط§ظ„ط¹ظ…ظٹظ„)',
          '<input id="v_party" value="' + F.esc(v.party) + '" placeholder="ظ…ط«ط§ظ„: ظ…ط¤ط³ط³ط© ط§ظ„ط¥ظ…ط¯ط§ط¯">') +
        field('ط±ظ‚ظ… ط§ظ„ظپط§طھظˆط±ط©',
          '<input id="v_no" value="' + F.esc(v.invoiceNo) + '" placeholder="ط§ط®طھظٹط§ط±ظٹ">') +
        '<div class="field"><label>ط§ظ„طھطµظ†ظٹظپ</label>' +
          '<select id="v_cat">' + catOptions(v.dir, v.category) + '</select></div>' +
        field('ط·ط±ظٹظ‚ط© ط§ظ„ط¯ظپط¹', sel('v_method', S.METHODS.map(function (m) {
          return [m, m]; }), v.method)) +
        field('ط§ظ„ظ…ظ†ط´ط£ط©', sel('v_entity', S.db.entities.map(function (x) {
          return [x.id, x.name]; }), v.entityId)) +
        '<div class="field"><label>ط§ظ„ط­ط§ظ„ط©</label>' +
          '<select id="v_status">' +
            '<option value="paid"' + (v.status === 'paid' ? ' selected' : '') + '>ظ…ط³ط¯ظ‘ط¯ط© â€” ط£ط«ظ‘ط±طھ ط¹ظ„ظ‰ ط§ظ„ط±طµظٹط¯</option>' +
            '<option value="unpaid"' + (v.status === 'unpaid' ? ' selected' : '') + '>ظ…ط¹ظ„ظ‘ظ‚ط© â€” ظ„ظ… طھط¤ط«ط± ط¨ط¹ط¯</option>' +
          '</select></div>' +
        '<div class="field full"><label>ظ…ظ„ط§ط­ط¸ط§طھ</label>' +
          '<textarea id="v_note" rows="2" placeholder="ط§ط®طھظٹط§ط±ظٹ">' + F.esc(v.note) + '</textarea></div>' +
        '<div class="field full" id="v_preview" style="background:var(--bg);padding:12px;border-radius:10px"></div>' +
      '</div>';

    openModal(existing ? 'طھط¹ط¯ظٹظ„ ظپط§طھظˆط±ط©' : 'ظپط§طھظˆط±ط© ط¬ط¯ظٹط¯ط©', body,
      '<button class="btn btn-primary" id="modalSave">ط­ظپط¸</button>' +
      '<button class="btn" data-close>ط¥ظ„ط؛ط§ط،</button>',
      function () {
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
          note: $('#v_note').value
        };
        if (!rec.date) { toast('ط§ظ„طھط§ط±ظٹط® ظ…ط·ظ„ظˆط¨', true); return; }
        if (!(parseFloat(rec.amount) > 0)) { toast('ط£ط¯ط®ظ„ ظ…ط¨ظ„ط؛ط§ظ‹ ط£ظƒط¨ط± ظ…ظ† طµظپط±', true); return; }

        if (existing) { S.updateInvoice(existing.id, rec); toast('طھظ… طھط­ط¯ظٹط« ط§ظ„ظپط§طھظˆط±ط©'); }
        else { S.addInvoice(rec); toast('طھظ…طھ ط¥ط¶ط§ظپط© ط§ظ„ظپط§طھظˆط±ط©'); }
        closeModal(); render();
      });

    // طھط­ط¯ظٹط« ط§ظ„طھطµظ†ظٹظپط§طھ ظˆط§ظ„ظ…ط¹ط§ظٹظ†ط© ط¹ظ†ط¯ طھط؛ظٹظٹط± ط§ظ„ظ†ظˆط¹
    function refresh() {
      var dir = ($('input[name=invdir]:checked') || {}).value || 'out';
      var cur = $('#v_cat').value;
      $('#v_cat').innerHTML = catOptions(dir, cur);
      $$('.seg-opt', $('#modalBody')).forEach(function (l) {
        var on = l.querySelector('input').checked;
        l.className = 'seg-opt' + (on ? ' on ' + l.querySelector('input').value : '');
      });

      var amt = parseFloat($('#v_amount').value) || 0;
      var st = $('#v_status').value;
      var cur2 = S.treasury(null, null, 'all').balance;
      var eff = existing
        ? cur2 // ط¹ظ†ط¯ ط§ظ„طھط¹ط¯ظٹظ„ ظٹطµط¹ط¨ ط¹ط±ط¶ ط§ظ„ط£ط«ط± ط¨ط¯ظ‚ط© ظ‚ط¨ظ„ ط§ظ„ط­ظپط¸
        : (st === 'paid' ? cur2 + (dir === 'in' ? amt : -amt) : cur2);
      $('#v_preview').innerHTML =
        '<div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px">' +
          '<span>ط§ظ„ط±طµظٹط¯ ط§ظ„ط­ط§ظ„ظٹ: <strong class="num">' + F.money(cur2) + ' ط±.ط³</strong></span>' +
          (existing ? '' :
            '<span>ط§ظ„ط±طµظٹط¯ ط¨ط¹ط¯ ط§ظ„ط­ظپط¸: <strong class="num" style="color:' +
            (eff < 0 ? 'var(--red)' : 'var(--green)') + '">' + F.money(eff) + ' ط±.ط³</strong></span>') +
          (st === 'unpaid' ? '<span style="color:var(--amber)">ظپط§طھظˆط±ط© ظ…ط¹ظ„ظ‘ظ‚ط© â€” ظ„ظ† طھط¤ط«ط± ط¹ظ„ظ‰ ط§ظ„ط±طµظٹط¯ ط­طھظ‰ طھظڈط³ط¯ظژظ‘ط¯</span>' : '') +
        '</div>';
    }
    $('#modalBody').addEventListener('change', refresh);
    $('#v_amount').addEventListener('input', refresh);
    refresh();
  }

  /* ============================================================
     ط§ظ„طھظ‚ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹ
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
          (d.dir === 'up' ? 'â–²' : d.dir === 'down' ? 'â–¼' : 'â€”') + ' ' + F.pct(d.v) + '</span></td>' +
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
             '<h2>ط§ظ„طھظ‚ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹ</h2><p>ظ…ظ„ط®طµ ط§ظ„ط£ط¯ط§ط، ط´ظ‡ط±ط§ظ‹ ط¨ط´ظ‡ط± ظ„ظƒط§ظ…ظ„ ط§ظ„ط³ط¬ظ„</p>' +
           '</div>' +
           '<button class="btn no-print" onclick="window.print()">' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>' +
             '<rect x="6" y="14" width="12" height="8"/></svg>ط·ط¨ط§ط¹ط©</button></div>' +
           '<div class="panel mb"><div class="panel-head"><h3>ط§ظ„ط£ط¯ط§ط، ط§ظ„ط´ظ‡ط±ظٹ</h3></div>' +
             '<div class="table-wrap"><table><thead><tr>' +
             '<th>ط§ظ„ط´ظ‡ط±</th><th>ط§ظ„طµط±ظپ</th><th>ط§ظ„ط·ظ„ط¨ط§طھ</th><th>ط§ظ„ظ…ط¨ظٹط¹ط§طھ</th>' +
             '<th>ROAS</th><th>ظ†ط³ط¨ط© ط§ظ„طھط³ظˆظٹظ‚</th><th>ط§ظ„ط±ط¨ط­</th><th>ظ…ظ‚ط§ط±ظ†ط© ط¨ط§ظ„ط³ط§ط¨ظ‚</th>' +
             '</tr></thead><tbody>' +
             (months.length ? rows : '<tr><td colspan="8">' + C.empty('ظ„ط§ طھظˆط¬ط¯ ط¨ظٹط§ظ†ط§طھ ط¨ط¹ط¯') + '</td></tr>') +
             '</tbody></table></div></div>' +
           '<div class="panel"><div class="panel-head"><h3>ط§ظ„ط£ط¯ط§ط، ط­ط³ط¨ ط§ظ„ظ…ظ†ط´ط£ط©</h3></div>' +
             '<div class="table-wrap"><table><thead><tr>' +
             '<th>ط§ظ„ظ…ظ†ط´ط£ط©</th><th>ط§ظ„طµط±ظپ</th><th>ط§ظ„ظ…ط¨ظٹط¹ط§طھ</th><th>ROAS</th>' +
             '<th>ظ†ط³ط¨ط© ط§ظ„طھط³ظˆظٹظ‚</th><th>ط§ظ„ط±ط¨ط­</th>' +
             '</tr></thead><tbody>' +
             (ent.length ? entRows : '<tr><td colspan="6">' + C.empty('ظ„ط§ طھظˆط¬ط¯ ط¨ظٹط§ظ†ط§طھ ط¨ط¹ط¯') + '</td></tr>') +
             '</tbody></table></div></div>';
  }

  /* ============================================================
     ط§ظ„ظ‚ظ†ظˆط§طھ
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
          '<button class="btn btn-sm" data-ch-edit="' + c.id + '">طھط¹ط¯ظٹظ„</button>' +
          '<button class="btn btn-sm btn-danger" data-ch-del="' + c.id + '">ط­ط°ظپ</button>' +
        '</div></td></tr>';
    }).join('');

    return '<div class="page-head"><div>' +
             '<h2>ط§ظ„ظ‚ظ†ظˆط§طھ ظˆط§ظ„ظ…ظ†طµط§طھ</h2>' +
             '<p>ظ‚ظ†ظˆط§طھ ط§ظ„طµط±ظپ ط§ظ„طھط³ظˆظٹظ‚ظٹ â€” ط§ظ„ط£ظ„ظˆط§ظ† ظ…ط£ط®ظˆط°ط© ظ…ظ† ظ„ظˆط­ط© ظ…ظڈطھط­ظ‚ظژظ‘ظ‚ ظ…ظ†ظ‡ط§ ظ„ط¥ظ…ظƒط§ظ†ظٹط© ط§ظ„ظˆطµظˆظ„</p>' +
           '</div><button class="btn btn-primary" id="addCh">' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M12 5v14M5 12h14"/></svg>ظ‚ظ†ط§ط© ط¬ط¯ظٹط¯ط©</button></div>' +
           '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
             '<th>ط§ظ„ظ‚ظ†ط§ط©</th><th>ط§ظ„ظ„ظˆظ†</th><th>ط¹ط¯ط¯ ط§ظ„ط¥ط¯ط®ط§ظ„ط§طھ</th><th></th>' +
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

    openModal(existing ? 'طھط¹ط¯ظٹظ„ ظ‚ظ†ط§ط©' : 'ظ‚ظ†ط§ط© ط¬ط¯ظٹط¯ط©',
      '<div class="form-grid">' +
        '<div class="field full"><label>ط§ط³ظ… ط§ظ„ظ‚ظ†ط§ط©</label>' +
          '<input id="ch_name" value="' + F.esc(c.name) + '" placeholder="ظ…ط«ط§ظ„: ط³ظ†ط§ط¨ ط´ط§طھ"></div>' +
        '<div class="field full"><label>ط§ظ„ظ„ظˆظ†</label>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' + swatches + '</div>' +
          '<span class="hint">ط£ظ„ظˆط§ظ† ظ…ط®طھط§ط±ط© ظˆظ…ظڈط®طھط¨ظژط±ط© ظ„ظ„طھظ…ظٹظٹط² ط§ظ„ط¨طµط±ظٹ ظˆط¹ظ…ظ‰ ط§ظ„ط£ظ„ظˆط§ظ†</span></div>' +
        '<div class="field full"><label>ط§ظ„ط£ظٹظ‚ظˆظ†ط©</label>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' + iconOpts + '</div></div>' +
      '</div>',
      '<button class="btn btn-primary" id="modalSave">ط­ظپط¸</button>' +
      '<button class="btn" data-close>ط¥ظ„ط؛ط§ط،</button>',
      function () {
        var name = $('#ch_name').value.trim();
        if (!name) { toast('ط§ط³ظ… ط§ظ„ظ‚ظ†ط§ط© ظ…ط·ظ„ظˆط¨', true); return; }
        var color = ($('input[name=chcolor]:checked') || {}).value || S.PALETTE[0];
        var ic = ($('input[name=chicon]:checked') || {}).value || 'dot';
        if (existing) { S.updateChannel(existing.id, { name: name, color: color, icon: ic }); toast('طھظ… ط§ظ„طھط­ط¯ظٹط«'); }
        else { S.addChannel(name, color, ic); toast('طھظ…طھ ط§ظ„ط¥ط¶ط§ظپط©'); }
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
     ط§ظ„ظ…ظ†ط´ط¢طھ
     ============================================================ */
  function viewEntities() {
    var all = S.query(null, null, 'all');
    var used = {};
    all.forEach(function (e) { used[e.entityId] = (used[e.entityId] || 0) + 1; });

    var rows = S.db.entities.map(function (x) {
      return '<tr><td style="font-weight:600">' + F.esc(x.name) + '</td>' +
        '<td class="num">' + F.int(used[x.id] || 0) + '</td>' +
        '<td><div class="t-actions">' +
          '<button class="btn btn-sm" data-ent-edit="' + x.id + '">طھط¹ط¯ظٹظ„</button>' +
          '<button class="btn btn-sm btn-danger" data-ent-del="' + x.id + '">ط­ط°ظپ</button>' +
        '</div></td></tr>';
    }).join('');

    return '<div class="page-head"><div><h2>ط§ظ„ظ…ظ†ط´ط¢طھ</h2>' +
             '<p>ط§ظ„ط¬ظ‡ط§طھ ط£ظˆ ط§ظ„ظپط±ظˆط¹ ط§ظ„طھظٹ طھظڈط³ط¬ظژظ‘ظ„ ظ…طµط±ظˆظپط§طھظ‡ط§ ظپظٹ ط§ظ„ظ†ط¸ط§ظ…</p></div>' +
           '<button class="btn btn-primary" id="addEnt">' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M12 5v14M5 12h14"/></svg>ظ…ظ†ط´ط£ط© ط¬ط¯ظٹط¯ط©</button></div>' +
           '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
             '<th>ط§ظ„ظ…ظ†ط´ط£ط©</th><th>ط¹ط¯ط¯ ط§ظ„ط¥ط¯ط®ط§ظ„ط§طھ</th><th></th>' +
           '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ============================================================
     ط³ط¬ظ„ ط§ظ„طھط¹ط¯ظٹظ„ط§طھ
     ============================================================ */
  function viewLog() {
    var rows = S.db.log.map(function (l) {
      var d = new Date(l.ts);
      var colors = { 'ط¥ط¶ط§ظپط©': 'var(--green)', 'طھط¹ط¯ظٹظ„': 'var(--amber)', 'ط­ط°ظپ': 'var(--red)' };
      return '<tr>' +
        '<td class="num">' + F.arDate(S.iso(d)) + ' â€” ' +
          String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '</td>' +
        '<td><span class="tag" style="background:var(--bg)">' +
          '<i class="dot" style="background:' + (colors[l.action] || 'var(--muted)') + '"></i>' +
          F.esc(l.action) + '</span></td>' +
        '<td>' + F.esc(l.detail) + '</td>' +
        '<td>' + F.esc(l.user) + '</td></tr>';
    }).join('');

    return '<div class="page-head"><div><h2>ط³ط¬ظ„ ط§ظ„طھط¹ط¯ظٹظ„ط§طھ</h2>' +
             '<p>ظƒظ„ ط¥ط¶ط§ظپط© ط£ظˆ طھط¹ط¯ظٹظ„ ط£ظˆ ط­ط°ظپ ظٹظڈط³ط¬ظژظ‘ظ„ ظ‡ظ†ط§ (ط¢ط®ط± 500 ط¹ظ…ظ„ظٹط©)</p></div></div>' +
           '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
             '<th>ط§ظ„طھط§ط±ظٹط® ظˆط§ظ„ظˆظ‚طھ</th><th>ط§ظ„ط¹ظ…ظ„ظٹط©</th><th>ط§ظ„طھظپط§طµظٹظ„</th><th>ط§ظ„ظ…ط³طھط®ط¯ظ…</th>' +
           '</tr></thead><tbody>' +
           (S.db.log.length ? rows : '<tr><td colspan="4">' + C.empty('ط§ظ„ط³ط¬ظ„ ظپط§ط±ط؛') + '</td></tr>') +
           '</tbody></table></div></div>';
  }

  /* ============================================================
     ط§ظ„ظپط±ظٹظ‚ ظˆط§ظ„طµظ„ط§ط­ظٹط§طھ
     ============================================================ */
  function viewTeam() {
    var canManage = ['owner', 'admin'].indexOf(S.me.role) >= 0;

    var rows = S.db.members.map(function (m) {
      return '<tr>' +
        '<td>' + (m.isMe ? '<strong>ط£ظ†طھ</strong>' : '<span class="num" style="font-family:monospace;font-size:12px">' +
          F.esc(m.userId.slice(0, 8)) + 'â€¦</span>') + '</td>' +
        '<td><span class="tag" style="background:var(--brand-50);color:var(--brand)">' +
          F.esc(S.roleName(m.role)) + '</span></td>' +
        '<td>' + (canManage && !m.isMe
          ? '<button class="btn btn-sm btn-danger" data-mem-del="' + m.userId + '">ط¥ط²ط§ظ„ط©</button>'
          : '<span style="color:var(--muted)">â€”</span>') + '</td></tr>';
    }).join('');

    var link = window.location.origin + window.location.pathname;

    return '<div class="page-head"><div>' +
             '<h2>ط§ظ„ظپط±ظٹظ‚ ظˆط§ظ„طµظ„ط§ط­ظٹط§طھ</h2>' +
             '<p>ظ…ظ†ط´ط£ط© آ«' + F.esc(S.db.orgName) + 'آ» â€” ' + S.db.members.length + ' ط¹ط¶ظˆ</p>' +
           '</div>' +
           (canManage ? '<button class="btn btn-primary" id="inviteBtn">' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
             '<path d="M12 5v14M5 12h14"/></svg>ط¯ط¹ظˆط© ط¹ط¶ظˆ</button>' : '') +
           '</div>' +
           '<div class="panel mb"><div class="panel-head"><h3>ط±ط§ط¨ط· ط§ظ„ظ†ط¸ط§ظ…</h3></div>' +
             '<div class="panel-body">' +
               '<p style="color:var(--muted);margin-bottom:12px">ط´ط§ط±ظƒ ظ‡ط°ط§ ط§ظ„ط±ط§ط¨ط· ظ…ط¹ ظپط±ظٹظ‚ظƒ. ' +
                 'ظƒظ„ ظˆط§ط­ط¯ ظٹظ†ط´ط¦ ط­ط³ط§ط¨ظ‡طŒ ظˆط¨ط¹ط¯ ظ…ط§ طھط¯ط¹ظˆظ‡ ظٹط´ظˆظپ ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ظ†ط´ط£ط© ظˆظٹظ‚ط¯ط± ظٹط¯ط®ظ‘ظ„.</p>' +
               '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
                 '<input readonly id="shareLink" value="' + F.esc(link) +
                   '" dir="ltr" style="flex:1;min-width:240px;border:1px solid var(--line);' +
                   'border-radius:10px;padding:10px 12px;background:var(--bg);font-size:13px">' +
                 '<button class="btn" id="copyLink">ظ†ط³ط® ط§ظ„ط±ط§ط¨ط·</button>' +
               '</div></div></div>' +
           '<div class="panel mb"><div class="panel-head"><h3>ط§ظ„ط£ط¹ط¶ط§ط،</h3></div>' +
             '<div class="table-wrap"><table><thead><tr>' +
               '<th>ط§ظ„ط¹ط¶ظˆ</th><th>ط§ظ„طµظ„ط§ط­ظٹط©</th><th></th>' +
             '</tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
           '<div class="panel"><div class="panel-head"><h3>ظ…ط¹ظ†ظ‰ ط§ظ„طµظ„ط§ط­ظٹط§طھ</h3></div>' +
             '<div class="table-wrap"><table><thead><tr>' +
               '<th>ط§ظ„طµظ„ط§ط­ظٹط©</th><th>ظٹظ‚ط¯ط± ظٹط³ظˆظٹ</th>' +
             '</tr></thead><tbody>' +
               '<tr><td><strong>ظ…ط§ظ„ظƒ</strong></td><td>ظƒظ„ ط´ظٹ â€” ط¨ظ…ط§ ظپظٹظ‡ ط¥ط¯ط§ط±ط© ط§ظ„ظپط±ظٹظ‚</td></tr>' +
               '<tr><td><strong>ظ…ط¯ظٹط±</strong></td><td>ط¥ط¯ط®ط§ظ„ ظˆطھط¹ط¯ظٹظ„ ظˆط­ط°ظپ + ط¯ط¹ظˆط© ط£ط¹ط¶ط§ط،</td></tr>' +
               '<tr><td><strong>ط¹ط¶ظˆ</strong></td><td>ط¥ط¯ط®ط§ظ„ ظˆطھط¹ط¯ظٹظ„ ظˆط­ط°ظپ ط§ظ„ط¨ظٹط§ظ†ط§طھ</td></tr>' +
               '<tr><td><strong>ظ…ط´ط§ظ‡ط¯ ظپظ‚ط·</strong></td><td>ط§ظ„ط§ط·ظ„ط§ط¹ ط¹ظ„ظ‰ ط§ظ„طھظ‚ط§ط±ظٹط± ط¯ظˆظ† ط£ظٹ طھط¹ط¯ظٹظ„</td></tr>' +
             '</tbody></table></div></div>';
  }

  /* ============================================================
     ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ
     ============================================================ */
  function viewSettings() {
    var s = S.db.settings;
    return '<div class="page-head"><div><h2>ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ</h2>' +
             '<p>ط§ظ„ط­ط³ط§ط¨ ط§ظ„ط¨ظ†ظƒظٹ ظˆط§ظ„ظ†ط³ط® ط§ظ„ط§ط­طھظٹط§ط·ظٹ</p></div></div>' +
      '<div class="grid grid-2">' +
        '<div class="panel"><div class="panel-head"><h3>ط§ظ„ط­ط³ط§ط¨ ط§ظ„ط¨ظ†ظƒظٹ</h3></div><div class="panel-body">' +
          '<div class="field" style="margin-bottom:12px"><label>ط§ط³ظ… ط§ظ„ط­ط³ط§ط¨</label>' +
            '<input id="setBank" value="' + F.esc(s.bankName || '') +
            '" placeholder="ظ…ط«ط§ظ„: ط§ظ„ط­ط³ط§ط¨ ط§ظ„ط±ط¦ظٹط³ظٹ â€” ط§ظ„ط±ط§ط¬ط­ظٹ"></div>' +
          '<div class="field"><label>ط§ظ„ط±طµظٹط¯ ط§ظ„ط§ظپطھطھط§ط­ظٹ (ط±.ط³)</label>' +
            '<input type="number" id="setOpening" step="0.01" value="' + (s.openingBalance || 0) + '">' +
            '<span class="hint">ط§ظ„ط±طµظٹط¯ ظ‚ط¨ظ„ طھط³ط¬ظٹظ„ ط£ظٹ ظپط§طھظˆط±ط© â€” ظƒظ„ ط§ظ„ط­ط³ط§ط¨ط§طھ طھظڈط¨ظ†ظ‰ ط¹ظ„ظٹظ‡</span></div>' +
          '<button class="btn btn-primary" id="saveSet" style="margin-top:12px">ط­ظپط¸</button>' +
        '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>ط§ظ„ظ†ط³ط® ط§ظ„ط§ط­طھظٹط§ط·ظٹ</h3></div><div class="panel-body">' +
          '<p style="color:var(--muted);margin-bottom:14px">ط¨ظٹط§ظ†ط§طھظƒ ظ…ط­ظپظˆط¸ط© ظپظٹ ط§ظ„ظ‚ط§ط¹ط¯ط© ط§ظ„ط³ط­ط§ط¨ظٹط© ظˆظ…ظ†ط³ظˆط®ط© طھظ„ظ‚ط§ط¦ظٹط§ظ‹. ' +
            'طھظ‚ط¯ط± طھظ†ط²ظ‘ظ„ ظ†ط³ط®ط© ط¥ط¶ط§ظپظٹط© ط¹ظ†ط¯ظƒ ظ…طھظ‰ ظ…ط§ ط­ط¨ظٹطھ.</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="btn" id="dlJSON">طھظ†ط²ظٹظ„ ظ†ط³ط®ط© JSON</button>' +
          '</div></div></div>' +
        '<div class="panel"><div class="panel-head"><h3>ط­ط³ط§ط¨ظƒ</h3></div><div class="panel-body">' +
          '<div style="display:flex;flex-direction:column;gap:8px;font-size:13.5px">' +
            '<div><span style="color:var(--muted)">ط§ظ„ط¨ط±ظٹط¯: </span><strong dir="ltr">' +
              F.esc(S.me.email) + '</strong></div>' +
            '<div><span style="color:var(--muted)">ط§ظ„طµظ„ط§ط­ظٹط©: </span><strong>' +
              F.esc(S.roleName(S.me.role)) + '</strong></div>' +
            '<div><span style="color:var(--muted)">ط§ظ„ظ…ظ†ط´ط£ط©: </span><strong>' +
              F.esc(S.db.orgName) + '</strong></div>' +
          '</div>' +
          '<button class="btn btn-danger" id="logoutBtn2" style="margin-top:14px">طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬</button>' +
        '</div></div>' +
      '</div>';
  }

  /* ============================================================
     ط§ظ„ظ…ظˆط¬ظ‘ظ‡
     ============================================================ */
  var VIEWS = {
    dashboard: viewDashboard, entries: viewEntries, invoices: viewInvoices,
    monthly: viewMonthly, channels: viewChannels, entities: viewEntities,
    team: viewTeam, log: viewLog, settings: viewSettings
  };

  function render() {
    var sel2 = $('#entityFilter');
    sel2.innerHTML = '<option value="all">ظƒظ„ ط§ظ„ظ…ظ†ط´ط¢طھ</option>' +
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
        'طµظ„ط§ط­ظٹطھظƒ آ«ظ…ط´ط§ظ‡ط¯ ظپظ‚ط·آ» â€” طھظ‚ط¯ط± طھط·ظ‘ظ„ط¹ ط¹ظ„ظ‰ ظƒظ„ ط§ظ„طھظ‚ط§ط±ظٹط± ظ„ظƒظ† ظ„ط§ ظٹظ…ظƒظ†ظƒ ط§ظ„ط¥ط¶ط§ظپط© ط£ظˆ ط§ظ„طھط¹ط¯ظٹظ„.' +
      '</div>';

    $('#viewHost').innerHTML = banner + (VIEWS[state.view] || viewDashboard)();
    window.scrollTo(0, 0);
  }

  /** ظٹط؛ظ„ظ‘ظپ ط¹ظ…ظ„ظٹط© ط؛ظٹط± ظ…طھط²ط§ظ…ظ†ط© ط¨ط±ط³ط§ظ„ط© ط®ط·ط£ ظ…ظˆط­ظ‘ط¯ط© */
  async function run(fn, okMsg) {
    try {
      await fn();
      if (okMsg) toast(okMsg);
      render();
      return true;
    } catch (e) {
      toast(e.message || 'طھط¹ط°ظ‘ط± ط¥طھظ…ط§ظ… ط§ظ„ط¹ظ…ظ„ظٹط©', true);
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

  /* --- أحداث المحتوى (تفويض) --- */
  $('#viewHost').addEventListener('click', async function (e) {
    var t = e.target;

    /* ---------- الفترات ---------- */
    var chip = t.closest('[data-preset]');
    if (chip) { state.preset = chip.dataset.preset; render(); return; }

    if (t.closest('#applyRange')) {
      var f = $('#fromDate').value, to = $('#toDate').value;
      if (!f || !to) { toast('حدّد تاريخ البداية والنهاية', true); return; }
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
