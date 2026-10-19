# 发布说明 1.4.3

| 项 | 内容 |
|---|---|
| 版本 | **1.4.3**（`package.json` 的 `version`；Windows 文件编号 `1.4.3.0`） |
| 日期 | **2026-10-19** |
| 对照基线 | Git 标签 `v1.4.2`（`14d2386`）。版本号在提交 `7c51ebc`（2026-09-01，见 `CHANGELOG.md`）升到 1.4.3，其后合入 `main` 的 PR 没有再改版本号。 |
| 本文对应的 `main` | `e260e67`（Merge pull request #19） |

本说明只记录 `v1.4.2` 之后已经出现在 `git log` 里的变更。未合并的 Issue 不写成已交付功能。

## 变更摘要

自标签 `v1.4.2` 起，`main` 上的提交与已合并 PR 如下（按合入顺序）。

| 来源 | 标题（与 GitHub / 提交信息一致） | 交付内容 |
|---|---|---|
| 提交 `7c51ebc` | feat(admin): 月度计划 Excel 批量导入/导出，发布 v1.4.3 | `/admin` → 业务数据 → **月度计划** 增加「下载导入模板 / 导入 Excel / 导出当前」。这一笔把版本号定为 1.4.3，没有单独的 PR 编号。 |
| PR [#13](https://github.com/R6SD/factory-3d-showcase/pull/13) | fix(electron): cross-platform model name sanitization for Windows paths | 模型文件名在写入前去掉 Windows 路径（反斜杠），避免把 `C:\...\a.glb` 当成文件名。 |
| PR [#14](https://github.com/R6SD/factory-3d-showcase/pull/14) | feat(shell): 展示端接入模型库与设置中心 | 展示端侧栏增加 `/models`（模型库）和 `/settings`（设置中心），与 `/admin` 里的同名标签共用页面。 |
| PR [#15](https://github.com/R6SD/factory-3d-showcase/pull/15) | fix: replace xlsx with exceljs and require Node.js 22.12+ | 表格导入导出由 `xlsx` 改为 `exceljs`。`package.json` 的 `engines.node` 为 `>=22.12.0`。 |
| PR [#16](https://github.com/R6SD/factory-3d-showcase/pull/16) | ci: run test and build on push and pull request to main | 新增 `.github/workflows/ci.yml`。推送到 `main` 以及指向 `main` 的 PR 会跑 `npm ci`、`npm test`、`npm run build`。 |
| PR [#17](https://github.com/R6SD/factory-3d-showcase/pull/17) | ci: GitHub Pages 部署 Web 预览 (#10) | 新增 `.github/workflows/pages.yml`。构建时设置 `VITE_BASE=/factory-3d-showcase/`，并把 `dist/index.html` 复制为 `dist/404.html`。README 增加「Web 预览 / GitHub Pages」。 |
| PR [#19](https://github.com/R6SD/factory-3d-showcase/pull/19) | docs: 添加无头浏览器验证技能 verify-app | 增加 `.cursor/skills/verify-app/SKILL.md`，约定用无头浏览器核对首页三维、模型库和后台导入。 |

展示端侧栏路由（`src/app.jsx`）：`/` 场地总览、`/models` 模型库、`/capacity` 产能看板、`/organization` 组织关系、`/settings` 设置中心，以及 `/admin` 后端数据管理。

## CI 状态（`ci.yml`）

工作流名称是 **CI**，文件是 `.github/workflows/ci.yml`。触发条件：push 到 `main`，以及 pull request 目标分支为 `main`。作业 `test-and-build` 在 `ubuntu-latest`、Node 22 上执行 `npm ci`、`npm test`、`npm run build`。

截至 2026-10-19，`main`（`e260e67`）最近一次 CI **成功**：

- 运行：<https://github.com/R6SD/factory-3d-showcase/actions/runs/39307014496>
- 时间：2026-10-19T18:58:20Z
- 结论：`success`

同一次推送触发的 **Deploy GitHub Pages**（`pages.yml`，不是 `ci.yml`）失败，原因见下方已知问题。不要把 Pages 工作流的红叉当成 CI 未通过。

本地在同一棵 `e260e67` 上复跑（Node v22.23.3，未设置 `VITE_BASE`）：

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm ci` | 0 | 安装 516 个包 |
| `npm test` | 0 | vitest 4.1.11：16 个文件、**145** 个测试通过 |
| `npm run build` | 0 | vite 7.3.6 成功。控制台有「chunk 大于 500 kB」警告，构建本身成功，产物在 `dist/` |

## 已知问题

1. **照片管理只在桌面端。** Web 构建和 GitHub Pages 构建没有照片的浏览器回落。`/admin` → **照片库** 依赖 `GET/POST /api/photos`（Electron 本地服务）。`npm run dev` / `npm run preview` 下该接口不存在，列表为空；上传会提示「照片上传失败」。
2. **没有 `/api` 时，Web 构建改用浏览器存储。** `GET /api/data/business`、`GET /api/config` 非成功时，业务数据写入 `localStorage` 键 `factory-business-v1`，配置写入 `factory-workbench-v4`。模型文件在 `/api/models` 不可用时写入 IndexedDB 库 `factory-model-library`。这两条接口 404 不表示页面崩溃。设置中心 → **数据与集成** 的来源文案为「浏览器本地存储」。桌面端来源文案为「本地后端服务（已落盘）」。
3. **GitHub Pages 尚未在仓库设置里打开，预览地址还不是活的。** <https://r6sd.github.io/factory-3d-showcase/> 当前返回 HTTP 404。`main` 上最近一次 Pages 部署失败：<https://github.com/R6SD/factory-3d-showcase/actions/runs/39307014442>（`actions/configure-pages` 报 `Get Pages site failed` / `Not Found`）。需要仓库所有者在 Settings → Pages → Source 选择 **GitHub Actions** 之后才会发布。开通前失败是预期情况，本交付不改仓库设置。
4. **开放中的 `bug` 标签：** [#20](https://github.com/R6SD/factory-3d-showcase/issues/20)「fix: 导入与存储的错误处理收尾（坏文件提示、分包加载失败、IndexedDB 不可用）」。现状：0 字节或无法解析的 `.xlsx` 会走「未解析到有效行：需包含……列」，文案容易理解成缺列，而不是「文件无法解析」。exceljs 动态导入失败、以及隐私模式下 IndexedDB 不可用，仍可能出现未处理的拒绝。演示 Checklist 按**当前页面文案**验收，不按 #20 的目标文案验收。
5. **未进入本版本的开放功能（不要在演示里找）：** [#7](https://github.com/R6SD/factory-3d-showcase/issues/7) 设备拾取、状态色和详情侧栏仍开放，点击场景里的设备不会打开状态侧栏。[#8](https://github.com/R6SD/factory-3d-showcase/issues/8) 性能预算面板仍开放。三维页已有的 **FPS** 按钮是 1.3.0 起的性能监控，不是 #8。

## 安装（Windows 桌面）

在 Windows 10/11 64 位、已安装 Node.js 22.12+ 的源码目录执行：

```powershell
npm run package:win
```

该脚本先 `npm run build`，再以 `CSC_IDENTITY_AUTO_DISCOVERY=false` 调用 electron-builder，目标为 NSIS 与 portable。产物目录是 `release/`。安装包文件名以 README 为准：

- `工厂 Web3D 工作台 Setup 1.4.3.exe`：安装版
- `工厂 Web3D 工作台 1.4.3.exe`：免安装版

安装版默认目录（`build/installer.nsh`）：

```text
D:\工厂 Web3D 工作台
```

安装后双击 `工厂 Web3D 工作台.exe`。程序只绑定本机 `http://127.0.0.1:43891/`，并打开默认浏览器。卸载程序：

```text
D:\工厂 Web3D 工作台\unins000.exe
```

导入的模型在：

```text
%APPDATA%\Factory Web3D Workbench\models
```

该目录不在安装目录里，升级或卸载不会自动删掉模型文件。退出服务：展示端 **设置中心 → 常规 → 退出并关闭服务**。这个按钮由 `public/service-controls.js` 注入（「常规」标签激活时出现）。在桌面端它会 `POST /api/close` 并停掉本机服务；浏览器预览里按钮也在，但没有 Electron 服务可关。

本交付不附带 `release/` 安装包，也不打 Git 标签或 GitHub Release。需要对外发安装包时由维护者另行决定。

## 开发

`package.json` 的 `engines.node` 为 **`>=22.12.0`**。低于 22.12 时，安装 Electron 可能报 `EBADENGINE`。

```powershell
node --version
npm ci
npm run dev
npm test
npm run build
```

`npm run dev` 默认是 Vite 开发服务器。README 里的本机示例：

```powershell
npm run dev -- --host 127.0.0.1 --port 4173
```

浏览器打开 <http://127.0.0.1:4173/>。停止服务：`Ctrl + C`。

生产包预览不要设置 `VITE_BASE`（此时 `base` 为 `/`）：

```powershell
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

发布到 GitHub Pages 项目站点时才使用子路径（本地核对子路径时同样加上它）：

```powershell
$env:VITE_BASE="/factory-3d-showcase/"; npm run build
```

```bash
VITE_BASE=/factory-3d-showcase/ npm run build
```

`BrowserRouter` 的 `basename` 来自构建期的 `import.meta.env.BASE_URL`。未设置 `VITE_BASE` 时，路由就是 `/`、`/models`、`/capacity`、`/organization`、`/settings`、`/admin`。

桌面壳：`npm run desktop`（先构建再启动 Electron）。打安装包见上一节 `npm run package:win`。

逐步点击验收见 [演示 Checklist](DEMO_CHECKLIST.md)。
