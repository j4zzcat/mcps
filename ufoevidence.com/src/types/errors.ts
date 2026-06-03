export type UfoeErrorCode =
  | "NOT_FOUND"
  | "PARSE_ERROR"
  | "NETWORK_ERROR"
  | "INSUFFICIENT_DATA"
  | "UNSUPPORTED";

export type UfoeError = {
  error: {
    code: UfoeErrorCode;
    message: string;
    sourceUrl?: string;
    details?: unknown;
  };
};

export class UfoeToolError extends Error {
  constructor(
    public readonly code: UfoeErrorCode,
    message: string,
    public readonly sourceUrl?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
