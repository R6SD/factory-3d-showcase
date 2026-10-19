---
name: verify-app
description: 构建、启动并用无头浏览器验证工厂 Web3D 工作台。在声称首页三维、模型库或后台导入导出可用之前使用。
---

# 验证本应用

单元测试通过不等于页面可用。声称某条用户路径可用之前，先构建、启动，再用无头浏览器把那条路径点一遍，并留下截图。没有在页面上看到的结果不要写成通过。

## 构建

```bash
npm ci
npm test
npm run build
```

记录每条命令的退出码。`npm test` 是 vitest，`npm run build` 是 vite，产物在 `dist/`。

本地验证不要设置 `VITE_BASE`。仓库里 GitHub Pages 会用这个变量把站点挂到子路径；不设置时 `base` 为 `/`，预览地址就是下面的根路径。

## 启动

验证生产包：

```bash
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

打开 `http://127.0.0.1:4173/`。开发服务是 `npm run dev -- --host 127.0.0.1 --port 4173`。

没有 Electron 时，页面会请求 `/api/data/business` 和 `/api/config`，两者返回 404。业务数据这时用浏览器 localStorage 里的种子数据。这两条 404 不是页面崩溃。`pageerror` 和 `unhandledrejection` 仍然要为 0。

## 无头浏览器

用 Playwright 驱动本机 Chrome，像用户一样点击和选择文件。容器里的 WebGL 需要软件渲染，否则首页画布会是空的。Chrome 启动参数：

```text
--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --enable-webgl --ignore-gpu-blocklist
```

每个页面监听 `pageerror` 和 `unhandledrejection`。断言失败时先截当前屏幕。视口用 1440×900 左右，能看见表格和三维画布。

`setInputFiles` 会绕过系统文件对话框的扩展名过滤。要确认选择框接受哪些类型，读页面上 `<input type="file">` 的 `accept`。不要把 `.xlsx` 当成包含 `.xls`。

### 首页 `/`

- 出现 `.three canvas`，画布宽高大于 0。
- WebGL 上下文没有丢失，`.webgl-context-lost` 保持 `display: none`。
- 截图画布。场景背景是黑色，工厂模型应当占住一部分像素，整张纯黑算渲染失败。

### 模型库 `/models`

- 点「导入模型」，选择一个 `.glb`。
- 列表里立刻出现该文件名，且只有一条。默认场景 `Factory Campus A.glb` 仍在。
- 再导入同名文件，仍然只有一条。
- 刷新后该模型还在。

模型库页本身不挂三维场景。导入后先看列表，不必为了冒烟去解析一个假的 glb。

### 后台 `/admin`

Excel 导入在「业务数据」的三个子页：人员与组织、产出记录、月度计划。产能看板和组织关系没有 Excel 导入。

- 坏文件（0 字节 `.xlsx`、用文本改名的 `.xlsx`）要在页面上出现「文件无法解析，请检查格式」，条数不变，之后还能切换子页。表头能读但缺必填列时，仍提示「未解析到有效行：需包含…列」。
- 正常 `.xlsx` 含表头和中间空行。产出记录的日期列用真正的日期单元格，并在 UTC 负时区（如 `America/Los_Angeles`）核对日期没有提前一天。
- 导入条数、关键字段和刷新后的列表一致。
- 「导出当前」下载的 `.xlsx` 用 exceljs 读回，与页面可见行一致；再把该文件导回去，页面提示成功且条数不变。

产出记录超过 300 条时，表格只显示前 300 条，标题里的总数才是全量。导出对的是全量。这个子页上会同时有导入提示和「仅显示最近 300 条」，读提示时要按文案匹配，不要假定只有一个 `.admin-msg`。

## 不覆盖的部分

Electron 桌面端和 `npm run package:win` 不在无头浏览器的范围内。
