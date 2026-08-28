import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { creditCalibrationSchema, creditActionSchema } from '@kitchen/contracts';
import { DB } from '../../db/index.js';
import { aiUsage, creditLedger } from '../../db/schema.js';
import { AppExceptionFilter } from '../../common/errors.js';
import { AuthGuard } from '../../common/auth.guard.js';
import { StaffGuard } from '../../common/staff.guard.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedUser,
  type TestContext,
} from '../../testing/harness.js';
import { CREDIT_COST_BASIS_USD, creditRevenueUsd } from '../realtime-cost.js';
import { ActionCostQuery } from './action-cost.query.js';
import { CreditCalibrationService } from './calibration.service.js';
import { AdminCreditsController } from './admin-credits.controller.js';

describe('admin credits calibration route', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let staffId: string;
  let memberId: string;
  let householdId: string;
  let staffToken: string;
  let memberToken: string;
  const groupId = randomUUID();

  beforeAll(async () => {
    ctx = createTestContext();
    staffId = await seedUser(ctx.db, `staff+${Date.now()}@example.com`, 'staff');
    memberId = await seedUser(ctx.db, `member+${Date.now()}@example.com`);
    householdId = await seedHousehold(ctx.db, memberId);
    staffToken = await ctx.jwt.signAsync({ sub: staffId });
    memberToken = await ctx.jwt.signAsync({ sub: memberId });

    // One measured charge: a monthly plan spend joined to two vendor calls
    // totalling $0.50. The report reads globally, so other suites may add to
    // the same action — every assertion below is therefore a lower bound.
    await ctx.db.insert(creditLedger).values({
      householdId,
      delta: -50,
      kind: 'spend',
      bucket: 'paid',
      action: 'plan.monthly',
      spendGroupId: groupId,
    });
    await ctx.db.insert(aiUsage).values([
      {
        householdId,
        model: 'gpt',
        operation: 'plan.generate',
        costUsd: '0.30',
        spendGroupId: groupId,
      },
      {
        householdId,
        model: 'gpt',
        operation: 'recipe.translate',
        costUsd: '0.20',
        spendGroupId: groupId,
      },
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [AdminCreditsController],
      providers: [
        { provide: DB, useValue: ctx.db },
        AuthGuard,
        StaffGuard,
        ActionCostQuery,
        CreditCalibrationService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    // The household cascade removes these too; deleting by group first is
    // belt-and-braces so a failed cascade cannot leak into other suites.
    await ctx.db.delete(aiUsage).where(eq(aiUsage.spendGroupId, groupId));
    await ctx.db.delete(creditLedger).where(eq(creditLedger.spendGroupId, groupId));
    await cleanup(ctx.db, { households: [householdId], users: [staffId, memberId] });
    await ctx.client.end({ timeout: 5 });
  });

  const get = (token: string) =>
    request(app.getHttpServer())
      .get('/admin/credits/calibration')
      .set('authorization', `Bearer ${token}`);

  it('rejects a non-staff caller', async () => {
    expect((await get(memberToken)).status).toBe(403);
  });

  it('returns a schema-valid report over every credit action', async () => {
    const res = await get(staffToken);
    expect(res.status).toBe(200);

    const parsed = creditCalibrationSchema.parse(res.body);
    expect(parsed.rows.map((r) => r.action).sort()).toEqual([...creditActionSchema.options].sort());
    expect(parsed.costBasisUsd).toBe(CREDIT_COST_BASIS_USD);
    expect(parsed.creditValueUsd).toBeCloseTo(creditRevenueUsd(), 10);
  });

  it('reads the seeded charge and its vendor cost through the full stack', async () => {
    const res = await get(staffToken);
    const row = creditCalibrationSchema
      .parse(res.body)
      .rows.find((r) => r.action === 'plan.monthly')!;

    // Lower bounds: the aggregate can only grow with other suites' rows.
    expect(row.chargedCount).toBeGreaterThanOrEqual(1);
    expect(row.measuredCount).toBeGreaterThanOrEqual(1);
    expect(row.callCount).toBeGreaterThanOrEqual(2);
    expect(row.creditsCharged).toBeGreaterThanOrEqual(50);
    expect(row.measuredCostUsd).toBeGreaterThanOrEqual(0.5);
    expect(row.measurable).toBe(true);
    expect(row.measuredCreditsPerCharge).not.toBeNull();
  });
});
