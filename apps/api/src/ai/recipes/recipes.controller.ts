import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  getRecipeQuerySchema,
  markCookedRequestSchema,
  type GetRecipeQuery,
  type MarkCookedRequest,
  type MarkCookedResponse,
  type Recipe,
  type RecipeVideo,
} from '@kitchen/contracts';
import { ZodPipe } from '../../common/http.js';
import { AuthGuard } from '../../common/auth.guard.js';
import { HouseholdGuard } from '../../common/household.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentHousehold } from '../../common/current-household.decorator.js';
import type { AuthUser, HouseholdContext } from '../../common/request-context.js';
import { RecipesService } from './recipes.service.js';

/** Recipe read, video, and cook endpoints (spec §5.5, §4.2). */
@Controller()
@UseGuards(AuthGuard, HouseholdGuard)
export class RecipesController {
  constructor(@Inject(RecipesService) private readonly recipes: RecipesService) {}

  @Get('recipes/:id')
  get(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id') id: string,
    @Query(new ZodPipe(getRecipeQuerySchema)) query: GetRecipeQuery,
  ): Promise<Recipe> {
    return this.recipes.getRecipe(household.id, id, query.locale);
  }

  @Get('recipes/:id/videos')
  videos(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id') id: string,
  ): Promise<RecipeVideo[]> {
    return this.recipes.getVideos(household.id, id);
  }

  @Post('recipes/:id/cooked')
  cooked(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(markCookedRequestSchema)) body: MarkCookedRequest,
  ): Promise<MarkCookedResponse> {
    return this.recipes.markCooked(household.id, user.userId, id, body);
  }
}
