import pino from 'pino';

// Get log level from environment variable, default to 'info'
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Valid log levels: 'trace', 'debug', 'info', 'warn', 'error', 'fatal'
const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const logLevel = validLevels.includes(LOG_LEVEL.toLowerCase())
  ? LOG_LEVEL.toLowerCase()
  : 'info';

export const logger = pino({
  level: logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: false,
      messageFormat: '{msg}',
      customColors: 'info:cyan,debug:magenta,trace:gray',
      levelFirst: true,
      hideObject: false,
    }
  },
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
});

/**
 * Export convenience methods for structured logging
 */
export const createChildLogger = (component: string) => {
  return logger.child({ component });
};

/**
 * Format section headers without emojis
 */
export function formatSection(title: string): string {
  const separator = '='.repeat(60);
  return `\n${separator}\n${title}\n${separator}`;
}

/**
 * Format deployment information
 */
export function formatDeployment(name: string, address: string): string {
  return `${name}: ${address}`;
}

/**
 * Format indented content
 */
export function indent(message: string, level: number = 1): string {
  const spacing = '  '.repeat(level);
  return `${spacing}${message}`;
}

/**
 * Format list items
 */
export function formatListItem(message: string, marker: string = '-'): string {
  return `${marker} ${message}`;
}
