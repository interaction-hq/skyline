/**
 * Canonical Skyline error catalog.
 *
 * Single source of truth for the numeric codes, slugs, categories, and retry
 * semantics that the management API and broker return. Kept in sync with the
 * error reference at https://docs.interactions.co.in/errors/overview.
 *
 * Consumers can branch on `slug` for stable handling and use `retryable` to
 * decide whether to back off:
 *
 * ```ts
 * import { BrokerError, ERROR_CATALOG } from "skyline-ts";
 *
 * if (err instanceof BrokerError && err.retryable) {
 *   // 3xxx — retry with exponential backoff
 * }
 * ```
 */

/** Broad handling class for an error code. */
export type ErrorCategory = "client" | "resource" | "server";

/** A single entry in the Skyline error catalog. */
export interface ErrorDefinition {
  /** Broad handling class. */
  readonly category: ErrorCategory;
  /** Stable numeric code (e.g. 2006). */
  readonly code: number;
  /** Human-readable explanation. */
  readonly message: string;
  /** Whether retrying the same request with backoff may succeed. */
  readonly retryable: boolean;
  /** Stable string identifier for `switch` statements and logs. */
  readonly slug: string;
}

/**
 * The full catalog, keyed by slug for ergonomic lookups and autocomplete.
 * `1xxx` client, `2xxx` resource, `3xxx` server.
 */
export const ERROR_CATALOG = {
  COMMIT_FAILED: {
    category: "resource",
    code: 2011,
    message: "The upload could not be committed.",
    retryable: false,
    slug: "COMMIT_FAILED",
  },
  DUPLICATE_URL: {
    category: "resource",
    code: 2008,
    message: "A webhook with this URL is already registered.",
    retryable: false,
    slug: "DUPLICATE_URL",
  },
  FLEET_UNAVAILABLE: {
    category: "server",
    code: 3003,
    message: "The fleet registry is unavailable.",
    retryable: true,
    slug: "FLEET_UNAVAILABLE",
  },
  FORBIDDEN: {
    category: "resource",
    code: 2005,
    message: "You do not have permission to access this resource.",
    retryable: false,
    slug: "FORBIDDEN",
  },
  INTERNAL_ERROR: {
    category: "server",
    code: 3008,
    message: "An unexpected error occurred.",
    retryable: true,
    slug: "INTERNAL_ERROR",
  },
  INVALID_PHONE_E164: {
    category: "client",
    code: 1002,
    message: "Phone number must be in E.164 format (e.g. +14155551234).",
    retryable: false,
    slug: "INVALID_PHONE_E164",
  },
  INVALID_PLATFORM: {
    category: "client",
    code: 1004,
    message: "The requested platform is not supported.",
    retryable: false,
    slug: "INVALID_PLATFORM",
  },
  INVALID_REQUEST_BODY: {
    category: "client",
    code: 1003,
    message: "The request body is invalid or malformed.",
    retryable: false,
    slug: "INVALID_REQUEST_BODY",
  },
  INVALID_WEBHOOK_URL: {
    category: "client",
    code: 1005,
    message: "The webhook URL is not a valid public HTTPS endpoint.",
    retryable: false,
    slug: "INVALID_WEBHOOK_URL",
  },
  // 1xxx — client / request errors (fix the request; do not retry unchanged)
  MISSING_REQUIRED_FIELD: {
    category: "client",
    code: 1001,
    message: "A required field is missing from the request.",
    retryable: false,
    slug: "MISSING_REQUIRED_FIELD",
  },
  NO_AVAILABLE_LINE: {
    category: "server",
    code: 3002,
    message: "No free line is available for a new conversation.",
    retryable: true,
    slug: "NO_AVAILABLE_LINE",
  },

  // 3xxx — server / infrastructure errors (retry with exponential backoff)
  NO_HEALTHY_MINI: {
    category: "server",
    code: 3001,
    message: "No healthy messaging line is available right now.",
    retryable: true,
    slug: "NO_HEALTHY_MINI",
  },

  // 2xxx — resource / auth errors (fix credentials or the reference)
  NOT_FOUND: {
    category: "resource",
    code: 2001,
    message: "The requested resource was not found.",
    retryable: false,
    slug: "NOT_FOUND",
  },
  PLAN_NOT_WRITABLE: {
    category: "resource",
    code: 2009,
    message: "This operation is not available on the current plan.",
    retryable: false,
    slug: "PLAN_NOT_WRITABLE",
  },
  PLATFORM_NOT_ENABLED: {
    category: "resource",
    code: 2006,
    message: "This platform is not enabled for the project.",
    retryable: false,
    slug: "PLATFORM_NOT_ENABLED",
  },
  PROJECT_INACTIVE: {
    category: "resource",
    code: 2007,
    message: "The project is inactive or does not exist.",
    retryable: false,
    slug: "PROJECT_INACTIVE",
  },
  RATE_LIMITED: {
    category: "client",
    code: 1007,
    message: "Rate limit exceeded. Retry after the delay in retry_after.",
    retryable: true,
    slug: "RATE_LIMITED",
  },
  SERVICE_UNAVAILABLE: {
    category: "server",
    code: 3007,
    message: "The service is temporarily unavailable.",
    retryable: true,
    slug: "SERVICE_UNAVAILABLE",
  },
  STORAGE_DISABLED: {
    category: "resource",
    code: 2010,
    message: "Object storage is not configured for this environment.",
    retryable: false,
    slug: "STORAGE_DISABLED",
  },
  TOKEN_MINT_FAILED: {
    category: "server",
    code: 3005,
    message: "Could not mint a runtime token.",
    retryable: true,
    slug: "TOKEN_MINT_FAILED",
  },
  TOKEN_MINT_UNAVAILABLE: {
    category: "server",
    code: 3006,
    message: "The runtime token service is unavailable.",
    retryable: true,
    slug: "TOKEN_MINT_UNAVAILABLE",
  },
  UNAUTHORIZED: {
    category: "resource",
    code: 2004,
    message: "Authentication failed. Check project credentials or session.",
    retryable: false,
    slug: "UNAUTHORIZED",
  },
  USER_NOT_FOUND: {
    category: "resource",
    code: 2002,
    message: "The Skyline user was not found on this project.",
    retryable: false,
    slug: "USER_NOT_FOUND",
  },
  WEBHOOK_LIMIT_REACHED: {
    category: "client",
    code: 1006,
    message:
      "This project has reached the maximum number of webhook endpoints.",
    retryable: false,
    slug: "WEBHOOK_LIMIT_REACHED",
  },
  WEBHOOK_NOT_FOUND: {
    category: "resource",
    code: 2003,
    message: "The webhook endpoint was not found.",
    retryable: false,
    slug: "WEBHOOK_NOT_FOUND",
  },
  WHATSAPP_NOT_CONFIGURED: {
    category: "server",
    code: 3004,
    message: "WhatsApp Business is not configured for this project.",
    retryable: true,
    slug: "WHATSAPP_NOT_CONFIGURED",
  },
} as const satisfies Record<string, ErrorDefinition>;

/** Union of every known error slug. */
export type ErrorSlug = keyof typeof ERROR_CATALOG;

/** Lookup table keyed by numeric code. */
export const ERROR_CODES: Readonly<Record<number, ErrorDefinition>> =
  Object.freeze(
    Object.fromEntries(
      Object.values(ERROR_CATALOG).map((entry) => [entry.code, entry])
    )
  );

/** Resolve a catalog entry by its slug, if known. */
export function errorBySlug(slug: string): ErrorDefinition | undefined {
  return (ERROR_CATALOG as Record<string, ErrorDefinition>)[slug];
}

/** Resolve a catalog entry by its numeric code, if known. */
export function errorByCode(code: number): ErrorDefinition | undefined {
  return ERROR_CODES[code];
}

/**
 * Whether an error is safe to retry with backoff. Accepts a slug or numeric
 * code. Unknown references default to `false`.
 */
export function isRetryableError(ref: string | number): boolean {
  const def = typeof ref === "number" ? errorByCode(ref) : errorBySlug(ref);
  return def?.retryable ?? false;
}
