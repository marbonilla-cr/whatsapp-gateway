/** Defaults so buildApp() validateEnv passes when tests omit JWT vars */
process.env.JWT_ACCESS_SECRET ||= 'vitest-jwt-access-secret-32chars!!';
process.env.JWT_REFRESH_SECRET ||= 'vitest-jwt-refresh-secret-32chars!!';
