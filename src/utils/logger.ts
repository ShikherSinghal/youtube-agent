type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const RESET = "\x1b[0m";

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function log(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;
  const timestamp = new Date().toISOString();
  const color = LEVEL_COLORS[level];
  const prefix = `${color}[${timestamp}] [${level.toUpperCase()}] [${component}]${RESET}`;
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  debug: (component: string, msg: string, data?: Record<string, unknown>) => log("debug", component, msg, data),
  info: (component: string, msg: string, data?: Record<string, unknown>) => log("info", component, msg, data),
  warn: (component: string, msg: string, data?: Record<string, unknown>) => log("warn", component, msg, data),
  error: (component: string, msg: string, data?: Record<string, unknown>) => log("error", component, msg, data),
};
