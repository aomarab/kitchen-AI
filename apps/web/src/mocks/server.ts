import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Node-side mock used by the vitest suite (see `vitest.setup.ts`). */
export const server = setupServer(...handlers);
