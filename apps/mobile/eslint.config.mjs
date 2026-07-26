import { baseConfig } from '@kitchen/config/eslint';

// `styleKeys` bans physical-direction style keys (marginLeft, left, …) so the
// UI mirrors correctly in Arabic.
export default baseConfig({ styleKeys: true });
