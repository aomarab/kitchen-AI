import type { ReceiptExtractContext, ReceiptMapContext } from './prompt.types.js';
import {
  type BuiltPrompt,
  localeDirective,
  untrustedList,
  UNTRUSTED_DATA_DIRECTIVE,
} from './prompt.shared.js';

/**
 * Receipt parsing is two passes (spec §5.3): a vision pass extracts raw line
 * items, then a cheap text pass maps each raw line to a catalog ingredient with
 * candidate names supplied in-prompt to constrain the output.
 */
export const RECEIPT_EXTRACT_PROMPT_VERSION = 'receipt-extract/v1';
export const RECEIPT_MAP_PROMPT_VERSION = 'receipt-map/v1';

export function buildReceiptExtractPrompt(ctx: ReceiptExtractContext): BuiltPrompt {
  const system = [
    'You read a shopping receipt photo and extract its line items.',
    'Return JSON {"merchant","purchasedOn","currency","lines":[{"rawText","nameGuess",' +
      '"quantity","unit","priceMinor"}]}. `rawText` is the line as printed; `nameGuess` is your ' +
      'best plain product name. Use null for anything not present. `priceMinor` is an integer in ' +
      'the smallest currency unit. Ignore totals, taxes and loyalty lines.',
    localeDirective(ctx.locale),
  ].join('\n\n');

  return {
    system,
    user: 'Extract every purchasable food line item from this receipt.',
    version: RECEIPT_EXTRACT_PROMPT_VERSION,
  };
}

export function buildReceiptMapPrompt(ctx: ReceiptMapContext): BuiltPrompt {
  const system = [
    'You map raw receipt line items to a fixed ingredient catalog.',
    'Return JSON {"items":[{"rawName","canonicalName","confidence"}]} with one entry per input ' +
      'line, in the same order. Choose `canonicalName` from the provided candidates when a good ' +
      'match exists; otherwise return your best generic name and a low confidence.',
    localeDirective(ctx.locale),
    UNTRUSTED_DATA_DIRECTIVE,
  ].join('\n\n');

  const user = [
    `Raw lines:\n${untrustedList(ctx.rawLines)}`,
    `Catalog candidates:\n${untrustedList(ctx.candidateNames)}`,
  ].join('\n\n');

  return { system, user, version: RECEIPT_MAP_PROMPT_VERSION };
}
