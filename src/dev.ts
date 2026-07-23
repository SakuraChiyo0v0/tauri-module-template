import { activate } from "./module";
import type {
  LogLevel,
  RuntimeModuleEventEnvelope,
  RuntimeModuleHostSdkV12,
  RuntimeServiceHandler,
  RuntimeSqlValue,
  SupportedLocale,
  ThemeState,
} from "./sdk";

const settingListeners = new Set<() => void>();
const themeListeners = new Set<(theme: ThemeState) => void>();
const localeListeners = new Set<(locale: SupportedLocale) => void>();
const settingKey = "starter-module.dev.settings";
const databaseKey = "starter-module.dev.database";
let theme: ThemeState = { mode: "light", preset: "neutral" };
let locale: SupportedLocale = "zh-CN";
const privateFiles = new Map<string, number[]>();
const exposedServices = new Map<string, Record<string, RuntimeServiceHandler>>();
const eventListeners = new Map<string, Set<(event: RuntimeModuleEventEnvelope) => void>>();

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

const hostSdk: RuntimeModuleHostSdkV12 = {
  sdkVersion: 12,
  hostVersion: "0.3.0-dev",
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
  i18n: {
    getLocale: () => locale,
    subscribe(listener) {
      localeListeners.add(listener);
      return () => localeListeners.delete(listener);
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
  filesystem: {
    async readPrivate(path) { return privateFiles.get(path) ?? []; },
    async writePrivate(path, data) { privateFiles.set(path, [...data]); return data.length; },
    async listGrants() { return []; },
    async readGrant() { throw new Error("Mock grant is unavailable"); },
    async writeGrant() { throw new Error("Mock grant is unavailable"); },
    async listDirectory() { return []; },
    async revokeGrant() {},
  },
  process: {
    async openUrl(url) { log("info", `Mock open URL: ${url}`); },
    async openPath(grantId) { log("info", `Mock open granted file: ${grantId}`); },
    async revealInFolder(grantId) { log("info", `Mock reveal granted file: ${grantId}`); },
    async run() { throw new Error("Mock process execution is unavailable"); },
  },
  registry: {
    async read() { throw new Error("Mock registry is unavailable"); },
    async write() { throw new Error("Mock registry is unavailable"); },
    async deleteValue() { throw new Error("Mock registry is unavailable"); },
  },
  tray: { async update() {}, async onAction() { return () => undefined; } },
  shortcuts: {
    async list() { return [{ shortcutId: "show-main", accelerator: "Ctrl+Shift+M", state: "registered" as const }]; },
    async rebind() { return []; },
    async disable() { return []; },
    async onTrigger() { return () => undefined; },
  },
  services: {
    expose(serviceId, handlers) {
      if (exposedServices.has(serviceId)) throw new Error(`Mock service already registered: ${serviceId}`);
      exposedServices.set(serviceId, handlers);
      return () => exposedServices.delete(serviceId);
    },
    available() { return false; },
    async call(providerModuleId: string, serviceId: string, method: string) {
      throw new Error(`Mock dependency service is unavailable: ${providerModuleId}/${serviceId}.${method}`);
    },
  },
  events: {
    publish(eventId, payload = null) {
      const listeners = eventListeners.get(eventId);
      if (!listeners) return;
      const envelope = { eventId, publisherModuleId: "starter-module", publishedAt: new Date().toISOString(), payload };
      queueMicrotask(() => listeners.forEach((listener) => {
        try { listener(envelope); } catch { log("error", `Mock event listener for ${eventId} failed`); }
      }));
    },
    subscribe(eventId, listener) {
      let listeners = eventListeners.get(eventId);
      if (!listeners) { listeners = new Set(); eventListeners.set(eventId, listeners); }
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  },
  notifications: {
    async show(notification: { title: string; body?: string }) {
      log("info", `Mock notification: ${notification.title}${notification.body ? ` — ${notification.body}` : ""}`);
    },
  },
  data: {
    async exportBackup() {
      log("info", "Mock data export (no disk write)");
      return { grantId: "starter-module:mock.mtbk:0", displayName: "mock.mtbk", size: 0 };
    },
    async importBackup() {
      log("info", "Mock data import (no disk write)");
    },
  },
  clipboard: {
    async readText() { log("info", "Mock clipboard read"); return "starter-module"; },
    async writeText(text: string) { log("info", `Mock clipboard write: ${text}`); },
  },
  dialogs: {
    async confirm(options) { log("info", `Mock confirm: ${options.title}`); return true; },
    async prompt(options) { log("info", `Mock prompt: ${options.title}`); return options.defaultValue ?? ""; },
  },
  http: {
    async fetch(options) {
      log("info", `Mock http fetch: ${options.url}`);
      return { status: 200, headers: [["content-type", "text/plain"]], body: [104, 105], truncated: false };
    },
  },
  moduleRepository: {
    async chooseDirectory() {
      return {
        id: "mock-repository-grant",
        moduleId: "starter-module",
        displayName: "mock-module-market",
        kind: "directory",
        access: { read: true, write: false, list: true, execute: false },
      };
    },
    async scan() {
      return [{
        fileName: "sample-module-0.1.0.mtp",
        manifest: {
          schemaVersion: 2,
          id: "sample-module",
          name: { "zh-CN": "示例模块", en: "Sample Module" },
          description: { "zh-CN": "浏览器预览数据", en: "Browser preview data" },
          version: "0.1.0",
          hostVersion: ">=0.3.0, <0.4.0",
          sdkVersion: 8,
          entry: "index.js",
          dependencies: { required: [], optional: [] },
          navigation: [],
          settings: [],
        },
        installedVersion: null,
        status: "not_installed",
        permissionSummary: [],
        error: null,
      }];
    },
    async install(_grantId, _fileName) {
      return {
        moduleId: "sample-module",
        version: "0.1.0",
        selectedVersion: "0.1.0",
        status: "active",
        packageInstalled: true,
        planChanged: true,
      };
    },
    async previewInstallPlan(_grantId, fileName) {
      const blocked = fileName.includes("blocked");
      return {
        planId: `mock-plan:${fileName}`,
        targetModuleId: "sample-module",
        targetVersion: "0.1.0",
        executable: !blocked,
        entries: blocked ? [] : [{
          moduleId: "sample-module",
          name: { "zh-CN": "示例模块", en: "Sample Module" },
          version: "0.1.0",
          currentVersion: null,
          action: "install",
          requiredDependencies: [],
          permissionSummary: [],
          requiresPermissionApproval: false,
        }],
        activationOrder: blocked ? [] : ["sample-module"],
        diagnostics: blocked ? [{
          code: "missing_dependency",
          moduleId: "sample-module",
          dependencyId: "missing-module",
          requiredVersion: "^1.0.0",
          availableVersions: [],
          relatedModules: [],
        }] : [],
      };
    },
    async executeInstallPlan(_grantId, planId) {
      if (planId.includes("stale")) throw new Error("stale_plan");
      return {
        targetModuleId: "sample-module",
        planChanged: true,
        modules: [{ moduleId: "sample-module", version: "0.1.0", status: "active" }],
      };
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
document.querySelector("#toggle-locale")?.addEventListener("click", () => {
  locale = locale === "zh-CN" ? "en" : "zh-CN";
  document.documentElement.lang = locale;
  localeListeners.forEach((listener) => listener(locale));
});
document.querySelector("#call-service")?.addEventListener("click", async () => {
  const result = await exposedServices.get("starter.v1")?.ping?.({ source: "preview" });
  await log("info", `Mock service result: ${JSON.stringify(result)}`);
});
