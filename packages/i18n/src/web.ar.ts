import type { WebMessages } from './web.en.js';

/** Arabic web-only strings. Typed against `webEn`, so a gap is a build error. */
export const webAr: WebMessages = {
  web: {
    nav: {
      dashboard: 'لوحة التحكم',
      kitchen: 'مطبخي',
      plans: 'خطط الوجبات',
      recipes: 'الوصفات',
      shopping: 'التسوق',
      household: 'الأسرة',
      settings: 'الإعدادات',
    },
    rail: {
      title: 'تغطية المخزون',
      hint: 'ما تستخدمه هذه الخطة، وما تحتاج إلى شرائه.',
      inStock: 'من مطبخك',
      missing: 'يحتاج إلى شراء',
      collapse: 'إخفاء شريط المخزون',
      expand: 'إظهار شريط المخزون',
    },
    skipToContent: 'تخطٍ إلى المحتوى',
  },
};
