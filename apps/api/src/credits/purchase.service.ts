import { Injectable } from '@nestjs/common';
import type { ConfirmPurchaseRequest, CreditBalance, PurchaseIntent } from '@kitchen/contracts';
import { AppError } from '../common/errors.js';

/** Stub — full implementation in Task 6. */
@Injectable()
export class PurchaseService {
  createIntent(_householdId: string, _userId: string, _productId: string): Promise<PurchaseIntent> {
    throw new AppError('INTERNAL_ERROR');
  }

  confirm(_householdId: string, _body: ConfirmPurchaseRequest): Promise<CreditBalance> {
    throw new AppError('INTERNAL_ERROR');
  }
}
