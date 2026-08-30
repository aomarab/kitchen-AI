# App Store review notes & demo account

Paste-ready content for **App Store Connect → your app → the version → App Review
Information**. Fill the two `<…>` demo-credential blanks with a real account you
create, then copy the **Review notes** block into the "Notes" field and the
demo email/password into the "Sign-In required" fields.

---

## Demo account (create one, then fill these)

The app signs in with **email + password** (as well as Google and Sign in with
Apple). Give the reviewer an email/password account so they don't need your
Google/Apple identity:

- **Sign-in required:** Yes
- **User name (email):** `<demo@kitchenai.app>`
- **Password:** `<a-strong-password>`

Create it once via the app's **Sign up** screen (or `POST /auth/register`). A
fresh account starts with the **free monthly grant of 150 credits**, which is
**6 live-assistant sessions** (25 credits each) — enough to review every feature
**without buying anything**.

---

## Review notes (copy into the "Notes" field)

```
Thanks for reviewing Mama's Kitchen.

SIGN IN
Use the demo account above (email + password). Sign in with Apple and Google are
also offered on the sign-in screen.

WHAT THE APP DOES
Photograph your kitchen or a receipt to build a pantry, then get meal plans
grounded in what you actually have. The app is fully bilingual English/Arabic
with right-to-left layout; switch language in Settings.

LIVE ASSISTANT (real-time voice + camera)
From the Home tab, tap "Live assistant". It opens a real-time assistant with
three modes:
  - Text: type a message.
  - Voice: talk hands-free (asks for Microphone permission).
  - Live: point the camera and talk while it looks (asks for Camera + Microphone).
The assistant is a live AI session and shows a "Live" badge. Audio/video streams
directly from the device to the AI provider; our server only mints a short-lived
credential. To protect the user's credits, a live session auto-pauses after 5
minutes and shows a "Resume" button — this is expected behavior, just tap Resume
to continue.
Items the assistant spots are NEVER written to the pantry automatically; the user
must review and confirm each one.

CREDITS & IN-APP PURCHASE
AI features are paid for in credits. Every account gets 150 free credits per
month (spent first), so no purchase is needed to test any feature. Credits can
also be bought via the in-app purchase "300 Credits" (consumable). Purchased
credits never expire; the free monthly grant resets each calendar month. To test
the purchase, use a Sandbox Apple ID — after a successful sandbox purchase the
credit balance in Settings increases by 300.

ACCOUNT DELETION
Settings → Delete account removes the account and its data in-app
(Guideline 5.1.1(v)). Web equivalent: /settings/delete-account.

PRIVACY
No tracking, no ads, no third-party analytics SDK, so no ATT prompt. Photos
upload directly to our storage and are used only to recognize items. See our
Privacy Policy (URL in App Information).

CONTACT
aomarab@outlook.com
```

---

## Reviewer tap-path cheat-sheet (for your own QA before submitting)

1. Launch → **Sign in** with the demo email/password.
2. **Home** tab → **"Live assistant"** row (sparkles icon) → assistant opens.
3. Switch mode to **Voice** → accept the **Microphone** prompt → say hello →
   confirm you hear a spoken reply and see the **Live** badge.
4. Switch to **Live** → accept the **Camera** prompt → point at any food → the
   assistant comments; tap a spotted item → **Add** → confirm it only lands in
   the pantry after you confirm.
5. Leave a session running ~5 min → confirm it **pauses** with a **Resume**
   button (the credit cap).
6. **Settings** → switch language to **Arabic** → confirm the layout mirrors
   right-to-left.
7. **Settings → Credits/Store** → buy **300 Credits** with a **Sandbox Apple ID**
   → confirm the balance rises by 300.
8. **Settings → Delete account** → confirm the account is removed.

## Things reviewers commonly flag — and where we stand

- **Guideline 4.8 (Sign in with Apple):** offered on the sign-in screen because
  Google sign-in is also offered. ✔
- **Guideline 3.1.1 (IAP for digital content):** credits are a consumable IAP;
  free grant never expires vs. purchased credits never expire — no external
  purchase path. ✔
- **Guideline 5.1.1(v) (account deletion):** in-app, `DELETE /me`. ✔
- **Camera/Mic usage strings:** live assistant uses them; ensure the
  `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` strings in
  `app.json` read naturally (they describe recognizing kitchen items / talking to
  the assistant). ✔
- **"Is the AI real?"** Yes — the default adapter is a live WebRTC session
  (`OpenAiRealtimeAssistantClient`). The "Demo" badge only ever appears on a
  deployment with no realtime key configured; the production API has one, so
  reviewers see "Live". Do not describe it as a demo in the listing.

## Source of truth

- Auth: `routes.register` / `routes.login` (email+password), plus `oauthLogin`.
- Free grant & costs: `FREE_MONTHLY_GRANT = 150`,
  `CREDIT_COSTS['assistant.session'] = 25` (`packages/contracts/src/credits.ts`).
- Assistant entry: Home tab row → `/assistant`
  (`apps/mobile/src/app/(tabs)/home.tsx`).
- Session cap: `MAX_ASSISTANT_SESSION_MS = 5 min`
  (`packages/contracts/src/assistant.ts`).
- Privacy posture: `docs/store-listing/app-store-privacy-answers.md` +
  `app.json` privacy manifest.
