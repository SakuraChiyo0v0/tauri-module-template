import { afterEach, describe, expect, it, vi } from "vitest";
import { activate, deactivate } from "./module";
import type { RuntimeModuleHostSdkV4, RuntimeSqlValue, SupportedLocale, ThemeState } from "./sdk";

function hostSdk() {
  let showDetails = true;
  let theme: ThemeState = { mode: "light", preset: "neutral" };
  let userVersion = 0;
  let records = 0;
  const settingListeners = new Set<() => void>();
  const themeListeners = new Set<(value: ThemeState) => void>();
  const localeListeners = new Set<(value: SupportedLocale) => void>();
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
  const sdk: RuntimeModuleHostSdkV4 = {
    sdkVersion: 4,
    hostVersion: "0.2.0",
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
  };
  return {
    sdk,
    logger,
    database: { execute, select, transaction },
    services: { expose },
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
  it("activates with Host SDK V4, registers its service and verifies private storage", async () => {
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
  });

  it("runs only an executable selected through an opaque grant", async () => {
    const host = hostSdk();
    vi.mocked(host.sdk.filesystem.listGrants).mockResolvedValue([{
      id: "grant-1",
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
  });

  it("updates rendered details when namespaced settings change", async () => {
    const host = hostSdk();
    await activate(host.sdk);
    const page = document.createElement("starter-module-page");
    document.body.append(page);

    expect(page.shadowRoot?.textContent).toContain("Host");
    expect(page.shadowRoot?.textContent).toContain("0.2.0");
    host.sdk.settings.set("showDetails", false);
    expect(page.shadowRoot?.textContent).not.toContain("0.2.0");
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
