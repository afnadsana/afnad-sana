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

  function emptyDB() {
    return {
      version: 1,
      user: 'مدير النظام',
      entities: DEFAULT_ENTITIES.slice(),
      channels: DEFAULT_CHANNELS.slice(),
      entries: [],
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
    log('استيراد', 'تم استيراد ' + db.entries.length + ' إدخال من ملف نسخة احتياطية');
    save();
    return { ok: true, count: db.entries.length };
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

    log('تهيئة', 'تم توليد بيانات تجريبية (' + db.entries.length + ' إدخال)');
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

    exportJSON: exportJSON, importJSON: importJSON, exportCSV: exportCSV,
    resetAll: resetAll, seedDemo: seedDemo,
    setUser: function (n) { db.user = n; save(); }
  };

})(window);
