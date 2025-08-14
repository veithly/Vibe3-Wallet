export interface Logger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

export function createLogger(prefix: string): Logger {
  const formatMessage = (level: string, message: string) =>
    `[${prefix}:${level}] ${message}`;

  return {
    debug: (message: string, ...args: any[]) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(formatMessage('DEBUG', message), ...args);
      }
    },
    info: (message: string, ...args: any[]) => {
      console.info(formatMessage('INFO', message), ...args);
    },
    warn: (message: string, ...args: any[]) => {
      console.warn(formatMessage('WARN', message), ...args);
    },
    error: (message: string, ...args: any[]) => {
      console.error(formatMessage('ERROR', message), ...args);
    },
  };
}
