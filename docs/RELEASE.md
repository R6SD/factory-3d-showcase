# 发布说明 1.4.3

| 项 | 内容 |
|---|---|
| 版本 | **1.4.3**（`package.json` 的 `version`；Windows 文件编号 `1.4.3.0`） |
| 日期 | **2026-10-19** |
| 对照基线 | Git 标签 `v1.4.2`（`14d2386`）。版本号在提交 `7c51ebc`（2026-09-01，见 `CHANGELOG.md`）升到 1.4.3，其后合入 `main` 的 PR 没有再改版本号。 |
| 本文对应的 `main` | `f294654`（Merge PR #66）。`package.json` 版本仍是 1.4.3。文中「1.4.3」指 #23、#25 合入之前的行为，对应 `0dbb2cb`（Merge PR #18）。 |

本说明只记录 `v1.4.2` 之后已经出现在 `git log` 里的变更。未合并的 Issue 不写成已交付功能。

## 变更摘要

自标签 `v1.4.2` 起，`main` 上的提交与已合并 PR 如下（按合入顺序）。

| 来源 | 标题（与 GitHub / 提交信息一致） | 交付内容 |
|---|---|---|
| 提交 `7c51ebc` | feat(admin): 月度计划 Excel 批量导入/导出，发布 v1.4.3 | `/admin` → 业务数据 → **月度计划** 增加「下载导入模板 / 导入 Excel / 导出当前」。这一笔把版本号定为 1.4.3，没有单独的 PR 编号。 |
| PR [#13](https://github.com/R6SD/factory-3d-showcase/pull/13) | fix(electron): cross-platform model name sanitization for Windows paths | 模型文件名在写入前去掉 Windows 路径（反斜杠），避免把 `C:\...\a.glb` 当成文件名。 |
| PR [#16](https://github.com/R6SD/factory-3d-showcase/pull/16) | ci: run test and build on push and pull request to main | 新增 `.github/workflows/ci.yml`。推送到 `main` 以及指向 `main` 的 PR 会跑 `npm ci`、`npm test`、`npm run build`。 |
| PR [#14](https://github.com/R6SD/factory-3d-showcase/pull/14) | feat(shell): 展示端接入模型库与设置中心 | 展示端侧栏增加 `/models`（模型库）和 `/settings`（设置中心），与 `/admin` 里的同名标签共用页面。 |
| PR [#17](https://github.com/R6SD/factory-3d-showcase/pull/17) | ci: GitHub Pages 部署 Web 预览 (#10) | 新增 `.github/workflows/pages.yml`。构建时设置 `VITE_BASE=/factory-3d-showcase/`，并把 `dist/index.html` 复制为 `dist/404.html`。README 增加「Web 预览 / GitHub Pages」。 |
| PR [#15](https://github.com/R6SD/factory-3d-showcase/pull/15) | fix: replace xlsx with exceljs and require Node.js 22.12+ | 表格导入导出由 `xlsx` 改为 `exceljs`。`package.json` 的 `engines.node` 为 `>=22.12.0`。 |
| PR [#19](https://github.com/R6SD/factory-3d-showcase/pull/19) | docs: 添加无头浏览器验证技能 verify-app | 增加 `.cursor/skills/verify-app/SKILL.md`，约定用无头浏览器核对首页三维、模型库和后台导入。 |
| PR [#18](https://github.com/R6SD/factory-3d-showcase/pull/18) | Split Admin into its own module and document app boundaries | 把 `/admin` 拆到 `src/ui/admin/`（人员与组织、产出记录、月度计划、照片库，以及仍从 `src/app.jsx` 引入的模型库和设置中心）。按钮、`accept=".xlsx,.csv"` 和导入提示与拆分前相同。并增加 `docs/adr/0004-app-module-boundaries.md`。 |
| PR [#21](https://github.com/R6SD/factory-3d-showcase/pull/21) | docs: 发布说明与演示 Checklist (#12) | 增加本说明和 [演示 Checklist](DEMO_CHECKLIST.md)。只改文档。 |
| PR [#24](https://github.com/R6SD/factory-3d-showcase/pull/24) | docs: 修正合入顺序与页面文案 (#12) | 变更表改为上面的合入顺序；Checklist 里的轨道目标改为 `control.target`；页上 FPS 标签写作「GL调用/帧」。只改文档。 |
| PR [#23](https://github.com/R6SD/factory-3d-showcase/pull/23) | fix: 双击空白画布，相机缓动归位 (#22) | 空白处双击（以及触屏双击）在 680ms 内缓动回首次取景。只在当前 `main`，1.4.3 没有双击归位。已知问题 #27 仅 main 曾出现，已由 #31 修复。 |
| PR [#25](https://github.com/R6SD/factory-3d-showcase/pull/25) | fix: 导入与存储的错误处理收尾 | 无法读取的 `.xlsx` 改为「文件无法解析，请检查格式」；exceljs 分包加载失败改为「表格组件加载失败，请刷新页面后重试」；IndexedDB 不可用时页面仍打开，并显示「本地模型库不可用，已降级为本次会话」。已在 `main` 修复 #20。1.4.3 仍是旧行为。 |
| PR [#28](https://github.com/R6SD/factory-3d-showcase/pull/28) | docs: 补回 1.4.3 已知问题并标明 main 上的 #27 | 补回 #20 的已知问题，并记下当时仍在 `main` 上的 #27（仅 main 曾出现，已由 #31 修复）。只改文档。 |
| PR [#31](https://github.com/R6SD/factory-3d-showcase/pull/31) | fix: 归位动画中途改视角会被拉回；隐藏部件仍算命中 (#27) | 归位动画中途改视角会立刻取消，停在新机位；隐藏网格（自身或祖先 `visible === false`）不再挡住双击归位。#27 仅 main 曾出现，已由 #31 修复。 |
| PR [#32](https://github.com/R6SD/factory-3d-showcase/pull/32) | docs: 标明 #27 已在 main 修复（#31） | 已知问题 #27 改为「仅 main 曾出现，已由 #31 修复」。只改文档。 |
| PR [#30](https://github.com/R6SD/factory-3d-showcase/pull/30) | Pick equipment, tint status, and open a detail panel | 点击设备打开详情侧栏，并按状态着色（#7）。右键点已隐藏部件的原位置不再新建标签（#33）。已在 main 修复（#30）。 |
| PR [#34](https://github.com/R6SD/factory-3d-showcase/pull/34) | docs: #30 合并后更新已知问题与未验证项 | 设备拾取侧栏随 #30 记入变更表；#33 不列为开放问题。Checklist 去掉重复的「main 上」。只改文档。 |
| PR [#35](https://github.com/R6SD/factory-3d-showcase/pull/35) | refactor(scene): unify touch double-tap state, use moved flag for click | 触屏双击只留一份记录；鼠标、笔和触屏共用按下记录上的 `moved`，指针越过 30px 后即使松手回到起点也不拾取。 |
| PR [#36](https://github.com/R6SD/factory-3d-showcase/pull/36) | Add a performance budget panel to the 3D viewer | 三维页增加「性能预算」面板（#8）。预算三行（帧率、三角面（模型总量）、绘制调用/帧）下面保留「渲染/秒」「跳过/秒」「三角面（每帧提交）」「立体模式」。1.4.3 仍是 **FPS** 按钮。 |
| PR [#39](https://github.com/R6SD/factory-3d-showcase/pull/39) | fix: 罗盘点 N / E 切换前视和侧视 | 点罗盘 N 切到前视（与 F 同一机位），点 E 切到侧视（与 S 同一机位）。[#26](https://github.com/R6SD/factory-3d-showcase/issues/26) 已由 [#39](https://github.com/R6SD/factory-3d-showcase/pull/39) 修复。 |
| PR [#38](https://github.com/R6SD/factory-3d-showcase/pull/38) | Fix narrow-screen layout so overlays stay inside the viewport | 去掉 `body` 的 `min-width: 1100px`，窄屏下性能面板、工具栏和设备详情留在视口内。[#37](https://github.com/R6SD/factory-3d-showcase/issues/37) 已由 [#38](https://github.com/R6SD/factory-3d-showcase/pull/38) 修复。 |
| PR [#40](https://github.com/R6SD/factory-3d-showcase/pull/40) | fix(ui): screenshot icon, font fallback, and viewer i18n | 截图与全屏不再共用同一图标；无外网字体时回退系统字体；展示端关键文案中英文可用。[#11](https://github.com/R6SD/factory-3d-showcase/issues/11) 已由 [#40](https://github.com/R6SD/factory-3d-showcase/pull/40) 修复。 |
| PR [#45](https://github.com/R6SD/factory-3d-showcase/pull/45) | feat: 设备列表与状态统计条三维联动 (#41) | 三维页增加常驻状态统计条和工具栏「设备列表」。点列表行飞到该设备并打开详情；点某一状态只高亮该类设备，其余变暗。状态为异常 / 离线 / 待机 / 运行。[#41](https://github.com/R6SD/factory-3d-showcase/issues/41) 已由 [#45](https://github.com/R6SD/factory-3d-showcase/pull/45) 修复。 |
| PR [#54](https://github.com/R6SD/factory-3d-showcase/pull/54) | feat: 顶栏铭牌改版 (#50) | 顶栏去掉默认工厂图标。应用名称作为工业铭牌居中；有品牌图标时 Logo 贴在标题左侧，没有则纯字居中。路由名降为右侧小标签。[#50](https://github.com/R6SD/factory-3d-showcase/issues/50) 已由 [#54](https://github.com/R6SD/factory-3d-showcase/pull/54) 修复。 |
| PR [#55](https://github.com/R6SD/factory-3d-showcase/pull/55) | feat: 精细化厂房外壳与 PMREM 光照 (#47) | 默认厂房改为程序化外壳：钢柱、屋架、檩条，不铺屋面板；地面接收阴影，并画分区和标线。环境光用 RoomEnvironment + PMREM，背景仍是纯黑。[#47](https://github.com/R6SD/factory-3d-showcase/issues/47) 已由 [#55](https://github.com/R6SD/factory-3d-showcase/pull/55) 修复。 |
| PR [#57](https://github.com/R6SD/factory-3d-showcase/pull/57) | Add title and theme background slots stored in IndexedDB | 设置「品牌与外观」把标题背景 `titleBg`（只铺顶栏底板）和主题背景 `themeBg`（壳层背景，不盖三维画布）分开存进 IndexedDB，可导入 PNG/JPG/WEBP 或清除回默认，导出不含图片像素，同页和 README 写清大标题、可选 Logo 与两槽的用途和推荐尺寸。[#51](https://github.com/R6SD/factory-3d-showcase/issues/51)、[#52](https://github.com/R6SD/factory-3d-showcase/issues/52) 已由 [#57](https://github.com/R6SD/factory-3d-showcase/pull/57) 修复。 |
| PR [#59](https://github.com/R6SD/factory-3d-showcase/pull/59) | test: fix app-header-narrow CI timeout | 改 `tests/app-header-narrow.test.js`：直接启动 `chrome`，用可中止的请求轮询调试端口，页面改看 `document.readyState`，不再把「默认标题和短标题与时钟的间隙都 ≥ 0，无图标时铭牌仍居中」挂到 Vitest 默认 5000ms。这条超时原先把 CI 和 Pages 跑红。 |
| PR [#58](https://github.com/R6SD/factory-3d-showcase/pull/58) | 精细化六台设备并守住性能预算 | 默认厂房六台设备改为分设备的程序化网格（料仓、传送带、主厂房、总装线、包装车间）。点选按设备打开详情，状态色和过滤压暗按设备生效；静态展示时机械臂停住。标准展示和静态展示的绘制调用/帧，10 秒内最大都是 57。与 [#57](https://github.com/R6SD/factory-3d-showcase/pull/57) 的标题背景、主题背景一起留在 `main`，背景槽不盖三维画布。[#48](https://github.com/R6SD/factory-3d-showcase/issues/48)、[#49](https://github.com/R6SD/factory-3d-showcase/issues/49) 已由 [#58](https://github.com/R6SD/factory-3d-showcase/pull/58) 修复。 |
| PR [#62](https://github.com/R6SD/factory-3d-showcase/pull/62) | test: 修复 CI 上 Chrome 调试端口起不来 | 改 `tests/app-header-narrow.test.js`：`--remote-debugging-port=0`，由 Chrome 分配端口，再从用户目录的 `DevToolsActivePort` 读取，连 `127.0.0.1` 或 `::1`。stderr 写到文件；调试服务没起来时，错误带上 Chrome 日志。布局断言没有改。只改测试。 |
| PR [#63](https://github.com/R6SD/factory-3d-showcase/pull/63) | 模拟实时数据与故障注入 | 设备状态和读数由内存里的本地模拟器推动。工具栏增加「模拟数据」（英文 Live sim），频率只接受 1s / 2s / 5s，默认关闭、2 秒一拍。温度超过 65 转为异常并着色，低于 60 才回到运行；待机和离线在未注入故障时不演化。模拟开启时，详情可以「注入故障」或「恢复」。注入立刻把该设备锁成异常，告警 `SIM-001`（温度 73）。`clearFault` 还原注入前的覆盖层快照；当时没有 patch 就回到台账，所以待机、离线恢复原来的状态和颜色。整个 feed 只有一个定时器；关闭模拟后停表、取消订阅并丢掉覆盖层。开关和频率写在场景配置里；实时读数和注入的故障不写 repository，也不写入业务 localStorage。[#43](https://github.com/R6SD/factory-3d-showcase/issues/43) 已由 [#63](https://github.com/R6SD/factory-3d-showcase/pull/63) 修复。 |
| PR [#65](https://github.com/R6SD/factory-3d-showcase/pull/65) | docs(release): 记录 #43（PR #63）与 #62 | 变更表补上 #62、#63，并把当时的 `main` 基线写到 `cb87c9e`。只改文档。合入 `9c877d5`。 |
| PR [#67](https://github.com/R6SD/factory-3d-showcase/pull/67) | test: 修复 narrow 用例的浏览器启动 | 改 `tests/app-header-narrow.test.js`：用 `puppeteer-core` 以 pipe 启动系统里已有的 Chrome，CDP 走管道，不再使用 `--remote-debugging-port`，也不再读 `DevToolsActivePort`。`puppeteer-core`（`^25.16.0`）只加在 `devDependencies`，不下载浏览器，不进运行时。布局断言没有改（仍是「默认标题和短标题与时钟的间隙都 ≥ 0，无图标时铭牌仍居中」）。只改测试和开发依赖，没有运行时或用户可见的变化。合入 `21bab71`。PR 上连续三次 CI 通过：[42673073719](https://github.com/R6SD/factory-3d-showcase/actions/runs/42673073719)、[42673229712](https://github.com/R6SD/factory-3d-showcase/actions/runs/42673229712)、[42673373040](https://github.com/R6SD/factory-3d-showcase/actions/runs/42673373040)。测试方在串行、并行和 CPU 打满下共 60/60 通过，并在基线 `9c877d5` 上用 4.5 秒的 Chrome 启动延迟复现了原来的「没有 DevToolsActivePort」。Chrome 启动挂起或超时时，进程和临时目录可能留下，见已知问题。合入 `21bab71` 当时不阻塞；当前 `main` 见 CI 一节。 |
| PR [#72](https://github.com/R6SD/factory-3d-showcase/pull/72) | docs(release): 记录 #67 narrow 用例改用 puppeteer-core pipe 启动 | 变更表补上 #67，并补上已合入的文档 PR #65。当时的 `main` 基线写到 `21bab71`。只改文档。合入 `9e49077`。 |
| PR [#66](https://github.com/R6SD/factory-3d-showcase/pull/66) | 自动巡检：预设视点漫游 (#42) | 自动巡检按预设视点漫游。巡检中从设备列表选中设备时不会把选中项清掉。键盘 T/S/R/F 都能停巡检；F 仍是全屏并顺带停巡检。停巡检统一走 `_userTakesCamera`。README 快捷键一节已同步（表下写明巡检中按 T/F/S/R 会停止巡检，F 仍是全屏查看器）。[#42](https://github.com/R6SD/factory-3d-showcase/issues/42) 已由 [#66](https://github.com/R6SD/factory-3d-showcase/pull/66) 修复。PR head 是 `bd4ed36`。合入前 PR CI [43252983885](https://github.com/R6SD/factory-3d-showcase/actions/runs/43252983885) 是绿的，41 个文件、327 条测试通过。合入 `f294654`。 |

展示端侧栏路由仍在 `src/app.jsx`：`/` 场地总览、`/models` 模型库、`/capacity` 产能看板、`/organization` 组织关系、`/settings` 设置中心。`/admin` 后端数据管理由 `src/app.jsx` 挂到该路径，页面在 `src/ui/admin/`。

## CI 状态（`ci.yml`）

工作流名称是 **CI**，文件是 `.github/workflows/ci.yml`。触发条件：push 到 `main`，以及 pull request 目标分支为 `main`。作业 `test-and-build` 在 `ubuntu-latest`、Node 22 上执行 `npm ci`、`npm test`、`npm run build`。

截至 2026-11-12，`main`（`f294654`，Merge PR #66）最近一次 CI **失败**：

- 运行：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43258768258>
- 时间：2026-11-12T16:26:56Z
- 结论：`failure`（作业 `test-and-build`：`npm ci` 通过，`npm test` 失败，`npm run build` 被跳过）
- 41 个文件里 40 个通过、1 个失败；327 条测试里 326 条通过、1 条失败。整次 19.25s
- 失败项是 `tests/app-header-narrow.test.js` 的「默认标题和短标题与时钟的间隙都 ≥ 0，无图标时铭牌仍居中」，这条 15075ms
- 错误是 `ProtocolError: Target.setDiscoverTargets timed out. Increase the 'protocolTimeout' setting in launch/connect calls for a higher timeout if needed.`
- 作业结束时 runner 清掉残留进程：`chrome`（pid 2565）、`chrome_crashpad_handler`（pid 2762 和 2778）

`gh run list --branch main` 显示，这条是 `main` 上最新的 **CI** 工作流：`headSha` 为 `f29465421d29923c3528f9d9cfb12692b81fb272`，`conclusion` 为 `failure`，运行编号 `43258768258`。

这是 #67 改用 `puppeteer-core` pipe 之后的新失败方式，不再是「没有 DevToolsActivePort」。#66 合入前，PR head `bd4ed36` 的 CI 是绿的：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43252983885>（41 个文件、327 条测试全部通过，`npm run build` 也通过）。上一笔 `main` `9e49077`（Merge PR #72）的 CI 是 <https://github.com/R6SD/factory-3d-showcase/actions/runs/42677767888>，结论 `success`（`npm ci`、`npm test`、`npm run build` 都通过）。再上一笔 `21bab71`（Merge PR #67）的 CI 是 <https://github.com/R6SD/factory-3d-showcase/actions/runs/42676767900>，结论 `success`。

#67 合入之前，同一条 narrow 用例会把 `main` 跑红。`cb87c9e`（#63）的 CI 是 <https://github.com/R6SD/factory-3d-showcase/actions/runs/42667750904>，结论 `failure`：38 个文件、292 个测试里 291 个通过、1 个失败。失败项是 `tests/app-header-narrow.test.js` 的「默认标题和短标题与时钟的间隙都 ≥ 0，无图标时铭牌仍居中」，错误是「Chrome 调试端口没有起来 (没有 DevToolsActivePort)」，`npm run build` 被跳过。其后的文档合入 `9c877d5`（#65）没有改测试，CI 仍失败：<https://github.com/R6SD/factory-3d-showcase/actions/runs/42668908528>。#62（`d2d9222`）合入时自己的 CI 曾是绿的：<https://github.com/R6SD/factory-3d-showcase/actions/runs/42665151666>（37 个文件、276 个测试全部通过，`npm run build` 也通过）。#67 去掉对 `--remote-debugging-port` 和 `DevToolsActivePort` 的依赖。PR 上连续三次跑完测试的 CI 都通过：<https://github.com/R6SD/factory-3d-showcase/actions/runs/42673073719>、<https://github.com/R6SD/factory-3d-showcase/actions/runs/42673229712>、<https://github.com/R6SD/factory-3d-showcase/actions/runs/42673373040>。合入后的 `21bab71` 与随后的文档合入 `9e49077` 都是 `success`。当前 `f294654` 又因同一条用例失败，错误已换成上面的 `ProtocolError`。

同一次推送触发的 **Deploy GitHub Pages**（`pages.yml`，不是 `ci.yml`）失败：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43258767940>。`pages.yml` 的 Test 和 Build 通过，失败在 Setup Pages（`actions/configure-pages` 报 `Get Pages site failed` / `Not Found`）。Pages 仍未开通，站点 404，见下方已知问题。

下表数字来自在同一提交 `f294654` 上的本地复跑（`npm ci && npm test && npm run build`），不是上面那次失败的 CI。本地 41 个文件、327 条测试全部通过。#30 没有验证：真机触屏（双击 / 手势）、长按出标签，以及 Electron（含 `npm run package:win`）。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm ci` | 0 | 安装 537 个包（审计 538 个） |
| `npm test` | 0 | 41 个文件、327 个测试：**327** 个通过。 |
| `npm run build` | 0 | 构建完成，5.33s |

## 已知问题

1. **照片管理只在桌面端。** Web 构建和 GitHub Pages 构建没有照片的浏览器回落。`/admin` → **照片库** 依赖 `GET/POST /api/photos`（Electron 本地服务）。`npm run dev` / `npm run preview` 下该接口不存在，列表为空；上传会提示「照片上传失败」。
2. **没有 `/api` 时，Web 构建改用浏览器存储。** `GET /api/data/business`、`GET /api/config` 非成功时，业务数据写入 `localStorage` 键 `factory-business-v1`，配置写入 `factory-workbench-v4`。模型文件在 `/api/models` 不可用时写入 IndexedDB 库 `factory-model-library`。这两条接口 404 不表示页面崩溃。设置中心 → **数据与集成** 的来源文案为「浏览器本地存储」。桌面端来源文案为「本地后端服务（已落盘）」。
3. **GitHub Pages 尚未在仓库设置里打开，预览地址还不是活的。** 仓库 API 的 `has_pages` 为 `false`。<https://r6sd.github.io/factory-3d-showcase/> 当前返回 HTTP 404（2026-11-12 用 `curl -sI` 核对，状态码 404）。`main`（`f294654`）上最近一次 Pages 部署失败：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43258767940>（Test 与 Build 通过，失败在 Setup Pages，`actions/configure-pages` 报 `Get Pages site failed` / `Not Found`）。同一提交的 CI（<https://github.com/R6SD/factory-3d-showcase/actions/runs/43258768258>）结论是 `failure`。需要仓库所有者在 Settings → Pages → Source 选择 **GitHub Actions** 之后才会发布。本交付不改仓库设置。
4. **[#20](https://github.com/R6SD/factory-3d-showcase/issues/20) 坏文件提示、exceljs 分包加载失败、IndexedDB 不可用。** 1.4.3 的行为：导入 0 字节或改名的 `.xlsx` 时，提示是「未解析到有效行：需包含“姓名”列」（产出记录为「需包含“日期、姓名、产量”列」，月度计划为「需包含“月份、计划产量”列」），容易理解成缺列，而不是文件无法解析。`src/data/sheet-io.js` 的 `loadWorkbook()`（`import('exceljs')`）在 try 外面，分包加载失败时会出现 unhandled rejection。IndexedDB 不可用（如隐私模式）时同样可能出现 unhandled rejection。已在 main 修复（#25），1.4.3 仍是旧行为。`main` 上无法读取的工作簿提示「文件无法解析，请检查格式」；分包加载失败提示「表格组件加载失败，请刷新页面后重试」；IndexedDB 打不开时展示页仍能打开，并显示「本地模型库不可用，已降级为本次会话」。
5. **[#27](https://github.com/R6SD/factory-3d-showcase/issues/27) 双击归位动画被其他视角操作拉回；隐藏部件仍算命中。** 双击空白处后，680ms 归位动画进行中（大约一秒内）再点预设视角（「顶视图」「前视图」「侧视图」「默认视角」，或 `T` / `F` / `S`）或按 `R`，下一帧会被动画拉回初始机位；隐藏网格原来的位置双击不会归位。仅 main 曾出现，已由 #31 修复。1.4.3 没有双击归位，不受 #27 影响。
6. **[#7](https://github.com/R6SD/factory-3d-showcase/issues/7) 设备拾取、状态色和详情侧栏。** 点击设备打开详情侧栏，并按状态着色。已在 main 修复（#30）。1.4.3 点击设备不会打开侧栏。[#8](https://github.com/R6SD/factory-3d-showcase/issues/8) 性能预算面板由 [#36](https://github.com/R6SD/factory-3d-showcase/pull/36) 合入后，三维页按钮是「性能预算」，不再是 **FPS**。1.4.3 仍是 1.3.0 起的 **FPS** 性能监控，不要在 1.4.3 演示里找 #8。
7. **narrow 用例：Chrome 在启动阶段挂起或超时时，可能留下进程和临时目录。** #67 把 `tests/app-header-narrow.test.js` 改成用 `puppeteer-core` 的 pipe 启动之后，正常结束会关掉浏览器。若 Chrome 在 `puppeteer.launch` 里挂起或超时（启动还没返回），`stopBrowser` 的强杀不会执行，浏览器进程和 `/tmp/puppeteer_dev_chrome_profile-*` 会留下。这只出现在用例已经失败的时候，不改变布局断言，也不影响运行时或用户可见行为。CI 的 runner 结束时会清掉残留进程。当前 `main`（`f294654`）的 CI [43258768258](https://github.com/R6SD/factory-3d-showcase/actions/runs/43258768258) 已经看到这一笔，而且失败方式不再是 `DevToolsActivePort`：`npm ci` 通过，`npm test` 失败，`npm run build` 被跳过。41 个文件里 40 个通过，327 条里 326 条通过，整次 19.25s。失败的一条是「默认标题和短标题与时钟的间隙都 ≥ 0，无图标时铭牌仍居中」，15075ms。错误是 `ProtocolError: Target.setDiscoverTargets timed out. Increase the 'protocolTimeout' setting in launch/connect calls for a higher timeout if needed.`。作业结束时 runner 清掉了残留的 `chrome`（pid 2565）和两个 `chrome_crashpad_handler`（pid 2762、2778）。这条失败把当前 `main` 的 CI 跑红。`21bab71` 的 CI [42676767900](https://github.com/R6SD/factory-3d-showcase/actions/runs/42676767900) 和 `9e49077` 的 CI [42677767888](https://github.com/R6SD/factory-3d-showcase/actions/runs/42677767888) 当时是 `success`。计划用后续的小 PR 处理，记在 [#73](https://github.com/R6SD/factory-3d-showcase/issues/73)。

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
