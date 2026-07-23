import type { RuntimeModuleHostSdkV5, SupportedLocale, ThemeState } from "./sdk";

const ELEMENT_NAME = "starter-module-page";
let activeHost: RuntimeModuleHostSdkV5 | undefined;
let unsubscribeTray: (() => void) | undefined;
let unsubscribeShortcut: (() => void) | undefined;
let unregisterService: (() => void) | undefined;

const messages = {
  title: { "zh-CN": "独立模块已就绪", en: "Standalone module ready" },
  description: { "zh-CN": "这个无业务页面用于验证路由、设置、主题、日志和本地 UI 状态。", en: "This business-neutral page verifies routing, settings, theme, logs and local UI state." },
  module: { "zh-CN": "模块", en: "Module" },
  host: { "zh-CN": "宿主", en: "Host" },
  sqlite: { "zh-CN": "SQLite", en: "SQLite" },
  privateFile: { "zh-CN": "私有文件", en: "Private file" },
  loadingRecords: { "zh-CN": "加载中", en: "loading" },
  records: { "zh-CN": "{count} 条记录", en: "{count} records" },
  storeRecord: { "zh-CN": "保存测试记录 · 本地计数 {count}", en: "Store test record · local count {count}" },
  runExecutable: { "zh-CN": "运行已授权程序", en: "Run granted executable" },
  grantHelp: { "zh-CN": "在模块管理中授权一个可执行文件，以测试受控进程启动。", en: "Grant an executable in Module Manager to test controlled process launch." },
  noGrant: { "zh-CN": "没有可用的可执行文件授权。", en: "No executable grant is available." },
  processExit: { "zh-CN": "进程退出码：{code}。", en: "Process exited with code {code}." },
} as const;

type MessageKey = keyof typeof messages;

function translate(locale: SupportedLocale, key: MessageKey, params: Record<string, string | number> = {}) {
  return Object.entries(params).reduce(
    (message, [name, value]) => message.split(`{${name}}`).join(String(value)),
    messages[key][locale] as string,
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  })[character] as string);
}

class StarterModulePage extends HTMLElement {
  readonly #root = this.attachShadow({ mode: "open" });
  #unsubscribeSettings?: () => void;
  #unsubscribeTheme?: () => void;
  #unsubscribeLocale?: () => void;
  #theme?: ThemeState;
  #locale: SupportedLocale = "zh-CN";
  #count = 0;
  #databaseRecords?: number;
  #processResult: { key: MessageKey; params?: Record<string, string | number> } | { raw: string } = { key: "grantHelp" };

  connectedCallback() {
    const host = activeHost;
    if (!host) {
      this.#root.textContent = "Module host is unavailable.";
      return;
    }

    this.#theme = host.theme.get();
    this.#locale = host.i18n.getLocale();
    this.#unsubscribeSettings = host.settings.subscribe(() => this.#render());
    this.#unsubscribeTheme = host.theme.subscribe((theme) => {
      this.#theme = theme;
      this.#render();
    });
    this.#unsubscribeLocale = host.i18n.subscribe((locale) => {
      this.#locale = locale;
      this.#render();
    });
    this.#render();
    void this.#loadDatabaseRecords();
  }

  async #loadDatabaseRecords() {
    const host = activeHost;
    if (!host) return;
    const rows = await host.database.select<{ count: number }>("SELECT COUNT(*) AS count FROM module_events");
    this.#databaseRecords = rows[0]?.count ?? 0;
    this.#render();
  }

  disconnectedCallback() {
    this.#unsubscribeSettings?.();
    this.#unsubscribeTheme?.();
    this.#unsubscribeLocale?.();
    this.#unsubscribeSettings = undefined;
    this.#unsubscribeTheme = undefined;
    this.#unsubscribeLocale = undefined;
  }

  #render() {
    const host = activeHost;
    if (!host) return;
    const showDetails = host.settings.get("showDetails", true);
    const theme = this.#theme ?? host.theme.get();
    const locale = this.#locale;
    const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params);
    const databaseRecords = this.#databaseRecords === undefined
      ? t("loadingRecords")
      : t("records", { count: this.#databaseRecords });
    const processResult = "raw" in this.#processResult
      ? this.#processResult.raw
      : t(this.#processResult.key, this.#processResult.params);
    const details = showDetails
      ? `<dl><div><dt>${t("module")}</dt><dd>${escapeHtml(host.module.id)}@${escapeHtml(host.module.version)}</dd></div><div><dt>${t("host")}</dt><dd>${escapeHtml(host.hostVersion)}</dd></div><div><dt>${t("sqlite")}</dt><dd>${escapeHtml(databaseRecords)}</dd></div><div><dt>${t("privateFile")}</dt><dd>Host SDK V5</dd></div></dl>`
      : "";

    this.#root.innerHTML = `
      <style>
        :host { display: block; color: var(--foreground, #111827); font: 14px/1.5 system-ui, sans-serif; }
        article { border: 1px solid var(--border, #d1d5db); border-radius: 12px; padding: 20px; background: var(--card, #ffffff); }
        h2 { margin: 0 0 4px; font-size: 20px; }
        p { margin: 0 0 16px; color: var(--muted-foreground, #6b7280); }
        dl { display: grid; gap: 8px; margin: 16px 0; }
        dl div { display: grid; grid-template-columns: 72px 1fr; gap: 12px; }
        dt { color: var(--muted-foreground, #6b7280); }
        dd { margin: 0; font-family: ui-monospace, monospace; }
        .actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .process-result { margin: 12px 0 0; font-family: ui-monospace, monospace; white-space: pre-wrap; }
        button { border: 0; border-radius: 8px; padding: 8px 12px; background: var(--primary, #111827); color: var(--primary-foreground, #ffffff); cursor: pointer; }
      </style>
      <article data-theme-mode="${escapeHtml(theme.mode)}" data-theme-preset="${escapeHtml(theme.preset)}">
        <h2>${t("title")}</h2>
        <p>${t("description")}</p>
        ${details}
        <div class="actions">
          <button type="button" data-action="database">${t("storeRecord", { count: this.#count })}</button>
          <button type="button" data-action="process">${t("runExecutable")}</button>
        </div>
        <p class="process-result">${escapeHtml(processResult)}</p>
      </article>
    `;
    this.#root.querySelector('[data-action="database"]')?.addEventListener("click", async () => {
      try {
        this.#count += 1;
        this.#render();
        await host.database.execute("INSERT INTO module_events (kind) VALUES (?1)", ["button"]);
        await this.#loadDatabaseRecords();
        await host.logger.info("Starter record stored");
      } catch {
        await host.logger.error("Starter record store failed");
      }
    });
    this.#root.querySelector('[data-action="process"]')?.addEventListener("click", async () => {
      try {
        const grant = (await host.filesystem.listGrants()).find((item) => item.kind === "executable");
        if (!grant) {
          this.#processResult = { key: "noGrant" };
          await host.logger.warn("Executable launch skipped: no grant");
        } else {
          const result = await host.process.run(grant.id, [], 5_000);
          const output = result.stdout.trim() || result.stderr.trim();
          this.#processResult = output ? { raw: output } : { key: "processExit", params: { code: result.code ?? "null" } };
          await host.logger.info(`Executable launch completed code=${result.code ?? "null"}`);
        }
      } catch (error) {
        this.#processResult = { raw: error instanceof Error ? error.message : String(error) };
        await host.logger.error("Executable launch failed");
      }
      this.#render();
    });
  }
}

export async function activate(hostSdk: RuntimeModuleHostSdkV5) {
  if (hostSdk.sdkVersion !== 5) throw new Error(`Unsupported Host SDK version: ${hostSdk.sdkVersion}`);
  const userVersion = await hostSdk.database.getUserVersion();
  if (userVersion < 1) {
    await hostSdk.database.transaction([{
      sql: "CREATE TABLE module_events (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    }]);
    await hostSdk.database.setUserVersion(1);
  }
  await hostSdk.database.execute("INSERT INTO module_events (kind) VALUES (?1)", ["activation"]);
  await hostSdk.filesystem.writePrivate("verification/activation.txt", [...new TextEncoder().encode("ready")]);
  await hostSdk.filesystem.readPrivate("verification/activation.txt");
  unsubscribeTray = await hostSdk.tray.onAction((itemId) => hostSdk.logger.info(`Tray action: ${itemId}`));
  unsubscribeShortcut = await hostSdk.shortcuts.onTrigger((shortcutId) => hostSdk.logger.info(`Shortcut trigger: ${shortcutId}`));
  unregisterService = hostSdk.services.expose("starter.v1", {
    ping: () => ({ status: "ready", moduleVersion: hostSdk.module.version }),
  });
  activeHost = hostSdk;
  if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, StarterModulePage);
  await hostSdk.logger.info("Starter module activated");
}

export async function deactivate() {
  if (activeHost) await activeHost.logger.info("Starter module deactivated");
  unsubscribeTray?.();
  unsubscribeShortcut?.();
  unregisterService?.();
  unsubscribeTray = undefined;
  unsubscribeShortcut = undefined;
  unregisterService = undefined;
  activeHost = undefined;
}
