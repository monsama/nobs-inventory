/* The error with an HTTP status that the routes throw; the error handler in app.js answers with its status and text. */
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
