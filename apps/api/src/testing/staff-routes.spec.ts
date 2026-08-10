import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { routes, type RouteDefinition, type RouteName } from '@kitchen/contracts';
import { AppModule } from '../app.module.js';
import { DB } from '../db/index.js';
import { AppExceptionFilter } from '../common/errors.js';
import { cleanup, createTestContext, seedUser, type TestContext } from './harness.js';

type StaffRoute = [RouteName, RouteDefinition & { staff: true }];

const STAFF_ROUTES = (Object.entries(routes) as [RouteName, RouteDefinition][]).filter(
  (entry): entry is StaffRoute => entry[1].staff === true,
);

/** A concrete uuid for every `:param`, so the request reaches the guard. */
function concretePath(path: string): string {
  return path.replace(/\/:([A-Za-z0-9_]+)/g, '/00000000-0000-4000-8000-000000000000');
}

describe('staff-only routes', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let plainId: string;
  let staffId: string;
  let plainToken: string;
  let staffToken: string;

  beforeAll(async () => {
    ctx = createTestContext();
    plainId = await seedUser(ctx.db);
    staffId = await seedUser(ctx.db, undefined, 'staff');
    plainToken = await ctx.jwt.signAsync({ sub: plainId });
    staffToken = await ctx.jwt.signAsync({ sub: staffId });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DB)
      .useValue(ctx.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, { users: [plainId, staffId] });
    await ctx.client.end({ timeout: 5 });
  });

  function send(route: RouteDefinition, token: string) {
    const server = app.getHttpServer();
    const path = concretePath(route.path);
    const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
    const req = request(server)[method](path).set('authorization', `Bearer ${token}`);
    return route.body ? req.send({}) : req;
  }

  it('declares at least one staff route, or this suite proves nothing', () => {
    expect(STAFF_ROUTES.length).toBeGreaterThan(0);
  });

  it.each(STAFF_ROUTES)('refuses %s to an ordinary account', async (_name, route) => {
    const res = await send(route, plainToken);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it.each(STAFF_ROUTES)('refuses %s with no token at all', async (_name, route) => {
    const path = concretePath(route.path);
    const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
    const res = await request(app.getHttpServer())[method](path).send();

    expect(res.status).toBe(401);
  });

  it.each(STAFF_ROUTES)('gets past authorization for %s with a staff account', async (_name, route) => {
    const res = await send(route, staffToken);

    // 404 (unknown id) and 400 (empty PATCH body) are fine — they prove the
    // request reached the handler. 401 and 403 mean the guard rejected staff.
    expect([401, 403]).not.toContain(res.status);
  });
});
