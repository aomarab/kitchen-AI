import type { MobileMessages } from './mobile.en.js';

/** Arabic mobile-only strings. Typed against `mobileEn`, so a gap is a build error. */
export const mobileAr: MobileMessages = {
  mobile: {
    tabs: {
      home: 'الرئيسية',
      kitchen: 'المطبخ',
      plans: 'الخطط',
      more: 'المزيد',
    },
    home: {
      tonightTitle: 'الليلة',
      tonightEmpty: 'لا توجد وجبة مخططة لهذه الليلة.',
      expiringStrip: 'استخدمها قريباً',
      weekProgress: 'طهوت {cooked} من {total} وجبات هذا الأسبوع',
      quickAdd: 'إضافة سريعة',
    },
    permissions: {
      cameraTitle: 'نحتاج إذن الكاميرا',
      cameraBody: 'يحتاج «مطبخ AI» إلى الكاميرا للتعرف على ما في مطبخك.',
      openSettings: 'فتح الإعدادات',
    },
    offlineBanner: 'غير متصل — تُحفظ التغييرات وستتم مزامنتها تلقائياً.',
  },
};
