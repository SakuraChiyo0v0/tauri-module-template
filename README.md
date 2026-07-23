# Modular Tauri Runtime Module Template

一个与桌面底座源码完全分离的 `.mtp` 模块开发模板。它提供 schema V2 双语清单、Host SDK V12 类型、中英文语言订阅、模块服务、模块事件总线、模块系统通知、模块数据导出/导入、模块剪贴板、模块模态对话框、受限 HTTP 代理、受限本地仓库依赖计划、浏览器模拟宿主、模块隔离 SQLite、私有文件与用户授权程序示例、原生 Web Component、测试、单文件 ESM 构建和确定性打包。

## 开始开发

```powershell
pnpm install
pnpm dev
```

浏览器预览用于快速检查页面、中英文切换、模块私有设置、主题订阅、日志、数据库、私有文件和服务注册。SQLite 与私有文件由浏览器内存或 `localStorage` 模拟；注册表、真实进程、系统托盘、全局快捷键和跨模块服务授权必须安装 `.mtp` 到 Tauri 底座验证。模块不得直接调用原始 Tauri invoke。

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

1. 修改 `manifest.json` 的 `id`、版本和底座兼容范围；名称、说明、导航、设置、托盘与快捷键文案必须同时填写 `zh-CN` 和 `en`。
2. 所有自定义元素名称必须以模块 ID 开头。
3. 在 `src/module.ts` 中实现页面和 `activate(hostSdk)`，复杂功能可以拆到同一 `src` 目录。
4. npm 依赖由 Vite 打进 `build/index.js`；只有其他 `.mtp` 模块才写入 `dependencies`。
5. 只使用 `src/sdk.ts` 声明的 Host SDK V12 能力和语义 CSS 变量；在 `nativeCapabilities` 中按最小权限声明实际所需能力。需要兼容旧底座时可以降低清单 `sdkVersion`，但代码不得调用该版本没有的接口。
6. 使用数据库参数占位符，通过 `getUserVersion()` / `setUserVersion()` 管理迁移，并把关联修改放进 `transaction()`。
7. 在 `services.provides` 声明本模块提供的版本化服务；消费者只能通过 `services.call()` 调用 `dependencies` 中的模块，并只传递 JSON 兼容值。
8. 在 `events.publishes` 与 `events.subscribes` 声明本模块会发布和订阅的事件 ID（如 `notes.changed.v1`）；事件 ID 复用服务 ID 格式，约定 `<域>.<动作>.v<主版本>`。通过 `hostSdk.events.publish()` 发布数据变化通知，其他模块用 `hostSdk.events.subscribe()` 收到通知；事件订阅不需要把发布者声明为依赖，但双方都必须在清单声明事件。事件载荷只包含受限 JSON 值，不要放入机密数据。
9. 在 `nativeCapabilities.notifications` 声明 `system: true` 才能请求系统通知；用户在模块管理页批准后，通过 `hostSdk.notifications.show({ title, body })` 发送系统通知。通知是原生能力，权限扩大的更新会先等待批准；标题与正文为有限长度纯文本，模块负责提供可展示内容，不要附加数据库或机密数据。浏览器预览只记录意图不真实推送。
10. 通过 `hostSdk.data.exportBackup()` 让用户把模块 SQLite 与私有设置导出为单个归档文件，`hostSdk.data.importBackup(grantId)` 从用户选择的归档恢复。模块只收到不透明 grant 摘要，不接触真实路径；恢复前模块须停用，导入其他模块的归档会被拒绝。浏览器预览用内存快照往返不真实写盘。
11. 在 `nativeCapabilities.clipboard` 声明 `text: true` 才能请求剪贴板文本读写；用户批准后通过 `hostSdk.clipboard.readText()` / `writeText(text)` 读写系统剪贴板纯文本。只支持纯文本，不支持富文本或图像；不要把读取的剪贴板内容记入日志。浏览器预览用内存缓冲往返。
12. 通过 `hostSdk.dialogs.confirm(options)` / `prompt(options)` 请求由外壳托管的模态对话框，避免自绘弹层。外壳负责渲染、焦点陷阱、Esc/Enter 与主题；内容为受限纯文本，不承载富 HTML 或脚本。模块停用时未关闭的对话框自动取消。浏览器预览用内存实现同步回显。
13. 在 `nativeCapabilities.http.origins` 声明允许的 HTTPS 源；用户批准后通过 `hostSdk.http.fetch({ url, method, headers, body, timeoutMs })` 访问。只允许清单声明的源与 HTTPS，拒绝私有地址防止 SSRF；请求/响应大小与超时受限，不持久 cookie，不执行响应脚本。浏览器预览用内存固定回显。
14. 通过 `hostSdk.logger` 记录生命周期和关键操作的最终结果：成功使用 `info`，无效输入、缺少依赖等可恢复结果使用 `warn`，意外失败使用 `error`。日志只写稳定操作名和必要的非敏感结果，不得包含正文、凭据、完整 URL、文件路径、服务负载或原始错误消息。
15. 为关键操作日志补充测试，确认日志级别正确且没有泄露用户数据；运行 `pnpm check`，打包后在桌面底座“模块管理”中安装真实 `.mtp` 验证。

模块页面正文不由底座翻译。模块应使用自己的双语词典，初始渲染读取 `hostSdk.i18n.getLocale()`，并通过 `hostSdk.i18n.subscribe()` 在语言变化时重新渲染。打包器会拒绝任一宿主可见文本缺少中文或英文的清单。

每个模块只能访问自己的 SQLite 文件。模块依赖保证兼容版本和 provider 优先启动；SDK V4–V7 服务调用仍不能绕过依赖关系，也不能直接访问另一个模块数据库。文件、进程、注册表、托盘和快捷键必须经过 Host SDK 代理；文件授权只使用不透明 grant ID，不能读取真实路径。`process.openPath()` / `process.revealInFolder()` 只接受可读文件 grant ID，`process.run()` 只接受可执行文件 grant ID。需要共享新的系统能力时，应先为底座提出版本化 Host SDK 变更。

SDK V5 的 `moduleRepository` 提供单包扫描与安装；SDK V6 增加 `previewInstallPlan()` 和 `executeInstallPlan()`，由基座解析同一授权仓库中的传递必需依赖并返回不透明 `planId`。清单必须同时声明外部目录 `read`/`list` 与 `moduleRepository.install`。模块只能保存 grant ID、顶层包文件名和短期 plan ID，不得记录真实目录、读取包内容、自动批准权限或绕过宿主校验。通用起步清单默认将该能力设为 `null`。

SDK V7 的 `events` 提供模块事件总线：模块在 `events.publishes` 声明可发布事件，在 `events.subscribes` 声明可订阅事件，再通过 `hostSdk.events.publish(eventId, payload)` 发布、`hostSdk.events.subscribe(eventId, listener)` 订阅。事件是单向通知，不返回结果；需要返回值的协作仍用模块服务。事件投递异步、按发布顺序、单订阅者异常不影响他人；载荷复用服务的受限 JSON 边界并深复制；模块停用后自动退订且不补投离线事件。事件载荷应对所有可信模块可见，不要放入机密数据。
