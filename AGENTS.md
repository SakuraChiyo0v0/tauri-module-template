# Standalone Runtime Module Template rules

This repository builds one independently installable `.mtp` module for Modular Tauri Template.

## Boundaries

- Never import files from the desktop base repository or assume a sibling checkout exists.
- `src/sdk.ts` is the public Host SDK V12 type snapshot. Do not add capabilities that the base does not expose.
- `manifest.json` uses schema V2. Every host-rendered name, description, navigation label, setting label, tray label, and shortcut description must provide non-empty `zh-CN` and `en` values.
- Module-owned page text must provide both Chinese and English, read `hostSdk.i18n.getLocale()` during initial render, and subscribe to language changes without reactivation.
- `src/module.ts` must export `activate(hostSdk)` and may export `deactivate()`.
- Every custom element must begin with the module ID from `manifest.json`.
- Bundle all npm dependencies into the single ESM `build/index.js`.
- Declare only other `.mtp` modules in manifest dependencies; npm packages are build-time dependencies.
- Declare provided services in `services.provides`. Call only modules listed in dependencies, and keep service inputs and outputs JSON-compatible.
- Declare publishable and subscribable events in `events.publishes` and `events.subscribes`. Event subscriptions do not require a module dependency; keep payloads JSON-compatible and never put secrets in event payloads.
- Declare system notifications in `nativeCapabilities.notifications` (`{ system: true }`). Send only user-facing text via `hostSdk.notifications.show`; never attach database content or secrets. The capability requires user approval before activation.
- Use `hostSdk.data.exportBackup()` / `importBackup(grantId)` only for the module's own SQLite and private settings. Modules never see real paths; restore requires the module to be stopped and rejects archives belonging to other modules.
- Declare clipboard text access in `nativeCapabilities.clipboard` (`{ text: true }`). Read/write only plain text via `hostSdk.clipboard`; never log clipboard contents or store them outside the module's own data.
- Use `hostSdk.dialogs.confirm` / `prompt` for confirmations and text input. Content is plain text only; never inject HTML or scripts. Open at most one dialog at a time per module.
- Declare allowed HTTPS origins in `nativeCapabilities.http.origins`. Fetch only declared origins via `hostSdk.http.fetch`; never log full response bodies or credentials, and never attempt private addresses.
- Use semantic CSS variables inherited from the base. Do not hard-code product colors.
- Use parameterized module-private database calls. Never attempt ATTACH, PRAGMA, filesystem paths, or direct access to another module's schema.
- Use only opaque file grants and module-private relative paths. Never import raw Tauri APIs or infer host filesystem paths.
- Repository-capable modules may use only `moduleRepository` opaque directory grants and top-level `.mtp` file names. Never persist or log a real repository path.
- Report lifecycle and key user operations through `hostSdk.logger`; do not use `console` or direct native logging as the only record of an operation.
- Log successful operations at `info`, recoverable outcomes at `warn`, and unexpected failures at `error`. Do not rely on `debug` or `trace` for the only record of a user operation because the host defaults to an `info` threshold.
- Keep log messages stable and minimal. Never log user content, credentials, tokens, complete URLs, filesystem paths, service payloads, or raw error messages; prefer an operation name plus safe results such as a count, record ID, trigger source, or exit code.
- Keep the starter business-neutral and removable.

## Packaging

- Change the manifest module version for real releases.
- `pnpm module:pack -- --version x.y.z` is only for reproducible compatibility/smoke artifacts and must not rewrite the source manifest.
- Never commit `build/`, `dist/`, `.mtp` files, secrets, or installed module data.

## Verification

Run `pnpm check` after module changes. Add focused tests for operation log level and sensitive-data boundaries, and build the same package twice when changing SDK, build, or packaging behavior.
