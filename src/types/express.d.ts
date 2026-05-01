import type { GatewayAppContext } from './index';
import type { V1ApiKeyContext } from './index';
import type { AccessTokenPayload } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      /** Registered client app row (name avoids clashing with Express `Application` on `req.app`). */
      gatewayApp?: GatewayAppContext;
      /** Auth context for REST API /v1 routes. */
      v1Auth?: V1ApiKeyContext;
      /** JWT admin user (Bearer) when using admin panel auth. */
      adminUser?: AccessTokenPayload;
    }
  }
}

export {};
