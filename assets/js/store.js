/* ============================================================
   store.js — طبقة البيانات (Supabase)
   ------------------------------------------------------------
   البيانات تُحفظ في قاعدة سحابية مشتركة، فيراها كل أعضاء المنشأة
   من أي جهاز. نحتفظ بنسخة في الذاكرة بنفس شكل الواجهة القديمة
   حتى تبقى كل دوال التجميع والرسم تعمل بشكل متزامن دون تعديل.
   ============================================================ */
(function (global) {
  'use strict';

  var sb = null;          // عميل Supabase
  var db = null;          // النسخة في الذاكرة
  var orgId = null;
  var me = { id: null, email: '', role: 'member' };

  /* ---------- أدوات ---------- */
  function todayISO() { return iso(new Date()); }
  function iso(d) {
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }
  function addDays(dateISO, n) {
    var d = new Date(dateISO + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  var PALETTE = [
    '#4f46e5', '#f97316', '#db2777', '#ca8a04',
    '#0284c7', '#16a34a', '#7e22ce', '#0d9488'
  ];

  var CAT_OUT = ['تسويق', 'بضاعة', 'رواتب', 'إيجار', 'شحن', 'رسوم وعمولات', 'أخرى'];
  var CAT_IN  = ['مبيعات', 'تحويل وارد', 'استرجاع', 'أخرى'];
  var METHODS = ['تحويل بنكي', 'شبكة / مدى', 'نقدي', 'بطاقة ائتمانية', 'محفظة إلكترونية'];

  function emptyDB() {
    return {
      user: '', orgName: '', role: 'member',
      entities: [], channels: [], entries: [], invoices: [],
      clients: [], clientDues: [], clientReports: [], clientUsers: [], clientEvents: [],
      members: [],
      settings: { openingBalance: 0, bankName: '', vatRegistrationDate: null, defaultVatRate: 0.15 },
      log: []
    };
  }

  /* ---------- تحويل صفوف القاعدة إلى شكل الواجهة ---------- */
  function mapEntry(r) {
    return {
      id: r.id, date: r.date, entityId: r.entity_id, channelId: r.channel_id,
      cost: num(r.cost), orders: num(r.orders), sales: num(r.sales),
      cogs: num(r.cogs), note: r.note || ''
    };
  }
  function mapInvoice(r) {
    return {
      id: r.id, date: r.date, dir: r.dir, amount: num(r.amount),
      party: r.party || '', invoiceNo: r.invoice_no || '', category: r.category,
      method: r.method, status: r.status, entityId: r.entity_id, note: r.note || '',
      vatRate: num(r.vat_rate), vatAmount: num(r.vat_amount)
    };
  }
  function mapClient(r) {
    return {
      id: r.id, entityId: r.entity_id, name: r.name,
      contractStatus: r.contract_status, contractStart: r.contract_start, contractEnd: r.contract_end,
      monthlyAmount: num(r.monthly_amount), note: r.note || '',
      portalCode: r.portal_code || null,
      feeType: r.fee_type || 'fixed',
      feePercent: num(r.fee_percent),
      feeDeductPercent: num(r.fee_deduct_percent),
      feeMarkupPercent: num(r.fee_markup_percent)
    };
  }
  /* المنصات الإعلانية المدعومة — المفتاح يُخزَّن، والاسم للعرض */
  var PLATFORMS = ['meta', 'snapchat', 'tiktok', 'google', 'x', 'nomu', 'other'];
  var PLATFORM_AR = {
    meta: 'ميتا (فيسبوك وانستقرام)', snapchat: 'سناب شات', tiktok: 'تيك توك',
    google: 'جوجل', x: 'إكس (تويتر)', nomu: 'منصة نمو', other: 'أخرى'
  };

  function mapReport(r) {
    var spend = num(r.spend), revenue = num(r.revenue);
    return {
      id: r.id, clientId: r.client_id, date: r.report_date,
      platform: r.platform || 'meta',
      spend: spend, revenue: revenue, donations: num(r.donations),
      roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
      source: r.source || 'manual', note: r.note || ''
    };
  }
  function mapEvent(r) {
    return {
      id: r.id, clientId: r.client_id, date: r.event_date,
      kind: r.kind || 'general', title: r.title, note: r.note || ''
    };
  }
  function mapDue(r) {
    return {
      id: r.id, clientId: r.client_id, period: r.period,
      amountDue: num(r.amount_due), amountPaid: num(r.amount_paid),
      revenueBase: num(r.revenue_base),
      paidDate: r.paid_date, note: r.note || ''
    };
  }

  /* ---------- الاتصال والجلسة ---------- */
  function client() {
    if (sb) return sb;
    if (!global.SUPA_READY) throw new Error('لم تُضبط مفاتيح Supabase في config.js');
    sb = global.supabase.createClient(global.SUPA_CONFIG.url, global.SUPA_CONFIG.anonKey);
    return sb;
  }

  async function currentUser() {
    var res = await client().auth.getUser();
    return res.data ? res.data.user : null;
  }

  async function signUp(email, password) {
    var r = await client().auth.signUp({ email: email, password: password });
    if (r.error) return { ok: false, reason: authMsg(r.error) };
    if (!r.data.session) {
      return { ok: true, needsConfirm: true };
    }
    return { ok: true };
  }

  async function signIn(email, password) {
    var r = await client().auth.signInWithPassword({ email: email, password: password });
    if (r.error) return { ok: false, reason: authMsg(r.error) };
    return { ok: true };
  }

  async function signOut() {
    await client().auth.signOut();
    db = null; orgId = null;
  }

  function authMsg(err) {
    var m = (err && err.message) || '';
    if (/Invalid login credentials/i.test(m)) return 'البريد أو كلمة المرور غير صحيحة';
    if (/User already registered/i.test(m))   return 'هذا البريد مسجّل مسبقاً — سجّل الدخول بدلاً من إنشاء حساب';
    if (/Password should be at least/i.test(m)) return 'كلمة المرور قصيرة — ٦ أحرف على الأقل';
    if (/Email not confirmed/i.test(m))       return 'لم تؤكد بريدك بعد — افتح رسالة التأكيد في بريدك';
    if (/rate limit|too many/i.test(m))       return 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة';
    return m || 'تعذّر إتمام العملية';
  }

  /* ---------- التحميل الكامل ---------- */
  async function sync() {
    var c = client();
    var u = await currentUser();
    if (!u) throw new Error('غير مسجّل دخول');
    me.id = u.id;
    me.email = u.email || '';

    // إيجاد المنظمة، أو تهيئتها عند أول دخول
    var mem = await c.from('memberships').select('org_id, role').limit(1);
    if (mem.error) throw new Error(mem.error.message);

    if (!mem.data.length) {
      var boot = await c.rpc('bootstrap_org', { org_name: 'منشأة أفناد سنا' });
      if (boot.error) throw new Error('تعذّرت تهيئة المنشأة: ' + boot.error.message);
      orgId = boot.data;
      me.role = 'owner';
    } else {
      orgId = mem.data[0].org_id;
      me.role = mem.data[0].role;
    }

    var out = emptyDB();
    out.user = me.email;
    out.role = me.role;

    var q = await Promise.all([
      c.from('orgs').select('name').eq('id', orgId).single(),
      c.from('entities').select('*').eq('org_id', orgId).order('name'),
      c.from('channels').select('*').eq('org_id', orgId).order('created_at'),
      c.from('entries').select('*').eq('org_id', orgId).order('date', { ascending: false }),
      c.from('invoices').select('*').eq('org_id', orgId).order('date', { ascending: false }),
      c.from('settings').select('*').eq('org_id', orgId).maybeSingle(),
      c.from('audit_log').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(300),
      c.from('memberships').select('user_id, role').eq('org_id', orgId),
      c.from('clients').select('*').eq('org_id', orgId).order('name'),
      c.from('client_dues').select('*').eq('org_id', orgId).order('period', { ascending: false }),
      c.from('client_reports').select('*').eq('org_id', orgId).order('report_date', { ascending: false }),
      c.from('client_users').select('*').eq('org_id', orgId),
      c.from('client_events').select('*').eq('org_id', orgId).order('event_date', { ascending: false })
    ]);

    for (var i = 0; i < q.length; i++) {
      if (q[i].error) throw new Error(q[i].error.message);
    }

    out.orgName  = q[0].data ? q[0].data.name : '';
    out.entities = q[1].data.map(function (r) { return { id: r.id, name: r.name }; });
    out.channels = q[2].data.map(function (r) {
      return { id: r.id, name: r.name, color: r.color, icon: r.icon };
    });
    out.entries  = q[3].data.map(mapEntry);
    out.invoices = q[4].data.map(mapInvoice);
    out.settings = q[5].data
      ? { openingBalance: num(q[5].data.opening_balance), bankName: q[5].data.bank_name || '',
          vatRegistrationDate: q[5].data.vat_registration_date || null,
          defaultVatRate: q[5].data.default_vat_rate != null ? Number(q[5].data.default_vat_rate) : 0.15 }
      : { openingBalance: 0, bankName: '', vatRegistrationDate: null, defaultVatRate: 0.15 };
    out.log = q[6].data.map(function (r) {
      return { id: r.id, ts: r.created_at, user: r.user_email || '—',
               action: r.action, detail: r.detail || '' };
    });
    out.members = q[7].data.map(function (r) {
      return { userId: r.user_id, role: r.role, isMe: r.user_id === me.id };
    });
    out.clients    = q[8].data.map(mapClient);
    out.clientDues = q[9].data.map(mapDue);
    out.clientReports = q[10].data.map(mapReport);
    out.clientEvents  = q[12].data.map(mapEvent);
    out.clientUsers   = q[11].data.map(function (r) {
      return { id: r.id, clientId: r.client_id, userId: r.user_id,
               email: r.email || '', createdAt: r.created_at };
    });

    db = out;
    return db;
  }

  function canWrite() {
    return ['owner', 'admin', 'member'].indexOf(me.role) >= 0;
  }
  function requireWrite() {
    if (!canWrite()) throw new Error('صلاحيتك للاطلاع فقط — لا يمكنك التعديل');
  }

  /* ---------- السجل ---------- */
  async function log(action, detail) {
    try {
      await client().from('audit_log').insert({
        org_id: orgId, user_id: me.id, user_email: me.email,
        action: action, detail: detail
      });
    } catch (e) { /* السجل لا يُفشل العملية الأساسية */ }
  }

  /* ---------- الإدخالات ---------- */
  async function addEntry(e) {
    requireWrite();
    var row = {
      org_id: orgId, entity_id: e.entityId, channel_id: e.channelId,
      date: e.date, cost: num(e.cost), orders: Math.round(num(e.orders)),
      sales: num(e.sales), cogs: num(e.cogs), note: (e.note || '').trim(),
      created_by: me.id
    };
    var r = await client().from('entries').insert(row).select().single();
    if (r.error) throw new Error(r.error.message);
    db.entries.unshift(mapEntry(r.data));
    await log('إضافة', 'إدخال ' + row.date + ' — ' + channelName(row.channel_id) +
              ' — صرف ' + row.cost.toFixed(2) + ' ر.س');
    return r.data;
  }

  async function updateEntry(id, patch) {
    requireWrite();
    var before = db.entries.find(function (x) { return x.id === id; });
    var row = {
      entity_id: patch.entityId, channel_id: patch.channelId, date: patch.date,
      cost: num(patch.cost), orders: Math.round(num(patch.orders)),
      sales: num(patch.sales), cogs: num(patch.cogs), note: (patch.note || '').trim()
    };
    var r = await client().from('entries').update(row).eq('id', id).select().single();
    if (r.error) throw new Error(r.error.message);
    var i = db.entries.findIndex(function (x) { return x.id === id; });
    if (i >= 0) db.entries[i] = mapEntry(r.data);
    await log('تعديل', 'إدخال ' + row.date + ' — الصرف ' +
              (before ? before.cost.toFixed(2) : '?') + ' ← ' + row.cost.toFixed(2) + ' ر.س');
    return r.data;
  }

  async function deleteEntry(id) {
    requireWrite();
    var rec = db.entries.find(function (x) { return x.id === id; });
    var r = await client().from('entries').delete().eq('id', id);
    if (r.error) throw new Error(r.error.message);
    db.entries = db.entries.filter(function (x) { return x.id !== id; });
    if (rec) await log('حذف', 'إدخال ' + rec.date + ' — صرف ' + rec.cost.toFixed(2) + ' ر.س');
    return true;
  }

  /* ---------- الفواتير ---------- */
  async function addInvoice(v) {
    requireWrite();
    var row = {
      org_id: orgId, entity_id: v.entityId, date: v.date,
      dir: v.dir === 'in' ? 'in' : 'out', amount: num(v.amount),
      party: (v.party || '').trim(), invoice_no: (v.invoiceNo || '').trim(),
      category: v.category || 'أخرى', method: v.method || METHODS[0],
      status: v.status === 'unpaid' ? 'unpaid' : 'paid',
      note: (v.note || '').trim(), created_by: me.id,
      vat_rate: num(v.vatRate), vat_amount: num(v.vatAmount)
    };
    var r = await client().from('invoices').insert(row).select().single();
    if (r.error) throw new Error(r.error.message);
    db.invoices.unshift(mapInvoice(r.data));
    await log('إضافة', 'فاتورة ' + (row.dir === 'in' ? 'واردة' : 'صادرة') + ' ' + row.date +
              ' — ' + row.amount.toFixed(2) + ' ر.س' + (row.party ? ' — ' + row.party : ''));
    return r.data;
  }

  async function updateInvoice(id, patch) {
    requireWrite();
    var before = db.invoices.find(function (x) { return x.id === id; });
    var row = {};
    if (patch.entityId  !== undefined) row.entity_id  = patch.entityId;
    if (patch.date      !== undefined) row.date       = patch.date;
    if (patch.dir       !== undefined) row.dir        = patch.dir;
    if (patch.amount    !== undefined) row.amount     = num(patch.amount);
    if (patch.party     !== undefined) row.party      = (patch.party || '').trim();
    if (patch.invoiceNo !== undefined) row.invoice_no = (patch.invoiceNo || '').trim();
    if (patch.category  !== undefined) row.category   = patch.category;
    if (patch.method    !== undefined) row.method     = patch.method;
    if (patch.status    !== undefined) row.status     = patch.status;
    if (patch.note      !== undefined) row.note       = (patch.note || '').trim();
    if (patch.vatRate   !== undefined) row.vat_rate   = num(patch.vatRate);
    if (patch.vatAmount !== undefined) row.vat_amount = num(patch.vatAmount);

    var r = await client().from('invoices').update(row).eq('id', id).select().single();
    if (r.error) throw new Error(r.error.message);
    var i = db.invoices.findIndex(function (x) { return x.id === id; });
    if (i >= 0) db.invoices[i] = mapInvoice(r.data);
    await log('تعديل', 'فاتورة ' + r.data.date + ' — ' +
              (before ? before.amount.toFixed(2) : '?') + ' ← ' + num(r.data.amount).toFixed(2) + ' ر.س');
    return r.data;
  }

  async function deleteInvoice(id) {
    requireWrite();
    var rec = db.invoices.find(function (x) { return x.id === id; });
    var r = await client().from('invoices').delete().eq('id', id);
    if (r.error) throw new Error(r.error.message);
    db.invoices = db.invoices.filter(function (x) { return x.id !== id; });
    if (rec) await log('حذف', 'فاتورة ' + rec.date + ' — ' + rec.amount.toFixed(2) + ' ر.س');
    return true;
  }

  /* ---------- القنوات ---------- */
  function channelName(id) {
    var c = db.channels.find(function (x) { return x.id === id; });
    return c ? c.name : '—';
  }
  function channel(id) {
    return db.channels.find(function (x) { return x.id === id; }) ||
           { id: id, name: '—', color: '#94a3b8', icon: 'dot' };
  }

  async function addChannel(name, color, icon) {
    requireWrite();
    var r = await client().from('channels').insert({
      org_id: orgId, name: name.trim(), color: color || PALETTE[0], icon: icon || 'dot'
    }).select().single();
    if (r.error) throw new Error(r.error.message);
    db.channels.push({ id: r.data.id, name: r.data.name, color: r.data.color, icon: r.data.icon });
    await log('إضافة', 'قناة جديدة: ' + r.data.name);
    return r.data;
  }

  async function updateChannel(id, patch) {
    requireWrite();
    var r = await client().from('channels').update({
      name: patch.name, color: patch.color, icon: patch.icon
    }).eq('id', id).select().single();
    if (r.error) throw new Error(r.error.message);
    var c = db.channels.find(function (x) { return x.id === id; });
    if (c) { c.name = r.data.name; c.color = r.data.color; c.icon = r.data.icon; }
    await log('تعديل', 'قناة: ' + r.data.name);
    return r.data;
  }

  async function deleteChannel(id) {
    requireWrite();
    if (db.entries.some(function (e) { return e.channelId === id; })) {
      return { ok: false, reason: 'لا يمكن حذف قناة مرتبطة بإدخالات. احذف إدخالاتها أولاً.' };
    }
    var nm = channelName(id);
    var r = await client().from('channels').delete().eq('id', id);
    if (r.error) return { ok: false, reason: r.error.message };
    db.channels = db.channels.filter(function (x) { return x.id !== id; });
    await log('حذف', 'قناة: ' + nm);
    return { ok: true };
  }

  /* ---------- المنشآت ---------- */
  function entityName(id) {
    var e = db.entities.find(function (x) { return x.id === id; });
    return e ? e.name : '—';
  }

  async function addEntity(name) {
    requireWrite();
    var r = await client().from('entities').insert({
      org_id: orgId, name: name.trim()
    }).select().single();
    if (r.error) throw new Error(r.error.message);
    db.entities.push({ id: r.data.id, name: r.data.name });
    await log('إضافة', 'منشأة جديدة: ' + r.data.name);
    return r.data;
  }

  async function updateEntity(id, name) {
    requireWrite();
    var r = await client().from('entities').update({ name: name.trim() })
              .eq('id', id).select().single();
    if (r.error) throw new Error(r.error.message);
    var e = db.entities.find(function (x) { return x.id === id; });
    if (e) e.name = r.data.name;
    await log('تعديل', 'منشأة: ' + r.data.name);
    return r.data;
  }

  async function deleteEntity(id) {
    requireWrite();
    if (db.entries.some(function (e) { return e.entityId === id; })) {
      return { ok: false, reason: 'لا يمكن حذف منشأة مرتبطة بإدخالات. احذف إدخالاتها أولاً.' };
    }
    if (db.invoices.some(function (v) { return v.entityId === id; })) {
      return { ok: false, reason: 'لا يمكن حذف منشأة مرتبطة بفواتير. احذف فواتيرها أولاً.' };
    }
    if (db.entities.length <= 1) {
      return { ok: false, reason: 'يجب الإبقاء على منشأة واحدة على الأقل.' };
    }
    var nm = entityName(id);
    var r = await client().from('entities').delete().eq('id', id);
    if (r.error) return { ok: false, reason: r.error.message };
    db.entities = db.entities.filter(function (x) { return x.id !== id; });
    await log('حذف', 'منشأة: ' + nm);
    return { ok: true };
  }

  /* ============================================================
     العملاء والمستحقات الشهرية (متابعة العقود المتكررة)
     ============================================================ */
  function currentPeriod() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }
  function periodOf(dateISO) { return dateISO.slice(0, 8) + '01'; }

  async function addClient(c) {
    requireWrite();
    var row = {
      org_id: orgId, entity_id: c.entityId || null, name: (c.name || '').trim(),
      contract_status: c.contractStatus || 'active',
      contract_start: c.contractStart || null, contract_end: c.contractEnd || null,
      monthly_amount: num(c.monthlyAmount), note: (c.note || '').trim(), created_by: me.id,
      fee_type: c.feeType || 'fixed',
      fee_percent: num(c.feePercent),
      fee_deduct_percent: num(c.feeDeductPercent),
      fee_markup_percent: num(c.feeMarkupPercent)
    };
    var r = await client().from('clients').insert(row).select().single();
    if (r.error) throw new Error(r.error.message);
    db.clients.push(mapClient(r.data));
    db.clients.sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    await log('إضافة', 'عميل جديد: ' + row.name);
    return r.data;
  }

  async function updateClient(id, patch) {
    requireWrite();
    var row = {};
    if (patch.entityId       !== undefined) row.entity_id       = patch.entityId || null;
    if (patch.name           !== undefined) row.name            = (patch.name || '').trim();
    if (patch.contractStatus !== undefined) row.contract_status = patch.contractStatus;
    if (patch.contractStart  !== undefined) row.contract_start  = patch.contractStart || null;
    if (patch.contractEnd    !== undefined) row.contract_end    = patch.contractEnd || null;
    if (patch.monthlyAmount  !== undefined) row.monthly_amount  = num(patch.monthlyAmount);
    if (patch.note           !== undefined) row.note            = (patch.note || '').trim();
    if (patch.feeType          !== undefined) row.fee_type           = patch.feeType || 'fixed';
    if (patch.feePercent       !== undefined) row.fee_percent        = num(patch.feePercent);
    if (patch.feeDeductPercent !== undefined) row.fee_deduct_percent = num(patch.feeDeductPercent);
    if (patch.feeMarkupPercent !== undefined) row.fee_markup_percent = num(patch.feeMarkupPercent);
    if (patch.portalCode       !== undefined) row.portal_code        = patch.portalCode || null;

    var r = await client().from('clients').update(row).eq('id', id).select().single();
    if (r.error) throw new Error(r.error.message);
    var i = db.clients.findIndex(function (x) { return x.id === id; });
    if (i >= 0) db.clients[i] = mapClient(r.data);
    await log('تعديل', 'عميل: ' + r.data.name);
    return r.data;
  }

  async function deleteClient(id) {
    requireWrite();
    var c = db.clients.find(function (x) { return x.id === id; });
    var r = await client().from('clients').delete().eq('id', id);
    if (r.error) throw new Error(r.error.message);
    db.clients = db.clients.filter(function (x) { return x.id !== id; });
    db.clientDues = db.clientDues.filter(function (x) { return x.clientId !== id; });
    if (c) await log('حذف', 'عميل: ' + c.name + ' (وكل مستحقاته)');
    return true;
  }

  /** إضافة أو تحديث مستحق شهر معيّن لعميل (upsert بمفتاح عميل+شهر) */
  async function saveDue(due) {
    requireWrite();
    var row = {
      org_id: orgId, client_id: due.clientId, period: periodOf(due.period),
      amount_due: num(due.amountDue), amount_paid: num(due.amountPaid),
      revenue_base: num(due.revenueBase),
      paid_date: due.paidDate || null, note: (due.note || '').trim(), created_by: me.id
    };
    var r = await client().from('client_dues')
              .upsert(row, { onConflict: 'client_id,period' }).select().single();
    if (r.error) throw new Error(r.error.message);
    var rec = mapDue(r.data);
    var i = db.clientDues.findIndex(function (x) { return x.clientId === rec.clientId && x.period === rec.period; });
    if (i >= 0) db.clientDues[i] = rec; else db.clientDues.unshift(rec);
    var c = db.clients.find(function (x) { return x.id === rec.clientId; });
    await log('تعديل', 'مستحق ' + (c ? c.name : '') + ' لشهر ' + rec.period.slice(0, 7) +
              ' — مدفوع ' + rec.amountPaid.toFixed(2) + ' من ' + rec.amountDue.toFixed(2) + ' ر.س');
    return rec;
  }

  async function deleteDue(id) {
    requireWrite();
    var r = await client().from('client_dues').delete().eq('id', id);
    if (r.error) throw new Error(r.error.message);
    db.clientDues = db.clientDues.filter(function (x) { return x.id !== id; });
    return true;
  }

  /** يولّد مستحقات الشهر المحدد لكل العملاء النشطين الذين ليس لديهم مستحق بعد لهذا الشهر */
  async function generateDuesForPeriod(period) {
    requireWrite();
    period = periodOf(period);
    var active = db.clients.filter(function (c) {
      // يحترم بداية العقد ونهايته، فلا يولّد مستحقاً لشهر سابق لتعاقد الجهة
      if (!clientActiveInPeriod(c, period)) return false;
      // الأتعاب المحسوبة من الإيراد تحتاج إدخال إيراد الشهر يدوياً، فلا تُولَّد تلقائياً
      if (c.feeType && c.feeType !== 'fixed') return false;
      if (c.monthlyAmount <= 0) return false;
      return !dueOf(c.id, period);
    });
    var created = 0;
    for (var i = 0; i < active.length; i++) {
      // المبلغ الشهري مُخزَّن قبل الضريبة، والمستحق يُسجَّل شاملاً لها
      await saveDue({
        clientId: active[i].id, period: period,
        amountDue: computeFee(active[i], 0).total, amountPaid: 0
      });
      created++;
    }
    return created;
  }

  function clientDuesOf(clientId) {
    return db.clientDues.filter(function (x) { return x.clientId === clientId; })
             .sort(function (a, b) { return a.period < b.period ? 1 : -1; });
  }

  /**
   * يحسب المستحق من إيراد الشهر حسب نموذج أتعاب العميل، ثم يضيف الضريبة.
   *   fixed      → المبلغ الشهري الثابت (لا يعتمد على الإيراد)
   *   percent    → الإيراد × النسبة
   *   net_markup → الإيراد × (1 − الخصم) × (1 + الهامش)
   * يرجع { base, vat, total } — المطلوب للسداد هو total (شامل الضريبة).
   */
  function computeFee(c, revenue, vatRate) {
    var rev = num(revenue);
    var rate = vatRate === undefined || vatRate === null
      ? num(db.settings.defaultVatRate) || 0.15
      : num(vatRate);
    var base;
    if (c.feeType === 'percent') {
      base = rev * (num(c.feePercent) / 100);
    } else if (c.feeType === 'net_markup') {
      base = rev * (1 - num(c.feeDeductPercent) / 100) * (1 + num(c.feeMarkupPercent) / 100);
    } else {
      base = num(c.monthlyAmount);
    }
    base = Math.round(base * 100) / 100;
    var vat = Math.round(base * rate * 100) / 100;
    return { base: base, vat: vat, total: Math.round((base + vat) * 100) / 100 };
  }

  /* ---------- تقارير أداء الجهات ---------- */
  async function saveReport(rep) {
    requireWrite();
    var row = {
      org_id: orgId, client_id: rep.clientId, report_date: rep.date,
      platform: rep.platform || 'meta',
      spend: num(rep.spend), revenue: num(rep.revenue),
      donations: Math.round(num(rep.donations)),
      source: rep.source || 'manual', note: (rep.note || '').trim(),
      created_by: me.id
    };
    var r = await client().from('client_reports')
              .upsert(row, { onConflict: 'client_id,report_date,platform' }).select().single();
    if (r.error) throw new Error(r.error.message);
    var rec = mapReport(r.data);
    var i = db.clientReports.findIndex(function (x) {
      return x.clientId === rec.clientId && x.date === rec.date && x.platform === rec.platform;
    });
    if (i >= 0) db.clientReports[i] = rec; else db.clientReports.unshift(rec);
    var c = db.clients.find(function (x) { return x.id === rec.clientId; });
    await log('تعديل', 'تقرير أداء ' + (c ? c.name : '') + ' — ' + PLATFORM_AR[rec.platform] +
              ' ليوم ' + rec.date);
    return rec;
  }

  /** تجميع تقارير يوم واحد لجهة عبر كل المنصات */
  function reportsByDay(clientId, from, to) {
    var map = {};
    db.clientReports.forEach(function (r) {
      if (r.clientId !== clientId) return;
      if (from && r.date < from) return;
      if (to && r.date > to) return;
      var d = map[r.date] || (map[r.date] = {
        date: r.date, spend: 0, revenue: 0, donations: 0, platforms: []
      });
      d.spend += r.spend; d.revenue += r.revenue; d.donations += r.donations;
      d.platforms.push(r);
    });
    return Object.keys(map).sort().reverse().map(function (k) {
      var d = map[k];
      d.spend = Math.round(d.spend * 100) / 100;
      d.revenue = Math.round(d.revenue * 100) / 100;
      d.roas = d.spend > 0 ? Math.round((d.revenue / d.spend) * 100) / 100 : 0;
      d.platforms.sort(function (a, b) { return b.spend - a.spend; });
      return d;
    });
  }

  async function deleteReport(id) {
    requireWrite();
    var r = await client().from('client_reports').delete().eq('id', id);
    if (r.error) throw new Error(r.error.message);
    db.clientReports = db.clientReports.filter(function (x) { return x.id !== id; });
    return true;
  }

  function reportsOf(clientId) {
    return db.clientReports.filter(function (x) { return x.clientId === clientId; })
             .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  /* ---------- سير أحداث الحملة ---------- */
  async function saveEvent(ev) {
    requireWrite();
    var row = {
      org_id: orgId, client_id: ev.clientId, event_date: ev.date,
      kind: ev.kind || 'general', title: (ev.title || '').trim(),
      note: (ev.note || '').trim(), created_by: me.id
    };
    if (!row.title) throw new Error('عنوان الحدث مطلوب');
    var q = ev.id
      ? await client().from('client_events').update(row).eq('id', ev.id).select().single()
      : await client().from('client_events').insert(row).select().single();
    if (q.error) throw new Error(q.error.message);
    var rec = mapEvent(q.data);
    var i = db.clientEvents.findIndex(function (x) { return x.id === rec.id; });
    if (i >= 0) db.clientEvents[i] = rec; else db.clientEvents.unshift(rec);
    return rec;
  }

  async function deleteEvent(id) {
    requireWrite();
    var r = await client().from('client_events').delete().eq('id', id);
    if (r.error) throw new Error(r.error.message);
    db.clientEvents = db.clientEvents.filter(function (x) { return x.id !== id; });
    return true;
  }

  function eventsOf(clientId) {
    return db.clientEvents.filter(function (x) { return x.clientId === clientId; })
             .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  /* ---------- حسابات بوابة الجهات ---------- */
  function portalUsersOf(clientId) {
    return db.clientUsers.filter(function (x) { return x.clientId === clientId; });
  }

  /**
   * ينشئ حساب دخول لجهة ويربطه بها.
   * يستخدم عميل Supabase ثانياً بلا حفظ جلسة، حتى لا يُستبدل
   * تسجيل دخول المالك الحالي عند إنشاء المستخدم الجديد.
   */
  async function createPortalAccount(clientId, email, password) {
    requireWrite();
    email = (email || '').trim().toLowerCase();
    if (!email) throw new Error('البريد مطلوب');
    if (!password || password.length < 6) throw new Error('كلمة المرور ٦ أحرف على الأقل');

    var tmp = global.supabase.createClient(global.SUPA_CONFIG.url, global.SUPA_CONFIG.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false,
              detectSessionInUrl: false, storageKey: 'afnad-portal-tmp' }
    });

    var r = await tmp.auth.signUp({ email: email, password: password });
    if (r.error) throw new Error(authMsg(r.error));

    var u = r.data && r.data.user;
    if (!u) throw new Error('تعذّر إنشاء الحساب');
    // Supabase يرجّع مستخدماً بلا هويات إذا كان البريد مسجّلاً من قبل
    if (u.identities && u.identities.length === 0) {
      throw new Error('هذا البريد مسجّل مسبقاً — استخدم بريداً آخر');
    }

    var ins = await client().from('client_users').insert({
      org_id: orgId, client_id: clientId, user_id: u.id,
      email: email, created_by: me.id
    }).select().single();
    if (ins.error) throw new Error(ins.error.message);

    db.clientUsers.push({ id: ins.data.id, clientId: ins.data.client_id,
                          userId: ins.data.user_id, email: ins.data.email,
                          createdAt: ins.data.created_at });

    var c = db.clients.find(function (x) { return x.id === clientId; });
    await log('إضافة', 'حساب بوابة لجهة ' + (c ? c.name : '') + ' — ' + email);
    return { ok: true, needsConfirm: !r.data.session };
  }

  /** يفصل حساب الدخول عن الجهة (لا يحذف المستخدم من نظام المصادقة) */
  async function removePortalAccount(id) {
    requireWrite();
    var r = await client().from('client_users').delete().eq('id', id);
    if (r.error) throw new Error(r.error.message);
    db.clientUsers = db.clientUsers.filter(function (x) { return x.id !== id; });
    await log('حذف', 'إلغاء ربط حساب بوابة');
    return true;
  }

  /** آخر يوم في شهر الفترة (period = YYYY-MM-01) */
  function periodEnd(period) {
    var p = period.slice(0, 7).split('-');
    return iso(new Date(+p[0], +p[1], 0));
  }

  /**
   * هل عقد الجهة ساري خلال هذا الشهر تحديداً؟
   * يعتمد على تاريخ بداية العقد ونهايته وحالته — فلا تظهر الجهة
   * في أشهر سابقة لبداية تعاقدها.
   */
  function clientActiveInPeriod(c, period) {
    if (c.contractStatus === 'pending') return false;
    if (c.contractStatus === 'paused') return false;
    var start = period.slice(0, 8) + '01';
    var end = periodEnd(period);
    if (c.contractStart && c.contractStart > end) return false;   // لم يبدأ بعد
    if (c.contractEnd && c.contractEnd < start) return false;      // انتهى قبل الشهر
    if (c.contractStatus === 'ended' && !c.contractEnd) return false;
    return true;
  }

  /** مستحق جهة معيّنة لشهر معيّن (أو null) */
  function dueOf(clientId, period) {
    var p = periodOf(period);
    return db.clientDues.find(function (x) {
      return x.clientId === clientId && x.period.slice(0, 10) === p;
    }) || null;
  }

  /** حالة سداد شهر: paid / partial / unpaid / none */
  function dueState(d) {
    if (!d) return 'none';
    if (d.amountDue > 0 && d.amountPaid >= d.amountDue) return 'paid';
    if (d.amountPaid > 0) return 'partial';
    return 'unpaid';
  }

  /** هل العقد ساري فعلياً؟ (يأخذ بعين الاعتبار انتهاء تاريخ العقد تلقائياً) */
  function clientEffectiveStatus(c) {
    if (c.contractStatus === 'ended') return 'ended';
    if (c.contractStatus === 'paused') return 'paused';
    if (c.contractStatus === 'pending') return 'pending';
    if (c.contractEnd && c.contractEnd < todayISO()) return 'ended';
    return 'active';
  }

  /** ملخص مالي لعميل: إجمالي مطلوب/مدفوع/متأخر، وحالة الشهر الحالي */
  function clientSummary(c) {
    var dues = clientDuesOf(c.id);
    var cur = currentPeriod();
    var totalDue = 0, totalPaid = 0, overdue = 0, overdueCount = 0;
    var curDue = null;
    dues.forEach(function (d) {
      totalDue += d.amountDue; totalPaid += d.amountPaid;
      if (d.period === cur) curDue = d;
      if (d.period < cur && d.amountPaid < d.amountDue) {
        overdue += (d.amountDue - d.amountPaid);
        overdueCount++;
      }
    });
    var curStatus = !curDue ? 'none'
      : curDue.amountPaid >= curDue.amountDue ? 'paid'
      : curDue.amountPaid > 0 ? 'partial' : 'unpaid';
    return {
      totalDue: totalDue, totalPaid: totalPaid,
      overdue: Math.round(overdue * 100) / 100, overdueCount: overdueCount,
      currentDue: curDue, currentStatus: curStatus,
      effectiveStatus: clientEffectiveStatus(c)
    };
  }

  /* ---------- الإعدادات ---------- */
  async function saveSettings(openingBalance, bankName, vatRegistrationDate, defaultVatRate) {
    requireWrite();
    var old = db.settings.openingBalance;
    var payload = {
      org_id: orgId, opening_balance: num(openingBalance),
      bank_name: (bankName || '').trim(), updated_at: new Date().toISOString()
    };
    if (vatRegistrationDate !== undefined) payload.vat_registration_date = vatRegistrationDate || null;
    if (defaultVatRate !== undefined) payload.default_vat_rate = num(defaultVatRate);

    var r = await client().from('settings').upsert(payload).select().single();
    if (r.error) throw new Error(r.error.message);
    db.settings = {
      openingBalance: num(r.data.opening_balance),
      bankName: r.data.bank_name || '',
      vatRegistrationDate: r.data.vat_registration_date || null,
      defaultVatRate: r.data.default_vat_rate != null ? Number(r.data.default_vat_rate) : 0.15
    };
    if (num(openingBalance) !== old) {
      await log('تعديل', 'الرصيد الافتتاحي: ' + old.toFixed(2) + ' ← ' +
                num(openingBalance).toFixed(2) + ' ر.س');
    }
    return db.settings;
  }

  /** هل التاريخ المعطى يقع بعد تسجيل المنشأة في ضريبة القيمة المضافة؟ */
  function isVatRegisteredOn(dateISO) {
    var reg = db.settings.vatRegistrationDate;
    return !!reg && !!dateISO && dateISO >= reg;
  }

  /** يحسب الضريبة (طرح) من مبلغ شامل الضريبة بنسبة معيّنة */
  function vatFromInclusive(totalAmount, rate) {
    rate = num(rate);
    if (rate <= 0) return 0;
    return Math.round((totalAmount - totalAmount / (1 + rate)) * 100) / 100;
  }

  /* ============================================================
     الاستعلام والتجميع — تعمل على النسخة في الذاكرة (متزامنة)
     ============================================================ */
  function query(from, to, entityId) {
    return db.entries.filter(function (e) {
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      if (entityId && entityId !== 'all' && e.entityId !== entityId) return false;
      return true;
    });
  }

  function totals(list) {
    var t = { cost: 0, orders: 0, sales: 0, cogs: 0 };
    list.forEach(function (e) {
      t.cost += e.cost; t.orders += e.orders; t.sales += e.sales; t.cogs += e.cogs;
    });
    t.profit = t.sales - t.cost - t.cogs;
    t.roas = t.cost > 0 ? t.sales / t.cost : 0;
    t.cpo = t.orders > 0 ? t.cost / t.orders : 0;
    t.aov = t.orders > 0 ? t.sales / t.orders : 0;
    t.mktRatio = t.sales > 0 ? (t.cost / t.sales) * 100 : 0;
    return t;
  }

  function byChannel(list) {
    var map = {};
    list.forEach(function (e) {
      if (!map[e.channelId]) map[e.channelId] = [];
      map[e.channelId].push(e);
    });
    return Object.keys(map).map(function (k) {
      var t = totals(map[k]);
      t.channelId = k; t.channel = channel(k);
      return t;
    }).sort(function (a, b) { return b.cost - a.cost; });
  }

  function byDay(list, from, to) {
    if (!from || !to) return [];   // فترة مفتوحة — لا يمكن بناء محور يومي بلا حدّين
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

  function byMonth(list) {
    var map = {};
    list.forEach(function (e) {
      var m = e.date.slice(0, 7);
      if (!map[m]) map[m] = [];
      map[m].push(e);
    });
    return Object.keys(map).sort().map(function (m) {
      var t = totals(map[m]); t.month = m; return t;
    });
  }

  function byEntity(list) {
    var map = {};
    list.forEach(function (e) {
      if (!map[e.entityId]) map[e.entityId] = [];
      map[e.entityId].push(e);
    });
    return Object.keys(map).map(function (k) {
      var t = totals(map[k]);
      t.entityId = k; t.entityName = entityName(k);
      return t;
    }).sort(function (a, b) { return b.sales - a.sales; });
  }

  function previousRange(from, to) {
    var d1 = new Date(from + 'T00:00:00'), d2 = new Date(to + 'T00:00:00');
    var days = Math.round((d2 - d1) / 86400000) + 1;
    return { from: addDays(from, -days), to: addDays(from, -1), days: days };
  }

  /* ---------- الفواتير: استعلام وخزينة ---------- */
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

  function treasury(from, to, entityId) {
    var all = queryInvoices(null, null, entityId, 'all', 'all');
    var t = {
      opening: num(db.settings.openingBalance),
      paidIn: 0, paidOut: 0, pendingIn: 0, pendingOut: 0,
      periodIn: 0, periodOut: 0, countPendingIn: 0, countPendingOut: 0
    };
    all.forEach(function (v) {
      var inPeriod = (!from || v.date >= from) && (!to || v.date <= to);
      if (v.status === 'paid') {
        if (v.dir === 'in') { t.paidIn += v.amount; if (inPeriod) t.periodIn += v.amount; }
        else                { t.paidOut += v.amount; if (inPeriod) t.periodOut += v.amount; }
      } else {
        if (v.dir === 'in') { t.pendingIn += v.amount; t.countPendingIn++; }
        else                { t.pendingOut += v.amount; t.countPendingOut++; }
      }
    });
    t.balance   = t.opening + t.paidIn - t.paidOut;
    t.projected = t.balance + t.pendingIn - t.pendingOut;
    t.periodNet = t.periodIn - t.periodOut;
    return t;
  }

  /* ============================================================
     الضريبة (ضريبة القيمة المضافة)
     ضريبة المخرجات: على الوارد (المبيعات) — دائنة على المنشأة لصالح الزكاة والدخل
     ضريبة المدخلات: على الصادر (المشتريات) — تُخصم من ضريبة المخرجات
     صافي الضريبة = المخرجات − المدخلات (موجب = مستحق سداد، سالب = قابل للاسترداد)
     تُحسب فقط على الفواتير المسدّدة (أساس نقدي، يطابق دفتر الحساب البنكي)
     ============================================================ */
  function vatSummary(from, to, entityId) {
    var list = queryInvoices(from, to, entityId, 'all', 'paid');
    var t = { outputBase: 0, outputVat: 0, inputBase: 0, inputVat: 0 };
    list.forEach(function (v) {
      var vat = num(v.vatAmount), base = v.amount - vat;
      if (v.dir === 'in') { t.outputBase += base; t.outputVat += vat; }
      else                { t.inputBase += base; t.inputVat += vat; }
    });
    t.netVat = Math.round((t.outputVat - t.inputVat) * 100) / 100;
    return t;
  }

  function quarterOf(dateISO) { return Math.floor((parseInt(dateISO.slice(5, 7), 10) - 1) / 3) + 1; }

  function vatByQuarter(year, entityId) {
    var out = [];
    for (var q = 1; q <= 4; q++) {
      var from = year + '-' + String((q - 1) * 3 + 1).padStart(2, '0') + '-01';
      var toMonth = q * 3;
      var toDate = new Date(year, toMonth, 0);
      var to = year + '-' + String(toMonth).padStart(2, '0') + '-' + String(toDate.getDate()).padStart(2, '0');
      var s = vatSummary(from, to, entityId);
      s.quarter = q; s.year = year; s.from = from; s.to = to;
      out.push(s);
    }
    return out;
  }

  function vatByMonth(year, entityId) {
    var out = [];
    for (var m = 1; m <= 12; m++) {
      var from = year + '-' + String(m).padStart(2, '0') + '-01';
      var toDate = new Date(year, m, 0);
      var to = year + '-' + String(m).padStart(2, '0') + '-' + String(toDate.getDate()).padStart(2, '0');
      var s = vatSummary(from, to, entityId);
      s.month = m; s.year = year;
      out.push(s);
    }
    return out;
  }

  /** كل السنوات التي فيها فواتير (لقائمة اختيار السنة) */
  function invoiceYears() {
    var set = {};
    db.invoices.forEach(function (v) { set[v.date.slice(0, 4)] = true; });
    var years = Object.keys(set).sort();
    return years.length ? years : [String(new Date().getFullYear())];
  }

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

  /* ---------- التصدير ---------- */
  function csvEscape(v) {
    v = String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function exportCSV(list) {
    var head = ['التاريخ', 'المنشأة', 'القناة', 'الصرف التسويقي', 'عدد الطلبات',
                'المبيعات', 'تكلفة البضاعة', 'الربح', 'ROAS', 'ملاحظات'];
    var rows = list.map(function (e) {
      return [e.date, entityName(e.entityId), channelName(e.channelId),
              e.cost.toFixed(2), e.orders, e.sales.toFixed(2), e.cogs.toFixed(2),
              (e.sales - e.cost - e.cogs).toFixed(2),
              (e.cost > 0 ? e.sales / e.cost : 0).toFixed(2), e.note || ''];
    });
    return '﻿' + [head].concat(rows).map(function (r) {
      return r.map(csvEscape).join(',');
    }).join('\r\n');
  }

  function exportInvoicesCSV(list) {
    var head = ['التاريخ', 'النوع', 'رقم الفاتورة', 'الجهة', 'التصنيف',
                'المبلغ شامل الضريبة', 'قبل الضريبة', 'الضريبة', 'طريقة الدفع', 'الحالة', 'المنشأة', 'ملاحظات'];
    var rows = list.map(function (v) {
      return [v.date, v.dir === 'in' ? 'وارد' : 'صادر', v.invoiceNo, v.party,
              v.category, v.amount.toFixed(2), (v.amount - num(v.vatAmount)).toFixed(2),
              num(v.vatAmount).toFixed(2), v.method,
              v.status === 'paid' ? 'مسدّدة' : 'معلّقة',
              entityName(v.entityId), v.note];
    });
    return '﻿' + [head].concat(rows).map(function (r) {
      return r.map(csvEscape).join(',');
    }).join('\r\n');
  }

  function exportJSON() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(), org: db.orgName,
      entities: db.entities, channels: db.channels,
      entries: db.entries, invoices: db.invoices, settings: db.settings
    }, null, 2);
  }

  /* ---------- إدارة الفريق ---------- */
  async function inviteMember(email, role) {
    if (['owner', 'admin'].indexOf(me.role) < 0) {
      return { ok: false, reason: 'فقط المالك أو المدير يقدر يدعو أعضاء' };
    }
    var r = await client().rpc('invite_member', {
      target_email: (email || '').trim().toLowerCase(),
      target_role: role || 'member'
    });
    if (r.error) return { ok: false, reason: r.error.message };
    if (r.data && r.data.ok === false) return { ok: false, reason: r.data.reason };
    await log('إضافة', 'دعوة عضو: ' + email + ' بصلاحية ' + roleName(role));
    return { ok: true };
  }

  async function removeMember(userId) {
    if (['owner', 'admin'].indexOf(me.role) < 0) {
      return { ok: false, reason: 'فقط المالك أو المدير يقدر يزيل أعضاء' };
    }
    if (userId === me.id) return { ok: false, reason: 'لا يمكنك إزالة نفسك' };
    var r = await client().from('memberships').delete()
              .eq('org_id', orgId).eq('user_id', userId);
    if (r.error) return { ok: false, reason: r.error.message };
    db.members = db.members.filter(function (m) { return m.userId !== userId; });
    await log('حذف', 'إزالة عضو من الفريق');
    return { ok: true };
  }

  function roleName(r) {
    return { owner: 'مالك', admin: 'مدير', member: 'عضو', viewer: 'مشاهد فقط' }[r] || r;
  }

  /* ---------- الواجهة المصدَّرة ---------- */
  global.Store = {
    get db() { return db; },
    get me() { return me; },
    get orgId() { return orgId; },
    canWrite: canWrite, roleName: roleName,

    client: client, currentUser: currentUser,
    signUp: signUp, signIn: signIn, signOut: signOut, sync: sync,

    todayISO: todayISO, iso: iso, addDays: addDays, PALETTE: PALETTE,
    CAT_IN: CAT_IN, CAT_OUT: CAT_OUT, METHODS: METHODS,

    addEntry: addEntry, updateEntry: updateEntry, deleteEntry: deleteEntry,
    addInvoice: addInvoice, updateInvoice: updateInvoice, deleteInvoice: deleteInvoice,
    addChannel: addChannel, updateChannel: updateChannel, deleteChannel: deleteChannel,
    addEntity: addEntity, updateEntity: updateEntity, deleteEntity: deleteEntity,
    saveSettings: saveSettings,
    inviteMember: inviteMember, removeMember: removeMember,

    addClient: addClient, updateClient: updateClient, deleteClient: deleteClient,
    saveDue: saveDue, deleteDue: deleteDue, generateDuesForPeriod: generateDuesForPeriod,
    clientDuesOf: clientDuesOf, clientSummary: clientSummary,
    clientEffectiveStatus: clientEffectiveStatus, currentPeriod: currentPeriod,
    saveReport: saveReport, deleteReport: deleteReport, reportsOf: reportsOf,
    saveEvent: saveEvent, deleteEvent: deleteEvent, eventsOf: eventsOf,
    reportsByDay: reportsByDay, PLATFORMS: PLATFORMS, PLATFORM_AR: PLATFORM_AR,
    portalUsersOf: portalUsersOf, createPortalAccount: createPortalAccount,
    removePortalAccount: removePortalAccount,
    computeFee: computeFee, clientActiveInPeriod: clientActiveInPeriod,
    dueOf: dueOf, dueState: dueState, periodEnd: periodEnd, periodOf: periodOf,

    channel: channel, channelName: channelName, entityName: entityName,
    query: query, totals: totals, byChannel: byChannel, byDay: byDay,
    byMonth: byMonth, byEntity: byEntity, previousRange: previousRange,
    queryInvoices: queryInvoices, treasury: treasury, invoicesByCategory: invoicesByCategory,
    isVatRegisteredOn: isVatRegisteredOn, vatFromInclusive: vatFromInclusive,
    vatSummary: vatSummary, vatByQuarter: vatByQuarter, vatByMonth: vatByMonth,
    invoiceYears: invoiceYears, quarterOf: quarterOf,

    exportCSV: exportCSV, exportInvoicesCSV: exportInvoicesCSV, exportJSON: exportJSON
  };

})(window);
