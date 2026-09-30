# Mobile J · Coral — Figma parity fixes (plan)

- **Spec:** `docs/superpowers/specs/2026-09-28-mobile-coral-redesign-design.md` (visuals, §8 components,
  §9 frame → route table, §9.1 accepted deviations). Behaviour for capture remains
  `docs/superpowers/specs/2026-09-27-mobile-apricot-bento-redesign-design.md`.
- **Source:** a deep frame-by-frame review of the running app against the Figma file
  `2qQOglGHfyF3H3h0kxsQYZ` (J · Coral — Full app), 2026-09-29. It covered 78 frames plus the component
  page. Tokens, type scale, shadows, icon names and illustration names already match. What follows are
  the validated gaps.
- **User rulings (2026-09-29):**
  - Fix every validated design gap.
  - Also match five behaviour-changing frames:
    - B1: capture results sheet, keeping the confidence gate.
    - B2: Leave household.
    - B3: plan generation shown inside the Plans tab.
    - B4: meal sheet without the Servings stepper and without "Start cooking".
    - B5: no "Retake" on Review.
  - B1 detail: keep the Apricot rule that "Add all" appears only when every item is confident. When any
    item is unsure, only "Review" is offered. The results sheet takes the frame's full-width layout.

## Evidence kit (for every task)

`WS=/Users/aomr/.copilot/session-state/20e28aac-26b8-4091-a5a4-2f4921ae4e94/files/figma-review`

- **`$WS/ref/<slug>.png`:** the Figma frame at 1× (390×844 pt), for example `ref/kitchen.png`.
- **`$WS/pairs/<group>/<slug>.png`:** Figma on the left, the app before this plan on the right, with 20 pt
  ticks.
- **`$WS/verify-*.md`, `$WS/review-components.md`:** the reviewers' detailed notes. Search them for your
  frame's slug.
- **`$WS/FINDINGS.md`:** the consolidated list.
- **Exact measurements:** call the Figma MCP `figma-get_metadata` or `figma-get_design_context` with
  fileKey `2qQOglGHfyF3H3h0kxsQYZ` and the node id from spec §9. Metadata returns x/y/w/h for every
  layer.

## Global constraints

1. **Frame visuals govern; existing behaviour is kept**, except where a user ruling above says otherwise.
   Any behaviour change, or any change to a §9.1 ruling, must be recorded in spec §9.1 in the same commit.
   Write it as "By user ruling (2026-09-29), …".
2. **Tokens only.** Colours, radius and type come from `apps/mobile/src/theme/` (`palettes.ts`,
   `index.ts`) through `useTheme()`. Use no hex literals and no hard-coded `letterSpacing`.
   - Never relax the guard tests: `theme/palette.spec.ts`, `theme/typography.spec.ts`,
     `components/controls.spec.ts`, `components/structure.spec.ts`, `components/visual-rhythm.spec.ts`.
   - Updating a layout expectation test, such as `tile-layout.spec.ts`, is allowed only when it encoded
     a non-frame value. Say so in your report.
3. **RTL.** Use no physical-direction style keys: `marginStart/End`, `paddingStart/End`, `start/end`,
   never `left/right`. ESLint enforces this. Direction-implying icons go through `DirectionalIcon`.
4. **i18n is append-only.** Never delete or rename keys. New mobile copy goes into
   `packages/i18n/src/mobile.en.ts` and `mobile.ar.ts`, with Arabic written natively.
   - Run `pnpm --filter @kitchen/i18n build` after changing them. The app and typecheck read `dist`.
   - Error copy uses existing `errors.*` keys.
5. **Contracts are frozen.** Do not edit `packages/contracts`. Use existing routes only, through the
   typed client and the hooks in `apps/mobile/src/hooks/`.
6. **Accessibility.**
   - Every icon-only control keeps a 44 pt hit target and an `accessibilityLabel`.
   - Existing labels and live regions stay.
7. **Formatting and commits.**
   - Format only the files you changed: `npx prettier --config packages/config/prettier.config.mjs --write <paths>`.
   - End every commit message with `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
   - Never commit `.env*` files. Never run `pnpm format`.
8. **Checks per task.** All must pass before committing:
   - `pnpm --filter @kitchen/mobile typecheck`
   - `pnpm --filter @kitchen/mobile lint`
   - `pnpm --filter @kitchen/mobile exec vitest run`

## Visual verification recipe (every task)

The Simulator is iPhone 17e, the same 390×844 as the frames:
`U=4ED69801-776B-430F-B8FB-715A9538E447`.

- The app runs in MSW mock mode. Metro is already running on port 8082 in watch mode, so edits hot-reload.
  If something looks stale, relaunch the app.
- Never restart Metro or the API, never touch other Simulators, and never edit `.env*`.

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
U=4ED69801-776B-430F-B8FB-715A9538E447; IDB=~/Library/Python/3.9/bin/idb
xcrun simctl terminate $U com.abedomar.kitchenai; xcrun simctl launch $U com.abedomar.kitchenai
$IDB ui describe-all --udid $U          # accessibility tree with frames in points: find tap targets
$IDB ui tap --udid $U X Y               # points
$IDB ui swipe --udid $U X1 Y1 X2 Y2 --duration 0.4
xcrun simctl io $U screenshot $WS/after/task-N/<slug>.png
python3 $WS/pair.py $WS/after/task-N/<slug>-pair.png $WS/ref/<slug>.png $WS/after/task-N/<slug>.png
```

- **Sign-in and toolbox:**
  - If signed out, sign in with the mock: Welcome → "I already have an account" → `chef@kitchen.ai`,
    any password.
  - Dismiss the LogBox toast with its ⊗ before taking a shot.
  - If the idb companion is unreachable, start it (background) with
    `mkdir -p /tmp/idb && DEVELOPER_DIR=/tmp/XcShadow.app/Contents/Developer idb_companion --udid $U --grpc-domain-sock /tmp/idb/${U}_companion.sock > /tmp/idb-companion-$U.log 2>&1 &`.
- **Dark and Arabic:**
  - Dark: Account → Settings → Appearance.
  - Arabic: Settings → Language.
  - Restore Light and English when done.
- **Evidence:** produce an after-pair for every frame the task touches. View it and state in your report
  whether it now matches.
- **Limits:** the Simulator has no camera. For capture results, verify layout by reading the code plus
  whatever flow is reachable, and say what you could not see.

---

## Task 1: Shared components, chat bubble gutter, feedback mock bug

**Goal:** fix the library-level mismatches that every screen inherits.

1. **Row dividers are 1 pt `rowline`, not hairline.** Spec §8 says ListRow has a "bottom 1px `rowline`".
   - Change `StyleSheet.hairlineWidth` to `1` for row dividers in:
     - `components/ListRow.tsx` (~line 67)
     - `features/plans/PlanBoard.tsx` (~158, ~233)
     - `app/entry/[id].tsx` (~97)
   - Also change any other row-to-row divider that uses the `rowline` colour: grep `hairlineWidth` in
     `apps/mobile/src`.
   - Leave card edges, sheet edges and non-row borders alone.
2. **Waveform** (`features/assistant/Waveform.tsx:6–9`, `:72–85`): Figma component `124:492` is
   141×40 pt with 24 bars, each 3 wide on a 6 pt step (gap 3).
   - Render 24 bars in a 40 pt tall box, 141 pt wide.
   - Keep the animation, reduced-motion behaviour and `media` colouring.
3. **IconButton `outline` tone** (`components/button-tones.ts` ~line 115): the border becomes
   `colors.border` (#E5E5E7 light), not `colors.control`.
   - The Figma Composer mode button and the Live controls use the hairline-grey outline.
   - The checkbox off-state keeps `control`; its guard test stays as is.
4. **Tab bar icons** (`app/(tabs)/_layout.tsx` lines ~33, 40, 47, 54): size 24, not 22. Leave the
   centre scan action as it is.
5. **Assistant chat bubbles** (`features/assistant/Bubble.tsx`, `LiveAssistantScreen.tsx` ~518):
   - The user bubble currently runs to the screen edge. Pair: `$WS/pairs/capture-assistant/assistant-chat.png`.
   - The row wrapper uses `width: '100%'` inside a padded container. Use `alignSelf: 'stretch'`, or
     remove the width, so the padding applies.
   - The transcript's horizontal padding must be `spacing.gutter` (20).
   - Figma frame `159:3769`: bubbles run from x=20 to x=370, maxWidth 290, padding 10/14.
6. **Feedback mock bug** (`apps/mobile/src/mocks/handlers.ts` ~line 250): `submitFeedback` calls
   `crypto.randomUUID()`, which Hermes lacks, so Send feedback fails in mock mode.
   - Use the id helper in `apps/mobile/src/lib/uuid.ts` instead.
   - Check every other `crypto.randomUUID` in `apps/mobile/src/mocks` and fix it the same way.
7. **Not in scope:**
   - The timer stop glyph stays `x`. The Cooking timers and Cook mode screen frames draw an X.
   - Timer "+1 min" is documented in §9.1.

**Tests:**

- Add or adjust a unit test where a pure value changed, for example the waveform bar count and width, if
  it is exported or testable.
- Keep all guard tests green.

**Verify visually:**

- Assistant chat (Home → Chat), compared with `ref/assistant-chat.png`.
- Any ListRow screen (Account), compared with `ref/account.png`, to confirm the 1 pt dividers.
- The tab bar icon size.
- Send feedback submits in mock mode: Account → Settings → Send feedback.

**Spec:** in §8, note nothing new unless you deviate.

## Task 2: Home and Kitchen

**Goal:** make Home (`133:626`) and Kitchen (`133:1065`, Fridge `133:1268`) match their frames.

Pairs:

- `$WS/pairs/auth-tabs/home-full-page*.png`
- `$WS/pairs/auth-tabs/kitchen*.png`, `kitchen-fridge.png`

1. **Place tiles** (`components/Tile.tsx`, `components/tile-layout.ts`, the Home "Kitchen at a glance"
   grid and the Kitchen grid):
   - Tiles in one row must be the same height. A tile with the "n soon" line currently grows taller than
     its neighbour.
   - Frame values: tile 167×158, grid gap 16. Icon, name, count and "n soon" are top-aligned inside
     padding 16–18, with no vertical centring. Measure with `get_metadata` on `133:1065`.
   - The Home grid uses the same tile.
2. **Kitchen vertical rhythm.** Frame positions on the 844 frame:
   - Title row.
   - Search field top at y=122 (44 tall).
   - Chips at y=180–215.
   - Tile grid top at y=230.
   - "Use these first" header at y=585.

   The app currently places search at 135, chips at 207, grid at 271 and the header at 655. Fix the gaps
   in `app/(tabs)/kitchen.tsx` (the `gap: spacing.xl` stack and the chips' vertical padding) so the
   positions match within ±4 pt.

3. **Kitchen chips:**
   - Only "All" shows a count.
   - Place chips show just their label, with no count badge. Keep each place chip's accessibility label
     meaningful.
4. **"Use these first" trailing action:**
   - The frame shows "Sort" in coral, small, the same style as Home's "See all".
   - Replace the ink "See all" (`seeAllUseFirst`) with a "Sort" action that opens the existing
     `SortSheet`.
   - Add a key `mobile.kitchen.sortAction` if no existing key reads "Sort" (en "Sort", ar "ترتيب").
   - Make sure `SectionHeading`'s action style matches the Home one: coral, small.
5. **Home** (`app/(tabs)/home.tsx`, `features/home/*`, `components/TabHeader.tsx`, `CreditBalance.tsx`):
   - The greeting is all ink. Do not colour the name coral.
   - The assistant search row's leading glyph is `chat`, not `search`.
   - Remove the extra "n items" caption after "Use these soon". The frame has only the header and
     "See all".
   - Credits "Top up" is muted text, not coral.
   - Check the rest of the Home frame top to bottom (all three Home pairs) and fix any other structural
     or spacing drift you can prove from the frame.
   - Place order and sample counts come from mock data. Ignore them.

**Verify:**

- Home (light, dark, Arabic) against `home-full-page*.png`. It is a long frame; pass several scrolled
  shots to `pair.py`.
- Kitchen (light, dark, Arabic) against `kitchen*.png`.
- Kitchen · Fridge against `kitchen-fridge.png`.

## Task 3: Plans, the Stat primitive, and generation inside the Plans tab

**Goal:** make Plan · Weekly (`137:1097`, AR, Dark), Daily (`137:1342`) and Generating (`147:2819`)
match. The generating state moves into the Plans tab (user ruling B3).

Pairs:

- `$WS/pairs/auth-tabs/plan-*.png`
- `$WS/pairs/recipes-items/plan-generating.png`, `generate-a-plan.png`

1. **Stat primitive:**
   - Add `components/Stat.tsx` and export it from `components/index.ts`.
   - Spec §8: `Card` with padding 16, a `numeralSmall` value and a `caption` label. Figma component
     `124:571` is 167×86.
   - Use it for the two plan stats (`features/plans/PlanTiles.tsx`).
2. **Stat copy:**
   - The value is "{cooked} of {total}". The caption is "cooked", with no repeated "of N": today it reads
     "3 of 21 / of 21 cooked".
   - The second stat is "{n}" / "to buy".
   - Add keys if needed (append-only, en and ar).
3. **Plan rows** (`features/plans/PlanBoard.tsx`):
   - The date column (weekday plus day number) shows only on the first meal row of each day. Later rows
     of the same day leave the column empty but keep its width, so titles stay aligned.
   - Today's date is coral, as now.
4. **Cooked status:**
   - Frame: a leading `check` glyph (14) and the whole meta line in `success` colour. Example:
     "✓ Breakfast · 30 min · Cooked".
   - The app currently uses a green square dot before "Cooked".
   - Other statuses keep the muted meta line ("Tonight", "2 items missing").
5. **Daily view:** the last row, for example the empty Snack slot, must not be clipped by the tab bar.
   Add tab-bar clearance to the list's bottom padding, the same way the other tabs do.
6. **B3: generation inside the Plans tab.**
   - Today `app/generate-plan.tsx` shows `GeneratingState` on the pushed Generate screen (~line 268).
   - New flow:
     - When the job starts, record the job id in a small in-memory store: Zustand, following
       `apps/mobile/src/stores/*`.
     - Then return to the Plans tab: dismiss the Generate screen.
     - The Plans tab, with its title, scope Segmented set to the job's scope, and tab bar, renders the
       generating card in place of the plan content, with skeleton rows below it.
   - Card per the frame:
     - Steaming-pot illustration: find the matching name in `components/Illustration.tsx`.
     - "Building your plan…" at heading size.
     - The existing caption.
     - `Progress`.
     - Remove the "M" avatar.
     - Three skeleton rows with 56×56 thumbs, spaced as in the frame.
   - Poll with the existing `useJob`.
   - **On success:** clear the store, invalidate the plan queries, then open the new plan at
     `/plan/<id>`, as today.
   - **On failure:** clear the store and show the existing failure message and Retry in the Plans tab.
     Retry opens `/generate-plan`.
   - The job survives switching tabs; the frame's copy says "You can keep using the app".
   - Pre-start errors stay on the Generate screen: out-of-credits, validation.
   - Add unit tests for the store and any pure helper.
   - Record B3 in spec §9.1, and update the §9 table row for Generate/Generating.

**Verify:**

- Weekly (light, dark, Arabic), Daily, the Generate screen, and Generating in the Plans tab.
- In mock mode the job may finish fast. Capture the generating state if you can, and say if you could
  not.

## Task 4: Recipe, Cook mode, Meal sheet

**Goal:** make Recipe (`145:2064`; Steps `145:2194`; Watch how `145:2274`), Cook mode (`145:2365`) and
Plan · Meal sheet (`147:2914`) match. B4 applies.

Pairs: `$WS/pairs/recipes-items/recipe-*.png`, `cook-mode-dark.png`, `plan-meal-sheet.png`.

1. **Recipe hero** (`app/recipe/[id]/index.tsx`):
   - The app shows a darker band with a hard bottom edge over the top ~125 pt of the photo. The frame
     has none; its media back button carries its own fill.
   - Remove it. If it is the compact header's background, make it fully transparent until the hero has
     scrolled away.
   - The eyebrow ("Levantine · Easy") is muted `small` bold, not coral.
2. **Compact sticky header.** Frames Steps and Watch how show the scrolled state:
   - A 44 pt nav row: plain back, centred one-line title, and an empty trailing 44 slot. Bookmark is
     omitted per §9.1.
   - The Segmented tabs stick directly under it.
   - Build this on the existing `scrollY` Animated value (~line 76). The header fades in once the hero
     has scrolled off. The tabs stick, for example with `stickyHeaderIndices`.
3. **Servings stepper:**
   - Remove the `QuantityStepper` row that sits between the meta row and the tabs (~line 245). The frame
     goes straight from the meta row to the tabs.
   - Keep the capability: the meta row's "Serves" cell becomes a pressable, with an accessibility label
     and hint, that opens a `Sheet` titled Servings containing the same stepper, with the same state and
     limits, and a primary "Done".
   - Show a 12 pt `chevD` glyph after the value as the affordance.
   - Meta labels follow the frame ("Serves", "In stock") where existing keys allow. Otherwise add keys.
4. **Cook mode** (`app/recipe/[id]/cook.tsx`, `features/recipe/CookTimerPanel.tsx`):
   - The header's trailing control is a 44 `surface` IconButton with the `chat` glyph, not the "M"
     avatar. It keeps the same action and label.
   - **Timer panel:**
     - While a timer runs, show the time as `numeralSmall` and the timer name as `caption`.
     - A 44 `surface` pause/play IconButton and a 44 plain `x` stop IconButton.
     - A coral `Progress` bar that fills as time elapses.
     - Paused state: a play glyph and the progress fill in `control`.
     - Wire the buttons to `useUpdateTimer` (`hooks/timers.ts` ~line 30) with
       `{ action: 'pause' | 'resume' | 'stop' }`, exactly as `features/timers/TimerCard.tsx:85–99` does.
     - The idle and start state stays as today.
     - Confirm the countdown ticks: `useTimerTick` ~line 55 and `projected` ~line 101.
   - If the frame's per-step ingredient chips have no data source, leave them out and note it in §9.1.
   - Update the §9.1 sentence that says cook pause/stop were omitted.
5. **B4: Meal sheet** (`app/entry/[id].tsx`):
   - Remove the Servings `QuantityStepper` (~line 205) and the second footer action "Start cooking"
     (~line 256).
   - The footer has one primary, "Keep this meal".
   - Match the frame's structure:
     - A "Meal" title with a close X.
     - The recipe row (thumb, title, meta "Dinner · Thu 24 · Serves 4", status line).
     - A Status Segmented.
     - A "Change meal" row with the `shuffle` glyph.
   - Present it as a bottom sheet over the Plans tab, the way the frame does, with Expo Router's
     `presentation: 'formSheet'` (grabber, fit to content) in the Stack. Only do this if it renders
     correctly on iOS here. If it does not, keep the pushed screen with the frame's header and say why.
   - Record B4, and the presentation decision, in §9.1.

**Verify:**

- Recipe Ingredients (light, dark, Arabic).
- Steps and Watch how, scrolled.
- The Servings sheet.
- Cook mode dark with a running timer, including pause and resume.
- The meal sheet.

## Task 5: Capture results, Review, Review edit

**Goal:** make Capture · Results (`139:1765`), Review before adding (`142:1873`, Dark `170:5517`) and Edit
item (`142:2035`) match. B1 (layout only, confidence gate kept) and B5 apply.

Pairs: `$WS/pairs/capture-assistant/capture-*.png`, `review-*.png`.

1. **B1: results sheet** (`features/capture/PhotoCapture.tsx`, `renderBubble` ~line 740 and
   `renderBubbleActions` ~line 656):
   - Replace the floating inset card with the frame's full-bleed bottom sheet:
     - `surface` background.
     - No side inset.
     - Flush to the bottom edge, including the home-indicator safe area.
     - Padding 20.
   - Inside the sheet:
     - The Mama message as a `surfaceAlt` bubble, maxWidth 290, padding 10/14 (`MamaBubble` restyled or
       reused).
     - Below it, an action row with gap 10.
   - **When `canAddAll` is true:** secondary "Review first" (outline, ~120 wide) at the start and
     primary "Add all n" filling the rest, both size M (44).
   - **When `canAddAll` is false:** a single primary "Review", full width.
   - Keep `canAddAll`, its gate, and the copy logic exactly as they are. The user ruled to keep the
     confidence gate.
   - The "Also spotted" tray stays, positioned just above the sheet.
   - The "n photos" tray opener stays inside the sheet, compact.
   - Apply the same sheet to the `looking` and `nothingFound` flows, so every post-shutter state shares
     it. Then check that Shot taken (`139:1702`) still matches `ref/capture-shot-taken.png`.
2. **B5: remove "Retake"** from the Review header (`app/capture/review.tsx` ~line 77). Leave the i18n key
   in place, since catalogs are append-only.
3. **Review edit sheet** (`features/capture/ReviewEditSheet.tsx` ~line 118): the first field's label is
   "Name", not "Search ingredients". Keep its search behaviour. Use an existing key or add one.
   - Then check the rest of the sheet and the Review list against `ref/review-edit-item.png`,
     `review-before-adding*.png`, and fix proven drift.
4. **Spec:**
   - Record B1 (layout) and B5 in spec §9.1.
   - Add a pointer line in the Apricot spec's Result section (~line 834) saying the Coral sheet layout
     supersedes the bubble card. The gate is unchanged.

**Verify:**

- Review, Review dark and Edit item.
- For results, you cannot shoot a photo without a camera. Try Photo Library if the capture screen offers
  it (the Simulator has sample photos). Otherwise verify by code reading and state that.

## Task 6: Account, Credits, Preferences, Household, Notifications

**Goal:** make Account (`149:2731`, AR, Dark), Credits (`155:3117`), Preferences (`149:2900`),
Household (`149:3382`) and Notifications (`155:3426`) match. B2 applies.

Pairs: `$WS/pairs/account-settings/*.png`.

1. **Account** (`app/account.tsx`):
   - Rows get subtitles, from data that already exists:
     - Preferences: diet summary · "n people", for example "Halal only · 4 people".
     - Household: name · "n members".
     - Credits: "n credits". This replaces the trailing value.
     - Kitchen screen: "For a tablet on the wall".
   - Add keys where needed, en and ar.
   - Sign out is a full-width outlined danger button (`variant="secondary" tone="danger"`, 44 tall) with
     the `logout` glyph. It is not a borderless ghost.
   - Check AR and dark.
2. **Credits** (`app/ai-usage.tsx`, `features/credits/UsageSummary.tsx`), per the frame:
   - A `small`/eyebrow label "Today's usage".
   - A one-line title-size value "4 of 150".
   - The caption "3 AI calls today".
   - Credits are whole numbers: round, never show decimals like "93.33 of 444.44". Keep the underlying
     `usageCreditsFromUsd` maths, round for display, and unit-test the rounding helper.
   - Check the rest of the Credits frame.
3. **Preferences** (`app/profile.tsx` ~90–104): the footer Save is always an enabled primary.
   - Chips still autosave.
   - Save commits a pending typed allergy, if there is one, then goes back.
4. **Household** (`app/settings/household.tsx`):
   - "Members" is the small section label, not a heading.
   - The invite-code card holds a compact inverse "Share" button (label "Share") and a ghost "New invite
     code", side by side on one row.
   - Footer row:
     - "Leave household": danger ghost text, at the start.
     - Primary "Save": always enabled, filling the rest. With no name change it just goes back.
5. **B2: Leave household.**
   - Pressing "Leave household" asks for confirmation, with a destructive Alert and existing-style copy.
     Add keys, en and ar.
   - Then call the existing `leaveHousehold` route (`DELETE /households/:id/members/me`) through the
     typed client. Add a hook in `hooks/` if none exists.
   - **On success:** clear the active household from the session store, reset or clear the
     household-scoped queries, and route to where a user without a household lands today (the household
     create/join onboarding).
   - **On failure:** the last owner gets a `CONFLICT`. Show the translated error from its `messageKey`.
   - Unit-test any pure logic.
   - Record B2 in spec §9.1, replacing the sentence that says Leave household was omitted.
6. **Notifications** (`features/settings/NotificationSettings.tsx` ~187):
   - "Warn me" and "Remind me at" are plain ListRows: no leading clock glyph, a trailing value and a
     chevron.
   - Tapping one opens a `Sheet` with the existing choices. They are not expanded inline at the bottom.
   - The screen ends with a caption: "n reminders are set.", where n is the number of enabled toggles.
     Add the key if missing, en and ar, with correct Arabic plurals through the existing count helper.

**Verify:**

- Account (light, dark, Arabic).
- Credits, Preferences, Household, Notifications.
- The Leave household confirmation, then cancel. Also run one confirm path in mock mode.
