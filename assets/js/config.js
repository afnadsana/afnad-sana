/* ============================================================
   config.js — إعدادات الاتصال بقاعدة البيانات
   ------------------------------------------------------------
   املأ القيمتين من:  Supabase ← Settings ← API
   • url     = Project URL
   • anonKey = مفتاح "anon public"
   ------------------------------------------------------------
   مفتاح anon مصمَّم ليكون علنياً في كود المتصفح؛ حمايته تأتي من
   سياسات RLS في supabase/schema.sql وليس من إخفائه.
   لا تضع هنا مفتاح service_role إطلاقاً — فهو يتجاوز كل الحمايات.
   ============================================================ */
window.SUPA_CONFIG = {
  url:     'https://tyhfghqmyybeqcermrtm.supabase.co',
  anonKey: 'sb_publishable_23zpLuolctK6yZshvGkn0Q_C5ZvbGHd'
};

window.SUPA_READY = (function () {
  var c = window.SUPA_CONFIG;
  return !!(c && /^https:\/\/.+\.supabase\.co\/?$/.test(c.url || '') &&
            (c.anonKey || '').length > 30 &&
            c.anonKey.indexOf('ضع_هنا') < 0);
})();
