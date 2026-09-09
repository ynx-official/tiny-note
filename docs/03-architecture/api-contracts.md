# 命令与接口契约

最后更新：2026-09-06

`src/services/commandMap.ts` 是前端命令与 DTO 的权威清单；`remoteCommands.ts` 将业务命令映射到 Go REST/SSE。Rust 仅承接窗口、托盘、更新、通知、系统凭据及授权文件操作。业务存储使用 MySQL、Redis 和私有 S3，不使用本机 SQLite。完整资源映射见 [远程后端契约](../backend-migration-contract.md)。

## 返回与错误

JSON DTO 使用 camelCase。业务接口返回 `{ code, msg, data }`，前端转换为 `ApiError(code, message, status, details)`。401 清理登录凭据和用户状态；409 表示乐观锁或提案版本冲突。文件内容接口返回原始字节，不包装 JSON。

## 外部 Markdown

`app_take_pending_markdown_files` 和 `external_markdown_read` 读取系统授权路径，始终返回磁盘正文并建立单次打开授权。`note_open_external_markdown` 生成 `external:` 标识，再调用本机 `external_markdown_bind` 校验授权、内容和绑定，返回内容指纹。前端用它构造独立编辑视图，不创建云端笔记。

`external_markdown_write` 仅接受已绑定标识、正文和期望指纹；校验规范路径与磁盘内容后原子替换，保留 BOM 和文件权限。源文件变化、丢失或路径替换时拒绝覆盖。`external_markdown_list/clear` 只维护本机历史。相同 ID 再次打开会刷新编辑器正文。普通列表、标签、引用选择和云端备份排除外部文档；显式“导入到笔记”创建独立云端副本。AI、修订和组织操作须先导入。

## 知识库文件

路径统一使用 `knowledgeBaseId + relativePath`，服务端拒绝路径越界并验证知识库与对象归属。写入和 URL 导入上限为 20 MB。

`GET /knowledge-bases/{id}/library/preview` 返回 `{ kind, title, content, mimeType, downloadPath? }`。文本和安全 HTML 在 `content` 中返回；图片、PDF 和其他二进制只返回类型及受认证保护的下载路径。超过 2 MB 的文本降级为可下载文件。

`GET /knowledge-bases/{id}/library/content?relativePath=...` 使用同一 Bearer 认证，返回原文件字节以及 attachment、nosniff、private/no-store 响应头。前端以有大小限制的流读取；图片使用可释放的 Blob URL，PDF 使用延迟加载的 PDF.js 本地 Worker、分页画布和文字回退。HTML 经 DOMPurify 清理，并放入无权限 sandbox。未知格式提供原文件下载。

## 模型与后台任务

模型密钥仅保存在服务端，列表只返回是否配置；测试与模型调用均由服务端执行。客户端通过类型化入口创建笔记 AI、对话总结及图片任务，不提交正文快照或任务状态。普通对话与 Agent 留在对话内；后台任务由 MySQL 保存权威状态，SSE 支持 Last-Event-ID 重放。

Agent 工具、审批及结构化输入由服务端注册表和运行状态校验。前端只提交当前运行的合法响应。通用任务创建和客户端状态迁移接口已移除。

## 安全编辑

笔记 AI 任务冻结原始 `baseVersion`。应用提案时，服务端在事务内锁定用户笔记与提案，验证版本及草稿状态，保存修订、更新正文并消费提案。空请求应用提案中的持久正文；局部替换由客户端提交合并正文。旧版本返回 HTTP 409，重复应用被拒绝。修订恢复继续使用笔记乐观锁。工作区导出不包含模型密钥或外部源文件。

## 分页笔记目录

新增 `note_page` / `GET /notes/page`，返回独立 `NoteSummary` 数组、总数与后续游标。默认 80、最多 200 条，SQL 只投影元信息和 200 字 excerpt，不返回任何编辑正文。支持笔记本、知识库、标签、排除标签、未添加标签、正文搜索、置顶和回收站筛选；游标绑定用户及筛选条件并保留数据库时间精度。标签页已接入，主笔记工作区仍在迁移。具体边界与性能记录见 [大库性能验收](../04-quality/note-library-performance.md)。
