# App Store screenshots

Ready-to-upload iPhone screenshots for the App Store listing, in English (`en/`)
and Arabic (`ar/`). Pair them with the copy in
[`../listing-copy.md`](../listing-copy.md).

## Specs (verified)

- **Size:** 1320 × 2868 px — the **6.9-inch** iPhone display (iPhone 17 Pro Max).
  This is Apple's current required iPhone size; App Store Connect auto-scales it
  down for 6.5-inch and 6.1-inch devices, so this single set covers modern
  iPhones. (If Connect ever asks for a 6.5-inch set explicitly, add an
  iPhone 15 Plus / 8 Plus capture at 1284 × 2778 / 1242 × 2208.)
- **Format:** PNG, RGB, **no alpha channel** (Connect rejects transparency).
- **Status bar:** clean 9:41, full signal + battery (Apple marketing convention).

## The set

| #   | English               | Arabic (RTL)          | Shows                                                                           |
| --- | --------------------- | --------------------- | ------------------------------------------------------------------------------- |
| 1   | `en/01-welcome.png`   | — (first-run only)    | Value proposition + language toggle                                             |
| 2   | `en/02-home.png`      | `ar/02-home.png`      | "What should I cook tonight?" — tonight's meal, kitchen counts, freshness donut |
| 3   | `en/03-kitchen.png`   | `ar/03-kitchen.png`   | Pantry with quantities + colour-coded expiry badges                             |
| 4   | `en/04-plans.png`     | `ar/04-plans.png`     | Weekly meal plan                                                                |
| 5   | `en/05-assistant.png` | `ar/05-assistant.png` | Live assistant: spots ingredients, suggests a recipe                            |

The Arabic captures demonstrate full **RTL mirroring** (sidebar/donut/tabs flip,
badges move to the opposite edge) and **natively-written Arabic** (the assistant
speaks colloquially — it is not a literal translation of the English).

## Honesty / App Review note

The live-assistant screens are captured in the shipping **demo mode**: the frame
carries the persistent "Sample assistant — not live AI yet" /
"مساعد تجريبي" label, and the spotted ingredients are marked "(sample)". This
matches the app's behaviour today (only the mock realtime adapter ships) and the
[app review notes](../app-review-notes.md) — the screenshots do not overstate the
feature.

## How they were regenerated

Captured from the Expo app running on the **iPhone 17 Pro Max** simulator in
**mock mode** (`EXPO_PUBLIC_USE_MOCKS=true`), so no API, database, or API keys
are needed — the seeded mock household (`chef@kitchen.ai`, a stocked pantry, a
week of meals) provides the content.

```bash
# 1. Boot the 6.9" sim and set the marketing status bar
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
SIM=$(xcrun simctl list devices available | awk -F'[()]' '/iPhone 17 Pro Max/{print $2; exit}')
xcrun simctl boot "$SIM"
xcrun simctl status_bar "$SIM" override --time 9:41 \
  --batteryState discharging --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 --dataNetwork wifi --operatorName ""

# 2. Build + run the app in mock mode
( cd ../../../apps/mobile && EXPO_PUBLIC_USE_MOCKS=true npx expo run:ios --device "iPhone 17 Pro Max" )

# 3. Sign in with the mock "Continue with Apple" button, navigate, and capture
xcrun simctl io "$SIM" screenshot en/02-home.png
# switch language in Settings for the ar/ set

# 4. Strip the alpha channel Apple rejects
python3 - <<'PY'
import glob
from PIL import Image
for f in glob.glob('en/*.png') + glob.glob('ar/*.png'):
    Image.open(f).convert('RGB').save(f, 'PNG', optimize=True)
PY
```
