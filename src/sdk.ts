export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";
export type ColorMode = "system" | "light" | "dark";
export type ThemePresetId = "neutral" | "ocean";

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

export interface RuntimeModuleHostSdkV2 {
  readonly sdkVersion: 2;
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
  readonly database: {
    execute(sql: string, params?: RuntimeSqlValue[]): Promise<RuntimeDatabaseExecuteResult>;
    select<T extends Record<string, RuntimeSqlValue>>(sql: string, params?: RuntimeSqlValue[]): Promise<T[]>;
    transaction(statements: RuntimeDatabaseStatement[]): Promise<RuntimeDatabaseExecuteResult[]>;
    getUserVersion(): Promise<number>;
    setUserVersion(version: number): Promise<void>;
  };
}

export interface RuntimeModuleExports {
  activate(hostSdk: RuntimeModuleHostSdkV2): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
