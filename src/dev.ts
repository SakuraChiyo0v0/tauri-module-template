import { activate } from "./module";
import type { LogLevel, RuntimeModuleHostSdkV2, RuntimeSqlValue, ThemeState } from "./sdk";

const settingListeners = new Set<() => void>();
const themeListeners = new Set<(theme: ThemeState) => void>();
const settingKey = "starter-module.dev.settings";
const databaseKey = "starter-module.dev.database";
let theme: ThemeState = { mode: "light", preset: "neutral" };

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(settingKey) ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function log(level: LogLevel, message: string) {
  const output = document.querySelector<HTMLPreElement>("#logs");
  if (output) output.textContent += `[${level.toUpperCase()}] ${message}\n`;
  return Promise.resolve();
}

function readDatabase() {
  try {
    return JSON.parse(localStorage.getItem(databaseKey) ?? "{\"userVersion\":0,\"events\":[]}") as {
      userVersion: number;
      events: string[];
    };
  } catch {
    return { userVersion: 0, events: [] };
  }
}

function writeDatabase(value: ReturnType<typeof readDatabase>) {
  localStorage.setItem(databaseKey, JSON.stringify(value));
}

const hostSdk: RuntimeModuleHostSdkV2 = {
  sdkVersion: 2,
  hostVersion: "0.2.0-dev",
  module: { id: "starter-module", version: "0.1.0-dev" },
  logger: {
    trace: (message) => log("trace", message),
    debug: (message) => log("debug", message),
    info: (message) => log("info", message),
    warn: (message) => log("warn", message),
    error: (message) => log("error", message),
    write: log,
  },
  settings: {
    get(settingId, fallback) {
      const value = readSettings()[settingId];
      return (value === undefined ? fallback : value) as typeof fallback;
    },
    set(settingId, value) {
      localStorage.setItem(settingKey, JSON.stringify({ ...readSettings(), [settingId]: value }));
      settingListeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      settingListeners.add(listener);
      return () => settingListeners.delete(listener);
    },
  },
  theme: {
    get: () => theme,
    subscribe(listener) {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    },
  },
  database: {
    async execute(sql, params = []) {
      const database = readDatabase();
      if (/^INSERT INTO module_events/i.test(sql)) {
        database.events.push(String(params[0] ?? "event"));
        writeDatabase(database);
        return { rowsAffected: 1, lastInsertId: database.events.length };
      }
      return { rowsAffected: 0, lastInsertId: 0 };
    },
    async select<T extends Record<string, RuntimeSqlValue>>(sql: string) {
      if (/COUNT\(\*\)/i.test(sql)) return [{ count: readDatabase().events.length }] as unknown as T[];
      return [];
    },
    async transaction() {
      return [];
    },
    async getUserVersion() {
      return readDatabase().userVersion;
    },
    async setUserVersion(userVersion) {
      writeDatabase({ ...readDatabase(), userVersion });
    },
  },
};

await activate(hostSdk);
document.querySelector("#module-root")?.append(document.createElement("starter-module-page"));

document.querySelector("#toggle-details")?.addEventListener("click", () => {
  hostSdk.settings.set("showDetails", !hostSdk.settings.get("showDetails", true));
});
document.querySelector("#toggle-theme")?.addEventListener("click", () => {
  theme = { ...theme, mode: theme.mode === "dark" ? "light" : "dark" };
  document.documentElement.dataset.theme = theme.mode;
  themeListeners.forEach((listener) => listener(theme));
});
