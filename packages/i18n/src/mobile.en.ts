/**
 * Mobile-only strings. **Owned by the mobile workstream** — nothing else writes
 * here, which is what lets the web and mobile catalogs grow in parallel without
 * conflicting on a shared file.
 *
 * Shared domain strings (inventory, plans, recipe, shopping, …) live in
 * `en.ts` and are coordinator-owned; use those rather than duplicating here.
 *
 * Every key added here must also be added to `mobile.ar.ts`, or the build fails.
 */
export const mobileEn = {
  mobile: {
    tabs: {
      home: 'Home',
      kitchen: 'Kitchen',
      plans: 'Plans',
      more: 'More',
    },
    home: {
      tonightTitle: 'Tonight',
      tonightEmpty: 'No meal planned for tonight.',
      expiringStrip: 'Use these soon',
      weekProgress: '{cooked} of {total} meals cooked this week',
      quickAdd: 'Quick add',
    },
    permissions: {
      cameraTitle: 'Camera access needed',
      cameraBody: 'Kitchen AI needs the camera to recognise what is in your kitchen.',
      openSettings: 'Open settings',
    },
    offlineBanner: 'Offline — changes are saved and will sync automatically.',
  },
};

export type MobileMessages = typeof mobileEn;
