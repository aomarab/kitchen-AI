import type { Locale } from '@kitchen/i18n';

/** Picks the Arabic or English variant of a bilingual name for the active locale. */
export function localizedName(locale: Locale, names: { en: string; ar: string }): string {
  return locale === 'ar' ? names.ar : names.en;
}

/**
 * What to call an item on this household's shelf.
 *
 * A household can rename what it keeps, because a recognised name is often not
 * the name they use — and `ingredient` is a row in a global catalog shared by
 * everyone, so the new name lives on the item. Without this the rename would
 * appear to vanish everywhere except the screen that made it.
 */
export function itemName(
  locale: Locale,
  item: {
    label: string | null;
    ingredient: { canonicalNameEn: string; canonicalNameAr: string };
  },
): string {
  return (
    item.label ??
    localizedName(locale, {
      en: item.ingredient.canonicalNameEn,
      ar: item.ingredient.canonicalNameAr,
    })
  );
}
