import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import {
  createIngredientRequestSchema,
  searchIngredientsQuerySchema,
  type CreateIngredientRequest,
  type Ingredient,
  type SearchIngredientsQuery,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import type { Page } from '../common/pagination.js';
import { CatalogService } from './catalog.service.js';

@Controller('ingredients')
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  search(
    @Query(new ZodPipe(searchIngredientsQuerySchema)) query: SearchIngredientsQuery,
  ): Promise<Page<Ingredient>> {
    return this.catalog.search(query);
  }

  @Post()
  create(
    @Body(new ZodPipe(createIngredientRequestSchema)) body: CreateIngredientRequest,
  ): Promise<Ingredient> {
    return this.catalog.create(body);
  }
}
