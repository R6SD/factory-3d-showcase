# Electron 通过本地 HTTP 服务而非 file:// 加载

Electron 主进程启动一个监听 127.0.0.1:43891 的 HTTP 服务，渲染进程通过 `http://127.0.0.1:43891/` 访问应用，而非使用 `file://` 协议直接加载 index.html。

原因：localStorage 和 IndexedDB 的作用域绑定到 origin（协议+主机+端口）。`file://` 协议下每个文件路径被视为不同 origin，导致标签数据和模型库在重启后丢失。固定端口的 HTTP 服务提供稳定 origin，使浏览器存储持久化。端口占用时自动递增重试（最多 10 次），但递增会改变 origin 导致数据丢失，因此优先使用固定端口。

## Consequences

- 模型库（IndexedDB）和标签（localStorage）在应用重启后保留
- 端口冲突时数据可能丢失（回退到新端口）
- 需处理服务关闭逻辑（`/api/close`）
