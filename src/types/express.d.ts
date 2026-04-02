import type { AppRow } from './index';

declare global {
  namespace Express {
    interface Request {
      /** Registered client app row (name avoids clashing with Express `Application` on `req.app`). */
      gatewayApp?: AppRow;
    }
  }
}

export {};
