import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import {
  receiptExtractionSchema,
  type Locale,
  type ParseReceiptRequest,
  type ReceiptExtraction,
  type RecognizedItem,
} from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
import { normalizeArabic } from '../../catalog/normalize.js';
import { DB, type Database } from '../../db/index.js';
import { recognitionSessions, users } from '../../db/schema.js';
import { StorageService } from '../../storage/storage.service.js';
import { AiGateway } from '../ai-gateway.service.js';
import { CATALOG_PORT } from '../ai.constants.js';
import type { IngredientResolverPort } from '../catalog/ingredient-resolver.port.js';
import { buildReceiptExtractPrompt, buildReceiptMapPrompt } from '../prompts/receipt.prompt.js';
import { suggestedExpiry, suggestedLocation } from '../recognition/suggestions.js';
import { receiptMappingSchema, type ReceiptMapping } from './receipt.schemas.js';

/** Loose key so a model echoing different casing/diacritics still matches. */
function mappingKey(rawName: string): string {
  return normalizeArabic(rawName).toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface ReceiptProcessInput {
  householdId: string;
  userId: string;
  request: ParseReceiptRequest;
  scenario?: string;
}

/**
 * Receipt parsing (spec §5.3): a vision extraction pass reads raw line items,
 * then a cheap mapping pass resolves each line to a catalog ingredient. The
 * result is a `recognition_session` the user reviews — receipts, like photos,
 * never auto-commit to inventory.
 */
@Injectable()
export class ReceiptService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CATALOG_PORT) private readonly catalog: IngredientResolverPort,
    @Inject(AiGateway) private readonly gateway: AiGateway,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async process(input: ReceiptProcessInput): Promise<string> {
    const { householdId, request } = input;
    const locale = await this.localeFor(input.userId);

    // Signed URLs, not object keys — the provider fetches the image over HTTP.
    // This also rejects any key outside the household's prefix.
    const images = await Promise.all(
      request.photoKeys.map(async (key) => ({
        url: await this.storage.presignDownload(householdId, key),
      })),
    );

    const extraction = await this.gateway.execute<ReceiptExtraction>({
      householdId,
      operation: 'receipt.extract',
      prompt: buildReceiptExtractPrompt({ locale }),
      schema: receiptExtractionSchema,
      context: { locale },
      images,
      scenario: input.scenario,
    });

    const foodLines = extraction.lines.filter((line) => line.nameGuess.trim().length > 0);
    if (foodLines.length === 0) {
      throw new AppError('AI_NO_RESULT', 'errors.AI_NO_RESULT');
    }

    // Ranked against the actual receipt lines rather than an arbitrary slice of
    // the catalog: with 500+ ingredients, an unordered 200 routinely omitted the
    // very row the line should map to.
    const candidateNames = await this.catalog.candidateNamesFor(
      foodLines.map((l) => l.nameGuess),
      120,
    );
    const mapping = await this.gateway.execute<ReceiptMapping>({
      householdId,
      operation: 'receipt.map',
      prompt: buildReceiptMapPrompt({
        locale,
        rawLines: foodLines.map((l) => l.nameGuess),
        candidateNames,
      }),
      schema: receiptMappingSchema,
      context: { locale, rawLines: foodLines.map((l) => l.nameGuess), candidateNames },
      scenario: input.scenario,
    });

    const resolved = await this.catalog.resolve(
      mapping.items.map((m) => ({ name: m.canonicalName })),
      { createIfMissing: true },
    );

    // The mapping pass is not required to return one item per line, in order —
    // it routinely drops non-food lines and merges duplicates. Indexing
    // `mapping.items[i]` by line position therefore shifts every line after the
    // first omission onto someone else's ingredient, silently: the receipt's
    // milk is added to the pantry as chicken. `rawName` is echoed back by the
    // model for exactly this reason, so key on it.
    const byRawName = new Map<string, { map: ReceiptMapping['items'][number]; index: number }>();
    mapping.items.forEach((map, index) => {
      const key = mappingKey(map.rawName);
      if (key && !byRawName.has(key)) byRawName.set(key, { map, index });
    });

    const items: RecognizedItem[] = foodLines.map((line) => {
      const hit = byRawName.get(mappingKey(line.nameGuess));
      const map = hit?.map;
      // `resolved` is positional against `mapping.items`, so it follows the
      // mapping's index, not the line's.
      const resolution = hit ? resolved[hit.index] : undefined;
      const ref = resolution?.ingredient ?? null;
      const unit = line.unit ?? ref?.defaultUnit ?? 'piece';
      const category = ref?.category ?? 'other';
      return {
        tempId: randomUUID(),
        match: {
          ingredientId: ref?.id ?? null,
          strategy: resolution?.strategy ?? 'unresolved',
          confidence: map?.confidence ?? resolution?.confidence ?? 0,
          rawName: line.nameGuess,
        },
        nameEn: ref?.canonicalNameEn ?? line.nameGuess,
        nameAr: ref?.canonicalNameAr ?? line.nameGuess,
        category,
        quantity: line.quantity ?? 1,
        unit,
        confidence: map?.confidence ?? 0.5,
        suggestedExpiresAt: suggestedExpiry(category),
        suggestedLocationType: suggestedLocation(category),
        photoKey: request.photoKeys[0] ?? null,
      };
    });

    const [row] = await this.db
      .insert(recognitionSessions)
      .values({ householdId, photoKeys: request.photoKeys, items, emptyPhotoKeys: [] })
      .returning({ id: recognitionSessions.id });
    return row!.id;
  }

  private async localeFor(userId: string): Promise<Locale> {
    const [row] = await this.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return (row?.locale as Locale | undefined) ?? 'en';
  }
}
