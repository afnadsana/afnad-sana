/* ============================================================
   store.js — طبقة البيانات والتخزين المحلي
   كل البيانات تُحفظ في متصفح المستخدم (localStorage)
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'afnad.marketing.v1';

  /* ---------- أدوات مساعدة ---------- */
  function uid(p) {
    return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    var d = new Date();
    return iso(d);
  }

  function iso(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function addDays(dateISO, n) {
    var d = new Date(dateISO + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  }

  /* ---------- لوحة ألوان القنوات ----------
     ترتيب ثابت ومُتحقَّق منه (فحوص إمكانية الوصول للألوان، وضع الأزواج المتجاورة):
     نطاق الإضاءة ✓ · حد التشبع ✓ · فصل عمى الألوان ΔE 14.8 ✓ · الرؤية الطبيعية ΔE 19.9 ✓
     الألوان تُسنَد بهذا الترتيب ولا تُولَّد عشوائياً. اللون تابع للقناة نفسها
     ولا يتغيّر عند الفرز أو التصفية. كل صف في الرسم البياني يحمل اسمه نصّاً،
     فاللون تعزيز للهوية وليس المصدر الوحيد لها.
  ------------------------------------------- */
  var PALETTE = [
    '#4f46e5', '#f97316', '#db2777', '#ca8a04',
    '#0284c7', '#16a34a', '#7e22ce', '#0d9488'
  ];

  var DEFAULT_CHANNELS = [
    { id: 'ch_promo',    name: 'الترويج',         color: '#4f46e5', icon: 'send'   },
    { id: 'ch_infl',     name: 'المؤثرين',        color: '#f97316', icon: 'users'  },
    { id: 'ch_meta',     name: 'ميتا (انستقرام)', color: '#db2777', icon: 'camera' },
    { id: 'ch_snap',     name: 'سناب شات',        color: '#ca8a04', icon: 'ghost'  },
    { id: 'ch_google',   name: 'جوجل',            color: '#0284c7', icon: 'search' },
    { id: 'ch_wa',       name: 'الواتساب',        color: '#16a34a', icon: 'chat'   },
    { id: 'ch_tiktok',   name: 'تيك توك',         color: '#7e22ce', icon: 'music'  },
    { id: 'ch_wab',      name: 'واتساب بزنس',     color: '#0d9488', icon: 'chat'   }
  ];

  var DEFAULT_ENTITIES = [
    { id: 'ent_main', name: 'المنشأة الرئيسية' }
  ];

  /* ---------- تصنيفات الفواتير ---------- */
  var CAT_OUT = ['تسويق', 'بضاعة', 'رواتب', 'إيجار', 'شحن', 'رسوم وعمولات', 'أخرى'];
  var CAT_IN  = ['مبيعات', 'تحويل وارد', 'استرجاع', 'أخرى'];
  var METHODS = ['تحويل بنكي', 'شبكة / مدى', 'نقدي', 'بطاقة ائتمانية', 'محفظة إلكترونية'];

  function emptyDB() {
    return {
      version: 2,
      user: 'مدير النظام',
      entities: DEFAULT_ENTITIES.slice(),
      channels: DEFAULT_CHANNELS.slice(),
      entries: [],
      invoices: [],
      settings: { openingBalance: 0, bankName: '' },
      log: []
    };
  }

  /* ---------- التحميل والحفظ ---------- */
  var db = null;

  function load() {
    if (db) return db;
    try {
      var raw = global.localStorage.getItem(KEY);
      db = raw ? JSON.parse(raw) : emptyDB();
    } catch (e) {
      db = emptyDB();
    }
    // ضمان وجود كل الحقول بعد الترقية
    var base = emptyDB();
    Object.keys(base).forEach(function (k) {
      if (db[k] === undefined) db[k] = base[k];
    });
    return db;
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      console.error('تعذّر الحفظ:', e);
      return false;
    }
  }

  /* ---------- سجل التعديلات ---------- */
  function log(action, detail) {
    db.log.unshift({
      id: uid('log'),
      ts: new Date().toISOString(),
      user: db.user,
      action: action,
      detail: detail
    });
    if (db.log.length > 500) db.log.length = 500;
  }

  /* ---------- الحركات (الإدخالات) ---------- */
  function normalizeEntry(e) {
    return {
      id: e.id || uid('en'),
      date: e.date,
      entityId: e.entityId,
      channelId: e.channelId,
      cost: num(e.cost),      // الصرف التسويقي
      orders: num(e.orders),  // عدد الطلبات
      sales: num(e.sales),    // المبيعات
      cogs: num(e.cogs),      // تكلفة البضاعة
      note: (e.note || '').trim()
    };
  }

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  function addEntry(e) {
    var rec = normalizeEntry(e);
    db.entries.push(rec);
    log('إضافة', 'إدخال بتاريخ ' + rec.date + ' — ' + channelName(rec.channelId) +
        ' — صرف ' + rec.cost.toFixed(2) + ' ر.س');
    save();
    return rec;
  }

  function updateEntry(id, patch) {
    var i = db.entries.findIndex(function (x) { return x.id === id; });
    if (i < 0) return null;
    var before = db.entries[i];
    var rec = normalizeEntry(Object.assign({}, before, patch, { id: id }));
    db.entries[i] = rec;
    log('تعديل', 'إدخال ' + rec.date + ' — ' + channelName(rec.channelId) +
        ' — الصرف ' + before.cost.toFixed(2) + ' ← ' + rec.cost.toFixed(2) + ' ر.س');
    save();
    return rec;
  }

  function deleteEntry(id) {
    var i = db.entries.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    var rec = db.entries[i];
    db.entries.splice(i, 1);
    log('حذف', 'إدخال ' + rec.date + ' — ' + channelName(rec.channelId) +
        ' — صرف ' + rec.cost.toFixed(2) + ' ر.س');
    save();
    return true;
  }

  /* ============================================================
     الفواتير والحركات المالية (دفتر الحساب البنكي)
     dir: 'in' وارد | 'out' صادر
     status: 'paid' مسدّدة (أثّرت على الرصيد) | 'unpaid' معلّقة (لم تؤثر بعد)
     ============================================================ */
  function normalizeInvoice(v) {
    return {
      id: v.id || uid('inv'),
      date: v.date,
      dir: v.dir === 'in' ? 'in' : 'out',
      amount: num(v.amount),
      party: (v.party || '').trim(),          // الجهة / المورد / العميل
      invoiceNo: (v.invoiceNo || '').trim(),  // رقم الفاتورة
      category: v.category || 'أخرى',
      method: v.method || 'تحويل بنكي',
      status: v.status === 'unpaid' ? 'unpaid' : 'paid',
      entityId: v.entityId || (db.entities[0] && db.entities[0].id),
      note: (v.note || '').trim()
    };
  }

  function addInvoice(v) {
    var rec = normalizeInvoice(v);
    db.invoices.push(rec);
    log('إضافة', 'فاتورة ' + (rec.dir === 'in' ? 'واردة' : 'صادرة') + ' بتاريخ ' + rec.date +
        ' — ' + rec.amount.toFixed(2) + ' ر.س' + (rec.party ? ' — ' + rec.party : ''));
    save();
    return rec;
  }

  function updateInvoice(id, patch) {
    var i = db.invoices.findIndex(function (x) { return x.id === id; });
    if (i < 0) return null;
    var before = db.invoices[i];
    var rec = normalizeInvoice(Object.assign({}, before, patch, { id: id }));
    db.invoices[i] = rec;
    log('تعديل', 'فاتورة ' + rec.date + ' — ' + before.amount.toFixed(2) +
        ' ← ' + rec.amount.toFixed(2) + ' ر.س');
    save();
    return rec;
  }

  function deleteInvoice(id) {
    var i = db.invoices.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    var rec = db.invoices[i];
    db.invoices.splice(i, 1);
    log('حذف', 'فاتورة ' + rec.date + ' — ' + rec.amount.toFixed(2) + ' ر.س');
    save();
    return true;
  }

  /** استعلام الفواتير ضمن فترة/منشأة/اتجاه/حالة */
  function queryInvoices(from, to, entityId, dir, status) {
    return db.invoices.filter(function (v) {
      if (from && v.date < from) return false;
      if (to && v.date > to) return false;
      if (entityId && entityId !== 'all' && v.entityId !== entityId) return false;
      if (dir && dir !== 'all' && v.dir !== dir) return false;
      if (status && status !== 'all' && v.status !== status) return false;
      return true;
    });
  }

  /**
   * ملخص الخزينة.
   * الرصيد البنكي تراكمي بطبيعته: يُحسب من كل الحركات المسدّدة منذ البداية
   * وليس من الفترة المختارة فقط. أما حركة الفترة فتُحسب من الفواتير داخلها.
   */
  function treasury(from, to, entityId) {
    var all = queryInvoices(null, null, entityId, 'all', 'all');
    var t = {
      opening: num(db.settings.openingBalance),
      paidIn: 0, paidOut: 0,          // كل الحركات المسدّدة (تراكمي)
      pendingIn: 0, pendingOut: 0,    // المعلّقة (لم تؤثر على الرصيد)
      periodIn: 0, periodOut: 0,      // حركة الفترة المختارة (مسدّدة)
      countPendingIn: 0, countPendingOut: 0
    };

    all.forEach(function (v) {
      var inPeriod = (!from || v.date >= from) && (!to || v.date <= to);
      if (v.status === 'paid') {
        if (v.dir === 'in') {
          t.paidIn += v.amount;
          if (inPeriod) t.periodIn += v.amount;
        } else {
          t.paidOut += v.amount;
          if (inPeriod) t.periodOut += v.amount;
        }
      } else {
        if (v.dir === 'in') { t.pendingIn += v.amount; t.countPendingIn++; }
        else { t.pendingOut += v.amount; t.countPendingOut++; }
      }
    });

    t.balance = t.opening + t.paidIn - t.paidOut;              // الرصيد الحالي
    t.projected = t.balance + t.pendingIn - t.pendingOut;      // الرصيد المتوقع بعد التحصيل والسداد
    t.periodNet = t.periodIn - t.periodOut;                    // صافي حركة الفترة
    return t;
  }

  /** تجميع الفواتير حسب التصنيف (لرسم المصروفات) */
  function invoicesByCategory(list) {
    var map = {};
    list.forEach(function (v) {
      if (!map[v.category]) map[v.category] = 0;
      map[v.category] += v.amount;
    });
    return Object.keys(map).map(function (k) {
      return { category: k, amount: map[k] };
    }).sort(function (a, b) { return b.amount - a.amount; });
  }

  function setOpeningBalance(v) {
    var old = num(db.settings.openingBalance);
    db.settings.openingBalance = num(v);
    log('تعديل', 'الرصيد الافتتاحي: ' + old.toFixed(2) + ' ← ' +
        num(v).toFixed(2) + ' ر.س');
    save();
  }

  function setBankName(v) {
    db.settings.bankName = (v || '').trim();
    save();
  }

  function exportInvoicesCSV(list) {
    var head = ['التاريخ', 'النوع', 'رقم الفاتورة', 'الجهة', 'التصنيف',
                'المبلغ', 'طريقة الدفع', 'الحالة', 'المنشأة', 'ملاحظات'];
    var rows = list.map(function (v) {
      return [
        v.date, v.dir === 'in' ? 'وارد' : 'صادر', v.invoiceNo || '', v.party || '',
        v.category, v.amount.toFixed(2), v.method,
        v.status === 'paid' ? 'مسدّدة' : 'معلّقة',
        entityName(v.entityId), v.note || ''
      ];
    });
    var esc = function (x) {
      x = String(x);
      return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
    };
    return '﻿' + [head].concat(rows).map(function (r) {
      return r.map(esc).join(',');
    }).join('\r\n');
  }

  /* ---------- القنوات ---------- */
  function channelName(id) {
    var c = db.channels.find(function (x) { return x.id === id; });
    return c ? c.name : '—';
  }
  function channel(id) {
    return db.channels.find(function (x) { return x.id === id; }) ||
           { id: id, name: '—', color: '#9aa0b5', icon: 'dot' };
  }
  function addChannel(name, color, icon) {
    var c = { id: uid('ch'), name: name.trim(), color: color || '#4f46e5', icon: icon || 'dot' };
    db.channels.push(c);
    log('إضافة', 'قناة جديدة: ' + c.name);
    save();
    return c;
  }
  function updateChannel(id, patch) {
    var c = db.channels.find(function (x) { return x.id === id; });
    if (!c) return null;
    var old = c.name;
    Object.assign(c, patch);
    log('تعديل', 'قناة: ' + old + (old !== c.name ? ' ← ' + c.name : ''));
    save();
    return c;
  }
  function deleteChannel(id) {
    if (db.entries.some(function (e) { return e.channelId === id; })) {
      return { ok: false, reason: 'لا يمكن حذف قناة مرتبطة بإدخالات. احذف إدخالاتها أولاً.' };
    }
    var c = channel(id);
    db.channels = db.channels.filter(function (x) { return x.id !== id; });
    log('حذف', 'قناة: ' + c.name);
    save();
    return { ok: true };
  }

  /* ---------- المنشآت ---------- */
  function entityName(id) {
    var e = db.entities.find(function (x) { return x.id === id; });
    return e ? e.name : '—';
  }
  function addEntity(name) {
    var e = { id: uid('ent'), name: name.trim() };
    db.entities.push(e);
    log('إضافة', 'منشأة جديدة: ' + e.name);
    save();
    return e;
  }
  function updateEntity(id, name) {
    var e = db.entities.find(function (x) { return x.id === id; });
    if (!e) return null;
    var old = e.name;
    e.name = name.trim();
    log('تعديل', 'منشأة: ' + old + ' ← ' + e.name);
    save();
    return e;
  }
  function deleteEntity(id) {
    if (db.entries.some(function (e) { return e.entityId === id; })) {
      return { ok: false, reason: 'لا يمكن حذف منشأة مرتبطة بإدخالات. احذف إدخالاتها أولاً.' };
    }
    if (db.invoices.some(function (v) { return v.entityId === id; })) {
      return { ok: false, reason: 'لا يمكن حذف منشأة مرتبطة بفواتير. احذف فواتيرها أولاً.' };
    }
    if (db.entities.length <= 1) {
      return { ok: false, reason: 'يجب الإبقاء على منشأة واحدة على الأقل.' };
    }
    var e = db.entities.find(function (x) { return x.id === id; });
    db.entities = db.entities.filter(function (x) { return x.id !== id; });
    log('حذف', 'منشأة: ' + (e ? e.name : id));
    save();
    return { ok: true };
  }

  /* ---------- الاستعلام والتجميع ---------- */
  /**
   * يرجّع الإدخالات ضمن فترة ومنشأة محددة.
   * @param {string} from تاريخ البداية YYYY-MM-DD (شامل)
   * @param {string} to   تاريخ النهاية YYYY-MM-DD (شامل)
   * @param {string} entityId معرّف المنشأة أو "all"
   */
  function query(from, to, entityId) {
    return db.entries.filter(function (e) {
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      if (entityId && entityId !== 'all' && e.entityId !== entityId) return false;
      return true;
    });
  }

  /** يجمع قائمة إدخالات في مؤشرات واحدة */
  function totals(list) {
    var t = { cost: 0, orders: 0, sales: 0, cogs: 0 };
    list.forEach(function (e) {
      t.cost += e.cost; t.orders += e.orders; t.sales += e.sales; t.cogs += e.cogs;
    });
    t.profit = t.sales - t.cost - t.cogs;
    t.roas = t.cost > 0 ? t.sales / t.cost : 0;
    t.cpo = t.orders > 0 ? t.cost / t.orders : 0;      // متوسط تكلفة الطلب
    t.aov = t.orders > 0 ? t.sales / t.orders : 0;     // متوسط قيمة الطلب
    t.mktRatio = t.sales > 0 ? (t.cost / t.sales) * 100 : 0; // نسبة التسويق
    return t;
  }

  /** يجمّع حسب القناة ويرجّع مصفوفة مرتبة تنازلياً بالصرف */
  function byChannel(list) {
    var map = {};
    list.forEach(function (e) {
      if (!map[e.channelId]) map[e.channelId] = { channelId: e.channelId, items: [] };
      map[e.channelId].items.push(e);
    });
    return Object.keys(map).map(function (k) {
      var g = map[k];
      var t = totals(g.items);
      t.channelId = k;
      t.channel = channel(k);
      return t;
    }).sort(function (a, b) { return b.cost - a.cost; });
  }

  /** يجمّع حسب اليوم ضمن الفترة (يملأ الأيام الفارغة بصفر) */
  function byDay(list, from, to) {
    var map = {};
    list.forEach(function (e) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    var out = [], cur = from, guard = 0;
    while (cur <= to && guard++ < 800) {
      var t = totals(map[cur] || []);
      t.date = cur;
      out.push(t);
      cur = addDays(cur, 1);
    }
    return out;
  }

  /** يجمّع حسب الشهر YYYY-MM */
  function byMonth(list) {
    var map = {};
    list.forEach(function (e) {
      var m = e.date.slice(0, 7);
      if (!map[m]) map[m] = [];
      map[m].push(e);
    });
    return Object.keys(map).sort().map(function (m) {
      var t = totals(map[m]);
      t.month = m;
      return t;
    });
  }

  /** يجمّع حسب المنشأة */
  function byEntity(list) {
    var map = {};
    list.forEach(function (e) {
      if (!map[e.entityId]) map[e.entityId] = [];
      map[e.entityId].push(e);
    });
    return Object.keys(map).map(function (k) {
      var t = totals(map[k]);
      t.entityId = k;
      t.entityName = entityName(k);
      return t;
    }).sort(function (a, b) { return b.sales - a.sales; });
  }

  /** الفترة السابقة المكافئة بنفس عدد الأيام (للمقارنة) */
  function previousRange(from, to) {
    var d1 = new Date(from + 'T00:00:00'), d2 = new Date(to + 'T00:00:00');
    var days = Math.round((d2 - d1) / 86400000) + 1;
    return { from: addDays(from, -days), to: addDays(from, -1), days: days };
  }

  /* ---------- الاستيراد والتصدير ---------- */
  function exportJSON() {
    return JSON.stringify(db, null, 2);
  }

  function importJSON(text) {
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { return { ok: false, reason: 'الملف ليس بصيغة JSON صالحة.' }; }
    if (!parsed || !Array.isArray(parsed.entries) || !Array.isArray(parsed.channels)) {
      return { ok: false, reason: 'بنية الملف غير متوافقة مع النظام.' };
    }
    db = Object.assign(emptyDB(), parsed);
    db.entries = db.entries.map(normalizeEntry);
    // نسخ الإصدار الأول لا تحتوي فواتير ولا إعدادات
    if (!Array.isArray(db.invoices)) db.invoices = [];
    db.invoices = db.invoices.map(normalizeInvoice);
    if (!db.settings) db.settings = { openingBalance: 0, bankName: '' };
    log('استيراد', 'تم استيراد ' + db.entries.length + ' إدخال و' +
        db.invoices.length + ' فاتورة من ملف نسخة احتياطية');
    save();
    return { ok: true, count: db.entries.length, invoices: db.invoices.length };
  }

  function exportCSV(list) {
    var head = ['التاريخ', 'المنشأة', 'القناة', 'الصرف التسويقي', 'عدد الطلبات', 'المبيعات', 'تكلفة البضاعة', 'الربح', 'ROAS', 'ملاحظات'];
    var rows = list.map(function (e) {
      var profit = e.sales - e.cost - e.cogs;
      var roas = e.cost > 0 ? (e.sales / e.cost) : 0;
      return [
        e.date, entityName(e.entityId), channelName(e.channelId),
        e.cost.toFixed(2), e.orders, e.sales.toFixed(2), e.cogs.toFixed(2),
        profit.toFixed(2), roas.toFixed(2), e.note || ''
      ];
    });
    var esc = function (v) {
      v = String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    return '﻿' + [head].concat(rows).map(function (r) {
      return r.map(esc).join(',');
    }).join('\r\n');
  }

  function resetAll() {
    db = emptyDB();
    save();
  }

  /* ---------- بيانات تجريبية ---------- */
  function seedDemo() {
    db = emptyDB();
    db.entities = [
      { id: 'ent_main',  name: 'منشأة أفناد سنا' },
      { id: 'ent_two',   name: 'الفرع الثاني' }
    ];

    var chans = ['ch_promo', 'ch_infl', 'ch_wa', 'ch_wab', 'ch_tiktok', 'ch_snap'];
    var weight = { ch_promo: 1.0, ch_infl: .55, ch_wa: .30, ch_wab: .10, ch_tiktok: .75, ch_snap: .45 };
    var end = todayISO();
    var start = addDays(end, -75);
    var cur = start;

    while (cur <= end) {
      db.entities.forEach(function (ent, ei) {
        chans.forEach(function (cid) {
          if (Math.random() < .25) return; // بعض الأيام بلا صرف
          var w = weight[cid] * (ei === 0 ? 1 : .45);
          var cost = Math.round((180 + Math.random() * 620) * w * 100) / 100;
          if (cost < 5) return;
          var roas = 1.6 + Math.random() * 3.4;
          var sales = Math.round(cost * roas * 100) / 100;
          var aov = 130 + Math.random() * 190;
          var orders = Math.max(1, Math.round(sales / aov));
          var cogs = Math.round(sales * (0.42 + Math.random() * 0.16) * 100) / 100;
          db.entries.push(normalizeEntry({
            date: cur, entityId: ent.id, channelId: cid,
            cost: cost, orders: orders, sales: sales, cogs: cogs, note: ''
          }));
        });
      });
      cur = addDays(cur, 1);
    }

    /* --- فواتير تجريبية --- */
    db.settings.openingBalance = 150000;
    db.settings.bankName = 'الحساب البنكي الرئيسي';

    var suppliers = ['مؤسسة الإمداد التجارية', 'شركة الشحن السريع', 'وكالة الإعلان الرقمي',
                     'مكتب المحاسبة', 'مورد التغليف'];
    var clients = ['متجر سلة', 'عميل جملة - الرياض', 'عميل جملة - جدة', 'منصة الدفع'];
    var d2 = start, k = 0;

    while (d2 <= end) {
      // وارد: تحصيل مبيعات كل بضعة أيام
      if (k % 4 === 0) {
        db.invoices.push(normalizeInvoice({
          date: d2, dir: 'in', amount: Math.round((8000 + Math.random() * 14000) * 100) / 100,
          party: clients[k % clients.length], invoiceNo: 'IN-' + (1000 + k),
          category: 'مبيعات', method: 'تحويل بنكي', status: 'paid',
          entityId: 'ent_main', note: ''
        }));
      }
      // صادر: مصروفات متنوعة
      if (k % 3 === 0) {
        var cats = ['بضاعة', 'شحن', 'تسويق', 'رسوم وعمولات'];
        db.invoices.push(normalizeInvoice({
          date: d2, dir: 'out', amount: Math.round((2000 + Math.random() * 9000) * 100) / 100,
          party: suppliers[k % suppliers.length], invoiceNo: 'OUT-' + (2000 + k),
          category: cats[k % cats.length], method: 'تحويل بنكي', status: 'paid',
          entityId: 'ent_main', note: ''
        }));
      }
      // رواتب وإيجار شهرياً
      if (d2.slice(8) === '01') {
        db.invoices.push(normalizeInvoice({
          date: d2, dir: 'out', amount: 28000, party: 'رواتب الموظفين',
          invoiceNo: '', category: 'رواتب', method: 'تحويل بنكي', status: 'paid',
          entityId: 'ent_main', note: 'راتب شهر ' + d2.slice(0, 7)
        }));
        db.invoices.push(normalizeInvoice({
          date: d2, dir: 'out', amount: 12000, party: 'إيجار المستودع',
          invoiceNo: '', category: 'إيجار', method: 'تحويل بنكي', status: 'paid',
          entityId: 'ent_main', note: ''
        }));
      }
      k++; d2 = addDays(d2, 1);
    }

    // فواتير معلّقة (لم تُسدَّد بعد)
    db.invoices.push(normalizeInvoice({
      date: addDays(end, -4), dir: 'out', amount: 18500, party: 'مؤسسة الإمداد التجارية',
      invoiceNo: 'OUT-9001', category: 'بضاعة', method: 'تحويل بنكي', status: 'unpaid',
      entityId: 'ent_main', note: 'مستحقة السداد خلال أسبوع'
    }));
    db.invoices.push(normalizeInvoice({
      date: addDays(end, -2), dir: 'in', amount: 26400, party: 'عميل جملة - الدمام',
      invoiceNo: 'IN-9002', category: 'مبيعات', method: 'تحويل بنكي', status: 'unpaid',
      entityId: 'ent_main', note: 'بانتظار التحصيل'
    }));

    log('تهيئة', 'تم توليد بيانات تجريبية (' + db.entries.length + ' إدخال و' +
        db.invoices.length + ' فاتورة)');
    save();
    return db.entries.length;
  }

  /* ---------- الواجهة المصدَّرة ---------- */
  global.Store = {
    load: load, save: save, get db() { return db; },
    uid: uid, todayISO: todayISO, iso: iso, addDays: addDays,
    PALETTE: PALETTE,

    addEntry: addEntry, updateEntry: updateEntry, deleteEntry: deleteEntry,
    addChannel: addChannel, updateChannel: updateChannel, deleteChannel: deleteChannel,
    addEntity: addEntity, updateEntity: updateEntity, deleteEntity: deleteEntity,
    channel: channel, channelName: channelName, entityName: entityName,

    query: query, totals: totals,
    byChannel: byChannel, byDay: byDay, byMonth: byMonth, byEntity: byEntity,
    previousRange: previousRange,

    // الفواتير والخزينة
    addInvoice: addInvoice, updateInvoice: updateInvoice, deleteInvoice: deleteInvoice,
    queryInvoices: queryInvoices, treasury: treasury, invoicesByCategory: invoicesByCategory,
    setOpeningBalance: setOpeningBalance, setBankName: setBankName,
    exportInvoicesCSV: exportInvoicesCSV,
    CAT_IN: CAT_IN, CAT_OUT: CAT_OUT, METHODS: METHODS,

    exportJSON: exportJSON, importJSON: importJSON, exportCSV: exportCSV,
    resetAll: resetAll, seedDemo: seedDemo,
    setUser: function (n) { db.user = n; save(); }
  };

})(window);
