export interface HttpError extends Error {
  status?: number;
  expose?: boolean;
}

export function createHttpError(status: number, message: string, expose = true): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  err.expose = expose;
  return err;
}

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof Error && 'status' in err;
}
