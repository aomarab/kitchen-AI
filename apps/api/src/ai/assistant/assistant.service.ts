import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Locale, RealtimeSession } from '@kitchen/contracts';
import { CreditsService } from '../../credits/credits.service.js';
import { PANTRY_PORT, REALTIME_SESSION_PROVIDER } from '../ai.constants.js';
import type { PantryPort } from '../planner/pantry-snapshot.js';
import { pantryBrief } from './pantry-brief.js';
import type { RealtimeSessionProvider } from './realtime-provider.interface.js';

/**
 * Mints a realtime credential for the live assistant (spec Feature 5, Phase B).
 *
 * The whole reason this route exists on a feature whose transport bypasses the
 * API is cost and secrecy: it is the one moment the server is in the loop, so
 * it is where the provider key is kept and where the household is charged.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    // Injected by explicit token rather than by reflected type: this file's only
    // other use of `CreditsService` is a type position, and an inferred token
    // there depends on decorator metadata surviving the build.
    @Inject(CreditsService)
    private readonly credits: CreditsService,
    @Inject(REALTIME_SESSION_PROVIDER)
    private readonly provider: RealtimeSessionProvider,
    @Inject(PANTRY_PORT)
    private readonly pantry: PantryPort,
  ) {}

  /**
   * Read the pantry, charge, mint, and refund if the mint failed.
   *
   * The order matters and is the opposite of what reads naturally. Charging
   * first means a household that cannot afford a session never reaches the
   * provider, so we are never billed for a call we then refuse to hand over.
   * Minting first would make the credit check advisory.
   *
   * The refund is why `spend` returns a group id: a mint that throws after the
   * debit committed would otherwise silently keep the money for a session the
   * user never got.
   *
   * The pantry read comes first, before the debit, for the same reason: it is a
   * local query that can fail, and failing after the charge would mean refunding
   * a spend we should never have made.
   *
   * The snapshot is the planner's Stage-A output, not a second inventory reader
   * — an assistant that disagreed with the meal plan about what is in the
   * fridge would be worse than one that knew nothing.
   */
  async createSession(householdId: string, locale: Locale): Promise<RealtimeSession> {
    const snapshot = await this.pantry.snapshot(householdId);
    const brief = pantryBrief(snapshot, locale);

    const spendGroupId = await this.credits.spend(householdId, 'assistant.session');

    try {
      return await this.provider.mint(locale, brief);
    } catch (error) {
      await this.credits.refundSpendGroup(householdId, spendGroupId);
      // Logged rather than swallowed: a mint failure is an outage signal, and
      // the refund means the user sees only a retryable error.
      this.logger.warn(
        `realtime mint failed for household ${householdId}; spend ${spendGroupId} refunded`,
      );
      throw error;
    }
  }
}
