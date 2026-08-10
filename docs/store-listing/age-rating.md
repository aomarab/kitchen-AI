# Store age ratings

The answers to give in App Store Connect's age-rating questionnaire and the
Play Console's IARC questionnaire, and the reasoning that produced each one.
Update this file in the same change as any feature that could move a rating —
the point is that the console answers have a reviewable source, rather than
being reconstructed from memory at submission time.

The app photographs a kitchen and returns meal plans grounded in what is on
hand. It has no violence, sexual, gambling, horror or mature content of any
kind, so almost every answer is the neutral one; the two questions that need
thought are unrestricted web access and user-generated content, both answered
below against what the code actually does.

## App Store Connect — Age Rating

Answer every content question **None**:

- Cartoon or Fantasy Violence — **None**
- Realistic Violence — **None**
- Prolonged Graphic or Sadistic Realistic Violence — **None**
- Profanity or Crude Humor — **None**
- Mature/Suggestive Themes — **None**
- Horror/Fear Themes — **None**
- Medical/Treatment Information — **None**
- Alcohol, Tobacco, or Drug Use or References — **None**
- Simulated Gambling — **None**
- Sexual Content or Nudity — **None**
- Graphic Sexual Content and Nudity — **None**
- Contests — **None**

Then the capability questions:

- **Unrestricted Web Access — No.** The app opens YouTube recipe videos, but it
  never embeds an in-app browser or navigates to arbitrary URLs. A video is
  reached only by a specific video id obtained from the YouTube Data API
  (`apps/api/src/ai/clients/http-youtube.client.ts`); the id never comes from
  the model, and the client opens that one video rather than a browsable web
  view. Answering "Yes" here would over-rate the app to 17+.
- **Gambling — No.**
- **User Generated Content — No.** The only content a user creates is feedback
  (a star rating and an optional message), and it is submitted to us privately.
  No screen renders another user's text, so there is no shared content stream to
  moderate. See `data-safety.md` and the Guideline 1.2 note there.

**Expected result: 4+.**

## Play Console / IARC — Content rating questionnaire

Google routes the same declaration through IARC. Category: a **Utility /
Productivity** app (reference and meal planning), not a game. Answer the same
substance the Apple form asks, in IARC's wording:

- Violence (cartoon, fantasy, or realistic) — **No**
- Sexuality or nudity — **No**
- Profanity or crude humour — **No**
- Controlled substances (alcohol, tobacco, drugs) — **No**
- Gambling or simulated gambling — **No**
- Fear, horror, or disturbing content — **No**
- Discrimination or hateful content — **No**

Interactive-elements / miscellaneous section:

- **Users interact / shares info** — the account collects email and name and the
  app uploads kitchen photos; this is disclosed in `data-safety.md`, but none of
  it is shared *between users*.
- **Shares user-generated content with other users — No**, for the same reason
  as Apple's UGC answer: feedback is private to us.
- **Unrestricted internet access — No**, for the same reason as Apple's: only
  specific YouTube video ids from the Data API are opened, never an arbitrary
  URL or an in-app browser.

**Expected result: Everyone** (and the equivalent regional marks IARC assigns —
PEGI 3, USK 0, etc.).

## When these answers must be revisited

Both questionnaires above assume two properties of the app that the code
currently enforces. Re-open this file the moment either changes:

- **If any screen ever renders another user's text** — grocery-item reviews,
  shared notes, comments — the UGC answers flip to "Yes" and Guideline 1.2's
  moderation, reporting and blocking obligations attach. That is a rating and a
  policy change, not a copy change.
- **If the app ever opens an arbitrary URL or embeds a general web view** — as
  opposed to a single YouTube video id from the Data API — the unrestricted web
  access answers flip to "Yes" and the rating rises accordingly.
