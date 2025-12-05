/**
 * Simple structured logger for Edge Runtime
 * Provides consistent logging format for debugging and monitoring
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    requestId?: string;
    [key: string]: unknown;
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: LogContext;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

// Minimum log level (configurable via env)
const MIN_LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) ||
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

function formatLog(entry: LogEntry): string {
    if (process.env.NODE_ENV === 'production') {
        // JSON format for production (structured logging)
        return JSON.stringify(entry);
    }
    // Human-readable format for development
    const contextStr = entry.context
        ? ` ${JSON.stringify(entry.context)}`
        : '';
    return `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${contextStr}`;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        context,
    };

    const formatted = formatLog(entry);

    switch (level) {
        case 'debug':
        case 'info':
            console.log(formatted);
            break;
        case 'warn':
            console.warn(formatted);
            break;
        case 'error':
            console.error(formatted);
            break;
    }
}

export const logger = {
    debug: (message: string, context?: LogContext) => log('debug', message, context),
    info: (message: string, context?: LogContext) => log('info', message, context),
    warn: (message: string, context?: LogContext) => log('warn', message, context),
    error: (message: string, context?: LogContext) => log('error', message, context),
};

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
