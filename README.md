# Modular Tauri Runtime Module Template

一个与桌面底座源码完全分离的 `.mtp` 模块开发模板。它提供 Host SDK V2 类型、浏览器模拟宿主、模块隔离 SQLite 示例、原生 Web Component、测试、单文件 ESM 构建和确定性打包。

## 开始开发

```powershell
pnpm install
pnpm dev
```

浏览器预览用于快速检查页面、模块私有设置、主题订阅、日志和数据库调用。预览数据库由 `localStorage` 模拟；真实 SQLite 行为必须安装 `.mtp` 到 Tauri 底座验证。它不会模拟文件、进程或原始 Tauri invoke。

## 检查与打包

```powershell
pnpm check
pnpm module:pack
```

默认产物为 `dist/starter-module-0.1.0.mtp`。真实发布应修改 `manifest.json` 的语义版本；兼容性或集成冒烟可以在不修改源码清单的情况下生成更高版本：

```powershell
pnpm module:pack -- --version 0.1.1
```

相同源码、构建结果和版本会生成字节一致的 `.mtp`。`build/`、`dist/` 和 `.mtp` 均不会进入 Git。

## 改成自己的模块

1. 修改 `manifest.json` 的 `id`、名称、说明、版本和底座兼容范围。
2. 所有自定义元素名称必须以模块 ID 开头。
3. 在 `src/module.ts` 中实现页面和 `activate(hostSdk)`，复杂功能可以拆到同一 `src` 目录。
4. npm 依赖由 Vite 打进 `build/index.js`；只有其他 `.mtp` 模块才写入 `dependencies`。
5. 只使用 `src/sdk.ts` 声明的 Host SDK 能力和语义 CSS 变量。
6. 使用数据库参数占位符，通过 `getUserVersion()` / `setUserVersion()` 管理迁移，并把关联修改放进 `transaction()`。
7. 运行 `pnpm check`，打包后在桌面底座“模块管理”中安装真实 `.mtp` 验证。

每个模块只能访问自己的 SQLite 文件。模块依赖目前只保证兼容版本和 provider 优先启动，不提供跨模块数据库访问或服务调用。需要共享数据、文件、进程、窗口等能力时，应先为底座提出版本化 Host SDK 变更。
