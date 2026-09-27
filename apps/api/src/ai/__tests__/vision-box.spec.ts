import { afterAll, describe, expect, it, vi } from 'vitest';
import type { RecognizedItem } from '@kitchen/contracts';
import { createTestContext, seedHousehold, seedUser, cleanup } from '../../testing/harness.js';
import { CreditsService } from '../../credits/credits.service.js';
import { AppError } from '../../common/errors.js';
import { AiGateway } from '../ai-gateway.service.js';
import { SchemaGuard } from '../validation/schema-guard.js';
import { BudgetService } from '../usage/budget.service.js';
import { DrizzleUsageRepository } from '../usage/usage.repository.js';
import { RecognitionService } from '../recognition/recognition.service.js';
import type { AiProvider } from '../providers/ai-provider.interface.js';
import type { IngredientResolverPort } from '../catalog/ingredient-resolver.port.js';
import type { StorageService } from '../../storage/storage.service.js';
import type { Env } from '../../config/env.js';

/**
 * The vision box travels model → SchemaGuard → sanitizeBox → session. These run
 * the real gateway and guard behind a stub provider, so the raw JSON is parsed
 * by the same code that parses a real model's answer.
 */

const ctx = createTestContext();
const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

afterAll(async () => {
  await cleanup(ctx.db, { households: createdHouseholds, users: createdUsers });
  await ctx.client.end();
});

async function seedCtx() {
  const userId = await seedUser(ctx.db);
  const householdId = await seedHousehold(ctx.db, userId);
  createdUsers.push(userId);
  createdHouseholds.push(householdId);
  return { userId, householdId, credits: new CreditsService(ctx.db) };
}

function serviceReturning(raw: unknown, credits: CreditsService) {
  const provider: AiProvider = {
    kind: 'mock',
    complete: vi.fn(async () => ({
      raw,
      usage: { inputTokens: 1000, outputTokens: 500 },
      model: 'gpt-5-mini',
    })),
  };
  const budget = new BudgetService(new DrizzleUsageRepository(ctx.db), {
    AI_DAILY_BUDGET_USD: 100,
  } as Env);
  const gateway = new AiGateway(provider, new SchemaGuard(), budget);
  const catalog = {
    resolve: vi.fn(async (names: { name: string }[]) =>
      names.map((n) => ({
        rawName: n.name,
        ingredient: null,
        strategy: 'unresolved' as const,
        confidence: 0,
      })),
    ),
  } as unknown as IngredientResolverPort;
  const storage = {
    providerImageUrl: vi.fn(async () => 'https://example.com/photo.jpg'),
  } as unknown as StorageService;
  return new RecognitionService(ctx.db, catalog, gateway, storage, credits);
}

const tomato = {
  nameEn: 'Tomato',
  nameAr: 'طماطم',
  category: 'vegetable',
  estimatedQuantity: 200,
  unit: 'g',
  confidence: 0.95,
};

function byName(items: RecognizedItem[], name: string) {
  return items.find((i) => i.nameEn === name)!;
}

describe('recognition carries the vision box', () => {
  it('sanitises a box onto the item and nulls the ones it cannot trust', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const raw = {
      ingredients: [
        { ...tomato, box: { x: -0.02, y: 0.1, w: 0.32, h: 0.2 } },
        { ...tomato, nameEn: 'Labneh', category: 'dairy', box: { x: 100, y: 80, w: 300, h: 200 } },
        { ...tomato, nameEn: 'Cucumber' },
      ],
    };

    const session = await serviceReturning(raw, credits).recognize({
      householdId,
      userId,
      request: { photoKeys: ['a.jpg'] },
    });

    const box = byName(session.items, 'Tomato').box!;
    expect(box.x).toBe(0);
    expect(box.w).toBeCloseTo(0.3, 10);
    expect(byName(session.items, 'Labneh').box).toBeNull();
    expect(byName(session.items, 'Cucumber').box).toBeNull();
  });

  it('still refuses an all-empty scan with the photos that found nothing', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const attempt = serviceReturning({ ingredients: [] }, credits).recognize({
      householdId,
      userId,
      request: { photoKeys: ['a.jpg', 'b.jpg'] },
    });

    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({
      code: 'AI_NO_RESULT',
      details: { emptyPhotoKeys: ['a.jpg', 'b.jpg'] },
    });
  });
});
