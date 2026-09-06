export class SidefxError extends Error {
  constructor(code, message, exitCode = 3, details = undefined) {
    super(message);
    this.name = 'SidefxError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function requireValue(condition, code, message, exitCode = 3) {
  if (!condition) throw new SidefxError(code, message, exitCode);
}

export function errorRecord(error) {
  return {
    code: error.code ?? 'SIDEFX_FAILURE',
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}
