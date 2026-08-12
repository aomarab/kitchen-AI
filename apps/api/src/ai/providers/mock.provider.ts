import type { AiProvider, StructuredRequest, StructuredResponse } from './ai-provider.interface.js';
import type {
  NameResolveContext,
  PlanPromptContext,
  ReceiptMapContext,
  TranslateRecipeContext,
  TranslateTitlesContext,
  VisionPromptContext,
} from '../prompts/prompt.types.js';
import { buildMockPlan, INVALID_PLAN_RAW } from '../fixtures/plan.fixtures.js';
import { buildMockVision, INVALID_VISION_RAW } from '../fixtures/vision.fixtures.js';
import {
  buildMockReceiptMapping,
  INVALID_RECEIPT_RAW,
  RECEIPT_EXTRACTION_RAW,
} from '../fixtures/receipt.fixtures.js';
import {
  buildMockNameResolution,
  buildMockTitlesTranslation,
  buildMockTranslation,
} from '../fixtures/name-resolution.fixtures.js';

function isTitlesContext(context: unknown): context is TranslateTitlesContext {
  return typeof context === 'object' && context !== null && 'titles' in context;
}

/**
 * Fixture-backed provider, selected when `env.AI_MOCK` is true. Returns realistic
 * recorded output for every operation — including the failure paths (empty vision
 * result, schema-invalid output) — so the whole team can develop and test with no
 * network and no spend. See spec §5.6 and the AI_MOCK requirement.
 *
 * Scenario conventions (from `request.scenario`, used by callers and tests):
 *   - `empty`          → vision returns no ingredients (AI_NO_RESULT path)
 *   - `invalid-once`   → invalid output first, valid on the repair attempt
 *   - `invalid-always` → invalid output on every attempt (→ AI_INVALID_OUTPUT)
 */
export class MockAiProvider implements AiProvider {
  readonly kind = 'mock' as const;

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    const isRepair = request.repairOf != null;
    const scenario = request.scenario ?? '';
    const raw = this.resolve(request, scenario, isRepair);

    const inputTokens = Math.ceil((request.system.length + request.user.length) / 4);
    const outputTokens = Math.ceil(JSON.stringify(raw).length / 4);

    return {
      raw,
      usage: { inputTokens, outputTokens },
      model: `mock-${request.tier}`,
    };
  }

  private resolve(request: StructuredRequest, scenario: string, isRepair: boolean): unknown {
    const wantsInvalid =
      scenario.includes('invalid-always') || (scenario.includes('invalid-once') && !isRepair);

    switch (request.operation) {
      case 'plan.generate': {
        if (wantsInvalid) return INVALID_PLAN_RAW;
        return buildMockPlan(request.context as PlanPromptContext, { scenario });
      }
      case 'vision.recognize': {
        if (wantsInvalid) return INVALID_VISION_RAW;
        return buildMockVision(
          (request.context as VisionPromptContext | undefined) ?? { locale: 'en' },
          scenario.includes('empty') ? 'empty' : undefined,
        );
      }
      case 'receipt.extract': {
        if (wantsInvalid) return INVALID_RECEIPT_RAW;
        return RECEIPT_EXTRACTION_RAW;
      }
      case 'receipt.map':
        return buildMockReceiptMapping(request.context as ReceiptMapContext);
      case 'name.resolve':
        return buildMockNameResolution(request.context as NameResolveContext);
      case 'recipe.translate':
        // One operation, two granularities: whole recipes and bulk dish names
        // (see buildTitlesTranslatePrompt). They share a tier and a budget
        // line, so they share the operation and are told apart by their
        // context rather than by adding a second enum value to the database.
        return isTitlesContext(request.context)
          ? buildMockTitlesTranslation(request.context)
          : buildMockTranslation(request.context as TranslateRecipeContext);
      default:
        return {};
    }
  }
}
