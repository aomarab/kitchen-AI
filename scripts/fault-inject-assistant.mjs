#!/usr/bin/env node
/**
 * Fault injection for the live assistant (kitchen companion spec — Feature 5,
 * Phase B).
 *
 * Every rule the new code claims to enforce gets its defect introduced here,
 * and the check that *names* that rule must go red. A defect that reddens a
 * neighbouring assertion proves nothing, so the test name is matched against
 * the failure output.
 *
 * If a defect here cannot be caught, the honest fix is to delete the rule, not
 * to weaken the check.
 *
 * Run from the repo root: node scripts/fault-inject-assistant.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const WEB = 'apps/web/src/lib/assistant/openai-realtime.ts';
const SERVICE = 'apps/api/src/ai/assistant/assistant.service.ts';
const PROVIDER = 'apps/api/src/ai/assistant/openai-realtime.provider.ts';
const CONTRACT = 'packages/contracts/src/assistant.ts';
const VIEW = 'apps/web/src/components/assistant/LiveAssistantView.tsx';
const BRIEF = 'apps/api/src/ai/assistant/pantry-brief.ts';
const VOICE = 'packages/contracts/src/voice.ts';
const PROFILES = 'apps/api/src/profiles/profiles.service.ts';
const PERSONA_VIEW = 'apps/web/src/components/settings/AssistantPersonaView.tsx';
const AR_CATALOG = 'packages/i18n/src/ar.ts';
const REVIEW_LIST = 'apps/web/src/components/kitchen/ReviewList.tsx';
const DB_SCHEMA = 'apps/api/src/db/schema.ts';
const LABELS = 'apps/web/src/lib/labels.ts';
const OFF_CLIENT = 'apps/api/src/ai/clients/http-open-food-facts.client.ts';
const BARCODE_SERVICE = 'apps/api/src/ai/barcode/barcode.service.ts';
const MOBILE_CAPTURE = 'apps/mobile/src/lib/capture.ts';
const MOCK = 'apps/web/src/lib/assistant/mock-realtime.ts';
const CONNECTIVITY = 'apps/web/src/stores/connectivity.ts';
const SCREEN_VIEW = 'apps/web/src/components/screen/SmartScreenView.tsx';
const REALTIME_COST = 'apps/api/src/ai/realtime-cost.ts';
const CREDITS = 'packages/contracts/src/credits.ts';

const WEB_SPEC = ['@kitchen/web', 'src/lib/assistant/openai-realtime.test.ts'];
const API_SPEC = ['@kitchen/api', 'src/ai/assistant/assistant.service.spec.ts'];
const CONTRACT_SPEC = ['@kitchen/contracts', 'src/assistant.spec.ts'];
const VIEW_SPEC = ['@kitchen/web', 'src/components/assistant/LiveAssistantView.test.tsx'];
const BRIEF_SPEC = ['@kitchen/api', 'src/ai/assistant/pantry-brief.spec.ts'];
const VOICE_SPEC = ['@kitchen/contracts', 'src/voice.spec.ts'];
const PROFILES_SPEC = ['@kitchen/api', 'src/profiles/profiles.service.spec.ts'];
const PERSONA_VIEW_SPEC = ['@kitchen/web', 'src/components/settings/AssistantPersonaView.test.tsx'];
const I18N_SPEC = ['@kitchen/i18n', 'src/catalog.spec.ts'];
const REVIEW_LIST_SPEC = ['@kitchen/web', 'src/components/kitchen/ReviewList.test.tsx'];
const DB_SCHEMA_SPEC = ['@kitchen/api', 'src/db/schema.spec.ts'];
const ITEM_SHEET_SPEC = ['@kitchen/web', 'src/components/kitchen/ItemSheet.test.tsx'];
const OFF_CLIENT_SPEC = [
  '@kitchen/api',
  'src/ai/clients/__tests__/http-open-food-facts.client.spec.ts',
];
const BARCODE_SERVICE_SPEC = ['@kitchen/api', 'src/ai/barcode/barcode.service.spec.ts'];
const MOBILE_CAPTURE_SPEC = ['@kitchen/mobile', 'src/lib/capture.spec.ts'];
const MOCK_SPEC = ['@kitchen/web', 'src/lib/assistant/mock-realtime.test.ts'];
const CONNECTIVITY_SPEC = ['@kitchen/web', 'src/stores/connectivity.test.ts'];
const SCREEN_VIEW_SPEC = ['@kitchen/web', 'src/components/screen/SmartScreenView.test.tsx'];
const REALTIME_COST_SPEC = ['@kitchen/api', 'src/ai/realtime-cost.spec.ts'];

const CASES = [
  {
    // The ledger is append-only: provenance written here is permanent. This is
    // the exact defect that shipped — the assistant logged every confirmed
    // item as `photo` in a session where nobody took a photo — and it survived
    // because the test only counted rows.
    name: 'the assistant writes its items into the ledger as "photo"',
    file: VIEW,
    spec: VIEW_SPEC,
    check: 'writes nothing until the user confirms, then adds via the real ledger path',
    from: 'source="assistant"',
    to: 'source="photo"',
  },
  {
    // `ingredients` is a global table defaulting to 'other'. Dropping the
    // category files the new row under "other" for every household, forever.
    name: 'the recognized category never reaches the API',
    file: REVIEW_LIST,
    spec: REVIEW_LIST_SPEC,
    check: 'sends every catalog hint — both names and the category — on unresolved rows',
    from: '          rawCategory: r.ingredientId ? undefined : r.category,',
    to: '',
  },
  {
    // Same table, same permanence: sending only the English name has the API
    // file the ingredient under both languages for every household.
    name: 'the Arabic name is dropped on the confirm payload',
    file: REVIEW_LIST,
    spec: REVIEW_LIST_SPEC,
    check: 'sends every catalog hint — both names and the category — on unresolved rows',
    from: '          rawNameAr: r.ingredientId ? undefined : r.nameAr,',
    to: '          rawNameAr: undefined,',
  },
  {
    // A `Record<InventorySource, MessageKey>` makes a *missing* label a compile
    // error, but not a wrong one — the badge then renders the raw message key.
    name: 'the assistant source is labelled with the wrong message key',
    file: LABELS,
    spec: ITEM_SHEET_SPEC,
    check: 'labels an assistant-sourced item in the user’s language',
    from: "  assistant: 'web.kitchen.sources.assistant',",
    to: "  assistant: 'web.kitchen.sources.photo',",
  },
  {
    // A contract enum and its Postgres enum are independent lists. Drift is
    // invisible to tsc and surfaces as a 500 on the INSERT.
    name: 'the Postgres enum drifts from the contract enum',
    file: DB_SCHEMA,
    spec: DB_SCHEMA_SPEC,
    check: 'inventory_source',
    from: "  'receipt',\n  'assistant',\n])",
    to: "  'receipt',\n])",
  },
  {
    // Real provider output arrives padded and multi-item; a parser that took
    // only the first item would halve the pantry the user is asked to confirm,
    // and every hand-written fixture in the suite is single-item, so nothing
    // else in the file could see it.
    name: 'only the first reported item survives parsing',
    file: WEB,
    spec: WEB_SPEC,
    check: 'accepts the exact arguments a live gpt-realtime session produced',
    from: '    return result.data.items.map((item, index) => ({',
    to: '    return result.data.items.slice(0, 1).map((item, index) => ({',
  },
  {
    name: 'the demo badge comes off before a real session is minted',
    file: WEB,
    spec: WEB_SPEC,
    check: 'claims to be a demo until a session the API calls real has been minted',
    from: 'return !this.mintedReal;',
    to: 'return false;',
  },
  {
    name: 'a mocked deployment loses its demo badge',
    file: WEB,
    spec: WEB_SPEC,
    check: 'stays a demo when the API says the deployment is mocked',
    // Marking the session real before the mock branch is read — the realistic
    // regression, and the one the redundant `mock !== null` clause could not
    // have caught either.
    from: '    if (session.isMock) {',
    to: '    this.mintedReal = true;\n    if (session.isMock) {',
  },
  {
    name: 'the data channel is given the wrong label',
    file: WEB,
    spec: WEB_SPEC,
    check: 'opens the oai-events data channel the provider expects',
    from: "pc.createDataChannel('oai-events')",
    to: "pc.createDataChannel('events')",
  },
  {
    name: 'the camera track is published to the provider alongside audio',
    file: WEB,
    spec: WEB_SPEC,
    check: 'publishes the microphone but never the camera',
    from: 'stream?.getAudioTracks() ?? []',
    to: 'stream?.getTracks() ?? []',
  },
  {
    name: 'a malformed tool payload is reported as an empty detection list',
    file: WEB,
    spec: WEB_SPEC,
    check: 'drops a report whose items do not validate, rather than coercing them',
    from: "if (items) onEvent({ type: 'detections', items });",
    to: "onEvent({ type: 'detections', items: items ?? [] });",
  },
  {
    name: 'channel events keep firing after stop()',
    file: WEB,
    spec: WEB_SPEC,
    check: 'emits nothing after stop(), even if the channel keeps firing',
    from: '    if (this.stopped) return;\n\n    let event: ServerEvent;',
    to: '    let event: ServerEvent;',
  },
  {
    name: 'stop() closes the connection but never stops the microphone track',
    file: WEB,
    spec: WEB_SPEC,
    check: 'releases the microphone and the peer connection on stop',
    from: 'for (const sender of this.pc?.getSenders() ?? []) sender.track?.stop();',
    to: '',
  },
  {
    name: 'the mint is charged for after the provider call, not before',
    file: SERVICE,
    spec: API_SPEC,
    check: 'charges before minting, so an unaffordable session never reaches the provider',
    from: "    const spendGroupId = await this.credits.spend(householdId, 'assistant.session');\n\n    try {\n      return await this.provider.mint(locale, brief, assistantPersona);",
    to: "    const session = await this.provider.mint(locale, brief, assistantPersona);\n    const spendGroupId = await this.credits.spend(householdId, 'assistant.session');\n\n    try {\n      return session;",
  },
  {
    name: 'a failed mint keeps the money',
    file: SERVICE,
    spec: API_SPEC,
    check: 'refunds the spend group when the mint throws',
    from: 'await this.credits.refundSpendGroup(householdId, spendGroupId);',
    to: '',
  },
  {
    name: 'a response with no client secret is returned as a session anyway',
    file: PROVIDER,
    spec: API_SPEC,
    check: 'throws rather than returning a session when the response carries no secret',
    from: '    if (!data.value) {',
    to: '    if (data.value === undefined && false) {',
  },
  {
    name: 'the report_items tool is dropped from the session config',
    file: PROVIDER,
    spec: API_SPEC,
    check: 'never sends the provider key to the client, and asks for the pinned TTL',
    from: 'tools: [REPORT_ITEMS_TOOL],',
    to: 'tools: [],',
  },
  {
    name: 'the view goes straight to the scripted client without asking the API',
    file: VIEW,
    spec: VIEW_SPEC,
    check: 'does not loop, and falls back to the scripted client, on the default factory',
    // Fabricating the session locally instead of minting: the view would look
    // identical on screen while never charging or contacting the provider.
    from: "      api.call('createRealtimeSession', { body: { locale: locale as 'en' | 'ar' } }),",
    to: "      Promise.resolve({\n        clientSecret: 'x',\n        expiresAt: new Date().toISOString(),\n        model: 'x',\n        callsUrl: 'https://example.invalid/c',\n        isMock: true,\n      }),",
  },
  {
    name: 'the pantry list is no longer ordered by expiry',
    file: BRIEF,
    spec: BRIEF_SPEC,
    check: 'lists items soonest-to-expire first',
    from: '  const entries = pantryLinesByExpiry(snapshot);',
    to: '  const entries = [...snapshot.byIngredientId.values()];',
  },
  {
    name: 'the cap is removed, so a large pantry is sent in full every mint',
    file: BRIEF,
    spec: BRIEF_SPEC,
    check: 'caps the list and says how many items it left out',
    from: '  const shown = entries.slice(0, MAX_PANTRY_LINES);',
    to: '  const shown = entries;',
  },
  {
    name: 'a truncated list is presented as if it were complete',
    file: BRIEF,
    spec: BRIEF_SPEC,
    check: 'caps the list and says how many items it left out',
    from: "    omitted > 0\n      ? `There are ${omitted} more tracked items not listed here; your list is partial.`\n      : '',",
    to: "    '',",
  },
  {
    name: 'quantities are reported in base units instead of the display unit',
    file: BRIEF,
    spec: BRIEF_SPEC,
    check: 'reports quantities in the display unit, not the base unit',
    from: '    const quantity = Math.round(fromBase(entry.baseQuantity, entry.displayUnit) * 100) / 100;',
    to: '    const quantity = entry.baseQuantity;',
  },
  {
    name: 'an Arabic session is given English ingredient names',
    file: BRIEF,
    spec: BRIEF_SPEC,
    check: 'uses Arabic names in an Arabic session',
    from: "    const name = locale === 'ar' ? entry.nameAr : entry.nameEn;",
    to: '    const name = entry.nameEn;',
  },
  {
    // The regression that was actually live: the name was localised and the
    // unit was not, so an Arabic session read "طماطم: 4 piece".
    name: 'an Arabic brief emits the raw English unit enum',
    file: BRIEF,
    spec: BRIEF_SPEC,
    check: 'leaves no Latin text in an Arabic brief, for every unit in the contract',
    from: '    const unit = UNIT_WORDS[locale][entry.displayUnit];',
    to: '    const unit = entry.displayUnit;',
  },
  {
    name: 'the expiry label stays English in an Arabic brief',
    file: BRIEF,
    spec: BRIEF_SPEC,
    check: 'localises the expiry label rather than emitting English in Arabic',
    from: '        ? ` (ينتهي في ${entry.expiresOn})`',
    to: '        ? ` (expires ${entry.expiresOn})`',
  },
  {
    name: 'an Arabic unit falls back to the display abbreviation a speech model cannot read',
    file: BRIEF,
    spec: BRIEF_SPEC,
    check: 'spells Arabic units out instead of reusing the display abbreviations',
    from: "    tbsp: 'ملعقة كبيرة',",
    to: "    tbsp: 'م.ك',",
  },
  {
    name: 'the assistant is allowed to read an absent item as an absent item',
    file: BRIEF,
    spec: BRIEF_SPEC,
    check: 'warns that the list is only what is tracked, in both languages',
    from: "    'This lists only what is tracked, not everything the user owns. Do not tell them they lack an item just because it is missing from this list — ask instead.',",
    to: "    '',",
  },
  {
    name: 'the pantry is read after the household has already been charged',
    file: SERVICE,
    spec: API_SPEC,
    check: 'does not charge when the pantry read fails',
    from: '    const snapshot = await this.pantry.snapshot(householdId);\n    const brief = pantryBrief(snapshot, locale);\n',
    to: "    const spendGroupId0 = await this.credits.spend(householdId, 'assistant.session');\n    void spendGroupId0;\n    const snapshot = await this.pantry.snapshot(householdId);\n    const brief = pantryBrief(snapshot, locale);\n",
  },
  {
    name: 'the pantry brief is built and then dropped instead of being sent',
    file: PROVIDER,
    spec: API_SPEC,
    check: 'never sends the provider key to the client, and asks for the pinned TTL',
    from: 'instructions: instructions(locale, pantryBrief, persona),',
    to: "instructions: instructions(locale, '', persona),",
  },
  {
    name: 'the secret TTL is raised to the provider default',
    file: CONTRACT,
    spec: CONTRACT_SPEC,
    check: 'pins the secret TTL to the provider floor, which is what bounds a mint',
    from: 'export const REALTIME_SECRET_TTL_SEC = 10;',
    to: 'export const REALTIME_SECRET_TTL_SEC = 600;',
  },
  {
    // The persona read is a query that can fail. After the debit, a failure
    // means refunding a spend that should never have been made.
    name: 'the persona is read after the household is charged',
    file: SERVICE,
    spec: API_SPEC,
    check: 'reads the persona before charging',
    from:
      '    const { assistantPersona } = await this.profiles.get(userId);\n\n' +
      "    const spendGroupId = await this.credits.spend(householdId, 'assistant.session');",
    to:
      "    const spendGroupId = await this.credits.spend(householdId, 'assistant.session');\n\n" +
      '    const { assistantPersona } = await this.profiles.get(userId);',
  },
  {
    name: 'the chosen voice never reaches the provider',
    file: PROVIDER,
    spec: API_SPEC,
    check: 'sends the persona voice',
    from: 'audio: { output: { voice: ASSISTANT_PERSONAS[persona].voice } },',
    to: '',
  },
  {
    // Instructing an English session to speak Levantine produces
    // code-switching or an invented accent.
    name: 'an English session is told to speak an Arabic dialect',
    file: PROVIDER,
    spec: API_SPEC,
    check: 'steers dialect only in Arabic',
    from: "  if (locale === 'ar') lines.push(DIALECT_INSTRUCTIONS[profile.dialect]);",
    to: '  lines.push(DIALECT_INSTRUCTIONS[profile.dialect]);',
  },
  {
    name: 'the persona is buried behind the pantry brief',
    file: PROVIDER,
    spec: API_SPEC,
    check: 'puts the persona ahead of the pantry brief',
    from: 'return `${personaInstructions(locale, persona)}\\n\\n${role}\\n\\n${pantryBrief}`;',
    to: 'return `${role}\\n\\n${pantryBrief}\\n\\n${personaInstructions(locale, persona)}`;',
  },
  {
    // The only place a stale id can come from is the column, so this is the
    // only place the fallback can be enforced.
    name: 'a retired persona id is cast straight out of the database',
    file: PROFILES,
    spec: PROFILES_SPEC,
    check: 'falls back to the default when the stored persona has left the catalog',
    from: 'assistantPersona: resolveAssistantPersona(row.assistantPersona),',
    to: "assistantPersona: row.assistantPersona as Profile['assistantPersona'],",
  },
  {
    /*
     * Replaces an earlier case, "a persona is given a voice the provider does
     * not accept". That defect never reached its assertion — the `Record`
     * type stopped the package compiling — so the check it named was redundant
     * and was deleted rather than kept. What is *not* type-enforced is the
     * voice list itself: adding an unverified id compiles fine, and only the
     * pinned literal notices. An unrecognised voice is a hard 400 at mint,
     * after the household has been charged.
     */
    name: 'an unverified voice id is added to the provider list',
    file: VOICE,
    spec: VOICE_SPEC,
    check: 'lists exactly the ten voices the provider accepts',
    from: "  'alloy',\n  'ash',",
    to: "  'alloy',\n  'ash',\n  'nova',",
  },
  {
    name: 'two personas collapse onto the same voice',
    file: VOICE,
    spec: VOICE_SPEC,
    check: 'gives every persona a distinct voice',
    from: "  omar: { voice: 'ash', dialect: 'msa', tone: 'neutral' },",
    to: "  omar: { voice: 'coral', dialect: 'msa', tone: 'neutral' },",
  },
  {
    name: 'an unknown stored persona throws instead of falling back',
    file: VOICE,
    spec: VOICE_SPEC,
    check: 'falls back rather than throwing on an unknown stored persona',
    from: '  return parsed.success ? parsed.data : DEFAULT_ASSISTANT_PERSONA;',
    to: '  return assistantPersonaSchema.parse(value);',
  },
  {
    name: 'a persona ships without an Arabic name',
    file: AR_CATALOG,
    spec: I18N_SPEC,
    check: 'persona is fully translated into Arabic',
    from: "    salma: 'سلمى',",
    to: "    salma: 'Salma',",
  },
  {
    name: 'the persona picker hard-codes its list instead of reading the catalog',
    file: PERSONA_VIEW,
    spec: PERSONA_VIEW_SPEC,
    check: 'offers every persona in the catalog',
    from: '        {assistantPersonaSchema.options.map((persona) => {',
    to: '        {assistantPersonaSchema.options.slice(0, 2).map((persona) => {',
  },
  {
    name: 'the picker saves a persona other than the one pressed',
    file: PERSONA_VIEW,
    spec: PERSONA_VIEW_SPEC,
    check: 'saves the persona the user picks',
    from: '              onClick={() => update.mutate({ assistantPersona: persona })}',
    to: "              onClick={() => update.mutate({ assistantPersona: 'noor' })}",
  },

  /* ---- The barcode path's catalog hints (Feature spec §5.2) ---- */

  {
    // The same defect class as the assistant's `source="photo"`: a scan that
    // resolves to nothing creates a row in the global `ingredients` table, so
    // a hint dropped anywhere on this path is dropped for every household.
    name: 'the barcode lookup throws away the product category it was given',
    file: BARCODE_SERVICE,
    spec: BARCODE_SERVICE_SPEC,
    check: 'carries the Arabic name and the category of an unmatched product',
    from: '      category: product.category,',
    to: '      category: null,',
  },
  {
    name: 'the barcode lookup throws away the product\u2019s Arabic name',
    file: BARCODE_SERVICE,
    spec: BARCODE_SERVICE_SPEC,
    check: 'carries the Arabic name and the category of an unmatched product',
    from: '      productNameAr: product.productNameAr,',
    to: '      productNameAr: null,',
  },
  {
    // Scanning is not confirming. Creating here would put a row in the global
    // catalog for a product the user is still looking at.
    name: 'a bare lookup creates the catalog row before the user confirms',
    file: BARCODE_SERVICE,
    spec: BARCODE_SERVICE_SPEC,
    check: 'never creates a catalog row from a lookup alone',
    from: '      createIfMissing: false,',
    to: '      createIfMissing: true,',
  },
  {
    name: 'the client stops reading the Arabic name Open Food Facts returned',
    file: OFF_CLIENT,
    spec: OFF_CLIENT_SPEC,
    check: 'keeps the Arabic name and the category the record carried',
    from: '      productNameAr: body.product.product_name_ar ?? null,',
    to: '      productNameAr: null,',
  },
  {
    name: 'the client stops asking Open Food Facts for the category tags',
    file: OFF_CLIENT,
    spec: OFF_CLIENT_SPEC,
    check: 'asks for the fields it reads, including the category tags',
    from: "  'categories_tags',\n].join(',');",
    to: "].join(',');",
  },
  {
    // OFF slugs are head-final compounds. Matching anywhere in the slug reads
    // "breaded-cheeses" as bread.
    name: 'the category is matched anywhere in the slug instead of on its head noun',
    file: OFF_CLIENT,
    spec: OFF_CLIENT_SPEC,
    check: 'reads the head noun, not any word in the slug',
    from: '    const head = words[words.length - 1]!;',
    to: '    const head = words[0]!;',
  },
  {
    // The list runs general to specific, so reading it forwards answers
    // "beverage" for a cola and "meat" for a chicken.
    name: 'the tag list is read forwards, returning the vaguest category rather than the most specific',
    file: OFF_CLIENT,
    spec: OFF_CLIENT_SPEC,
    check: 'resolves chicken to poultry rather than meat, which OFF files it under too',
    from: '  for (let i = english.length - 1; i >= 0; i -= 1) {',
    to: '  for (let i = 0; i < english.length; i += 1) {',
  },
  {
    name: 'the confirmed barcode add drops the category the lookup resolved',
    file: MOBILE_CAPTURE,
    spec: MOBILE_CAPTURE_SPEC,
    check: 'carries the name, the Arabic name and the category of an unmatched product',
    from: '    rawCategory: ingredientId ? undefined : (lookup.category ?? undefined),',
    to: '    rawCategory: undefined,',
  },
  {
    name: 'the confirmed barcode add drops the Arabic name the lookup resolved',
    file: MOBILE_CAPTURE,
    spec: MOBILE_CAPTURE_SPEC,
    check: 'carries the name, the Arabic name and the category of an unmatched product',
    from: '    rawNameAr: ingredientId ? undefined : (lookup.productNameAr ?? undefined),',
    to: '    rawNameAr: undefined,',
  },
  {
    // Sending hints alongside a resolved id would re-describe an ingredient
    // the catalog already has, from a single product's packaging.
    name: 'the hints are sent even when the scan already matched the catalog',
    file: MOBILE_CAPTURE,
    spec: MOBILE_CAPTURE_SPEC,
    check: 'omits the hints when the scan already matched the catalog',
    from: '    rawName: ingredientId ? undefined : lookup.productName,',
    to: '    rawName: lookup.productName,',
  },
  {
    name: 'a barcode add is built with no storage location',
    file: MOBILE_CAPTURE,
    spec: MOBILE_CAPTURE_SPEC,
    check: 'refuses to build an add with no product or no location',
    from: "  if (!lookup.found || !lookup.productName || options.locationId === '') return null;",
    to: '  if (!lookup.found || !lookup.productName) return null;',
  },

  /* ---- The speaking state (Feature 5) and the kiosk's connection (Feature 1) ---- */

  {
    /*
     * The transcript is the tempting source and the wrong one: it arrives when
     * the *text* is final, which is after the voice started and often before it
     * has finished. Driving the indicator from it looks plausible in the demo
     * and is visibly wrong against a live provider.
     */
    name: 'the speaking state is driven by the transcript instead of the audio buffer',
    file: WEB,
    spec: WEB_SPEC,
    check: 'drives the speaking state from the output audio buffer, not the transcript',
    from: "const AUDIO_STARTED = 'output_audio_buffer.started';",
    to: "const AUDIO_STARTED = 'response.output_audio_transcript.done';",
  },
  {
    // Barging in discards the queued audio and fires `cleared`, with no
    // `stopped` to follow. Handling only `stopped` leaves the badge lit over
    // silence for the rest of the session.
    name: 'talking over the assistant leaves the speaking state lit',
    file: WEB,
    spec: WEB_SPEC,
    check: 'clears the speaking state when the user talks over the assistant',
    from: 'if (event.type === AUDIO_STOPPED || event.type === AUDIO_CLEARED) {',
    to: 'if (event.type === AUDIO_STOPPED) {',
  },
  {
    // A hang-up closes the channel, so no further server event arrives; the
    // adapter is the only thing that can put the indicator out.
    name: 'hanging up mid-sentence freezes the speaking state',
    file: WEB,
    spec: WEB_SPEC,
    check: 'puts the speaking state out when the user hangs up mid-sentence',
    from: "    if (this.speaking) {\n      this.speaking = false;\n      this.emit?.({ type: 'speaking', speaking: false });\n    }",
    to: '',
  },
  {
    // The mock is what everyone develops against. If its beats coincide with
    // the caption rather than bracketing it, the demo teaches the wrong shape
    // and the difference only shows up against the real provider.
    name: 'the demo flips the speaking state in step with the caption',
    file: MOCK,
    spec: MOCK_SPEC,
    check: 'brackets the assistant line with speaking on and off',
    from: "      { at: connectMs + stepMs * 2.5, event: { type: 'speaking', speaking: true } },",
    to: "      { at: connectMs + stepMs * 3.5, event: { type: 'speaking', speaking: true } },",
  },
  {
    // The view's own guard, independent of the adapters': a transport that
    // drops without a closing event must not leave the badge claiming speech.
    name: 'the view keeps claiming speech after the session ends',
    file: VIEW,
    spec: VIEW_SPEC,
    check: 'does not leave the speaking state lit when the session ends mid-sentence',
    from: "          if (event.status === 'ended') setSpeaking(false);",
    to: '',
  },
  {
    /*
     * `navigator.onLine` reports that an interface exists, not that our API is
     * reachable — the captive-portal case. Letting it clear an offline state a
     * failed request established makes the kiosk claim a connection it does not
     * have, which is worse than no indicator at all.
     */
    name: 'the browser’s optimism overrides a request that actually failed',
    file: CONNECTIVITY,
    spec: CONNECTIVITY_SPEC,
    check: 'does not let navigator.onLine clear an offline state a failed request established',
    from: '  if (window.navigator.onLine === false) markOffline();',
    to: '  useConnectivity.getState().setOnline(window.navigator.onLine);',
  },
  {
    // Every consumer re-renders on a state notification, and the kiosk asserts
    // "online" on every successful request — several a minute, for hours.
    name: 'an unchanged connection state still notifies every subscriber',
    file: CONNECTIVITY,
    spec: CONNECTIVITY_SPEC,
    check: 'does not notify subscribers when the state is unchanged',
    from: '  setOnline: (online) => set((prev) => (prev.online === online ? prev : { online })),',
    to: '  setOnline: (online) => set({ online }),',
  },
  {
    // A kiosk is left open for hours; being right only at mount is the failure
    // mode that matters, and it is invisible to a render-once test.
    name: 'the kiosk reads the connection once and never updates',
    file: SCREEN_VIEW,
    spec: SCREEN_VIEW_SPEC,
    check: 'reacts to the connection dropping while the kiosk is left open',
    from: '  const online = useConnectivity((state) => state.online);',
    to: '  const [online] = useState(() => useConnectivity.getState().online);',
  },
  {
    // The asymmetry is the design: offline is evidence, online is a belief.
    // Printing "Connected" on the wall states the belief as fact.
    name: 'the kiosk states a connection it only believes in',
    file: SCREEN_VIEW,
    spec: SCREEN_VIEW_SPEC,
    check: 'says nothing about a connection it only believes in',
    from: '        <WifiIcon />\n      </span>',
    to: "        <WifiIcon />\n        {t('web.screen.connectionOnline')}\n      </span>",
  },
  {
    // The asymmetry is the whole model: output audio is twice the tokens at
    // twice the price. Treating the two directions alike halves the estimate of
    // a session the assistant does most of the talking in.
    name: 'output audio is priced as if it were input audio',
    file: REALTIME_COST,
    spec: REALTIME_COST_SPEC,
    check: 'charges four times as much for the assistant talking as for the user',
    from: '  output: 64,',
    to: '  output: 32,',
  },
  {
    // The same asymmetry from the tokenization side rather than the rate side.
    // A model with the rates right and the cadence wrong still under-estimates
    // by 2x, so both halves need their own defect.
    name: 'output audio is tokenized at the input cadence',
    file: REALTIME_COST,
    spec: REALTIME_COST_SPEC,
    check: 'charges four times as much for the assistant talking as for the user',
    from: '  output: 1200,',
    to: '  output: 600,',
  },
  {
    // The break-even numbers read the slope from a single evaluation, which is
    // only valid while the estimate is linear. A fixed per-session term would
    // make every duration conclusion in the spec quietly wrong.
    name: 'the estimate gains a fixed cost the break-even maths cannot see',
    file: REALTIME_COST,
    spec: REALTIME_COST_SPEC,
    check: 'scales linearly, so a session has a well-defined per-minute cost',
    from: '  return (\n    (outputTokens * REALTIME_AUDIO_USD_PER_MTOK.output +',
    to: '  return (\n    0.01 +\n    (outputTokens * REALTIME_AUDIO_USD_PER_MTOK.output +',
  },
  {
    // Cached context is ~80x cheaper than fresh input. Billing the replayed
    // pantry brief at the fresh rate turns a rounding error into the dominant
    // term and inflates every price derived from it.
    name: 'replayed context is billed as fresh input rather than cached',
    file: REALTIME_COST,
    spec: REALTIME_COST_SPEC,
    check: 'replayed context is a rounding error next to the audio',
    from: 'cachedTokens * REALTIME_AUDIO_USD_PER_MTOK.cachedInput',
    to: 'cachedTokens * REALTIME_AUDIO_USD_PER_MTOK.input',
  },
  {
    // The price and the model must move together. A price edited on its own is
    // exactly the failure this file exists to make loud.
    name: 'the session price drifts away from the cost model it was derived from',
    file: CREDITS,
    spec: REALTIME_COST_SPEC,
    check: 'the price follows the cost model, with a stated margin rather than an arbitrary one',
    from: "  'assistant.session': 25,",
    to: "  'assistant.session': 8,",
  },
  {
    // Credits sold below their own cost basis would make every price in the
    // table a loss and the break-even duration meaningless.
    name: 'a credit sells for less than the basis the table is denominated in',
    file: CREDITS,
    spec: REALTIME_COST_SPEC,
    check: 'sells credits for more than they cost',
    from: "{ productId: 'credits_300', credits: 300, priceUsd: 4.99 },",
    to: "{ productId: 'credits_300', credits: 300, priceUsd: 0.99 },",
  },
];

function run([pkg, file]) {
  try {
    const out = execSync(`pnpm --filter ${pkg} exec vitest run ${file}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { failed: false, out };
  } catch (error) {
    return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

/**
 * `packages/*` are consumed as built artifacts, so a defect injected into one
 * only reaches any suite after a rebuild. Keyed by directory rather than by
 * filename: the previous version named a single file, so adding a second
 * contract file would have injected a defect nothing could ever see and
 * reported it as an uncatchable rule.
 */
const PACKAGE_BUILDS = [
  ['packages/contracts/', '@kitchen/contracts'],
  ['packages/i18n/', '@kitchen/i18n'],
];

/**
 * Returns `false` when the injected defect stopped the package compiling.
 *
 * That is not a crash and it is not a pass. It means the *type system* rejected
 * the defect before the named check could run — so the check cannot be shown to
 * fail, and by this harness's own rule the rule it encodes is redundant and
 * should be deleted rather than kept as decoration.
 */
function rebuildIfPackage(file) {
  for (const [prefix, pkg] of PACKAGE_BUILDS) {
    if (!file.startsWith(prefix)) continue;
    try {
      execSync(`pnpm --filter ${pkg} build`, { stdio: 'ignore' });
    } catch {
      return false;
    }
  }
  return true;
}

let pass = 0;
let fail = 0;

for (const testCase of CASES) {
  const original = readFileSync(testCase.file, 'utf8');
  if (!original.includes(testCase.from)) {
    console.log(`✗ ${testCase.name}\n    could not apply: anchor not found in ${testCase.file}`);
    fail += 1;
    continue;
  }

  writeFileSync(testCase.file, original.replace(testCase.from, testCase.to));
  let result;
  let built;
  try {
    built = rebuildIfPackage(testCase.file);
    result = built ? run(testCase.spec) : { failed: false, out: '' };
  } finally {
    writeFileSync(testCase.file, original);
    rebuildIfPackage(testCase.file);
  }

  if (!built) {
    fail += 1;
    console.log(
      `✗ ${testCase.name}\n    rejected by the compiler before "${testCase.check}" could run` +
        ' — the check is redundant with the type and should be deleted',
    );
    continue;
  }

  if (result.failed && result.out.includes(testCase.check)) {
    pass += 1;
    console.log(`✓ ${testCase.name}\n    caught by: ${testCase.check}`);
  } else {
    fail += 1;
    console.log(
      `✗ ${testCase.name}\n    NOT caught by: ${testCase.check}` +
        (result.failed ? ' (suite failed, but not that check)' : ' (suite stayed green)'),
    );
  }
}

console.log(`\n${pass}/${pass + fail} defects were caught by the check that names them`);
process.exit(fail === 0 ? 0 : 1);
