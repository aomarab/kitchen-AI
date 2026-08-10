import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { HOUSEHOLD_HEADER } from '@kitchen/contracts';
import { DB } from '../../db/index.js';
import { mealPlans, recognitionSessions } from '../../db/schema.js';
import { AppExceptionFilter } from '../../common/errors.js';
import { AuthGuard } from '../../common/auth.guard.js';
import { HouseholdGuard } from '../../common/household.guard.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedUser,
  type TestContext,
} from '../../testing/harness.js';
import { JobsController } from '../jobs/jobs.controller.js';
import { JobsService } from '../jobs/jobs.service.js';
import { DrizzleJobStore } from '../jobs/job-store.js';
import { PlanController } from '../plan/plan.controller.js';
import { PlanService } from '../plan/plan.service.js';
import { CaptureController } from '../recognition/capture.controller.js';
import { RecognitionService } from '../recognition/recognition.service.js';
import { BarcodeService } from '../barcode/barcode.service.js';

/**
 * Cross-household isolation for the AI endpoints (spec §8). Every AI route is
 * `auth: true` + `household: true`, so the controllers are guarded by
 * {@link AuthGuard} + {@link HouseholdGuard}. These tests boot the real guards,
 * the global {@link AppExceptionFilter}, and the live DB, then prove that:
 *   - no credentials -> 401 UNAUTHENTICATED (AuthGuard is applied);
 *   - a member of household X claiming household Y -> 403 FORBIDDEN;
 *   - a member of X polling a job / plan / recognition session owned by Y ->
 *     404 NOT_FOUND (never FORBIDDEN, so ids cannot be probed for existence);
 *   - a member of X reading their own resource -> 200.
 */
describe('AI endpoint cross-household isolation (live DB + real guards)', () => {
  let ctx: TestContext;
  let app: INestApplication;

  let userX: string;
  let userY: string;
  let hhX: string;
  let hhY: string;
  let tokenX: string;

  let jobX: string;
  let jobY: string;
  let planX: string;
  let planY: string;
  let sessionX: string;
  let sessionY: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userX = await seedUser(ctx.db);
    userY = await seedUser(ctx.db);
    hhX = await seedHousehold(ctx.db, userX, 'owner');
    hhY = await seedHousehold(ctx.db, userY, 'owner');
    tokenX = await ctx.jwt.signAsync({ sub: userX });

    const store = new DrizzleJobStore(ctx.db);
    jobX = (await store.create({ householdId: hhX, type: 'plan.generate', idempotencyKey: null, payload: {} })).job.id;
    jobY = (await store.create({ householdId: hhY, type: 'plan.generate', idempotencyKey: null, payload: {} })).job.id;

    planX = await seedPlan(hhX);
    planY = await seedPlan(hhY);
    sessionX = await seedSession(hhX);
    sessionY = await seedSession(hhY);

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [JobsController, PlanController, CaptureController],
      providers: [
        { provide: DB, useValue: ctx.db },
        AuthGuard,
        HouseholdGuard,
        { provide: JobsService, useValue: new JobsService(store) },
        { provide: PlanService, useValue: new PlanService(ctx.db, undefined as never, undefined as never, { resolveMany: async () => new Map() } as never) },
        {
          provide: RecognitionService,
          useValue: new RecognitionService(
            ctx.db,
            undefined as never,
            undefined as never,
            undefined as never,
          ),
        },
        { provide: BarcodeService, useValue: {} as unknown as BarcodeService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, { households: [hhX, hhY], users: [userX, userY] });
    await ctx.client.end({ timeout: 5 });
  });

  async function seedPlan(householdId: string): Promise<string> {
    const [row] = await ctx.db
      .insert(mealPlans)
      .values({
        householdId,
        scope: 'weekly',
        startsOn: '2026-08-03',
        endsOn: '2026-08-09',
        status: 'ready',
        locale: 'en',
      })
      .returning({ id: mealPlans.id });
    return row!.id;
  }

  async function seedSession(householdId: string): Promise<string> {
    const [row] = await ctx.db
      .insert(recognitionSessions)
      .values({ householdId, items: [], emptyPhotoKeys: [] })
      .returning({ id: recognitionSessions.id });
    return row!.id;
  }

  const auth = (token: string, householdId: string) => (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${token}`).set(HOUSEHOLD_HEADER, householdId);

  const server = () => app.getHttpServer();

  describe('AuthGuard is applied', () => {
    it('rejects an unauthenticated job poll with 401', async () => {
      const res = await request(server()).get(`/jobs/${jobX}`).set(HOUSEHOLD_HEADER, hhX);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('rejects an unauthenticated plan read with 401', async () => {
      const res = await request(server()).get(`/meal-plans/${planX}`).set(HOUSEHOLD_HEADER, hhX);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('HouseholdGuard verifies membership', () => {
    it('rejects a non-member claiming another household with 403 FORBIDDEN', async () => {
      const res = await auth(tokenX, hhY)(request(server()).get(`/jobs/${jobY}`));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('rejects a missing household header with 428 HOUSEHOLD_REQUIRED', async () => {
      const res = await request(server())
        .get(`/jobs/${jobX}`)
        .set('Authorization', `Bearer ${tokenX}`);
      expect(res.status).toBe(428);
      expect(res.body.code).toBe('HOUSEHOLD_REQUIRED');
    });
  });

  describe('a job id is scoped to its household', () => {
    it("returns 404 NOT_FOUND (not FORBIDDEN) for another household's job", async () => {
      const res = await auth(tokenX, hhX)(request(server()).get(`/jobs/${jobY}`));
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 200 for the caller’s own job', async () => {
      const res = await auth(tokenX, hhX)(request(server()).get(`/jobs/${jobX}`));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(jobX);
    });
  });

  describe('a meal plan is scoped to its household', () => {
    it("returns 404 NOT_FOUND for another household's plan", async () => {
      const res = await auth(tokenX, hhX)(request(server()).get(`/meal-plans/${planY}`));
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 200 for the caller’s own plan', async () => {
      const res = await auth(tokenX, hhX)(request(server()).get(`/meal-plans/${planX}`));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(planX);
    });
  });

  describe('a recognition session is scoped to its household', () => {
    it("returns 404 NOT_FOUND for another household's session", async () => {
      const res = await auth(tokenX, hhX)(
        request(server()).get(`/inventory/recognition-sessions/${sessionY}`),
      );
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 200 for the caller’s own session', async () => {
      const res = await auth(tokenX, hhX)(
        request(server()).get(`/inventory/recognition-sessions/${sessionX}`),
      );
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sessionX);
    });
  });
});
