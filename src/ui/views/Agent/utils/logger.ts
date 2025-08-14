/**
 * Production-ready logging utility for Agent components
 * Provides conditional logging based on environment and log levels
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: number;
  component?: string;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private isDevelopment = process.env.NODE_ENV === 'development';
  private currentLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;

  private shouldLog(level: LogLevel): boolean {
    return level <= this.currentLevel;
  }

  private formatMessage(
    component: string,
    message: string,
    data?: any
  ): string {
    const prefix = component ? `[${component}]` : '[Agent]';
    return data ? `${prefix} ${message}` : `${prefix} ${message}`;
  }

  private addLogEntry(
    level: LogLevel,
    component: string,
    message: string,
    data?: any
  ) {
    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: Date.now(),
      component,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  error(component: string, message: string, data?: any) {
    this.addLogEntry(LogLevel.ERROR, component, message, data);
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(component, message), data);
    }
  }

  warn(component: string, message: string, data?: any) {
    this.addLogEntry(LogLevel.WARN, component, message, data);
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(component, message), data);
    }
  }

  info(component: string, message: string, data?: any) {
    this.addLogEntry(LogLevel.INFO, component, message, data);
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(component, message), data);
    }
  }

  debug(component: string, message: string, data?: any) {
    this.addLogEntry(LogLevel.DEBUG, component, message, data);
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage(component, message), data);
    }
  }

  trace(component: string, message: string, data?: any) {
    this.addLogEntry(LogLevel.TRACE, component, message, data);
    if (this.shouldLog(LogLevel.TRACE)) {
      console.trace(this.formatMessage(component, message), data);
    }
  }

  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = new Logger();
