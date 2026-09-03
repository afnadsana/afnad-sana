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
    reports: [],       // تقارير الأداء اليومية (صف لكل منصة)
    events: [],        // سير العمل
    range: 'last30',   // today | last7 | last30 | thisMonth | all | custom
    from: null, to: null
  };

  function client() {
    if (sb) return sb;
    if (!window.SUPA_READY) throw new Error('لم تُضبط مفاتيح الاتصال');
    // مفتاح تخزين مستقل: البوابة والنظام الإداري على نفس النطاق، ولولا
    // الفصل لتشارَكا الجلسة ودخلت البوابة بحساب المالك.
    sb = window.supabase.createClient(window.SUPA_CONFIG.url, window.SUPA_CONFIG.anonKey, {
      auth: { storageKey: 'afnad-portal-session' }
    });
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
      case 'custom':    return { from: state.from, to: state.to };
      default:          return { from: addDays(t, -29), to: t };
    }
  }

  /* حقل تاريخ بأرقام لاتينية — كروم يرسم input[type=date] بلغة الواجهة */
  function toDisp(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function fromDisp(str) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((str || '').trim());
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3];
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    var p = function (n) { return String(n).padStart(2, '0'); };
    return y + '-' + p(mo) + '-' + p(d);
  }
  function dateBox(id, iso) {
    return '<span class="dpick">' +
      '<input type="text" id="' + id + '" class="dp-text" dir="ltr" inputmode="numeric" ' +
        'placeholder="dd/mm/yyyy" maxlength="10" value="' + toDisp(iso) + '">' +
      '<input type="date" class="dp-native" id="' + id + '_n" value="' + (iso || '') + '" ' +
        'tabindex="-1" aria-hidden="true">' +
      '<button type="button" class="dp-btn" data-dp="' + id + '" aria-label="اختيار تاريخ">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>' +
      '</button></span>';
  }
  function inRange(dateStr, r) {
    if (r.from && dateStr < r.from) return false;
    if (r.to && dateStr > r.to) return false;
    return true;
  }

  /* ---------- تحميل البيانات ---------- */
  async function loadAll() {
    var db = client();

    var u = await db.auth.getUser();
    var uid = u.data && u.data.user ? u.data.user.id : null;
    if (!uid) throw new Error('انتهت الجلسة، سجّل الدخول من جديد');

    // الجهة تُحدَّد من ربط الحساب صراحةً — لا بأول صف تُرجعه القاعدة
    var link = await db.from('client_users').select('client_id')
                 .eq('user_id', uid).maybeSingle();
    if (link.error) throw new Error(link.error.message);
    if (!link.data) {
      throw new Error('هذا الحساب غير مرتبط بأي جهة. أنشئ حساباً برمز الدعوة، أو تواصل مع إدارة أفناد سنا.');
    }

    var cRes = await db.from('clients').select('*').eq('id', link.data.client_id).maybeSingle();
    if (cRes.error) throw new Error(cRes.error.message);
    if (!cRes.data) throw new Error('تعذّر تحميل بيانات جهتك');
    var c = cRes.data;
    state.client = {
      id: c.id, name: c.name, contractStatus: c.contract_status,
      contractStart: c.contract_start, contractEnd: c.contract_end,
      note: c.note || ''
    };

    var rRes = await db.from('client_reports').select('*')
                 .eq('client_id', c.id).order('report_date', { ascending: false });
    state.reports = (rRes.data || []).map(function (x) {
      return {
        date: x.report_date, platform: x.platform || 'meta',
        spend: num(x.spend), revenue: num(x.revenue), donations: num(x.donations)
      };
    });

    var eRes = await db.from('client_events').select('*')
                 .eq('client_id', c.id).order('event_date', { ascending: false });
    state.events = (eRes.data || []).map(function (x) {
      return { date: x.event_date, kind: x.kind || 'general',
               title: x.title, note: x.note || '' };
    });
  }

  var PLATFORM_AR = {
    meta: 'ميتا', snapchat: 'سناب شات', tiktok: 'تيك توك',
    google: 'جوجل', x: 'إكس', nomu: 'منصة نمو', other: 'أخرى'
  };
  var KIND_AR = {
    campaign_new: 'حملة جديدة', campaign_edit: 'تعديل حملة', video: 'مونتاج مقطع',
    design: 'تصميم', content: 'محتوى', report: 'تقرير أداء',
    meeting: 'اجتماع', general: 'منجز',
    // مفاتيح قديمة محفوظة للتوافق
    campaign: 'حملة', launch: 'إطلاق', update: 'تحديث'
  };
  var KIND_COLOR = {
    campaign_new: 'var(--brand)', campaign_edit: 'var(--amber)', video: 'var(--cyan)',
    design: 'var(--violet)', content: 'var(--green)', report: 'var(--green)',
    meeting: 'var(--muted)', general: 'var(--muted)',
    campaign: 'var(--brand)', launch: 'var(--amber)', update: 'var(--muted)'
  };

  /** تجميع صفوف المنصات ليوم واحد */
  function byDay(rows) {
    var map = {};
    rows.forEach(function (r) {
      var d = map[r.date] || (map[r.date] = { date: r.date, spend: 0, revenue: 0, donations: 0, plats: [] });
      d.spend += r.spend; d.revenue += r.revenue; d.donations += r.donations;
      d.plats.push(r);
    });
    return Object.keys(map).sort().reverse().map(function (k) {
      var d = map[k];
      d.roas = d.spend > 0 ? d.revenue / d.spend : 0;
      d.plats.sort(function (a, b) { return b.spend - a.spend; });
      return d;
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
      money: '<text x="12" y="17.5" text-anchor="middle" font-size="12.5" font-weight="800" ' +
             'fill="currentColor" stroke="none">ر.س</text>',
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
    var donations = rows.reduce(function (a, x) { return a + x.donations; }, 0);
    var roas = spend > 0 ? revenue / spend : 0;
    var days = byDay(rows);

    /* الإنفاق لكل منصة */
    var byPlat = {};
    rows.forEach(function (r) {
      var p = byPlat[r.platform] || (byPlat[r.platform] = { spend: 0, revenue: 0, donations: 0 });
      p.spend += r.spend; p.revenue += r.revenue; p.donations += r.donations;
    });
    var platKeys = Object.keys(byPlat).sort(function (a, b) { return byPlat[b].spend - byPlat[a].spend; });
    var maxPlat = platKeys.length ? byPlat[platKeys[0]].spend : 1;
    var platHTML = platKeys.length ? '<div class="bars">' + platKeys.map(function (k) {
      var p = byPlat[k];
      return '<div class="bar-row">' +
        '<div class="bar-top"><span class="bar-label">' + (PLATFORM_AR[k] || k) + '</span>' +
        '<span class="bar-value num">' + F.money(p.spend) + ' ر.س</span></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' +
          Math.max((p.spend / (maxPlat || 1)) * 100, 2) + '%;background:var(--brand)"></div></div>' +
        '<span class="hint">' + F.int(p.donations) + ' تبرع · عائد ' + F.money(p.revenue) + ' ر.س</span>' +
      '</div>';
    }).join('') + '</div>' : window.Charts.empty('لا يوجد إنفاق في هذه الفترة');

    /* سير العمل */
    var evs = state.events.filter(function (x) { return inRange(x.date, r); });
    var timeline = evs.length
      ? '<ul class="timeline">' + evs.map(function (e) {
          return '<li>' +
            '<span class="tl-dot" style="background:' + (KIND_COLOR[e.kind] || 'var(--muted)') + '"></span>' +
            '<div class="tl-body">' +
              '<div class="tl-head"><span class="tl-kind" style="background:' +
                (KIND_COLOR[e.kind] || 'var(--muted)') + '">' + (KIND_AR[e.kind] || 'حدث') + '</span>' +
                '<span class="tl-date num">' + F.arDate(e.date) + '</span></div>' +
              '<strong>' + F.esc(e.title) + '</strong>' +
              (e.note ? '<p>' + F.esc(e.note) + '</p>' : '') +
            '</div></li>';
        }).join('') + '</ul>'
      : '<p class="hint" style="padding:6px 2px">لا توجد أحداث مسجّلة في هذه الفترة.</p>';

    var st = STATUS[c.contractStatus] || STATUS.active;

    var presets = [['today', 'اليوم'], ['last7', 'آخر 7 أيام'], ['last30', 'آخر 30 يوم'],
                   ['thisMonth', 'هذا الشهر'], ['all', 'كل الفترات']];
    var chips = presets.map(function (p) {
      return '<button class="chip' + (state.range === p[0] ? ' active' : '') +
             '" data-range="' + p[0] + '">' + p[1] + '</button>';
    }).join('') +
      '<span class="spacer"></span>' +
      '<div class="date-range">' +
        '<span class="range-label num">' +
          (r.from && r.to ? F.arDate(r.from) + ' — ' + F.arDate(r.to) : 'كل السجل') + '</span>' +
        dateBox('pFrom', r.from) + '<span>إلى</span>' + dateBox('pTo', r.to) +
        '<button class="btn btn-primary btn-sm" id="pApply">تطبيق</button>' +
      '</div>';

    /* جدول الأداء اليومي — إجمالي اليوم مع تفصيل المنصات */
    var tbl = days.map(function (d) {
      return '<tr>' +
        '<td class="num">' + F.arDate(d.date) + '</td>' +
        '<td class="num">' + F.money(d.spend) + '</td>' +
        '<td class="num" style="font-weight:700">' + F.int(d.donations) + '</td>' +
        '<td class="num">' + F.money(d.revenue) + '</td>' +
        '<td class="num" style="font-weight:800;color:' +
          (d.roas >= 1 ? 'var(--green)' : 'var(--red)') + '">' + d.roas.toFixed(2) + 'x</td>' +
        '<td>' + d.plats.map(function (p) {
          return '<span class="tag" style="background:var(--bg);color:var(--muted);margin-inline-end:4px">' +
            (PLATFORM_AR[p.platform] || p.platform) + ' ' +
            '<b class="num" style="color:var(--text)">' + F.money(p.spend) + '</b></span>';
        }).join('') + '</td>' +
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
        kpi('الإنفاق', F.money(spend) + ' ر.س', 'إجمالي الصرف على حملاتكم', 'money') +
        kpi('العائد', F.money(revenue) + ' ر.س', 'إجمالي التبرعات المحصّلة', 'cart') +
        kpi('عدد التبرعات', F.int(donations), 'عملية تبرع خلال الفترة', 'pct') +
        kpi('ROAS', roas.toFixed(2) + 'x', 'العائد ÷ الإنفاق', 'trend') +
      '</div>' +

      '<div class="grid grid-2 mb">' +
        '<div class="panel"><div class="panel-head"><h3>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-3"/></svg>' +
          'الإنفاق حسب المنصة</h3></div>' +
          '<div class="panel-body">' + platHTML + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>' +
          'الإنفاق مقابل العائد</h3></div>' +
          '<div class="panel-body">' + chartHTML(days) + '</div></div>' +
      '</div>' +

      '<div class="panel mb"><div class="panel-head"><h3>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
        'سير العمل</h3>' +
        '<span class="hint">' + evs.length + ' حدث في الفترة</span></div>' +
        '<div class="panel-body">' + timeline + '</div></div>' +

      '<div class="panel"><div class="panel-head"><h3>تفصيل الأداء اليومي</h3></div>' +
        '<div class="table-wrap"><table><thead><tr>' +
          '<th>التاريخ</th><th>الإنفاق</th><th>عدد التبرعات</th><th>العائد</th>' +
          '<th>ROAS</th><th>الإنفاق حسب المنصة</th>' +
        '</tr></thead><tbody>' +
        (days.length ? tbl : '<tr><td colspan="6">' +
          emptyBox('لا توجد تقارير في هذه الفترة', 'ستظهر هنا بمجرد تسجيل أول تقرير.') + '</td></tr>') +
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
  var mode = 'signin';

  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(function (x) {
        x.classList.toggle('active', x === b);
      });
      $('#codeField').hidden = mode !== 'signup';
      $('#pPass').setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
      $('#pSubmit').textContent = mode === 'signup' ? 'إنشاء الحساب' : 'تسجيل الدخول';
      $('#authMsg').hidden = true;
    });
  });

  $('#authForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('#pSubmit');
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = mode === 'signup' ? 'جارٍ الإنشاء…' : 'جارٍ الدخول…';
    $('#authMsg').hidden = true;
    var db = client();
    var email = $('#pEmail').value.trim();
    var pass = $('#pPass').value;

    try {
      if (mode === 'signup') {
        var code = $('#pCode').value.trim();
        if (!code) throw new Error('رمز الدعوة مطلوب');

        var su = await db.auth.signUp({ email: email, password: pass });
        if (su.error) throw new Error(su.error.message);
        if (su.data.user && su.data.user.identities && su.data.user.identities.length === 0) {
          // البريد مسجّل مسبقاً — نحاول الدخول به ثم نربطه بالرمز
          var si = await db.auth.signInWithPassword({ email: email, password: pass });
          if (si.error) throw new Error('هذا البريد مسجّل مسبقاً بكلمة مرور مختلفة');
        } else if (!su.data.session) {
          showAuth('أُنشئ حسابك. افتح بريدك وأكّده ثم سجّل الدخول وأدخل رمز الدعوة.', false);
          return;
        }

        var rd = await db.rpc('redeem_portal_code', { p_code: code });
        if (rd.error) throw new Error(rd.error.message);
        if (!rd.data || !rd.data.ok) throw new Error((rd.data && rd.data.reason) || 'تعذّر ربط الحساب');
        await enter();
        return;
      }

      var r = await db.auth.signInWithPassword({ email: email, password: pass });
      if (r.error) throw new Error('البريد أو كلمة المرور غير صحيحة');
      await enter();
    } catch (err) {
      showAuth(err.message, true);
    } finally {
      btn.disabled = false; btn.textContent = original;
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
    if (c) { state.range = c.dataset.range; render(); return; }

    var dp = e.target.closest('[data-dp]');
    if (dp) {
      var nat = $('#' + dp.dataset.dp + '_n');
      if (nat.showPicker) { try { nat.showPicker(); } catch (err) { nat.focus(); } }
      else { nat.focus(); nat.click(); }
      return;
    }

    if (e.target.closest('#pApply')) {
      var f = fromDisp($('#pFrom').value), t2 = fromDisp($('#pTo').value);
      if (!f || !t2) { toast('اكتب التاريخ بصيغة يوم/شهر/سنة — مثال 01/09/2026', true); return; }
      if (f > t2) { toast('تاريخ البداية بعد تاريخ النهاية', true); return; }
      state.range = 'custom'; state.from = f; state.to = t2;
      render();
    }
  });

  /* اختيار تاريخ من نافذة المتصفح ينعكس على الحقل النصي */
  $('#pHost').addEventListener('change', function (e) {
    if (e.target.classList.contains('dp-native')) {
      var txt = $('#' + e.target.id.replace(/_n$/, ''));
      if (txt) txt.value = toDisp(e.target.value);
    }
  });

  boot();
})();
