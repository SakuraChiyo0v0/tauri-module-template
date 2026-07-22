import { afterEach, describe, expect, it, vi } from "vitest";
import { activate, deactivate } from "./module";
import type { RuntimeModuleHostSdkV2, RuntimeSqlValue, ThemeState } from "./sdk";

function hostSdk() {
  let showDetails = true;
  let theme: ThemeState = { mode: "light", preset: "neutral" };
  let userVersion = 0;
  let records = 0;
  const settingListeners = new Set<() => void>();
  const themeListeners = new Set<(value: ThemeState) => void>();
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
  const sdk: RuntimeModuleHostSdkV2 = {
    sdkVersion: 2,
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
  };
  return {
    sdk,
    logger,
    database: { execute, select, transaction },
    setTheme(next: ThemeState) {
      theme = next;
      themeListeners.forEach((listener) => listener(theme));
    },
  };
}

afterEach(async () => {
  document.body.replaceChildren();
  await deactivate();
});

describe("standalone starter module", () => {
  it("activates with Host SDK V2 and defines the declared custom element", async () => {
    const host = hostSdk();

    await activate(host.sdk);

    expect(customElements.get("starter-module-page")).toBeDefined();
    expect(host.logger.info).toHaveBeenCalledWith("Starter module activated");
    expect(host.database.transaction).toHaveBeenCalledWith([expect.objectContaining({ sql: expect.stringContaining("CREATE TABLE") })]);
    expect(host.database.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO module_events"), ["activation"]);
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
