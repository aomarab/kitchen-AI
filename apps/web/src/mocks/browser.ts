import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/** Browser-side mock. Started by `MswProvider` in development. */
export const worker = setupWorker(...handlers);
