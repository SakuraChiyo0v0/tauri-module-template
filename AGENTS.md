# Standalone Runtime Module Template rules

This repository builds one independently installable `.mtp` module for Modular Tauri Template.

## Boundaries

- Never import files from the desktop base repository or assume a sibling checkout exists.
- `src/sdk.ts` is the public Host SDK V3 type snapshot. Do not add capabilities that the base does not expose.
- `src/module.ts` must export `activate(hostSdk)` and may export `deactivate()`.
- Every custom element must begin with the module ID from `manifest.json`.
- Bundle all npm dependencies into the single ESM `build/index.js`.
- Declare only other `.mtp` modules in manifest dependencies; npm packages are build-time dependencies.
- Use semantic CSS variables inherited from the base. Do not hard-code product colors.
- Use parameterized module-private database calls. Never attempt ATTACH, PRAGMA, filesystem paths, or direct access to another module's schema.
- Use only opaque file grants and module-private relative paths. Never import raw Tauri APIs or infer host filesystem paths.
- Keep the starter business-neutral and removable.

## Packaging

- Change the manifest module version for real releases.
- `pnpm module:pack -- --version x.y.z` is only for reproducible compatibility/smoke artifacts and must not rewrite the source manifest.
- Never commit `build/`, `dist/`, `.mtp` files, secrets, or installed module data.

## Verification

Run `pnpm check` and build the same package twice when changing SDK, build, or packaging behavior.
