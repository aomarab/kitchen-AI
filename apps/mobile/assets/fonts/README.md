# Vendored fonts

Both scripts ship inside the app so typography works offline and on first launch,
and so the app never fetches font binaries from a mutable CDN ref at runtime.
`src/lib/fonts.ts` keys each face by its PostScript name, and a mismatch falls
back to the system font silently, so the names below are load-bearing.

# Outfit (Latin)

The Latin face of the Apricot redesign (mobile redesign spec §7.1).

- **Source:** https://github.com/Outfitio/Outfit-Fonts/tree/main/fonts/ttf
- **Retrieved at commit:** `902773808eb372f70fb34e8946dd1ffe604efc79`
- **Version:** 1.100 — Copyright 2021 The Outfit Project Authors
- **Licence:** SIL Open Font License 1.1 — full text in `OFL-Outfit.txt`

Weights vendored: Regular (400), Medium (500), SemiBold (600), Bold (700). Each
cut carries the `tnum` feature, which the `numeral` type variant relies on for
tabular figures. Outfit has no Arabic glyphs; Arabic inside Latin UI falls back
per glyph to the OS font.

| File                  | sha256                                                             |
| --------------------- | ------------------------------------------------------------------ |
| `Outfit-Regular.ttf`  | `3b64ac4f6ab6a8eebddd4b0bc03c811c43602e11e176382ab0ee6be615ab861b` |
| `Outfit-Medium.ttf`   | `dc8d9212fc57556a55d01e863071f727cd6264b748e28885d853807aeb186142` |
| `Outfit-SemiBold.ttf` | `bf2e1d2a6ec2a67952e8b36edd2b2bb9f340c0cdd10b0ad5145b4dbbc1339608` |
| `Outfit-Bold.ttf`     | `f620b69582e06d7e1b3bbde74ed8c5876eadabb038390780db2a3414a1490197` |
| `OFL-Outfit.txt`      | `c676351bf8576b9aba743cd5eaa8c0e7ee0d51f805d720447b4df4ddb6a2e416` |

To update, re-download the four `.ttf` files from `fonts/ttf/` and the repository's
`OFL.txt` (saved here as `OFL-Outfit.txt`), record the new commit SHA and hashes
here, and re-check the PostScript names and `usWeightClass` in each file.

# Tajawal (Arabic)

Mandated for Arabic typography by the system design spec §7.

- **Source:** https://github.com/google/fonts/tree/main/ofl/tajawal
- **Retrieved at commit:** `7ff85c87f93ea6cca5f41c69f2e4edcb90240f26`
- **Version:** 1.700 — Copyright © 2018 Boutros International
- **Licence:** SIL Open Font License 1.1 — full text in `OFL.txt`

Weights vendored: Regular (400), Medium (500), Bold (700).

**Tajawal has no semibold.** The family ships 200, 300, 400, 500, 700, 800 and
900 — there is no 600 — so the type scale's 600 tier is mapped to Bold in
`src/lib/fonts.ts`. Adding a `Tajawal-SemiBold.ttf` here is not possible; if the
600 tier ever needs its own cut, the family has to change.

To update, re-download the three `.ttf` files and `OFL.txt` from the path above,
record the new commit SHA here, and re-check the PostScript names in the TTF
`name` tables — `src/lib/fonts.ts` keys each face by that exact string, and a
mismatch falls back to the system font silently.
