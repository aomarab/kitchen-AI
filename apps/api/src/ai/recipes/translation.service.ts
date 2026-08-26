import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Locale } from '@kitchen/contracts';
import { DB, type Database } from '../../db/index.js';
import { mealPlanEntries, mealPlans, recipes } from '../../db/schema.js';
import { AiGateway } from '../ai-gateway.service.js';
import {
  buildRecipeTranslatePrompt,
  buildTitlesTranslatePrompt,
} from '../prompts/name-resolution.prompt.js';

/** Steps as stored on the recipe row. */
interface StoredStep {
  index: number;
  text: string;
  durationMinutes: number | null;
}

const translatedRecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  steps: z.array(z.string()).default([]),
});

const translatedTitlesSchema = z.object({
  titles: z.array(z.string()),
});

/**
 * Ceiling on names translated in one pass. Bounds both the prompt size and the
 * blast radius of a single plan; anything past it keeps the language it was
 * generated in until it is opened.
 */
const MAX_TITLES_PER_CALL = 40;

/**
 * Fills in the language a recipe was *not* generated in (spec §4.3).
 *
 * A generated recipe exists in one language only — the planner writes
 * `title_en` or `title_ar`, never both — so a reader who switches language sees
 * the other one's text. Generating every recipe twice would double the cost of
 * a plan for a second language most households never read, so the translation
 * is filled in afterwards and cached in the empty columns, where it is written
 * once and read forever.
 *
 * Split by granularity, because the two reads have opposite economics: a board
 * shows twenty names at once and needs them in bulk and up front, while a
 * recipe body is long, is read one at a time, and is worth paying for only when
 * somebody actually opens it.
 */
@Injectable()
export class RecipeTranslationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AiGateway) private readonly gateway: AiGateway,
  ) {}

  private readonly logger = new Logger(RecipeTranslationService.name);

  /**
   * Translates one recipe's title, description and steps into `locale`.
   *
   * Returns whether anything was written, so the caller knows to re-read. A
   * failure is swallowed and reported as `false`: a recipe that cannot be
   * translated must still be readable in the language it already has, rather
   * than failing the screen.
   */
  async ensureRecipe(householdId: string, recipeId: string, locale: Locale): Promise<boolean> {
    const [row] = await this.db.select().from(recipes).where(eq(recipes.id, recipeId)).limit(1);
    if (!row) return false;

    const from: Locale = locale === 'ar' ? 'en' : 'ar';
    const source = {
      title: locale === 'ar' ? row.titleEn : row.titleAr,
      description: locale === 'ar' ? row.descriptionEn : row.descriptionAr,
      steps: (locale === 'ar' ? row.stepsEn : row.stepsAr) as StoredStep[] | null,
    };
    const existingTitle = locale === 'ar' ? row.titleAr : row.titleEn;
    const existingSteps = (locale === 'ar' ? row.stepsAr : row.stepsEn) as StoredStep[] | null;

    // Titles are filled in bulk ahead of the body, so a present title says
    // nothing about the steps — completeness is judged on the steps.
    if (!source.title || (existingTitle && existingSteps && existingSteps.length > 0)) return false;

    try {
      const result = await this.gateway.execute({
        householdId,
        operation: 'recipe.translate',
        prompt: buildRecipeTranslatePrompt({
          fromLocale: from,
          toLocale: locale,
          title: source.title,
          description: source.description ?? '',
          steps: (source.steps ?? []).map((step) => step.text),
        }),
        schema: translatedRecipeSchema,
        context: {
          fromLocale: from,
          toLocale: locale,
          title: source.title,
          description: source.description ?? '',
          steps: (source.steps ?? []).map((step) => step.text),
        },
      });

      // Durations belong to the recipe, not to the wording, so they are carried
      // over from the source rather than round-tripped through the model.
      const steps: StoredStep[] = result.steps.map((text, i) => ({
        index: source.steps?.[i]?.index ?? i + 1,
        text,
        durationMinutes: source.steps?.[i]?.durationMinutes ?? null,
      }));

      // A name already on the board is a name the reader has read. Translating
      // the body produces a title too, and letting it win renamed the dish
      // under them mid-tap — so an existing title stands and only the parts
      // that were missing are filled in.
      const title = existingTitle ?? result.title;

      await this.db
        .update(recipes)
        .set(
          locale === 'ar'
            ? { titleAr: title, descriptionAr: result.description ?? null, stepsAr: steps }
            : { titleEn: title, descriptionEn: result.description ?? null, stepsEn: steps },
        )
        .where(eq(recipes.id, recipeId));

      return true;
    } catch (err) {
      this.logger.warn(`recipe ${recipeId} translation to ${locale} failed: ${String(err)}`);
      return false;
    }
  }

  /**
   * Translates the dish names of a plan's recipes into whichever language they
   * are missing, so the board reads correctly the moment it is opened in the
   * other one.
   *
   * Runs from the generation job, where a second of latency costs nothing and
   * the user is already waiting; doing it on a board read would put a model
   * call in front of a list.
   */
  async warmPlanTitles(householdId: string, planId: string): Promise<number> {
    const [plan] = await this.db
      .select({ locale: mealPlans.locale })
      .from(mealPlans)
      .where(and(eq(mealPlans.id, planId), eq(mealPlans.householdId, householdId)))
      .limit(1);
    if (!plan) return 0;

    const generated = (plan.locale as Locale) ?? 'en';
    const target: Locale = generated === 'ar' ? 'en' : 'ar';

    const rows = await this.db
      .select({ id: recipes.id, titleEn: recipes.titleEn, titleAr: recipes.titleAr })
      .from(mealPlanEntries)
      .innerJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
      .where(
        and(
          eq(mealPlanEntries.planId, planId),
          isNull(target === 'ar' ? recipes.titleAr : recipes.titleEn),
        ),
      );

    const missing = rows
      .map((row) => ({ id: row.id, title: generated === 'ar' ? row.titleAr : row.titleEn }))
      .filter((row): row is { id: string; title: string } => Boolean(row.title));

    return this.translateTitles(householdId, missing, generated, target);
  }

  /**
   * Fills a missing title for every given recipe. Deduplicates by text first —
   * a weekly plan repeats dishes, and the same name must not be paid for twice.
   */
  private async translateTitles(
    householdId: string,
    rows: readonly { id: string; title: string }[],
    from: Locale,
    to: Locale,
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const idsByTitle = new Map<string, string[]>();
    for (const row of rows) {
      idsByTitle.set(row.title, [...(idsByTitle.get(row.title) ?? []), row.id]);
    }
    const titles = [...idsByTitle.keys()].slice(0, MAX_TITLES_PER_CALL);

    let translations: string[];
    try {
      const result = await this.gateway.execute({
        householdId,
        operation: 'recipe.translate',
        prompt: buildTitlesTranslatePrompt({ fromLocale: from, toLocale: to, titles }),
        schema: translatedTitlesSchema,
        context: { fromLocale: from, toLocale: to, titles },
      });
      translations = result.titles;
    } catch (err) {
      this.logger.warn(`title translation to ${to} failed: ${String(err)}`);
      return 0;
    }

    // The result is mapped back onto recipes by position, so a short or
    // mismatched list would silently label dishes with each other's names.
    if (translations.length !== titles.length) {
      this.logger.warn(
        `title translation returned ${translations.length} of ${titles.length}; discarding`,
      );
      return 0;
    }

    let written = 0;
    for (const [index, title] of titles.entries()) {
      const translated = translations[index]!.trim();
      if (!translated) continue;
      const ids = idsByTitle.get(title)!;

      await this.db
        .update(recipes)
        .set(to === 'ar' ? { titleAr: translated } : { titleEn: translated })
        .where(inArray(recipes.id, ids));
      written += ids.length;
    }

    return written;
  }
}
