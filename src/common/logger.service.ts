import { LoggerService as NestLoggerService } from '@nestjs/common';

export class AppLogger implements NestLoggerService {
  private formatMessage(level: string, message: string, context?: string): string {
    const timestamp = new Date().toISOString();
    const ctx = context ? `[${context}]` : '';
    return `${timestamp} ${level} ${ctx} ${message}`;
  }

  log(message: string, context?: string) {
    console.log(this.formatMessage('INFO', message, context));
  }

  error(message: string, trace?: string, context?: string) {
    console.error(this.formatMessage('ERROR', message, context));
    if (trace) console.error(trace);
  }

  warn(message: string, context?: string) {
    console.warn(this.formatMessage('WARN', message, context));
  }

  debug(message: string, context?: string) {
    console.debug(this.formatMessage('DEBUG', message, context));
  }

  verbose(message: string, context?: string) {
    console.log(this.formatMessage('VERBOSE', message, context));
  }
}
