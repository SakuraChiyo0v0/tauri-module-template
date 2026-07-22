import type { RuntimeModuleHostSdkV3, ThemeState } from "./sdk";

const ELEMENT_NAME = "starter-module-page";
let activeHost: RuntimeModuleHostSdkV3 | undefined;
let unsubscribeTray: (() => void) | undefined;
let unsubscribeShortcut: (() => void) | undefined;

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
  #theme?: ThemeState;
  #count = 0;
  #databaseRecords?: number;
  #processResult = "Grant an executable in Module Manager to test controlled process launch.";

  connectedCallback() {
    const host = activeHost;
    if (!host) {
      this.#root.textContent = "Module host is unavailable.";
      return;
    }

    this.#theme = host.theme.get();
    this.#unsubscribeSettings = host.settings.subscribe(() => this.#render());
    this.#unsubscribeTheme = host.theme.subscribe((theme) => {
      this.#theme = theme;
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
    this.#unsubscribeSettings = undefined;
    this.#unsubscribeTheme = undefined;
  }

  #render() {
    const host = activeHost;
    if (!host) return;
    const showDetails = host.settings.get("showDetails", true);
    const theme = this.#theme ?? host.theme.get();
    const details = showDetails
      ? `<dl><div><dt>Module</dt><dd>${escapeHtml(host.module.id)}@${escapeHtml(host.module.version)}</dd></div><div><dt>Host</dt><dd>${escapeHtml(host.hostVersion)}</dd></div><div><dt>SQLite</dt><dd>${this.#databaseRecords ?? "loading"} records</dd></div><div><dt>Private file</dt><dd>Host SDK V3</dd></div></dl>`
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
        <h2>Standalone module ready</h2>
        <p>This business-neutral page verifies routing, settings, theme, logs and local UI state.</p>
        ${details}
        <div class="actions">
          <button type="button" data-action="database">Store test record · local count ${this.#count}</button>
          <button type="button" data-action="process">Run granted executable</button>
        </div>
        <p class="process-result">${escapeHtml(this.#processResult)}</p>
      </article>
    `;
    this.#root.querySelector('[data-action="database"]')?.addEventListener("click", async () => {
      this.#count += 1;
      this.#render();
      await host.database.execute("INSERT INTO module_events (kind) VALUES (?1)", ["button"]);
      await this.#loadDatabaseRecords();
    });
    this.#root.querySelector('[data-action="process"]')?.addEventListener("click", async () => {
      try {
        const grant = (await host.filesystem.listGrants()).find((item) => item.kind === "executable");
        if (!grant) {
          this.#processResult = "No executable grant is available.";
        } else {
          const result = await host.process.run(grant.id, [], 5_000);
          this.#processResult = result.stdout.trim() || result.stderr.trim() || `Process exited with code ${result.code}.`;
        }
      } catch (error) {
        this.#processResult = error instanceof Error ? error.message : String(error);
      }
      this.#render();
    });
  }
}

export async function activate(hostSdk: RuntimeModuleHostSdkV3) {
  if (hostSdk.sdkVersion !== 3) throw new Error(`Unsupported Host SDK version: ${hostSdk.sdkVersion}`);
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
  activeHost = hostSdk;
  if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, StarterModulePage);
  await hostSdk.logger.info("Starter module activated");
}

export async function deactivate() {
  if (activeHost) await activeHost.logger.info("Starter module deactivated");
  unsubscribeTray?.();
  unsubscribeShortcut?.();
  unsubscribeTray = undefined;
  unsubscribeShortcut = undefined;
  activeHost = undefined;
}
