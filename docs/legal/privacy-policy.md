# Privacy Policy — Kitchen AI

> **DRAFT — NOT LEGAL ADVICE.** This document is engineering's honest description
> of what the app does with data, written so a lawyer can turn it into a
> published policy quickly and correctly. It must be reviewed by qualified
> counsel before it is published or linked from the App Store / Play Console.
> Fill every `[BRACKETED]` placeholder. Its factual claims are grounded in the
> code and in `docs/store-listing/data-safety.md`; if the two ever disagree,
> `data-safety.md` and the code win — update this file in the same change.

**Effective date:** `[DATE]`
**Provider:** `[LEGAL ENTITY NAME]` (`[JURISDICTION]`), "we", "us".
**Contact:** `[PRIVACY CONTACT EMAIL]`.

Kitchen AI photographs your kitchen and returns meal plans grounded in what you
actually have on hand. This policy explains what personal data the app collects,
why, who can see it, and how you can delete it.

## 1. Data we collect

We collect only what the app needs to function. We do **not** collect advertising
identifiers, and there is no third-party analytics or advertising SDK in the app,
so no App Tracking Transparency prompt is shown.

| Data                | Where it comes from         | Why we need it                                |
| ------------------- | --------------------------- | --------------------------------------------- |
| Email address       | Account creation or OAuth   | Sign-in and account recovery                  |
| Name / display name | Account creation or OAuth   | Showing who you are in the app                |
| Photos              | Kitchen and receipt capture | Recognising the items you have                |
| Feedback message    | The in-app feedback form    | Understanding and acting on what you told us  |
| Feedback rating     | The in-app feedback form    | The same product-support purpose              |
| Dietary preferences | Your profile (optional)     | Tailoring meal plans (allergies, halal, etc.) |

All of the above is **linked to your account** and **none of it is used to track
you** across other apps or services.

We do **not** sell your personal data and we do **not** share it with data
brokers.

## 2. How your photos are handled

Photos are uploaded **directly from your device to our object storage** through a
short-lived, single-purpose upload link (a presigned URL); they do not pass
through our application servers, and afterwards they are referenced only by an
internal storage key. They are still data we hold — they land on infrastructure
we control and are linked to the account that uploaded them.

To recognise the items in a photo, the image is sent to our AI processing
provider(s) (`[AI VISION PROVIDER, e.g. OpenAI / Google]`). We disclose these
sub-processors at `[SUB-PROCESSOR LIST URL]`. Photos are resized on-device before
upload and are used to identify pantry/receipt contents, not for any other
purpose.

## 3. How we use your data

- **Provide the service** — sign you in, recognise items from your photos, and
  generate meal plans and shopping lists grounded in your pantry.
- **Personalise plans** — apply the dietary preferences, allergies, and halal
  setting you choose to store in your profile.
- **Support the product** — read the feedback you send us so we can fix and
  improve the app.
- **Keep the service working and safe** — operate, secure, debug, and prevent
  abuse of the service.

We do not use your data for advertising, and we do not make automated decisions
that produce legal or similarly significant effects about you.

## 4. Feedback

When you send us feedback, we receive your rating, your message, the app
version, and your language. Our staff can see this along with the email address
and display name on your account, so we can understand and act on what you told
us. We do not use your feedback to decide whether to show you an App Store or
Google Play review prompt.

> The final sentence above is a commitment enforced in code
> (`apps/mobile/src/lib/store-policy.spec.ts` fails the build if the app imports a
> store-review API). Keep it verbatim.

## 5. Households and shared data

Kitchen AI organises data around a **household**, not a single user. Members of a
household can see that household's pantry, plans, and shopping lists. Your
profile (including dietary preferences) is your own. When you contribute to a
household's inventory history, that history belongs to the household — see
deletion below for what happens to it when you leave.

## 6. Purchases

If you buy credits, the purchase is processed by **Apple** or **Google** through
their in-app purchase systems and verified on our side via `[PAYMENTS PROVIDER,
e.g. RevenueCat]`. We receive a record that a purchase was made and the credits
it granted. We do **not** receive or store your full payment card details — those
are handled by the app store and its payment processor under their own privacy
terms.

## 7. Where data is stored and how we protect it

Your data is stored on `[HOSTING / REGION, e.g. AWS eu-west-1]`. We use
industry-standard measures including encryption in transit (HTTPS/TLS), access
controls, and least-privilege staff access. No method of transmission or storage
is perfectly secure, but we work to protect your information.

## 8. Retention and deletion

We keep your data for as long as your account exists. You can delete your account
at any time, from **Settings → Delete account** in the app, or from the web page
at `[https://YOUR-DOMAIN]/settings/delete-account`.

Deleting your account:

- **Erases** your sign-in credentials and OAuth links, your profile (dietary
  preferences, allergies, halal flag), the feedback you submitted, and any
  household that is left with no remaining members — including that household's
  storage locations, inventory, meal plans, shopping lists, and receipts.
- **Hands over** any household you shared with others to a remaining member, so
  their data is not destroyed with your account.
- **De-attributes** shared history that belongs to a household: your past
  inventory changes remain in the household's ledger but are no longer linked to
  you.
- **Revokes** your Sign in with Apple token (best-effort), as Apple requires.
- **Clears local data** on your device, including any queued offline changes.

If you signed in with Apple or Google, deletion also removes the stored link to
those providers.

## 9. Your rights

Depending on where you live, you may have rights to access, correct, delete, or
port your personal data, and to object to or restrict certain processing.

- **EEA/UK (GDPR):** our legal basis is performance of our contract with you
  (providing the service) and our legitimate interests (security, support, and
  improving the product). You may lodge a complaint with your local supervisory
  authority. `[APPOINT EU/UK REPRESENTATIVE IF REQUIRED.]`
- **California (CCPA/CPRA):** we do not sell or "share" personal information as
  those terms are defined, and we do not discriminate against you for exercising
  your rights.

To exercise any right, contact `[PRIVACY CONTACT EMAIL]`. Account deletion is
available immediately in-app as described above.

## 10. Children

Kitchen AI is rated 4+ / Everyone but is a general-purpose productivity app that
is **not directed to children**. We do not knowingly collect personal data from
children under `[13 / 16 as required by jurisdiction]`. If you believe a child
has provided us data, contact us and we will delete it.

## 11. International transfers

We may process and store data in countries other than the one you live in. Where
we transfer personal data out of the EEA/UK, we rely on appropriate safeguards
such as Standard Contractual Clauses. `[CONFIRM MECHANISM WITH COUNSEL.]`

## 12. Changes to this policy

We may update this policy. When we make material changes, we will update the
effective date and, where appropriate, notify you in the app. Continued use after
an update means you accept the revised policy.

## 13. Contact

Questions or requests: `[PRIVACY CONTACT EMAIL]`, `[POSTAL ADDRESS IF REQUIRED]`.
