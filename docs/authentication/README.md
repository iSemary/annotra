# Authentication

**Access:** JWT from `POST /api/v1/auth/register` or `POST /api/v1/auth/login` (or `POST /api/v1/auth/2fa/verify` during a 2FA login). Send as `Authorization: Bearer <access_token>`.

**Refresh:** HTTP-only cookie (default name `refresh_token`, path `/api/v1/auth`). `POST /api/v1/auth/refresh` uses it; `POST /api/v1/auth/logout` clears it.

**2FA:** If `TWO_FACTOR_ENABLED` is on, use `/api/v1/auth/2fa/*`. `GET /api/v1/auth/public-config` tells the client whether 2FA is enabled.
