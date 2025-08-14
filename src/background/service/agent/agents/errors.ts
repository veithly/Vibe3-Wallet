export class MaxTokensReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaxTokensReachedError';
  }
}

export class RequestCancelledError extends Error {
  constructor(message = 'Request cancelled by user') {
    super(message);
    this.name = 'RequestCancelledError';
  }
}

export class ChatModelAuthError extends Error {
  constructor(message = 'Failed to authenticate with chat model') {
    super(message);
    this.name = 'ChatModelAuthError';
  }
}

export class ChatModelForbiddenError extends Error {
  constructor(message = 'Forbidden to access chat model') {
    super(message);
    this.name = 'ChatModelForbiddenError';
  }
}

export class ExtensionConflictError extends Error {
  constructor(
    message = 'Another extension is interfering with this extension. Please disable other extensions and try again.'
  ) {
    super(message);
    this.name = 'ExtensionConflictError';
  }
}
