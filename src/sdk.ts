export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";
export type ColorMode = "system" | "light" | "dark";
export type ThemePresetId = "neutral" | "ocean";
export type SupportedLocale = "zh-CN" | "en";

export interface ThemeState {
  mode: ColorMode;
  preset: ThemePresetId;
}

export interface RuntimeModuleLogger {
  trace(message: string): Promise<void>;
  debug(message: string): Promise<void>;
  info(message: string): Promise<void>;
  warn(message: string): Promise<void>;
  error(message: string): Promise<void>;
  write(level: LogLevel, message: string): Promise<void>;
}

export type RuntimeSqlValue = null | boolean | number | string | number[];

export interface RuntimeDatabaseStatement {
  sql: string;
  params?: RuntimeSqlValue[];
}

export interface RuntimeDatabaseExecuteResult {
  rowsAffected: number;
  lastInsertId: number;
}

export type RuntimeServiceValue =
  | null
  | boolean
  | number
  | string
  | RuntimeServiceValue[]
  | { [key: string]: RuntimeServiceValue };

export type RuntimeServiceHandler = (
  input: RuntimeServiceValue,
) => RuntimeServiceValue | Promise<RuntimeServiceValue>;

export interface RuntimeModuleHostSdkV4 {
  readonly sdkVersion: 4;
  readonly hostVersion: string;
  readonly module: {
    readonly id: string;
    readonly version: string;
  };
  readonly logger: RuntimeModuleLogger;
  readonly settings: {
    get<T>(settingId: string, defaultValue: T): T;
    set(settingId: string, value: unknown): void;
    subscribe(listener: () => void): () => void;
  };
  readonly theme: {
    get(): ThemeState;
    subscribe(listener: (theme: ThemeState) => void): () => void;
  };
  readonly i18n: {
    getLocale(): SupportedLocale;
    subscribe(listener: (locale: SupportedLocale) => void): () => void;
  };
  readonly database: {
    execute(sql: string, params?: RuntimeSqlValue[]): Promise<RuntimeDatabaseExecuteResult>;
    select<T extends Record<string, RuntimeSqlValue>>(sql: string, params?: RuntimeSqlValue[]): Promise<T[]>;
    transaction(statements: RuntimeDatabaseStatement[]): Promise<RuntimeDatabaseExecuteResult[]>;
    getUserVersion(): Promise<number>;
    setUserVersion(version: number): Promise<void>;
  };
  readonly filesystem: {
    readPrivate(path: string): Promise<number[]>;
    writePrivate(path: string, data: number[]): Promise<number>;
    listGrants(): Promise<Array<{
      id: string;
      displayName: string;
      kind: "file" | "directory" | "executable";
      access: { read: boolean; write: boolean; list: boolean; execute: boolean };
    }>>;
    readGrant(grantId: string): Promise<number[]>;
    writeGrant(grantId: string, data: number[]): Promise<number>;
    listDirectory(grantId: string): Promise<Array<{ name: string; kind: "file" | "directory" | "executable" }>>;
    revokeGrant(grantId: string): Promise<void>;
  };
  readonly process: {
    openUrl(url: string): Promise<void>;
    openPath(grantId: string): Promise<void>;
    revealInFolder(grantId: string): Promise<void>;
    run(grantId: string, arguments_?: string[], timeoutMs?: number): Promise<{
      code: number | null; stdout: string; stderr: string; timedOut: boolean;
    }>;
  };
  readonly registry: {
    read(hive: "HKCU" | "HKLM", key: string, name: string): Promise<unknown>;
    write(key: string, name: string, value: unknown): Promise<void>;
    deleteValue(key: string, name: string): Promise<void>;
  };
  readonly tray: {
    update(itemId: string, update: { label?: string; enabled?: boolean; checked?: boolean }): Promise<void>;
    onAction(listener: (itemId: string) => void): Promise<() => void>;
  };
  readonly shortcuts: {
    list(): Promise<Array<{ shortcutId: string; accelerator: string | null; state: "registered" | "conflict" | "disabled" }>>;
    rebind(shortcutId: string, accelerator: string): Promise<unknown[]>;
    disable(shortcutId: string): Promise<unknown[]>;
    onTrigger(listener: (shortcutId: string) => void): Promise<() => void>;
  };
  readonly services: {
    expose(serviceId: string, handlers: Record<string, RuntimeServiceHandler>): () => void;
    available(providerModuleId: string, serviceId: string): boolean;
    call<T extends RuntimeServiceValue = RuntimeServiceValue>(
      providerModuleId: string,
      serviceId: string,
      method: string,
      input?: RuntimeServiceValue,
    ): Promise<T>;
  };
}

export interface RuntimeModuleExports {
  activate(hostSdk: RuntimeModuleHostSdkV4): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
