/* ============================================================
   report.js — تقرير الأداء الإعلاني القابل للتصدير (PNG / PDF)
   يعمل بجلستين:
     • جلسة البوابة (afnad-portal-session): الجهة ترى تقريرها هي فقط (RLS).
     • جلسة المالك/الأعضاء (الجلسة الافتراضية): ?client=<uuid> يختار الجهة.
   المصدر الوحيد للعائد والتبرعات: صفوف platform='nomu'.
   المنصات الإعلانية: الإنفاق + مرات الظهور فقط.
   ============================================================ */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var USD = 3.75;

  var PLAT_AR = { meta: 'ميتا فيسبوك وإنستغرام', snapchat: 'سناب شات', tiktok: 'تيك توك',
                  google: 'جوجل أدز', x: 'إكس', nomu: 'منصة نمو', other: 'أخرى',
                  instagram: 'إنستغرام', facebook: 'فيسبوك', youtube: 'يوتيوب', whatsapp: 'واتساب', sms: 'رسائل نصية' };
  var PLAT_COLOR = { meta: '#1877F2', snapchat: '#F5C800', tiktok: '#111', google: '#34A853', x: '#111',
                     instagram: '#E1306C', facebook: '#1877F2', youtube: '#E53935', whatsapp: '#25D366', sms: '#F57C00', other: '#8a8fa8' };
  /* المنصات المفوترة بالدولار تُعرض بالريال مع الأصل بين قوسين */
  var USD_BILLED = { snapchat: true, x: true };

  var KIND_AR = { design: 'التصاميم', video: 'مقاطع الفيديو', content: 'كتابة المحتوى',
                  campaign_new: 'حملات جديدة', campaign_edit: 'تعديل حملات', report: 'تقارير',
                  meeting: 'اجتماعات', general: 'منجزات أخرى' };
  var CONTENT_KINDS = ['design', 'video', 'content'];

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function money(n) { return (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money0(n) { return Math.round(n).toLocaleString('en-US'); }
  function int(n) { return Math.round(n).toLocaleString('en-US'); }
  function iso(d) { var p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function arDate(s) { var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  /* dd/mm/yyyy ← → yyyy-mm-dd (حقل نصي بدل input[type=date]) */
  function fromDisp(str) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((str || '').trim());
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3], dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return iso(dt);
  }
  var MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  function periodLabel(from, to) {
    var a = from.split('-'), b = to.split('-');
    if (a[0] === b[0] && a[1] === b[1] && a[2] === '01') {
      var last = new Date(+a[0], +a[1], 0).getDate();
      if (+b[2] === last) return 'شهر ' + MONTHS[+a[1] - 1] + ' ' + a[0];
    }
    return arDate(from) + ' — ' + arDate(to);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fail(msg) { $('#boot').hidden = true; var e = $('#err'); e.textContent = msg; e.hidden = false; }

  /* ---------- الجلسة والجهة ---------- */
  var qs = new URLSearchParams(location.search);
  var sb, client, isPortal = false;

  async function resolveClient() {
    if (!window.SUPA_READY) throw new Error('لم تُضبط مفاتيح الاتصال');
    var cfg = window.SUPA_CONFIG;
    // أولاً: جلسة البوابة (الجهة)
    var pb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { storageKey: 'afnad-portal-session' } });
    var ps = await pb.auth.getSession();
    if (ps.data && ps.data.session) {
      var link = await pb.from('client_users').select('client_id').eq('user_id', ps.data.session.user.id).maybeSingle();
      if (link.data) { sb = pb; isPortal = true; return link.data.client_id; }
    }
    // ثانياً: جلسة المالك + معرّف الجهة في الرابط
    var ob = window.supabase.createClient(cfg.url, cfg.anonKey);
    var os = await ob.auth.getSession();
    if (os.data && os.data.session) {
      var id = qs.get('client');
      if (!id) throw new Error('أضف ?client=<معرّف الجهة> إلى الرابط، أو افتح التقرير من صفحة الجمعيات');
      sb = ob; return id;
    }
    throw new Error('سجّل الدخول أولاً (من بوابة الجهات أو من النظام الإداري)');
  }

  /* ---------- المدى ---------- */
  function defaultRange() {
    var f = qs.get('from'), t = qs.get('to');
    if (f && t) return { from: f, to: t };
    var d = new Date(), y = d.getFullYear(), m = d.getMonth();
    // الافتراضي: الشهر الماضي كاملاً (التقرير الشهري المعتاد)
    return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  }
  var range = defaultRange();

  /* ---------- البيانات ---------- */
  var data = { client: null, reports: [], followers: [], events: [] };

  async function load(clientId) {
    var c = await sb.from('clients').select('*').eq('id', clientId).maybeSingle();
    if (c.error) throw new Error(c.error.message);
    if (!c.data) throw new Error('تعذّر تحميل بيانات الجهة');
    data.client = c.data;

    var r = await sb.from('client_reports').select('*').eq('client_id', clientId)
              .gte('report_date', range.from).lte('report_date', range.to);
    if (r.error) throw new Error(r.error.message);
    data.reports = r.data || [];

    var f = await sb.from('client_followers').select('*').eq('client_id', clientId).lte('snap_date', range.to).order('snap_date');
    data.followers = f.error ? [] : (f.data || []);   // الجدول قد لا يكون موجوداً قبل الهجرة

    var e = await sb.from('client_events').select('*').eq('client_id', clientId)
              .gte('event_date', range.from).lte('event_date', range.to);
    data.events = e.error ? [] : (e.data || []);
  }

  /* ---------- الحسابات ---------- */
  function compute() {
    var byPlat = {}, spend = 0, rev = 0, don = 0, impr = 0;
    data.reports.forEach(function (x) {
      var p = x.platform || 'meta';
      var b = byPlat[p] || (byPlat[p] = { spend: 0, impr: 0 });
      b.spend += num(x.spend); b.impr += num(x.impressions);
      if (p === 'nomu') { rev += num(x.revenue); don += num(x.donations); }
      else { spend += num(x.spend); impr += num(x.impressions); }
    });
    delete byPlat.nomu;
    var plats = Object.keys(byPlat).sort(function (a, b) { return byPlat[b].spend - byPlat[a].spend; });

    // المتابعون: "قبل" = آخر لقطة قبل بداية الفترة، "بعد" = آخر لقطة ≤ نهاية الفترة — لكل منصة ثم المجموع
    var folBefore = {}, folAfter = {};
    data.followers.forEach(function (s) {
      if (s.snap_date < range.from) folBefore[s.platform] = num(s.followers);
      folAfter[s.platform] = num(s.followers);
    });
    // منصة لها "بعد" ولا "قبل": نعتبر أول لقطة داخل الفترة هي "قبل" حتى لا يظهر نمو وهمي
    var firstIn = {};
    data.followers.forEach(function (s) { if (s.snap_date >= range.from && !(s.platform in firstIn)) firstIn[s.platform] = num(s.followers); });
    Object.keys(folAfter).forEach(function (p) { if (!(p in folBefore)) folBefore[p] = (p in firstIn) ? firstIn[p] : folAfter[p]; });
    var sum = function (o) { return Object.keys(o).reduce(function (a, k) { return a + o[k]; }, 0); };

    // المحتويات المنفَّذة من سير العمل
    var byKind = {};
    data.events.forEach(function (e) { byKind[e.kind || 'general'] = (byKind[e.kind || 'general'] || 0) + Math.max(1, num(e.qty)); });
    var contentTotal = CONTENT_KINDS.reduce(function (a, k) { return a + (byKind[k] || 0); }, 0);

    return { byPlat: byPlat, plats: plats, spend: spend, rev: rev, don: don, impr: impr,
             roas: spend > 0 ? rev / spend : 0, net: rev - spend,
             folBefore: folBefore, folAfter: folAfter, folB: sum(folBefore), folA: sum(folAfter),
             byKind: byKind, contentTotal: contentTotal };
  }

  /* ---------- العرض ---------- */
  function setLogo(imgId, fbId) {
    var img = $('#' + imgId), fb = $('#' + fbId);
    if (data.client.logo_url) { img.src = data.client.logo_url; img.hidden = false; fb.textContent = ''; }
    else { img.hidden = true; fb.textContent = data.client.name; }
  }

  function render() {
    var k = compute(), c = data.client;
    var sub = c.name + '، بإدارة أفناد سنا';
    var pl = periodLabel(range.from, range.to);
    $('#tbName').textContent = c.name; $('#tbRange').textContent = arDate(range.from) + ' — ' + arDate(range.to);
    $('#tbFrom').value = arDate(range.from); $('#tbTo').value = arDate(range.to);
    document.title = 'تقرير الأداء الإعلاني — ' + c.name + ' — ' + pl;

    $('#subTitle').textContent = sub; $('#subTitle2').textContent = sub;
    $('#periodPill').textContent = pl; $('#periodPill2').textContent = pl;
    setLogo('clientLogo', 'clientLogoFallback'); setLogo('clientLogo2', 'clientLogoFallback2');

    // الإنفاق حسب المنصة
    $('#platList').innerHTML = k.plats.length ? k.plats.map(function (p) {
      var b = k.byPlat[p];
      return '<div class="rp-plat"><i class="bar" style="background:' + (PLAT_COLOR[p] || PLAT_COLOR.other) + '"></i>' +
        '<span class="name">' + esc(PLAT_AR[p] || p) + '</span>' +
        (USD_BILLED[p] && b.spend > 0 ? '<span class="usd num">(' + money(b.spend / USD) + '$)</span>' : '') +
        '<span class="amt num">' + money(b.spend) + ' ر.س</span></div>';
    }).join('') : '<div class="rp-plat" style="color:var(--muted);justify-content:center">لا إنفاق مسجّل في الفترة</div>';
    $('#totSpend').textContent = money(k.spend) + ' ر.س';

    // العائد والأثر
    $('#totRev').textContent = money0(k.rev) + ' ر.س';
    $('#totDon').textContent = int(k.don);
    // عدد المتبرعين لا يُخزَّن حالياً في النظام؛ نُظهر "—" بدل رقم غير صحيح
    $('#totDonors').textContent = '—';
    $('#roas').textContent = k.spend > 0 ? k.roas.toFixed(2) + '×' : '—';
    $('#net').textContent = (k.net >= 0 ? '+' : '−') + money0(Math.abs(k.net)) + ' ر.س';
    $('#net').style.color = k.net >= 0 ? '#0a7d58' : 'var(--red)';

    // المعايير الأساسية
    $('#kImpr').textContent = int(k.impr);
    $('#kFolBefore').textContent = int(k.folB); $('#kFolAfter').textContent = int(k.folA);
    var d = k.folA - k.folB, dl = $('#kFolDelta');
    if (!data.followers.length) { dl.textContent = 'لا لقطات متابعين مسجّلة'; dl.className = ''; }
    else { dl.textContent = (d >= 0 ? '+' : '−') + int(Math.abs(d)) + ' متابع' + (k.folB > 0 ? ' (' + (d >= 0 ? '+' : '−') + Math.abs(d / k.folB * 100).toFixed(1) + '%)' : ''); dl.className = d >= 0 ? 'up' : 'down'; }
    $('#kContent').textContent = int(k.contentTotal);
    $('#kContentBreak').textContent = CONTENT_KINDS.filter(function (x) { return k.byKind[x]; })
      .map(function (x) { return KIND_AR[x] + ' ' + int(k.byKind[x]); }).join(' · ') || 'لا محتويات مسجّلة في سير العمل';

    // الصفحة 2: الوصول حسب المنصة (الظهور + المتابعون + عدد المنشورات من سير العمل عند توفرها)
    var reachPlats = {};
    k.plats.forEach(function (p) { reachPlats[p] = true; });
    Object.keys(k.folAfter).forEach(function (p) { reachPlats[p] = true; });
    var order = ['x', 'snapchat', 'instagram', 'meta', 'tiktok', 'facebook', 'youtube', 'whatsapp', 'google', 'sms', 'other'];
    var list = order.filter(function (p) { return reachPlats[p]; });
    $('#reachGrid').innerHTML = list.length ? list.map(function (p) {
      var b = k.byPlat[p] || { spend: 0, impr: 0 };
      var fb = k.folBefore[p], fa = k.folAfter[p];
      var rows = '';
      if (fa != null) rows += '<div class="rp-row"><span>عدد المتابعين</span><span class="num">' + int(fa) + (fb != null && fa !== fb ? ' <small style="color:' + (fa >= fb ? '#0a7d58' : 'var(--red)') + '">(' + (fa >= fb ? '+' : '−') + int(Math.abs(fa - fb)) + ')</small>' : '') + '</span></div>';
      if (b.impr) rows += '<div class="rp-row"><span>عدد مرات الظهور</span><span class="num">' + int(b.impr) + '</span></div>';
      if (b.spend) rows += '<div class="rp-row"><span>الإنفاق الإعلاني</span><span class="num">' + money(b.spend) + ' ر.س</span></div>';
      rows += '<div class="rp-row tot"><b>وصلنا</b><span class="num">' + int(b.impr + (fa || 0)) + '</span></div>';
      return '<div class="rp-block' + (!b.impr && fa == null ? ' empty' : '') + '">' +
        '<div class="bh" style="background:' + (PLAT_COLOR[p] || PLAT_COLOR.other) + '"><span class="ic">●</span>' + esc(PLAT_AR[p] || p) + '</div>' + rows + '</div>';
    }).join('') : '<p style="grid-column:1/-1;color:var(--muted);text-align:center;padding:30px">لا بيانات وصول في الفترة. سجّل مرات الظهور في التقرير اليومي ولقطات المتابعين.</p>';
    $('#reachTotal').textContent = int(k.impr);

    // الإنتاج الفني
    var kinds = Object.keys(k.byKind).sort(function (a, b) { return k.byKind[b] - k.byKind[a]; });
    $('#prodTable tbody').innerHTML = kinds.length ? kinds.map(function (x, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(KIND_AR[x] || x) + '</td><td class="num">' + int(k.byKind[x]) + '</td></tr>';
    }).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--muted)">لا منجزات مسجّلة في الفترة</td></tr>';

    $('#boot').hidden = true; $('#pages').hidden = false;
  }

  /* ---------- التصدير ---------- */
  function fileBase() {
    return 'تقرير-' + data.client.name.replace(/\s+/g, '-') + '-' + range.from + '_' + range.to;
  }
  async function exportPng() {
    var btn = $('#tbPng'); btn.disabled = true; btn.textContent = 'جارٍ التصدير…';
    try {
      var pages = document.querySelectorAll('.rp-page');
      for (var i = 0; i < pages.length; i++) {
        var canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
          onclone: function (doc) { var p = doc.querySelector('.rp-pages'); if (p) p.style.transform = 'none'; } });
        var a = document.createElement('a');
        a.download = fileBase() + '-' + (i + 1) + '.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
        await new Promise(function (r) { setTimeout(r, 400); });
      }
    } catch (e) { alert('تعذّر التصدير: ' + e.message); }
    btn.disabled = false; btn.textContent = 'تصدير PNG';
  }

  /* ---------- الأحداث ---------- */
  $('#tbApply').addEventListener('click', function () {
    var f = fromDisp($('#tbFrom').value), t = fromDisp($('#tbTo').value);
    if (!f || !t) { alert('اكتب التاريخ بصيغة يوم/شهر/سنة — مثال 01/09/2026'); return; }
    if (f > t) { alert('تاريخ البداية بعد تاريخ النهاية'); return; }
    var u = new URL(location.href); u.searchParams.set('from', f); u.searchParams.set('to', t);
    location.href = u.toString();
  });
  $('#tbPng').addEventListener('click', exportPng);
  $('#tbPdf').addEventListener('click', function () { window.print(); });

  /* ---------- التشغيل ---------- */
  (async function boot() {
    try {
      var id = await resolveClient();
      await load(id);
      render();
    } catch (e) { fail(e.message || 'تعذّر تحميل التقرير'); }
  })();
})();
