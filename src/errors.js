// A small error type that carries the HTTP status the bridge should return.
// Messages must never contain secrets, cookies, or full media URLs: they are sent to Hubitat.
export class BridgeError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

export const badRequest = (message) => new BridgeError(400, 'bad_request', message);
