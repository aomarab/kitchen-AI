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

const WEB_SPEC = ['@kitchen/web', 'src/lib/assistant/openai-realtime.test.ts'];
const API_SPEC = ['@kitchen/api', 'src/ai/assistant/assistant.service.spec.ts'];
const CONTRACT_SPEC = ['@kitchen/contracts', 'src/assistant.spec.ts'];
const VIEW_SPEC = ['@kitchen/web', 'src/components/assistant/LiveAssistantView.test.tsx'];
const BRIEF_SPEC = ['@kitchen/api', 'src/ai/assistant/pantry-brief.spec.ts'];

const CASES = [
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
    from: "    const spendGroupId = await this.credits.spend(householdId, 'assistant.session');\n\n    try {\n      return await this.provider.mint(locale, brief);",
    to: "    const session = await this.provider.mint(locale, brief);\n    const spendGroupId = await this.credits.spend(householdId, 'assistant.session');\n\n    try {\n      return session;",
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
    from: '    const snapshot = await this.pantry.snapshot(householdId);\n    const brief = pantryBrief(snapshot, locale);\n\n    const spendGroupId',
    to: "    const spendGroupId0 = await this.credits.spend(householdId, 'assistant.session');\n    void spendGroupId0;\n    const snapshot = await this.pantry.snapshot(householdId);\n    const brief = pantryBrief(snapshot, locale);\n\n    const spendGroupId",
  },
  {
    name: 'the pantry brief is built and then dropped instead of being sent',
    file: PROVIDER,
    spec: API_SPEC,
    check: 'never sends the provider key to the client, and asks for the pinned TTL',
    from: 'instructions: instructions(locale, pantryBrief),',
    to: "instructions: instructions(locale, ''),",
  },
  {
    name: 'the secret TTL is raised to the provider default',
    file: CONTRACT,
    spec: CONTRACT_SPEC,
    check: 'pins the secret TTL to the provider floor, which is what bounds a mint',
    from: 'export const REALTIME_SECRET_TTL_SEC = 10;',
    to: 'export const REALTIME_SECRET_TTL_SEC = 600;',
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

// The contract is consumed as a built package, so a change to it only reaches
// any suite after a rebuild.
function rebuildIfContract(file) {
  if (file !== CONTRACT) return;
  execSync('pnpm --filter @kitchen/contracts build', { stdio: 'ignore' });
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
  try {
    rebuildIfContract(testCase.file);
    result = run(testCase.spec);
  } finally {
    writeFileSync(testCase.file, original);
    rebuildIfContract(testCase.file);
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
