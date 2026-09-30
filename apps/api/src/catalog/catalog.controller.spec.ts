import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuthGuard } from '../common/auth.guard.js';
import { AppExceptionFilter } from '../common/errors.js';
import { StaffGuard } from '../common/staff.guard.js';
import { DB } from '../db/index.js';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

describe('CatalogController ingredient writes', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let plainId: string;
  let staffId: string;
  let plainToken: string;
  let staffToken: string;
  const createdIngredientIds: string[] = [];

  beforeAll(async () => {
    ctx = createTestContext();
    plainId = await seedUser(ctx.db);
    staffId = await seedUser(ctx.db, undefined, 'staff');
    plainToken = await ctx.jwt.signAsync({ sub: plainId });
    staffToken = await ctx.jwt.signAsync({ sub: staffId });

    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        CatalogService,
        AuthGuard,
        StaffGuard,
        { provide: DB, useValue: ctx.db },
        { provide: JwtService, useValue: ctx.jwt },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, {
      ingredients: createdIngredientIds,
      users: [plainId, staffId],
    });
    await ctx.client.end({ timeout: 5 });
  });

  function ingredientBody() {
    const tag = randomUUID();
    return {
      canonicalNameEn: `Security test ingredient ${tag}`,
      canonicalNameAr: `مكون اختبار أمني ${tag.slice(0, 8)}`,
      category: 'spice',
      defaultUnit: 'g',
      aliases: [`security-test-${tag}`],
      isStaple: false,
    };
  }

  it('refuses global catalog writes from a non-staff user', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/ingredients')
      .set('authorization', `Bearer ${plainToken}`)
      .send(ingredientBody());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('allows staff to create a global catalog ingredient', async () => {
    const body = ingredientBody();

    const res = await request(app.getHttpServer())
      .post('/admin/ingredients')
      .set('authorization', `Bearer ${staffToken}`)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      canonicalNameEn: body.canonicalNameEn,
      canonicalNameAr: body.canonicalNameAr,
      category: body.category,
      defaultUnit: body.defaultUnit,
      aliases: body.aliases,
      isStaple: false,
    });
    createdIngredientIds.push(res.body.id);
  });

  it('keeps ingredient search available to any signed-in user', async () => {
    const res = await request(app.getHttpServer())
      .get('/ingredients')
      .query({ q: 'tomato', limit: 5 })
      .set('authorization', `Bearer ${plainToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});
