import pino from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface LoggerOptions {
  level?: LogLevel;
  name?: string;
  pretty?: boolean;
}

/**
 * Create a structured logger for Corsen Context.
 *
 * Uses Pino for high-performance, JSON-based structured logging.
 * Logs include: timestamp, level, module, and message + data fields.
 *
 * In production, pipe through `pino-pretty` for human-readable output:
 *   node server.js | npx pino-pretty
 */
export function createLogger(options: LoggerOptions = {}): pino.Logger {
  return pino({
    name: options.name || 'corsen-context',
    level: options.level || (process.env.LOG_LEVEL as LogLevel) || 'info',
    ...(options.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true },
          },
        }
      : {}),
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['apiKey', 'authorization', 'password', 'secret', 'token'],
      censor: '[REDACTED]',
    },
  });
}

// Singleton default logger
let defaultLogger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger();
  }
  return defaultLogger;
}

export function setLogger(logger: pino.Logger): void {
  defaultLogger = logger;
}

// Convenience: security-specific child logger
export function securityLogger(parent?: pino.Logger): pino.Logger {
  const base = parent || getLogger();
  return base.child({ module: 'security' });
}

// Convenience: MCP-specific child logger
export function mcpLogger(parent?: pino.Logger): pino.Logger {
  const base = parent || getLogger();
  return base.child({ module: 'mcp' });
}
