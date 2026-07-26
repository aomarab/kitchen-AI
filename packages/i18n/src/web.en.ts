/**
 * Web-only strings. **Owned by the web workstream** — nothing else writes here,
 * which is what lets the web and mobile catalogs grow in parallel without
 * conflicting on a shared file.
 *
 * Shared domain strings (inventory, plans, recipe, shopping, …) live in
 * `en.ts` and are coordinator-owned; use those rather than duplicating here.
 *
 * Every key added here must also be added to `web.ar.ts`, or the build fails.
 */
export const webEn = {
  web: {
    nav: {
      dashboard: 'Dashboard',
      kitchen: 'My Kitchen',
      plans: 'Meal Plans',
      recipes: 'Recipes',
      shopping: 'Shopping',
      household: 'Household',
      settings: 'Settings',
    },
    rail: {
      title: 'Pantry coverage',
      hint: 'What this plan uses, and what you still need to buy.',
      inStock: 'From your kitchen',
      missing: 'Needs buying',
      collapse: 'Hide pantry rail',
      expand: 'Show pantry rail',
    },
    skipToContent: 'Skip to content',
  },
};

export type WebMessages = typeof webEn;
