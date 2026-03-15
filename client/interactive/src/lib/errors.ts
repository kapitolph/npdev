export const EXIT_CODES = {
  ok: 0,
  internal: 1,
  usage: 2,
  config: 3,
  notFound: 4,
  noData: 5,
  remote: 6,
  invalidData: 7,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export class NpdevError extends Error {
  code: string;
  exitCode: ExitCode;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    exitCode: ExitCode,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "NpdevError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function usageError(message: string, details?: Record<string, unknown>): NpdevError {
  return new NpdevError("usage_error", message, EXIT_CODES.usage, details);
}

export function configError(message: string, details?: Record<string, unknown>): NpdevError {
  return new NpdevError("config_error", message, EXIT_CODES.config, details);
}

export function notFoundError(message: string, details?: Record<string, unknown>): NpdevError {
  return new NpdevError("not_found", message, EXIT_CODES.notFound, details);
}

export function noDataError(message: string, details?: Record<string, unknown>): NpdevError {
  return new NpdevError("no_data", message, EXIT_CODES.noData, details);
}

export function remoteError(message: string, details?: Record<string, unknown>): NpdevError {
  return new NpdevError("remote_error", message, EXIT_CODES.remote, details);
}

export function invalidDataError(message: string, details?: Record<string, unknown>): NpdevError {
  return new NpdevError("invalid_data", message, EXIT_CODES.invalidData, details);
}

export function normalizeError(error: unknown): NpdevError {
  if (error instanceof NpdevError) return error;
  if (error instanceof Error) {
    return new NpdevError("internal_error", error.message, EXIT_CODES.internal);
  }
  return new NpdevError("internal_error", "Unexpected internal error", EXIT_CODES.internal);
}

export function renderError(error: unknown, json: boolean): NpdevError {
  const normalized = normalizeError(error);
  if (json) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: normalized.code,
            message: normalized.message,
            exit_code: normalized.exitCode,
            details: normalized.details ?? {},
          },
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Error: ${normalized.message}`);
  }
  return normalized;
}
