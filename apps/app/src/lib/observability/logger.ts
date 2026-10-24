/* eslint-disable no-console -- this module IS the logging boundary; everything else uses it. */
import { redactValue } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LogEntry {
  level: LogLevel;
  /** Feature/module emitting the log, e.g. "auth". */
  module: string;
  /** Stable machine-readable code, e.g. "SIGN_IN_FAILED". Never free text. */
  code: string;
  fields?: unknown;
  error?: unknown;
  time: string;
}

export type LogSink = (entry: LogEntry) => void;

function defaultSink(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === 'error') console.error(line);
  else if (entry.level === 'warn') console.warn(line);
  else if (entry.level === 'info') console.info(line);
  else console.debug(line);
}

let minLevel: LogLevel = 'warn';
let sink: LogSink = defaultSink;

/** Development shows everything; release builds keep warnings and errors only. */
export function configureLogger(options: { minLevel?: LogLevel; sink?: LogSink }): void {
  if (options.minLevel) minLevel = options.minLevel;
  if (options.sink) sink = options.sink;
}

function emit(level: LogLevel, module: string, code: string, fields?: unknown, error?: unknown) {
  if (ORDER[level] < ORDER[minLevel]) return;
  // Redaction happens HERE so no caller can forget it.
  const entry: LogEntry = {
    level,
    module,
    code,
    time: new Date().toISOString(),
    ...(fields === undefined ? {} : { fields: redactValue(fields) }),
    ...(error === undefined ? {} : { error: redactValue(error) }),
  };
  sink(entry);
}

export const log = {
  debug: (module: string, code: string, fields?: unknown) => emit('debug', module, code, fields),
  info: (module: string, code: string, fields?: unknown) => emit('info', module, code, fields),
  warn: (module: string, code: string, fields?: unknown, error?: unknown) =>
    emit('warn', module, code, fields, error),
  error: (module: string, code: string, error?: unknown, fields?: unknown) =>
    emit('error', module, code, fields, error),
};
