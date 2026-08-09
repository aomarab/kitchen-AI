# Tajawal

Vendored so Arabic typography (spec §7) works offline and on first launch, and so
the app does not fetch font binaries from a mutable CDN ref at runtime.

- **Source:** https://github.com/google/fonts/tree/main/ofl/tajawal
- **Retrieved at commit:** `7ff85c87f93ea6cca5f41c69f2e4edcb90240f26`
- **Version:** 1.700 — Copyright © 2018 Boutros International
- **Licence:** SIL Open Font License 1.1 — full text in `OFL.txt`

Weights vendored: Regular (400), Medium (500), Bold (700).
Latin faces are not vendored; Latin text uses the system font.

**Tajawal has no semibold.** The family ships 200, 300, 400, 500, 700, 800 and
900 — there is no 600 — so the type scale's 600 tier is mapped to Bold in
`src/lib/fonts.ts`. Adding a `Tajawal-SemiBold.ttf` here is not possible; if the
600 tier ever needs its own cut, the family has to change.

To update, re-download the three `.ttf` files and `OFL.txt` from the path above,
record the new commit SHA here, and re-check the PostScript names in the TTF
`name` tables — `src/lib/fonts.ts` keys each face by that exact string, and a
mismatch falls back to the system font silently.
