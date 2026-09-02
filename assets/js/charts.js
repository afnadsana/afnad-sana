/* ============================================================
   charts.js — التنسيق والرسوم البيانية (SVG خالص، بلا مكتبات)
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- التنسيق ---------- */
  var AR = 'ar-SA';

  function money(n, dec) {
    if (!isFinite(n)) n = 0;
    return n.toLocaleString('en-US', {
      minimumFractionDigits: dec === undefined ? 2 : dec,
      maximumFractionDigits: dec === undefined ? 2 : dec
    });
  }
  function sar(n, dec) { return money(n, dec) + ' ر.س'; }
  function sarShort(n) { return compact(n) + ' ر.س'; }
  function int(n) { return Math.round(n || 0).toLocaleString('en-US'); }
  function compact(n) {
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return money(n, 0);
  }
  function pct(n, dec) { return (isFinite(n) ? n : 0).toFixed(dec === undefined ? 1 : dec) + '%'; }
  function roas(n) { return (isFinite(n) ? n : 0).toFixed(2) + 'x'; }

  function arDate(isoStr) {
    var p = isoStr.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  var MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  function arMonth(ym) {
    var p = ym.split('-');
    return MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  /** نسبة التغير بين قيمتين مع اتجاهها */
  function delta(cur, prev) {
    if (!prev) return { v: cur ? 100 : 0, dir: cur ? 'up' : 'flat' };
    var d = ((cur - prev) / Math.abs(prev)) * 100;
    return { v: Math.abs(d), dir: d > 0.05 ? 'up' : (d < -0.05 ? 'down' : 'flat') };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- أيقونات القنوات ---------- */
  var ICONS = {
    send:   '<path d="m22 2-7 20-4-9-9-4 20-7z"/>',
    users:  '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
    chat:   '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5a8.4 8.4 0 0 1-.9-3.9 8.4 8.4 0 0 1 8.4-9 8.4 8.4 0 0 1 8.6 8.4z"/>',
    music:  '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    ghost:  '<path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-2 3 2 2-2 2 2 3-2 3 2V10a8 8 0 0 0-8-8z"/>',
    camera: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    dot:    '<circle cx="12" cy="12" r="8"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
           (ICONS[name] || ICONS.dot) + '</svg>';
  }

  /* ============================================================
     رسم الأعمدة الأفقية — الصرف حسب الجهة
     كل صف يحمل اسم القناة وقيمته نصّاً، فاللون تعزيز للهوية لا مصدرها الوحيد.
     يُعرض أعلى 7 قنوات ويُدمج الباقي في "أخرى" (لا تُولَّد ألوان جديدة).
     ============================================================ */
  function barsHTML(rows, opts) {
    opts = opts || {};
    var valueKey = opts.valueKey || 'cost';
    var fmt = opts.fmt || sar;
    var MAX = opts.max || 7;

    if (!rows.length) return emptyHTML('لا توجد بيانات في هذه الفترة');

    var list = rows.slice();
    if (list.length > MAX) {
      var head = list.slice(0, MAX);
      var tail = list.slice(MAX);
      var sum = tail.reduce(function (a, r) { return a + (r[valueKey] || 0); }, 0);
      head.push({
        channel: { name: 'أخرى (' + tail.length + ' قنوات)', color: '#94a3b8' },
        _other: true,
        __v: sum
      });
      head[head.length - 1][valueKey] = sum;
      list = head;
    }

    var maxV = Math.max.apply(null, list.map(function (r) { return r[valueKey] || 0; })) || 1;

    return '<div class="bars">' + list.map(function (r) {
      var v = r[valueKey] || 0;
      var w = Math.max((v / maxV) * 100, v > 0 ? 1.5 : 0);
      var c = r.channel ? r.channel.color : '#94a3b8';
      var nm = r.channel ? r.channel.name : '—';
      var tip = nm + ' — ' + fmt(v) +
                (r.orders ? ' · ' + int(r.orders) + ' طلب' : '') +
                (r.roas ? ' · ROAS ' + roas(r.roas) : '');
      return '<div class="bar-row" title="' + esc(tip) + '">' +
               '<div class="bar-top">' +
                 '<span class="bar-label"><i class="dot" style="background:' + c + '"></i>' + esc(nm) + '</span>' +
                 '<span class="bar-value num">' + esc(fmt(v)) + '</span>' +
               '</div>' +
               '<div class="bar-track"><div class="bar-fill" style="width:' + w + '%;background:' + c + '"></div></div>' +
             '</div>';
    }).join('') + '</div>';
  }

  /* ============================================================
     رسم خطي/مساحي — تطور الصرف والمبيعات عبر الزمن
     محور واحد فقط: نُظهر سلسلتين بنفس الوحدة (ر.س) — الصرف والمبيعات.
     ============================================================ */
  function lineHTML(days, opts) {
    opts = opts || {};
    var series = opts.series || [
      { key: 'cost',  name: 'الصرف التسويقي', color: '#4f46e5' },
      { key: 'sales', name: 'المبيعات',        color: '#0d9488' }
    ];
    if (!days.length) return emptyHTML('لا توجد بيانات في هذه الفترة');

    var W = 760, H = 240, PL = 56, PR = 14, PT = 16, PB = 30;
    var iw = W - PL - PR, ih = H - PT - PB;

    var maxV = 0;
    days.forEach(function (d) {
      series.forEach(function (s) { if (d[s.key] > maxV) maxV = d[s.key]; });
    });
    maxV = niceMax(maxV);

    var n = days.length;
    var x = function (i) { return PL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw); };
    var y = function (v) { return PT + ih - (v / maxV) * ih; };

    // خطوط الشبكة الأفقية + تدرج المحور
    var ticks = 4, grid = '', axis = '';
    for (var t = 0; t <= ticks; t++) {
      var gv = (maxV / ticks) * t, gy = y(gv);
      grid += '<line class="grid-l" x1="' + PL + '" y1="' + gy + '" x2="' + (W - PR) + '" y2="' + gy +
              '" stroke-width="1"/>';
      axis += '<text x="' + (W - PR + 6) + '" y="' + (gy + 4) +
              '" class="ax" text-anchor="start">' + compact(gv) + '</text>';
    }

    // تسميات المحور السيني (٤ نقاط فقط لتفادي التزاحم)
    var xlab = '';
    var step = Math.max(1, Math.floor((n - 1) / 3));
    for (var i = 0; i < n; i += step) {
      xlab += '<text x="' + x(i) + '" y="' + (H - 8) + '" class="ax" text-anchor="middle">' +
              days[i].date.slice(5).split('-').reverse().join('/') + '</text>';
    }

    var paths = series.map(function (s) {
      var pts = days.map(function (d, i) { return x(i) + ',' + y(d[s.key]); });
      var line = 'M' + pts.join(' L');
      var area = line + ' L' + x(n - 1) + ',' + y(0) + ' L' + x(0) + ',' + y(0) + ' Z';
      var last = days[n - 1];
      return '<path d="' + area + '" fill="' + s.color + '" opacity=".10"/>' +
             '<path d="' + line + '" fill="none" stroke="' + s.color +
             '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
             '<circle cx="' + x(n - 1) + '" cy="' + y(last[s.key]) + '" r="4.5" fill="' + s.color +
             '" stroke="#fff" stroke-width="2"/>';
    }).join('');

    // طبقة التمرير: شريط شفاف لكل يوم + خط تتبع
    var hot = days.map(function (d, i) {
      var bw = iw / Math.max(n - 1, 1);
      var tipLines = series.map(function (s) { return s.name + ': ' + sar(d[s.key]); }).join('\n');
      return '<rect x="' + (x(i) - bw / 2) + '" y="' + PT + '" width="' + bw + '" height="' + ih +
             '" fill="transparent" class="hot"><title>' + esc(arDate(d.date) + '\n' + tipLines) +
             '</title></rect>';
    }).join('');

    var legend = '<div class="legend">' + series.map(function (s) {
      return '<span><i class="dot" style="background:' + s.color + '"></i>' + esc(s.name) + '</span>';
    }).join('') + '</div>';

    return '<div class="chart-scroll">' +
             '<svg viewBox="0 0 ' + W + ' ' + H + '" class="linechart" preserveAspectRatio="xMidYMid meet">' +
               '<style>.ax{font-size:10px;fill:#8a8fa8;font-family:inherit}' +
               '.hot:hover{fill:rgba(79,70,229,.05)}</style>' +
               grid + axis + xlab + paths + hot +
             '</svg>' +
           '</div>' + legend;
  }

  function niceMax(v) {
    if (v <= 0) return 100;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var r = v / mag;
    var step = r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10;
    return step * mag;
  }

  function emptyHTML(msg) {
    return '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
           '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg><p>' + esc(msg) + '</p></div>';
  }

  global.Fmt = {
    money: money, sar: sar, sarShort: sarShort, int: int, compact: compact, pct: pct, roas: roas,
    arDate: arDate, arMonth: arMonth, delta: delta, esc: esc, icon: icon, MONTHS: MONTHS
  };
  global.Charts = { bars: barsHTML, line: lineHTML, empty: emptyHTML };

})(window);
