// Structured JSON logging -> CloudWatch Logs. Keeps Logs Insights queries simple:
//   fields @timestamp, msg, fieldName, durationMs | filter level = "error"
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? ORDER.info;

function write(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < threshold) return;
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), fn: process.env.AWS_LAMBDA_FUNCTION_NAME, ...fields });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => write('debug', msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write('info', msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write('warn', msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write('error', msg, f),
};
