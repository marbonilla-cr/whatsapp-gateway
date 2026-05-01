import type { GatewayAppContext } from './index';
import type { V1ApiKeyContext } from './index';

declare global {
  namespace Express {
    interface Request {
      /** Registered client app row (name avoids clashing with Express `Application` on `req.app`). */
      gatewayApp?: GatewayAppContext;
      /** Auth context for REST API /v1 routes. */
      v1Auth?: V1ApiKeyContext;
    }
  }
}

export {};
