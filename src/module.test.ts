import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { activate, deactivate } from "./module";
import type { NativePermissionSummary, RuntimeModuleHostSdkV12, RuntimeSqlValue, SupportedLocale, ThemeState } from "./sdk";

function hostSdk() {
  let showDetails = true;
  let theme: ThemeState = { mode: "light", preset: "neutral" };
  let userVersion = 0;
  let records = 0;
  const settingListeners = new Set<() => void>();
  const themeListeners = new Set<(value: ThemeState) => void>();
  const localeListeners = new Set<(value: SupportedLocale) => void>();
  const eventListeners = new Set<(event: { eventId: string; payload: unknown }) => void>();
  let locale: SupportedLocale = "zh-CN";
  const logger = {
    trace: vi.fn(async () => undefined),
    debug: vi.fn(async () => undefined),
    info: vi.fn(async () => undefined),
    warn: vi.fn(async () => undefined),
    error: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
  };
  const transaction = vi.fn(async () => []);
  const execute = vi.fn(async () => {
    records += 1;
    return { rowsAffected: 1, lastInsertId: records };
  });
  const select = vi.fn();
  const privateFiles = new Map<string, number[]>();
  const expose = vi.fn(() => () => undefined);
  const publish = vi.fn((eventId: string, payload?: unknown) => {
    queueMicrotask(() => {
      eventListeners.forEach((listener) => listener({ eventId, payload: payload ?? null }));
    });
  });
  const subscribe = vi.fn((eventId: string, listener: (event: { eventId: string; payload: unknown }) => void) => {
    if (eventId !== "starter.changed.v1") throw new Error(`Mock event ${eventId} is not declared.`);
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  });
  const showNotification = vi.fn(async () => undefined);
  const exportBackup = vi.fn(async () => ({ grantId: "starter-module:backup.mtbk:64", displayName: "backup.mtbk", size: 64 }));
  const importBackup = vi.fn(async () => undefined);
  const readClipboard = vi.fn(async () => "starter-module");
  const writeClipboard = vi.fn(async () => undefined);
  const confirmDialog = vi.fn(async () => true);
  const promptDialog = vi.fn(async () => "answer");
  const fetchHttp = vi.fn(async () => ({ status: 200, headers: [["content-type", "text/plain"]] as Array<[string, string]>, body: [104, 105], truncated: false }));
  const sdk: RuntimeModuleHostSdkV12 = {
    sdkVersion: 12,
    hostVersion: "0.3.0",
    module: { id: "starter-module", version: "0.1.0" },
    logger,
    settings: {
      get: <T,>(id: string, fallback: T) => (id === "showDetails" ? showDetails : fallback) as T,
      set: (_id, value) => {
        showDetails = Boolean(value);
        settingListeners.forEach((listener) => listener());
      },
      subscribe: (listener) => {
        settingListeners.add(listener);
        return () => settingListeners.delete(listener);
      },
    },
    theme: {
      get: () => theme,
      subscribe: (listener) => {
        themeListeners.add(listener);
        return () => themeListeners.delete(listener);
      },
    },
    i18n: {
      getLocale: () => locale,
      subscribe: (listener) => {
        localeListeners.add(listener);
        return () => localeListeners.delete(listener);
      },
    },
    database: {
      execute,
      async select<T extends Record<string, RuntimeSqlValue>>() {
        select();
        return [{ count: records }] as unknown as T[];
      },
      transaction,
      getUserVersion: vi.fn(async () => userVersion),
      setUserVersion: vi.fn(async (version) => {
        userVersion = version;
      }),
    },
    filesystem: {
      readPrivate: vi.fn(async (path) => privateFiles.get(path) ?? []),
      writePrivate: vi.fn(async (path, data) => { privateFiles.set(path, [...data]); return data.length; }),
      listGrants: vi.fn(async () => []),
      readGrant: vi.fn(async () => []),
      writeGrant: vi.fn(async () => 0),
      listDirectory: vi.fn(async () => []),
      revokeGrant: vi.fn(async () => undefined),
    },
    process: {
      openUrl: vi.fn(async () => undefined),
      openPath: vi.fn(async () => undefined),
      revealInFolder: vi.fn(async () => undefined),
      run: vi.fn(async () => ({ code: 0, stdout: "", stderr: "", timedOut: false })),
    },
    registry: { read: vi.fn(), write: vi.fn(), deleteValue: vi.fn() },
    tray: { update: vi.fn(async () => undefined), onAction: vi.fn(async () => () => undefined) },
    shortcuts: { list: vi.fn(async () => []), rebind: vi.fn(async () => []), disable: vi.fn(async () => []), onTrigger: vi.fn(async () => () => undefined) },
    services: {
      expose,
      available: vi.fn(() => false),
      async call() { throw new Error("Mock dependency service is unavailable"); },
    },
    events: { publish, subscribe },
    notifications: { show: showNotification },
    data: { exportBackup, importBackup },
    clipboard: { readText: readClipboard, writeText: writeClipboard },
    dialogs: { confirm: confirmDialog, prompt: promptDialog },
    http: { fetch: fetchHttp },
    moduleRepository: {
      chooseDirectory: vi.fn(async () => ({
        id: "repository-grant",
        moduleId: "starter-module",
        displayName: "module-market",
        kind: "directory" as const,
        access: { read: true, write: false, list: true, execute: false },
      })),
      scan: vi.fn(async () => []),
      install: vi.fn(async () => ({
        moduleId: "sample-module",
        version: "0.1.0",
        selectedVersion: "0.1.0",
        status: "active" as const,
        packageInstalled: true,
        planChanged: true,
      })),
      previewInstallPlan: vi.fn(async (_grantId, fileName) => ({
        planId: `plan:${fileName}`,
        targetModuleId: "sample-module",
        targetVersion: "0.1.0",
        executable: !fileName.includes("blocked"),
        entries: [],
        activationOrder: [],
        diagnostics: fileName.includes("blocked") ? [{
          code: "missing_dependency",
          moduleId: "sample-module",
          dependencyId: "missing-module",
          requiredVersion: "^1.0.0",
          availableVersions: [],
          relatedModules: [],
        }] : [],
      })),
      executeInstallPlan: vi.fn(async (_grantId, planId) => {
        if (planId.includes("stale")) throw new Error("stale_plan");
        return { targetModuleId: "sample-module", planChanged: true, modules: [] };
      }),
    },
  };
  return {
    sdk,
    logger,
    database: { execute, select, transaction },
    services: { expose },
    events: { publish, subscribe },
    notifications: { show: showNotification },
    data: { exportBackup, importBackup },
    clipboard: { readText: readClipboard, writeText: writeClipboard },
    dialogs: { confirm: confirmDialog, prompt: promptDialog },
    http: { fetch: fetchHttp },
    setTheme(next: ThemeState) {
      theme = next;
      themeListeners.forEach((listener) => listener(theme));
    },
    setLocale(next: SupportedLocale) {
      locale = next;
      localeListeners.forEach((listener) => listener(locale));
    },
  };
}

afterEach(async () => {
  document.body.replaceChildren();
  await deactivate();
});

describe("standalone starter module", () => {
  it("keeps V8-V12 native permission summaries representable in the SDK snapshot", () => {
    const summaries: NativePermissionSummary[] = [
      { kind: "notifications" },
      { kind: "clipboard" },
      { kind: "http", origins: ["https://example.com"] },
    ];

    expect(summaries).toHaveLength(3);
  });

  it("redacts clipboard values and HTTP URLs in the development host logs", async () => {
    const source = await readFile(path.join(process.cwd(), "src", "dev.ts"), "utf8");

    expect(source).toContain("Mock clipboard write requested");
    expect(source).toContain("Mock http fetch requested");
    expect(source).not.toContain("Mock clipboard write: ${text}");
    expect(source).not.toContain("Mock http fetch: ${options.url}");
  });

  it("activates with Host SDK V12, registers its service and event subscription, and verifies private storage", async () => {
    const host = hostSdk();

    await activate(host.sdk);

    expect(customElements.get("starter-module-page")).toBeDefined();
    expect(host.logger.info).toHaveBeenCalledWith("Starter module activated");
    expect(host.database.transaction).toHaveBeenCalledWith([expect.objectContaining({ sql: expect.stringContaining("CREATE TABLE") })]);
    expect(host.database.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO module_events"), ["activation"]);
    expect(host.sdk.filesystem.writePrivate).toHaveBeenCalledWith("verification/activation.txt", expect.any(Array));
    expect(host.sdk.filesystem.readPrivate).toHaveBeenCalledWith("verification/activation.txt");
    expect(host.sdk.tray.onAction).toHaveBeenCalledOnce();
    expect(host.sdk.shortcuts.onTrigger).toHaveBeenCalledOnce();
    expect(host.services.expose).toHaveBeenCalledWith("starter.v1", expect.objectContaining({ ping: expect.any(Function) }));
    expect(host.events.subscribe).toHaveBeenCalledWith("starter.changed.v1", expect.any(Function));
  });

  it("publishes a starter change event when a record is stored and the subscription receives it", async () => {
    const host = hostSdk();
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);
    await vi.waitFor(() => expect(page.shadowRoot?.textContent).toContain("SQLite"));

    page.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="database"]')?.click();
    await vi.waitFor(() => expect(host.events.publish).toHaveBeenCalledWith("starter.changed.v1", expect.objectContaining({ kind: "record" })));
    await vi.waitFor(() => expect(host.logger.info).toHaveBeenCalledWith("Starter change event received"));
  });

  it("sends a system notification through the Host SDK and logs the outcome", async () => {
    const host = hostSdk();
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);
    await vi.waitFor(() => expect(page.shadowRoot?.textContent).toContain("SQLite"));

    page.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="notify"]')?.click();
    await vi.waitFor(() => expect(host.notifications.show).toHaveBeenCalledWith(expect.objectContaining({ body: expect.any(String) })));
    await vi.waitFor(() => expect(host.logger.info).toHaveBeenCalledWith("System notification sent"));
  });

  it("writes module text to the clipboard through the Host SDK", async () => {
    const host = hostSdk();
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);
    await vi.waitFor(() => expect(page.shadowRoot?.textContent).toContain("SQLite"));

    page.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="copy"]')?.click();
    await vi.waitFor(() => expect(host.clipboard.writeText).toHaveBeenCalledWith("starter-module"));
    await vi.waitFor(() => expect(host.logger.info).toHaveBeenCalledWith("Module id copied to clipboard"));
  });

  it("opens a confirm dialog through the Host SDK and logs the result", async () => {
    const host = hostSdk();
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);
    await vi.waitFor(() => expect(page.shadowRoot?.textContent).toContain("SQLite"));

    page.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click();
    await vi.waitFor(() => expect(host.dialogs.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String) })));
    await vi.waitFor(() => expect(host.logger.info).toHaveBeenCalledWith("User confirmed dialog"));
  });

  it("fetches a declared origin through the Host SDK and logs the status", async () => {
    const host = hostSdk();
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);
    await vi.waitFor(() => expect(page.shadowRoot?.textContent).toContain("SQLite"));

    page.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="fetch"]')?.click();
    await vi.waitFor(() => expect(host.http.fetch).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com" })));
    await vi.waitFor(() => expect(host.logger.info).toHaveBeenCalledWith(expect.stringContaining("200")));
  });

  it("provides a typed mock repository boundary for browser development", async () => {
    const host = hostSdk();
    const grant = await host.sdk.moduleRepository.chooseDirectory();
    if (!grant) throw new Error("expected mock repository grant");
    await host.sdk.moduleRepository.scan(grant.id);
    await host.sdk.moduleRepository.install(grant.id, "sample-module-0.1.0.mtp");
    const plan = await host.sdk.moduleRepository.previewInstallPlan(grant.id, "sample-module-0.1.0.mtp");
    await host.sdk.moduleRepository.executeInstallPlan(grant.id, plan.planId);

    expect(host.sdk.moduleRepository.scan).toHaveBeenCalledWith("repository-grant");
    expect(host.sdk.moduleRepository.install).toHaveBeenCalledWith("repository-grant", "sample-module-0.1.0.mtp");
    expect(host.sdk.moduleRepository.previewInstallPlan).toHaveBeenCalledWith("repository-grant", "sample-module-0.1.0.mtp");
    expect(host.sdk.moduleRepository.executeInstallPlan).toHaveBeenCalledWith("repository-grant", "plan:sample-module-0.1.0.mtp");
  });

  it("simulates blocked and stale dependency plans", async () => {
    const host = hostSdk();
    const blocked = await host.sdk.moduleRepository.previewInstallPlan("repository-grant", "blocked.mtp");
    expect(blocked.executable).toBe(false);
    expect(blocked.diagnostics[0]?.code).toBe("missing_dependency");
    await expect(host.sdk.moduleRepository.executeInstallPlan("repository-grant", "stale-plan"))
      .rejects.toThrow("stale_plan");
  });

  it("runs only an executable selected through an opaque grant", async () => {
    const host = hostSdk();
    vi.mocked(host.sdk.filesystem.listGrants).mockResolvedValue([{
      id: "grant-1",
      moduleId: "starter-module",
      displayName: "whoami.exe",
      kind: "executable",
      access: { read: false, write: false, list: false, execute: true },
    }]);
    vi.mocked(host.sdk.process.run).mockResolvedValue({ code: 0, stdout: "test-user\n", stderr: "", timedOut: false });
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);

    (page.shadowRoot?.querySelector('[data-action="process"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(page.shadowRoot?.textContent).toContain("test-user"));

    expect(host.sdk.process.run).toHaveBeenCalledWith("grant-1", [], 5_000);
    expect(host.logger.info).toHaveBeenCalledWith("Executable launch completed code=0");
  });

  it("logs successful and recoverable example operations through the Host SDK", async () => {
    const host = hostSdk();
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);
    await vi.waitFor(() => expect(page.shadowRoot?.textContent).toContain("SQLite"));

    page.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="database"]')?.click();
    await vi.waitFor(() => expect(host.logger.info).toHaveBeenCalledWith("Starter record stored"));

    page.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="process"]')?.click();
    await vi.waitFor(() => expect(host.logger.warn).toHaveBeenCalledWith("Executable launch skipped: no grant"));
  });

  it("logs a safe failure message without exposing raw process errors", async () => {
    const host = hostSdk();
    vi.mocked(host.sdk.filesystem.listGrants).mockResolvedValue([{
      id: "grant-secret",
      moduleId: "starter-module",
      displayName: "private-tool.exe",
      kind: "executable",
      access: { read: false, write: false, list: false, execute: true },
    }]);
    vi.mocked(host.sdk.process.run).mockRejectedValue(new Error("C:\\private\\token.exe failed with secret"));
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);

    page.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="process"]')?.click();
    await vi.waitFor(() => expect(host.logger.error).toHaveBeenCalledWith("Executable launch failed"));
    expect(JSON.stringify(host.logger.error.mock.calls)).not.toContain("private\\token.exe");
    expect(JSON.stringify(host.logger.error.mock.calls)).not.toContain("secret");
  });

  it("updates rendered details when namespaced settings change", async () => {
    const host = hostSdk();
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);

    expect(page.shadowRoot?.textContent).toContain("Host");
    expect(page.shadowRoot?.textContent).toContain("0.3.0");
    host.sdk.settings.set("showDetails", false);
    expect(page.shadowRoot?.textContent).not.toContain("0.3.0");
  });

  it("renders Chinese and English from the Host SDK locale subscription", async () => {
    const host = hostSdk();
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);

    expect(page.shadowRoot?.textContent).toContain("独立模块已就绪");
    host.setLocale("en");
    expect(page.shadowRoot?.textContent).toContain("Standalone module ready");
    expect(page.shadowRoot?.textContent).not.toContain("独立模块已就绪");
  });

  it("reflects subscribed theme changes and cleans up when disconnected", async () => {
    const host = hostSdk();
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);

    host.setTheme({ mode: "dark", preset: "neutral" });
    expect(page.shadowRoot?.querySelector("article")?.getAttribute("data-theme-mode")).toBe("dark");

    page.remove();
    expect(() => host.setTheme({ mode: "light", preset: "neutral" })).not.toThrow();
  });
});
