import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import {
  visionResultSchema,
  type Locale,
  type RecognitionSession,
  type RecognizeRequest,
  type RecognizedItem,
  type StorageLocationType,
  type VisionResult,
} from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
import { DB, type Database } from '../../db/index.js';
import { recognitionSessions, users } from '../../db/schema.js';
import { StorageService } from '../../storage/storage.service.js';
import { CreditsService } from '../../credits/credits.service.js';
import { AiGateway } from '../ai-gateway.service.js';
import { CATALOG_PORT } from '../ai.constants.js';
import type { IngredientResolverPort } from '../catalog/ingredient-resolver.port.js';
import { buildVisionPrompt } from '../prompts/vision.prompt.js';
import { suggestedExpiry, suggestedLocation } from './suggestions.js';

export interface RecognizeInput {
  householdId: string;
  userId: string;
  request: RecognizeRequest;
  /** Fixture selector for the mock provider (tests only). */
  scenario?: string;
}

/**
 * Vision ingredient recognition (spec §5.1). Photos → candidate ingredients →
 * catalog-resolved review list. Recognition NEVER writes to inventory: it always
 * produces a `recognition_session` the user reviews. Nothing recognized →
 * `AI_NO_RESULT`, so the client degrades to manual entry.
 */
@Injectable()
export class RecognitionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CATALOG_PORT) private readonly catalog: IngredientResolverPort,
    @Inject(AiGateway) private readonly gateway: AiGateway,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(CreditsService) private readonly credits: CreditsService,
  ) {}

  async recognize(input: RecognizeInput): Promise<RecognitionSession> {
    const { householdId, request } = input;
    await this.credits.assertCanAfford(householdId, 'pantry.scan');
    const locale = await this.localeFor(input.userId);
    const hint = request.locationHint;

    const emptyPhotoKeys: string[] = [];
    const collected: { item: VisionResult['ingredients'][number]; photoKey: string }[] = [];
    const seen = new Set<string>();

    for (const photoKey of request.photoKeys) {
      // The provider fetches the image over HTTP, so it needs a signed URL, not
      // an object key. `presignDownload` also rejects any key outside this
      // household's prefix — `photoKeys` are opaque client strings, and without
      // that check a caller could name another household's photo, or an
      // arbitrary URL, and have the model fetch it for them.
      const imageUrl = await this.storage.presignDownload(householdId, photoKey);
      const vision = await this.gateway.execute<VisionResult>({
        householdId,
        operation: 'vision.recognize',
        prompt: buildVisionPrompt({ locale, locationHint: hint }),
        schema: visionResultSchema,
        context: { locale, locationHint: hint },
        images: [{ url: imageUrl }],
        scenario: input.scenario,
      });

      if (vision.ingredients.length === 0) {
        emptyPhotoKeys.push(photoKey);
        continue;
      }
      for (const item of vision.ingredients) {
        const key = item.nameEn.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({ item, photoKey });
      }
    }

    if (collected.length === 0) {
      throw new AppError('AI_NO_RESULT', 'errors.AI_NO_RESULT', { emptyPhotoKeys });
    }

    const resolved = await this.catalog.resolve(
      collected.map(({ item }) => ({
        name: item.nameEn,
        nameAr: item.nameAr,
        category: item.category,
        defaultUnit: item.unit,
      })),
      { createIfMissing: false },
    );

    const items: RecognizedItem[] = collected.map(({ item, photoKey }, i) => {
      const match = resolved[i]!;
      return {
        tempId: randomUUID(),
        match: {
          ingredientId: match.ingredient?.id ?? null,
          strategy: match.strategy,
          confidence: match.confidence,
          rawName: item.nameEn,
        },
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        category: item.category,
        quantity: item.estimatedQuantity,
        unit: item.unit,
        confidence: item.confidence,
        suggestedExpiresAt: suggestedExpiry(item.category),
        suggestedLocationType: suggestedLocation(
          item.category,
          hint as StorageLocationType | undefined,
        ),
        photoKey,
      };
    });

    const [row] = await this.db
      .insert(recognitionSessions)
      .values({
        householdId,
        photoKeys: request.photoKeys,
        items,
        emptyPhotoKeys,
      })
      .returning({ id: recognitionSessions.id, createdAt: recognitionSessions.createdAt });

    await this.credits.spend(householdId, 'pantry.scan');

    return {
      id: row!.id,
      items,
      emptyPhotoKeys,
      createdAt: row!.createdAt.toISOString(),
    };
  }

  async getSession(householdId: string, id: string): Promise<RecognitionSession> {
    const [row] = await this.db
      .select()
      .from(recognitionSessions)
      .where(and(eq(recognitionSessions.id, id), eq(recognitionSessions.householdId, householdId)))
      .limit(1);
    if (!row) throw AppError.notFound('errors.NOT_FOUND');
    return {
      id: row.id,
      items: row.items as RecognizedItem[],
      emptyPhotoKeys: row.emptyPhotoKeys,
      createdAt: row.createdAt.toISOString(),
    };
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
