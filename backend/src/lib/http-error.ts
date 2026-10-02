export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'HTTP_ERROR',
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
