# 发布说明 1.4.3

| 项 | 内容 |
|---|---|
| 版本 | **1.4.3**（`package.json` 的 `version`；Windows 文件编号 `1.4.3.0`） |
| 日期 | **2026-10-19** |
| 对照基线 | Git 标签 `v1.4.2`（`14d2386`）。版本号在提交 `7c51ebc`（2026-09-01，见 `CHANGELOG.md`）升到 1.4.3，其后合入 `main` 的 PR 没有再改版本号。 |
| 本文对应的 `main` | `20bd901`（Merge PR #81）。`package.json` 版本仍是 1.4.3。文中「1.4.3」指 #23、#25 合入之前的行为，对应 `0dbb2cb`（Merge PR #18）。 |

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
| PR [#67](https://github.com/R6SD/factory-3d-showcase/pull/67) | test: 修复 narrow 用例的浏览器启动 | 改 `tests/app-header-narrow.test.js`：用 `puppeteer-core` 以 pipe 启动系统里已有的 Chrome，CDP 走管道，不再使用 `--remote-debugging-port`，也不再读 `DevToolsActivePort`。`puppeteer-core`（`^25.16.0`）只加在 `devDependencies`，不下载浏览器，不进运行时。布局断言没有改（仍是「默认标题和短标题与时钟的间隙都 ≥ 0，无图标时铭牌仍居中」）。只改测试和开发依赖，没有运行时或用户可见的变化。合入 `21bab71`。PR 上连续三次 CI 通过：[42673073719](https://github.com/R6SD/factory-3d-showcase/actions/runs/42673073719)、[42673229712](https://github.com/R6SD/factory-3d-showcase/actions/runs/42673229712)、[42673373040](https://github.com/R6SD/factory-3d-showcase/actions/runs/42673373040)。测试方在串行、并行和 CPU 打满下共 60/60 通过，并在基线 `9c877d5` 上用 4.5 秒的 Chrome 启动延迟复现了原来的「没有 DevToolsActivePort」。合入 `21bab71` 当时，启动挂起或超时可能留下进程和临时目录，见已知问题（已由 #76 修复）。当时不阻塞；当前 `main` 见 CI 一节。 |
| PR [#72](https://github.com/R6SD/factory-3d-showcase/pull/72) | docs(release): 记录 #67 narrow 用例改用 puppeteer-core pipe 启动 | 变更表补上 #67，并补上已合入的文档 PR #65。当时的 `main` 基线写到 `21bab71`。只改文档。合入 `9e49077`。 |
| PR [#66](https://github.com/R6SD/factory-3d-showcase/pull/66) | 自动巡检：预设视点漫游 (#42) | 自动巡检按预设视点漫游。巡检中从设备列表选中设备时不会把选中项清掉。键盘 T/S/R/F 都能停巡检；F 仍是全屏并顺带停巡检。停巡检统一走 `_userTakesCamera`。README 快捷键一节已同步（表下写明巡检中按 T/F/S/R 会停止巡检，F 仍是全屏查看器）。[#42](https://github.com/R6SD/factory-3d-showcase/issues/42) 已由 [#66](https://github.com/R6SD/factory-3d-showcase/pull/66) 修复。PR head 是 `bd4ed36`。合入前 PR CI [43252983885](https://github.com/R6SD/factory-3d-showcase/actions/runs/43252983885) 是绿的，41 个文件、327 条测试通过。合入 `f294654`。 |
| PR [#75](https://github.com/R6SD/factory-3d-showcase/pull/75) | docs(release): 记录 #42（PR #66）预设视点巡检 | 变更表补上 #66，并补上已合入的文档 PR #72。当时的 `main` 基线写到 `f294654`。只改文档。合入 `e95371b`。 |
| PR [#76](https://github.com/R6SD/factory-3d-showcase/pull/76) | test: 修复 narrow 用例 Chrome 启动超时并清理残留进程 | 只改 `tests/app-header-narrow.test.js`。探针改为 20s，盖住已经看到的 12.9s 慢启动，不是把 puppeteer 默认的 180s 拿回来。只对这种启动超时再试一次：先清理，再换一个新的 `narrow-chrome-*` 用户目录；断言失败不重试。`launch` 抛错时也按该目录、它的子进程，以及启动前没有的 crashpad，SIGKILL 进程组并删掉目录。新增一条用例：`protocolTimeout` 40ms，断言同一类 `timed out`，清理时看到带该目录的 Chrome 和 crashpad，结束后进程和临时目录都没有了。布局断言没有改（仍是「默认标题和短标题与时钟的间隙都 ≥ 0，无图标时铭牌仍居中」）。没有运行时或用户可见的变化。[#73](https://github.com/R6SD/factory-3d-showcase/issues/73) 已由 [#76](https://github.com/R6SD/factory-3d-showcase/pull/76) 修复。PR head 是 `6103701`。PR CI [43262114717](https://github.com/R6SD/factory-3d-showcase/actions/runs/43262114717) 通过。合入 `622b253`。 |
| PR [#78](https://github.com/R6SD/factory-3d-showcase/pull/78) | docs(release): 记录 #73（PR #76）narrow 启动超时与残留清理 | 变更表补上 #76（[#73](https://github.com/R6SD/factory-3d-showcase/issues/73)）和已合入的文档 PR #75。当时的 `main` 基线写到 `622b253`。只改文档。合入 `636f5a3`。 |
| PR [#77](https://github.com/R6SD/factory-3d-showcase/pull/77) | 告警中心：事件条、确认清除，点击飞到设备并脉冲高亮 | 首页底部常驻告警事件条。告警由设备前后快照生成，用纯函数 reducer 处理，只留在内存，不写入 localStorage。打开后可按严重程度筛选，并可以确认、清除。点一条记录走 [#41](https://github.com/R6SD/factory-3d-showcase/issues/41) 已有路径：`EQUIPMENT_SELECT` → `focusEquipment`，再对当前状态材质做 `pulseEquipment`，不新建网格。未开「模拟数据」时也能看到三条预置告警：E-201 与 E-305 为重要，E-118（停机）为严重；SIM-001 为严重，SIM-T 为提示。恢复只写 `recoveredAt`，记录仍留在活动列表并标「已恢复」；同一 key 之后再告警会另开一条。确认只允许从活动（active）到已确认（acked）。清除把活动或已确认的记录放到历史头部，超过 200 条从尾部裁掉。非法迁移返回同一个 log 引用。设备不在当前模型里时沿用「模型中未找到」。只读时确认和清除不可用。`source` 留给 [#71](https://github.com/R6SD/factory-3d-showcase/issues/71)，这次不加重放。宽度低于 640px 时，面板改为通栏底部抽屉，最大高度 50vh。[#68](https://github.com/R6SD/factory-3d-showcase/issues/68) 已由 [#77](https://github.com/R6SD/factory-3d-showcase/pull/77) 修复。PR head 是 `8f6e45d`。合入前 PR CI [43267462820](https://github.com/R6SD/factory-3d-showcase/actions/runs/43267462820) 是绿的。合入 `71f7083`。 |
| PR [#79](https://github.com/R6SD/factory-3d-showcase/pull/79) | docs(release): 记录 #68（PR #77）告警中心 | 变更表补上 #77（[#68](https://github.com/R6SD/factory-3d-showcase/issues/68)）和已合入的文档 PR #78。当时的 `main` 基线写到 `71f7083`。只改文档。合入 `df64c21`。 |
| PR [#80](https://github.com/R6SD/factory-3d-showcase/pull/80) | 数据图层：状态 / 温度 / 振动 / 能耗热力着色 | 同一套已有设备网格上，在状态、温度、振动、能耗四个互斥图层之间切换。点当前项或点「状态」回到状态色。图例用该图层的固定量程，并用两端刻度标出当前数据的最小/最大。图层色跟着模拟馈送变。告警和停机在任何图层下都保持原来的状态色。只改已有材质的 emissive，不新增网格。6 个默认设备 id 不变。Web 与 Electron 共用这条路径。宽度低于 640px 时，分段按钮改为下拉框。[#69](https://github.com/R6SD/factory-3d-showcase/issues/69) 已由 [#80](https://github.com/R6SD/factory-3d-showcase/pull/80) 修复。同一 PR 里还有只改测试的跟进：收紧 `tests/app-header-narrow.test.js` 的启动超时清理，crashpad 如果来得晚就看满 1 秒，成功是没有留下 Chrome、crashpad 和临时目录。这不是用户可见的变化。15 个文件，+502/-26，2 个提交。PR head 是 `195d5cb`（`195d5cb4c02e01d3b22d664c3b789f9ef1b65bc0`）。合入前 PR CI [43273758944](https://github.com/R6SD/factory-3d-showcase/actions/runs/43273758944) 是绿的。作者、测试方和群里都报告 44 个文件、350 条测试。测试方 PASS：看到图层、图例、仿真和绘制调用（<https://github.com/R6SD/factory-3d-showcase/pull/80#issuecomment-6922438432>）。合入 `2d26dbf`。 |
| PR [#82](https://github.com/R6SD/factory-3d-showcase/pull/82) | docs(release): 记录 #69（PR #80）数据图层 | 变更表补上 #80（[#69](https://github.com/R6SD/factory-3d-showcase/issues/69)）和已合入的文档 PR #79。当时的 `main` 基线写到 `2d26dbf`。只改文档。PR head 是 `c641dce`。合入 `5b67901`。 |
| PR [#64](https://github.com/R6SD/factory-3d-showcase/pull/64) | 无 WebGL 降级提示与模型加载进度 | 无 WebGL（或 `SceneRuntime` 构造失败）时首页不再白屏，只显示说明和产能看板 / 组织关系入口。导入模型时按已读字节显示百分比（本地文件按 256KB 分片读取，百分比是已读字节 / 文件大小，不再依赖 `blob:` 的 XHR）；读完后遮罩改为「正在解析三维模型…」。损坏文件的提示与表格导入共用 `sheetErrorMessage`：「文件无法解析，请检查格式」。[#44](https://github.com/R6SD/factory-3d-showcase/issues/44) 已由 [#64](https://github.com/R6SD/factory-3d-showcase/pull/64) 修复。12 个文件，+353/-40，6 个提交。PR head 是 `e3cb200`（`e3cb200a1c94de97df86ae4649dedd10fa0f4bad`；父提交 `2970b6f` + `2d26dbf`）。合入前 PR CI [43910226428](https://github.com/R6SD/factory-3d-showcase/actions/runs/43910226428) 是绿的。作者、测试方和群里都报告 48 个文件、360 条测试。测试方 PASS：看到进度百分比、「正在解析三维模型…」、损坏提示「文件无法解析，请检查格式」、禁用 WebGL 后的降级页与产能/组织入口（<https://github.com/R6SD/factory-3d-showcase/pull/64#issuecomment-6923478752>）。Electron 未测。合入 `422d7a4`。 |
| PR [#83](https://github.com/R6SD/factory-3d-showcase/pull/83) | docs(release): 记录 #44（PR #64）无 WebGL 降级与模型加载进度 | 变更表补上 #64（[#44](https://github.com/R6SD/factory-3d-showcase/issues/44)）和已合入的文档 PR #82。当时的 `main` 基线写到 `422d7a4`。只改文档。PR head 是 `2e92426`。合入 `5581b6a`。 |
| PR [#81](https://github.com/R6SD/factory-3d-showcase/pull/81) | 时间轴回放：播放、暂停、倍速和拖动定位 | 固定种子预先生成 10 分钟模拟历史（300 帧，每 2 秒一帧）。故障脚本在主传送带和原料仓 B 上注入并恢复。进入回放会暂停实时模拟器。设备颜色、设备列表、详情里的 OEE / 产量 / 温度，以及告警，都读当前帧。告警按帧预先算好；时间戳是模拟时间（例如 `1970-01-01T00:01:30Z`），不是墙上时钟。支持播放 / 暂停、1× / 2× / 4× 和拖动定位。播放到 10:00 自动暂停。「回到实时」退出回放并重新启动实时模拟器。回放期间实时告警日志保持原样；确认和清除按钮（以及故障注入）被藏起。产能看板仍读台账产量，不跟随回放帧。PR #81 写明这一点是有意不改；测试方看到「2026-11 部门产能总览」本月总产出 23,553 件在回放前后不变。[#71](https://github.com/R6SD/factory-3d-showcase/issues/71) 要求产能看板同步，本文不把这一项写成已交付。[#71](https://github.com/R6SD/factory-3d-showcase/issues/71) 已由 [#81](https://github.com/R6SD/factory-3d-showcase/pull/81) 这次合入关闭。10 个文件，+887/-17，3 个提交。PR head 是 `66d74fe`（`66d74fe4b6b0a4e1daed9110bd5045cb275f3da1`；父提交 `8d50986` + `422d7a4`）。合入前 PR CI [43917640878](https://github.com/R6SD/factory-3d-showcase/actions/runs/43917640878) 是绿的。作者、测试方和群里都报告在 `66d74fe` 上 51 个文件、371 条测试。测试方在并入 #64 之后 PASS：看到进入回放的界面、播放/暂停/倍速/拖动、10:00 自动暂停、脚本故障在 01:30 和 05:00、回放中实时冻结且确认/清除被藏起、回到实时、图层跟随回放帧、#64 回归，产能看板不跟随帧（<https://github.com/R6SD/factory-3d-showcase/pull/81#issuecomment-6924815689>）。更早在 `8d50986` 上的 PASS（361 条测试）是 <https://github.com/R6SD/factory-3d-showcase/pull/81#issuecomment-6923653739>；该 SHA 后来相对 `422d7a4` 已脏。Electron 桌面端未测。640px 图例偏移未测，也没有记成失败。合入 `20bd901`。 |

展示端侧栏路由仍在 `src/app.jsx`：`/` 场地总览、`/models` 模型库、`/capacity` 产能看板、`/organization` 组织关系、`/settings` 设置中心。`/admin` 后端数据管理由 `src/app.jsx` 挂到该路径，页面在 `src/ui/admin/`。

## CI 状态（`ci.yml`）

工作流名称是 **CI**，文件是 `.github/workflows/ci.yml`。触发条件：push 到 `main`，以及 pull request 目标分支为 `main`。作业 `test-and-build` 在 `ubuntu-latest`、Node 22 上执行 `npm ci`、`npm test`、`npm run build`。

截至 2026-11-16，当前 `main`（`20bd901`，Merge PR #81）的 CI **成功**：

- 运行：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43925560584>
- 时间：`created_at` 2026-11-16T18:07:44Z。作业 `test-and-build` 从 2026-11-16T18:07:47Z 到 2026-11-16T18:08:39Z：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43925560584/job/133503933585>
- 结论：`success`
- 日志里的 `npm ci` 通过：`added 537 packages, and audited 538 packages in 8s`（步骤 2026-11-16T18:08:01Z 到 2026-11-16T18:08:10Z）
- 日志里的 `npm test` 通过：Test Files **51 passed**（51），Tests **371 passed**（371）。Start at 18:08:10，Duration **21.98s**（transform 1.12s，setup 0ms，import 4.81s，tests 27.94s，environment 4.03s）
- 日志里的 `npm run build` 通过：1907 modules transformed，`built in 5.46s`
- 作业结束打印了 `Cleaning up orphan processes`，没有列出 `chrome` 或 `chrome_crashpad_handler`

本文没有在 `20bd901` 上另跑 `npm ci && npm test && npm run build`。上面的文件数、测试数和耗时来自这次 CI 的作业日志，不是本地复跑。

此前的文档合入 `5581b6a`（Merge PR #83）CI 是 <https://github.com/R6SD/factory-3d-showcase/actions/runs/43918501151>，结论 `success`。

上一个功能基线 `422d7a4`（Merge PR #64）的 CI **成功**（日志 48 个文件、360 条测试）。这是历史结果，不是当前 `main`：

- 运行：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43915841228>
- 时间：`created_at` 2026-11-16T17:12:04Z。作业 `test-and-build` 从 2026-11-16T17:12:07Z 到 2026-11-16T17:12:44Z：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43915841228/job/133469604073>
- 结论：`success`
- 日志里的 `npm ci` 通过：`added 537 packages, and audited 538 packages in 10s`（步骤 2026-11-16T17:12:10Z 到 2026-11-16T17:12:21Z）
- 日志里的 `npm test` 通过：Test Files **48 passed**（48），Tests **360 passed**（360）。Start at 17:12:21，Duration **12.30s**（transform 1.66s，setup 0ms，import 7.46s，tests 13.95s，environment 6.77s）
- 日志里的 `npm run build` 通过：1904 modules transformed，`built in 7.32s`
- 作业结束打印了 `Cleaning up orphan processes`，没有列出 `chrome` 或 `chrome_crashpad_handler`

本文没有在 `422d7a4` 上另跑 `npm ci && npm test && npm run build`。上面 `422d7a4` 的文件数、测试数和耗时来自那次 CI 的作业日志，不是本地复跑。

此前的文档合入 `5b67901`（Merge PR #82）CI 是 <https://github.com/R6SD/factory-3d-showcase/actions/runs/43912300338>，结论 `success`。

更早的功能基线 `2d26dbf`（Merge PR #80）的 CI **失败**（349/350，narrow Chrome `Target.setDiscoverTargets` 在一次重试后仍超时，`npm run build` 被跳过）。这是历史结果，不是当前 `main`：

- 运行：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43909024883>
- 时间：`created_at` 2026-11-16T16:34:41Z。作业 `test-and-build` 从 2026-11-16T16:34:44Z 到 2026-11-16T16:35:50Z：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43909024883/job/133445544815>
- 结论：`failure`
- 日志里的 `npm ci` 通过：`added 537 packages, and audited 538 packages in 11s`（步骤 2026-11-16T16:34:52Z 到 2026-11-16T16:35:03Z）
- 日志里的 `npm test` 失败（步骤 2026-11-16T16:35:03Z 到 2026-11-16T16:35:46Z）：Test Files **1 failed** | **43 passed**（44），Tests **1 failed** | **349 passed**（350）。Start at 16:35:03，Duration **42.93s**（transform 1.26s，setup 0ms，import 5.09s，tests 48.97s，environment 4.72s）
- 失败项是 `tests/app-header-narrow.test.js` > 390 宽品牌图标不挡时钟 > 「默认标题和短标题与时钟的间隙都 ≥ 0，无图标时铭牌仍居中」，40904ms。错误是 `ProtocolError: Target.setDiscoverTargets timed out. Increase the 'protocolTimeout' setting in launch/connect calls for a higher timeout if needed.`。堆栈在 `ChromeLauncher.launch` → `TargetManager.initialize`。日志在 2026-11-16T16:35:25Z 先打出「narrow Chrome 启动超时，清理后重试（1/2）」，第二次探针也超时，布局断言没有跑到
- 同一文件里 40ms 清理用例通过：「Target.setDiscoverTargets 超时后不留 Chrome、crashpad 和临时目录」，471ms
- `npm run build` 被跳过
- 作业结束打印了 `Cleaning up orphan processes`，没有列出 `chrome` 或 `chrome_crashpad_handler`。早先 `f294654` 上 #73 那次失败（[43258768258](https://github.com/R6SD/factory-3d-showcase/actions/runs/43258768258)）在作业结束列出了残留进程，细节见已知问题 7

上面 `2d26dbf` 的文件数、测试数和耗时来自那次 CI 的作业日志，不是本地复跑。

此前仍是绿的 `main` CI：`df64c21`（Merge PR #79，只改文档）为 [43273640920](https://github.com/R6SD/factory-3d-showcase/actions/runs/43273640920)，结论 `success`。再往前，`71f7083`（Merge PR #77）为 [43270926997](https://github.com/R6SD/factory-3d-showcase/actions/runs/43270926997)，结论 `success`（当时日志 43 个文件、341 条测试）。更早的 `622b253`（Merge PR #76）为 [43264930273](https://github.com/R6SD/factory-3d-showcase/actions/runs/43264930273)（日志 41 个文件、328 条测试），`636f5a3`（Merge PR #78，只改文档）为 [43267230382](https://github.com/R6SD/factory-3d-showcase/actions/runs/43267230382)，结论都是 `success`。

#81 合入前，PR head `66d74fe`（`66d74fe4b6b0a4e1daed9110bd5045cb275f3da1`；父提交 `8d50986` + `422d7a4`）的 CI 是 [43917640878](https://github.com/R6SD/factory-3d-showcase/actions/runs/43917640878)，结论 `success`。作者、测试方和群里都报告在 `66d74fe` 上 51 个文件、371 条测试。测试方在并入 #64 之后 PASS：看到进入回放的界面、播放/暂停/倍速/拖动、10:00 自动暂停、脚本故障在 01:30 和 05:00、回放中实时冻结且确认/清除被藏起、回到实时、图层跟随回放帧、#64 回归，产能看板不跟随帧（<https://github.com/R6SD/factory-3d-showcase/pull/81#issuecomment-6924815689>）。更早在 `8d50986` 上的 PASS（361 条测试）是 <https://github.com/R6SD/factory-3d-showcase/pull/81#issuecomment-6923653739>；该 SHA 后来相对 `422d7a4` 已脏。Electron 桌面端未测。640px 图例偏移未测，也没有记成失败。

#64 合入前，PR head `e3cb200`（`e3cb200a1c94de97df86ae4649dedd10fa0f4bad`；父提交 `2970b6f` + `2d26dbf`）的 CI 是 [43910226428](https://github.com/R6SD/factory-3d-showcase/actions/runs/43910226428)，结论 `success`。作者、测试方和群里都报告 48 个文件、360 条测试。测试方 PASS：看到进度百分比、「正在解析三维模型…」、损坏提示「文件无法解析，请检查格式」、禁用 WebGL 后的降级页与产能/组织入口（<https://github.com/R6SD/factory-3d-showcase/pull/64#issuecomment-6923478752>）。Electron 未测。

#80 合入前，PR head `195d5cb`（`195d5cb4c02e01d3b22d664c3b789f9ef1b65bc0`）的 CI 是 [43273758944](https://github.com/R6SD/factory-3d-showcase/actions/runs/43273758944)，结论 `success`。作者、测试方和群里都报告 44 个文件、350 条测试。测试方在 `195d5cb` 上的结论是 PASS：看到图层、图例、仿真和绘制调用（<https://github.com/R6SD/factory-3d-showcase/pull/80#issuecomment-6922438432>）。

#77 合入前，PR head `8f6e45d`（已把当时的 `main` `636f5a3` 并入该分支）的 CI 是 [43267462820](https://github.com/R6SD/factory-3d-showcase/actions/runs/43267462820)，结论 `success`。作者在这次并入之前报告 `npm test` 为 340 条，并且 `npm run build` 通过；并入之后，开发方和测试方报告 341 条。测试方在 `8f6e45d` 上的结论是 PASS：看到预置告警、按严重程度筛选、飞到设备并脉冲、确认和清除后仍留在历史、故障注入和「已恢复」，341 条测试通过（<https://github.com/R6SD/factory-3d-showcase/pull/77#issuecomment-6831084566>）。当时 `main`（`71f7083`）的作业日志与这个 341 条一致（43 个文件）。

#76 修的是 `f294654`（Merge PR #66）那次失败，细节仍见已知问题 7，这里不重开。其间的文档合入 `e95371b`（Merge PR #75，只改文档）CI 是 [43262792131](https://github.com/R6SD/factory-3d-showcase/actions/runs/43262792131)，结论 `success`。#76 合入前，PR head `6103701` 的 CI 是 [43262114717](https://github.com/R6SD/factory-3d-showcase/actions/runs/43262114717)，结论 `success`。作者在该 PR 报告 `npm test` 为 41 个文件、328 条测试通过，并且 `npm run build` 通过。测试方在 `6103701` 上的结论是 PASS：布局断言没有改，328 条测试通过；40ms 启动超时用例连续 8 次通过，并清掉 chrome 和临时目录（<https://github.com/R6SD/factory-3d-showcase/pull/76#issuecomment-6830251603>）。#67 合入后的 `21bab71`（<https://github.com/R6SD/factory-3d-showcase/actions/runs/42676767900>）和 `9e49077`（<https://github.com/R6SD/factory-3d-showcase/actions/runs/42677767888>）当时是 `success`。更早的次数见变更表 #67 一行。

同一次推送触发的 **Deploy GitHub Pages**（`pages.yml`，不是 `ci.yml`）失败：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43925560416>（结论 `failure`）。Test 通过（日志 Test Files 51 passed，Tests 371 passed，Duration 33.38s），Build 通过（1907 modules transformed，`built in 5.22s`）。失败在 Setup Pages（`actions/configure-pages@v5` 报 `Get Pages site failed` / `Not Found`），Upload artifact 和 deploy 被跳过。这次 Pages 的 Test 打出了「narrow Chrome 启动超时，清理后重试（1/2）」，然后继续并通过（40ms 残留用例 484ms）。这是第一次探针超时后恢复，不是 CI 失败，也不重开 #73。同一失败形态也出现在 `5581b6a` 的 [43918499791](https://github.com/R6SD/factory-3d-showcase/actions/runs/43918499791)、`422d7a4` 的 [43915841088](https://github.com/R6SD/factory-3d-showcase/actions/runs/43915841088)、`5b67901` 的 [43912300429](https://github.com/R6SD/factory-3d-showcase/actions/runs/43912300429)、`2d26dbf` 的 [43909024954](https://github.com/R6SD/factory-3d-showcase/actions/runs/43909024954)、`df64c21` 的 [43273640915](https://github.com/R6SD/factory-3d-showcase/actions/runs/43273640915)、`71f7083` 的 [43270926946](https://github.com/R6SD/factory-3d-showcase/actions/runs/43270926946)、`636f5a3` 的 [43267230731](https://github.com/R6SD/factory-3d-showcase/actions/runs/43267230731) 和 `622b253` 的 [43264930028](https://github.com/R6SD/factory-3d-showcase/actions/runs/43264930028)。Pages 仍未开通，站点 404，见下方已知问题。

## 已知问题

1. **照片管理只在桌面端。** Web 构建和 GitHub Pages 构建没有照片的浏览器回落。`/admin` → **照片库** 依赖 `GET/POST /api/photos`（Electron 本地服务）。`npm run dev` / `npm run preview` 下该接口不存在，列表为空；上传会提示「照片上传失败」。
2. **没有 `/api` 时，Web 构建改用浏览器存储。** `GET /api/data/business`、`GET /api/config` 非成功时，业务数据写入 `localStorage` 键 `factory-business-v1`，配置写入 `factory-workbench-v4`。模型文件在 `/api/models` 不可用时写入 IndexedDB 库 `factory-model-library`。这两条接口 404 不表示页面崩溃。设置中心 → **数据与集成** 的来源文案为「浏览器本地存储」。桌面端来源文案为「本地后端服务（已落盘）」。
3. **GitHub Pages 尚未在仓库设置里打开，预览地址还不是活的。** 仓库 API 的 `has_pages` 仍为 `false`。<https://r6sd.github.io/factory-3d-showcase/> 当前返回 HTTP 404（2026-11-16T18:10:34Z 用 `curl -sI` 核对，Date 头为该时刻，状态码 404）。`main`（`20bd901`）上这次 Pages 部署失败：<https://github.com/R6SD/factory-3d-showcase/actions/runs/43925560416>（结论 `failure`。Test 通过：日志 Test Files 51 passed，Tests 371 passed，Duration 33.38s。Build 通过：1907 modules transformed，`built in 5.22s`。失败在 Setup Pages，`actions/configure-pages@v5` 报 `Get Pages site failed` / `Not Found`，Upload artifact 和 deploy 被跳过。这次 Pages 的 Test 打出了「narrow Chrome 启动超时，清理后重试（1/2）」，然后继续并通过（40ms 残留用例 484ms）。这是第一次探针超时后恢复，不是 CI 失败，也不重开 #73）。同一失败形态也出现在 `5581b6a` 的 [43918499791](https://github.com/R6SD/factory-3d-showcase/actions/runs/43918499791)、`422d7a4` 的 [43915841088](https://github.com/R6SD/factory-3d-showcase/actions/runs/43915841088)、`5b67901` 的 [43912300429](https://github.com/R6SD/factory-3d-showcase/actions/runs/43912300429)、`2d26dbf` 的 [43909024954](https://github.com/R6SD/factory-3d-showcase/actions/runs/43909024954)、`df64c21` 的 [43273640915](https://github.com/R6SD/factory-3d-showcase/actions/runs/43273640915) 和 `71f7083` 的 [43270926946](https://github.com/R6SD/factory-3d-showcase/actions/runs/43270926946)。同一提交的 CI（<https://github.com/R6SD/factory-3d-showcase/actions/runs/43925560584>）结论是 `success`，见上一节。需要仓库所有者在 Settings → Pages → Source 选择 **GitHub Actions** 之后才会发布。本交付不改仓库设置。
4. **[#20](https://github.com/R6SD/factory-3d-showcase/issues/20) 坏文件提示、exceljs 分包加载失败、IndexedDB 不可用。** 1.4.3 的行为：导入 0 字节或改名的 `.xlsx` 时，提示是「未解析到有效行：需包含“姓名”列」（产出记录为「需包含“日期、姓名、产量”列」，月度计划为「需包含“月份、计划产量”列」），容易理解成缺列，而不是文件无法解析。`src/data/sheet-io.js` 的 `loadWorkbook()`（`import('exceljs')`）在 try 外面，分包加载失败时会出现 unhandled rejection。IndexedDB 不可用（如隐私模式）时同样可能出现 unhandled rejection。已在 main 修复（#25），1.4.3 仍是旧行为。`main` 上无法读取的工作簿提示「文件无法解析，请检查格式」；分包加载失败提示「表格组件加载失败，请刷新页面后重试」；IndexedDB 打不开时展示页仍能打开，并显示「本地模型库不可用，已降级为本次会话」。
5. **[#27](https://github.com/R6SD/factory-3d-showcase/issues/27) 双击归位动画被其他视角操作拉回；隐藏部件仍算命中。** 双击空白处后，680ms 归位动画进行中（大约一秒内）再点预设视角（「顶视图」「前视图」「侧视图」「默认视角」，或 `T` / `F` / `S`）或按 `R`，下一帧会被动画拉回初始机位；隐藏网格原来的位置双击不会归位。仅 main 曾出现，已由 #31 修复。1.4.3 没有双击归位，不受 #27 影响。
6. **[#7](https://github.com/R6SD/factory-3d-showcase/issues/7) 设备拾取、状态色和详情侧栏。** 点击设备打开详情侧栏，并按状态着色。已在 main 修复（#30）。1.4.3 点击设备不会打开侧栏。[#8](https://github.com/R6SD/factory-3d-showcase/issues/8) 性能预算面板由 [#36](https://github.com/R6SD/factory-3d-showcase/pull/36) 合入后，三维页按钮是「性能预算」，不再是 **FPS**。1.4.3 仍是 1.3.0 起的 **FPS** 性能监控，不要在 1.4.3 演示里找 #8。
7. **[#73](https://github.com/R6SD/factory-3d-showcase/issues/73) narrow 用例启动超时，以及超时后留下 Chrome、crashpad 和临时目录。已由 [#76](https://github.com/R6SD/factory-3d-showcase/pull/76) 修复。** #67 把 `tests/app-header-narrow.test.js` 改成 `puppeteer-core` 的 pipe 之后，pipe 没有单独的就绪信号，第一条 CDP `Target.setDiscoverTargets` 就是探针，当时的 `protocolTimeout` 是 15s。正常结束会关掉浏览器。启动抛错时还没有 `Browser`：puppeteer 的失败路径是未等待的优雅关闭（再等一个 `protocolTimeout` 才 SIGKILL），临时目录要等浏览器进程退出才删；Vitest 的 fork 停不下来时会在 500ms 后 SIGKILL，`exit` 钩子不跑。Chrome 是 detached，`chrome_crashpad_handler` 在另一个进程组，命令行里也没有用户目录，所以当时 chrome、crashpad 和临时目录都会留下，要等 runner 在作业结束时收。这是 #67 留下的跟进。`f294654` 的 CI [43258768258](https://github.com/R6SD/factory-3d-showcase/actions/runs/43258768258) 就是这一笔：326/327，`ProtocolError: Target.setDiscoverTargets timed out`（15075ms），堆栈在 `ChromeLauncher.launch` → `TargetManager.initialize`，布局断言没有跑到。作业结束清掉 `chrome`（pid 2565）和两个 `chrome_crashpad_handler`（pid 2762、2778）。#76 只改测试：探针改为 20s（盖住已经看到的 12.9s 慢启动，不是恢复默认 180s）；只对这种启动超时再试一次，先清理再换新的 `narrow-chrome-*` 目录，断言失败不重试；即便 `launch` 抛错，也 SIGKILL 该目录的进程组、其子进程，以及启动前没有的 crashpad，然后删目录。用例超时盖住两次探针加清理。新增的 40ms 用例断言同一类 `timed out`，清理时看到带该目录的 Chrome 和 crashpad，结束后进程和临时目录都没有了。布局断言没有改。没有运行时或用户可见的变化。PR CI [43262114717](https://github.com/R6SD/factory-3d-showcase/actions/runs/43262114717) 通过，合入 `622b253`。#76 的修复仍在：探针 20s，只对启动超时再试一次并先清理，另有 40ms 残留用例。`2d26dbf`（Merge PR #80）的 CI [43909024883](https://github.com/R6SD/factory-3d-showcase/actions/runs/43909024883) 是 `failure`（日志为 44 个文件里 43 个通过、350 条里 349 条通过）。那次打出了「narrow Chrome 启动超时，清理后重试（1/2）」，40ms 用例「Target.setDiscoverTargets 超时后不留 Chrome、crashpad 和临时目录」通过（471ms），作业结束的 `Cleaning up orphan processes` 没有列出 `chrome` 或 `chrome_crashpad_handler`。已经写明的剩余风险是两次探针都超过 20s：那一次发生了，布局断言没有跑到，`npm run build` 被跳过。#80 把 crashpad 晚出现时的等待收紧为看满 1 秒，成功是没有留下 Chrome、crashpad 和临时目录；看满 1 秒没有让那次两次都超过 20s 的探针通过。`422d7a4`（Merge PR #64）的 CI [43915841228](https://github.com/R6SD/factory-3d-showcase/actions/runs/43915841228) 是 `success`（48 个文件、360 条测试），那次绿的运行没有出现两次探针都超过 20s。当前 `main`（`20bd901`）的 CI [43925560584](https://github.com/R6SD/factory-3d-showcase/actions/runs/43925560584) 是 `success`（51 个文件、371 条测试）。两次探针都超过 20s 的剩余风险最后出现在 `2d26dbf` 的 [43909024883](https://github.com/R6SD/factory-3d-showcase/actions/runs/43909024883)；这次绿的运行没有出现（40ms 残留用例通过，490ms；作业结束的 `Cleaning up orphan processes` 没有列出 `chrome` 或 `chrome_crashpad_handler`）。本文不把这次通过写成该波动已经消失。本文没有在 `20bd901` 上另跑本地测试。#73 仍记为已由 #76 修复，不重开。

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
