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
import { StaffGuard } from '../common/staff.guard.js';
import type { Page } from '../common/pagination.js';
import { CatalogService } from './catalog.service.js';

@Controller()
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get('ingredients')
  @UseGuards(AuthGuard)
  search(
    @Query(new ZodPipe(searchIngredientsQuerySchema)) query: SearchIngredientsQuery,
  ): Promise<Page<Ingredient>> {
    return this.catalog.search(query);
  }

  @Post('admin/ingredients')
  @UseGuards(AuthGuard, StaffGuard)
  create(
    @Body(new ZodPipe(createIngredientRequestSchema)) body: CreateIngredientRequest,
  ): Promise<Ingredient> {
    return this.catalog.create(body);
  }
}
