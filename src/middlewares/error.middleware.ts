import type { ErrorRequestHandler, RequestHandler } from 'express';
import { isHttpError } from '../utils/http-error';

const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = isHttpError(err) && err.status ? err.status : 500;
  const message = isHttpError(err) && err.expose ? err.message : 'Internal server error';

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
};

export { notFoundHandler, errorHandler };
