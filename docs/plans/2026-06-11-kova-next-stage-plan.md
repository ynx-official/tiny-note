# Kova 统一待办计划

- 范围：Kova 当前仓库统一执行面板
- 当前主线：本地优先体验 + 云同步可靠性
- 当前状态：执行中
- 主计划文件：`docs/plans/2026-06-11-kova-next-stage-plan.md`
- 最后更新：2026-06-11

---

## 已完成

### 1. 主计划文件与统一维护入口
- 完成日期：2026-06-11
- 影响范围：`docs/plans/`
- 结果说明：已确定由本文件作为唯一主计划入口，后续不再并行维护多份状态文档。

### 2. 设置弹窗化与分类重组
- 完成日期：已落地
- 影响范围：`src/App.tsx`、`src/components/layout/SettingsPanel/index.tsx`、`src/components/layout/SettingsPanel/settings-schema.ts`
- 结果说明：设置页已经从侧边栏形态切成居中弹窗，并带有一级分类导航和分类描述。

### 3. 本地同步基础骨架
- 完成日期：已落地
- 影响范围：`src-tauri/src/services/db/mod.rs`、`src-tauri/src/services/db/sync.rs`、`src/lib/db.ts`
- 结果说明：本地已具备 `sync_status / sync_version / cloud_id / deleted_at / device_id`、`sync_changes`、`sync_conflicts`、`attachment_index`、`sync_state` 等同步基础表和桥接模型。

### 4. 同步可观测性基础版
- 完成日期：已落地
- 影响范围：`src/lib/sync.ts`、`src/App.tsx`、`src/components/StatusBar.tsx`、`src/components/layout/SettingsPanel/index.tsx`
- 结果说明：已具备 `SyncRunDiagnostics`、`runId`、同步统计、状态栏同步信息、设置页诊断信息查看与复制入口。

### 5. 云登录、设备与首次同步入口基础版
- 完成日期：已落地
- 影响范围：`src/components/layout/LoginPanel.tsx`、`src/lib/cloudApi.ts`
- 结果说明：已具备云端登录、退出、当前用户展示，以及“本地上传 / 云端恢复 / 手动合并”的首次同步入口事件。

### 6. 备份恢复预检与回滚基础版
- 完成日期：已落地
- 影响范围：`src-tauri/src/services/db/mod.rs`、`src-tauri/src/lib.rs`、`src/components/layout/SettingsPanel/index.tsx`、`src/lib/db.ts`
- 结果说明：已具备恢复前检查、恢复前备份、恢复执行、恢复后设置回写与失败回滚基础链路。

### 7. 冲突处理入口基础版
- 完成日期：已落地
- 影响范围：`src/components/layout/SyncConflictDialog.tsx`、`src/App.tsx`、`src/lib/cloudApi.ts`
- 结果说明：已具备冲突列表、保留本地、云端覆盖、手动合并和标记处理的基础对话框。

### 8. 附件索引与内容复用基础版
- 完成日期：已落地
- 影响范围：`src/lib/assetArchive.ts`、`src-tauri/src/services/db/sync.rs`、`src/lib/db.ts`
- 结果说明：已具备附件索引、`sha256` 记录、`cloud_url / cloud_file_id`、基础上传复用和孤儿附件清理入口。

### 9. 排序入口与同步状态主界面可见基础版
- 完成日期：已落地
- 影响范围：`src/components/layout/Sidebar/index.tsx`、`src/components/StatusBar.tsx`
- 结果说明：列表已具备排序字段和升降序切换；状态栏已展示在线状态、待同步、失败、冲突和最近同步时间。

---

## 正在做

### 1. 附件同步一致性收口
- 当前目标：把现有附件索引、去重、清理、云映射收束成一条稳定链路，减少重复上传、重复下载和状态不一致
- 涉及模块：`src/lib/assetArchive.ts`、`src/lib/sync.ts`、`src-tauri/src/services/db/sync.rs`、`src/components/layout/SettingsPanel/index.tsx`
- 当前证据：已有 `attachment_index`、`sha256`、`cloud_file_id`、清理入口和上传复用，但计划里这条仍处于进行中
- 下一步：补下载复用统计、清理前预览、同步结果分项统计
- 风险/阻塞：附件路径仍和正文引用耦合，贸然改路径会影响旧笔记兼容性

### 2. 体验层状态统一
- 当前目标：把保存态、选择态、筛选态、同步态从“分别能用”收口成“一套对用户稳定可解释的状态系统” 
- 涉及模块：`src/App.tsx`、`src/hooks/useNotes.ts`、`src/components/detail/NoteDetail.tsx`、`src/components/shared/NoteList.tsx`、`src/components/StatusBar.tsx`
- 当前证据：已有 `saveState`、`isEditorDirty`、状态栏同步信息、排序入口，但还没有统一成完整体验闭环
- 下一步：先梳理状态来源和优先级，再统一状态文案与刷新策略
- 风险/阻塞：快捷便签、AI 改数、主窗口编辑都在改同一份数据，容易互相覆盖感知

---

## 未完成

### P0 近期必须推进

#### 1. 统一保存状态语言
- 目标：把“未保存 / 保存中 / 已保存 / 保存失败 / 待同步 / 冲突”统一成一套用户能看懂的反馈
- 涉及模块：`src/components/detail/NoteDetail.tsx`、`src/components/StatusBar.tsx`、`src/App.tsx`
- 当前状态：未开始
- 检查点：编辑器、状态栏、快捷便签回写、AI 改写同一笔记时状态口径一致

#### 2. 梳理列表态、编辑态、筛选态边界
- 目标：减少切换笔记、切换目录、AI 刷新、同步刷新时的状态跳变
- 涉及模块：`src/App.tsx`、`src/hooks/useNotes.ts`、`src/components/shared/NoteList.tsx`
- 当前状态：未开始
- 检查点：明确哪些状态属于主容器，哪些属于列表，哪些属于编辑器本地态

#### 3. 搜索能力升级
- 目标：从单一输入框升级为可解释的检索能力
- 涉及模块：`src/components/shared/SearchBar.tsx`、`src/components/layout/Sidebar/index.tsx`、`src/App.tsx`
- 当前状态：未开始
- 说明：排序入口已做，但搜索范围、空结果反馈、标签过滤、最近搜索还没形成闭环
- 检查点：至少补齐结果反馈、过滤维度和搜索上下文展示

#### 4. 主界面同步状态人话化
- 目标：把当前技术性同步状态翻译成更清晰的用户语言
- 涉及模块：`src/components/StatusBar.tsx`、`src/lib/sync.ts`、`src/App.tsx`
- 当前状态：未开始
- 说明：主界面同步状态基础版已做，但诊断仍偏技术视角
- 检查点：区分离线、待同步、失败、冲突、已同步，并减少技术字段直出

#### 5. 清理前预览与附件统计完善
- 目标：附件清理前先展示会删除什么，清理后能说明释放了多少、影响了什么
- 涉及模块：`src/components/layout/SettingsPanel/index.tsx`、`src-tauri/src/lib.rs`、`src/lib/sync.ts`
- 当前状态：未开始
- 检查点：支持“仅统计不删除”与更清晰的结果摘要

### P1 下一轮推进

#### 6. 草稿保护
- 目标：防止切换笔记、关闭窗口、同步刷新、AI 工具改写时覆盖本地未提交内容
- 涉及模块：`src/components/detail/NoteDetail.tsx`、`src/App.tsx`
- 当前状态：未开始
- 检查点：dirty 判定、切换策略、冲突提示统一

#### 7. 冲突处理界面从技术版升级到用户版
- 目标：不再让手动合并停留在 JSON 视角，而是面向笔记内容与字段差异
- 涉及模块：`src/components/layout/SyncConflictDialog.tsx`、`src/lib/cloudApi.ts`
- 当前状态：未开始
- 检查点：标题、正文、标签、移动、删除冲突可分开理解和处理

#### 8. 首次同步向导独立化
- 目标：把登录面板里的首次同步入口升级成真正的同步向导
- 涉及模块：`src/components/layout/LoginPanel.tsx`、`src/App.tsx`
- 当前状态：未开始
- 检查点：明确本地上传、云端恢复、手动合并三条路径的风险提示和后续动作

#### 9. 恢复安全增强
- 目标：把恢复链路从基础版推进到更彻底的整包校验和原子替换
- 涉及模块：`src-tauri/src/services/db/mod.rs`、`src-tauri/src/lib.rs`、`src/components/layout/SettingsPanel/index.tsx`
- 当前状态：未开始
- 说明：恢复预检和回滚基础版已完成，但大包校验下沉、临时目录整包校验仍未完全收口
- 检查点：损坏 ZIP、缺失文件、manifest 不合法、恢复失败回滚都要稳定可复现

#### 10. App / SettingsPanel 职责拆分
- 目标：降低主容器和设置面板的编排复杂度，为后续测试和性能优化清路
- 涉及模块：`src/App.tsx`、`src/components/layout/SettingsPanel/index.tsx`
- 当前状态：未开始
- 检查点：至少拆出同步控制层、设置子分区装配层

### P2 暂缓但保留

#### 11. 自动化测试基线
- 目标：为前端、Rust 同步与恢复链路建立最小自动化基线
- 涉及模块：`package.json`、前端关键纯逻辑、`src-tauri/src/services/db/*`
- 当前状态：未开始
- 检查点：前端测试、Rust 测试、手动回归清单三件套到位

#### 12. 大文档与预览性能优化
- 目标：降低大文档输入、Markdown 预览、图片处理和首包体积的成本
- 涉及模块：`src/components/detail/NoteDetail.tsx`、`src/components/shared/CodeEditor.tsx`、`src/components/shared/MarkdownPreview.tsx`、`vite.config.ts`
- 当前状态：未开始
- 检查点：输入卡顿下降、预览抖动减少、构建 chunk 更清晰

#### 13. 标签体系、历史与最近访问
- 目标：让笔记规模增长后依然易于检索和回访
- 涉及模块：`src/App.tsx`、`src/components/shared/SearchBar.tsx`、列表/侧边栏相关组件
- 当前状态：未开始
- 检查点：标签过滤、最近访问、历史入口形成最小导航闭环

#### 14. 跨仓云端服务收尾
- 目标：把 `tiny_rbac` 侧仍未完全并入当前体验闭环的同步/快照/并发安全项继续收口
- 涉及模块：外部仓库 `D:\study\tiny_rbac`
- 当前状态：暂缓
- 检查点：这部分单列为跨仓任务，不和当前前端/Rust 本地任务混做

---

## 当前迭代范围

### 迭代一：统一状态与主界面可解释性
- 统一保存状态语言
- 梳理列表态、编辑态、筛选态边界
- 搜索能力升级
- 主界面同步状态人话化

### 迭代二：附件与恢复可信度
- 附件同步一致性收口
- 清理前预览与附件统计完善
- 草稿保护
- 恢复安全增强

### 迭代三：结构拆分与质量底座
- 冲突处理界面升级
- 首次同步向导独立化
- App / SettingsPanel 职责拆分
- 自动化测试基线

---

## 风险与阻塞

### 1. 多入口改同一份数据
- 现象：主窗口、快捷便签、AI 工具、同步应用都可能改同一篇笔记
- 影响：保存态、选中态、dirty 判定容易互相覆盖
- 应对：先收口状态边界，再继续做体验层增强

### 2. `App.tsx` 作用域偏大
- 现象：同步、窗口、面板、选中态、刷新逻辑集中在同一处
- 影响：任何一个体验项都容易牵连别的链路
- 应对：等状态边界梳理后再拆控制层

### 3. 附件路径与正文引用耦合
- 现象：正文里直接引用 `kova-asset://...`
- 影响：做附件去重、改路径、做缺失下载复用时要兼顾旧内容兼容
- 应对：优先在索引和云映射层优化，不直接批量改正文路径

### 4. 跨仓任务边界
- 现象：部分历史计划涉及 `tiny_rbac` 云端仓库
- 影响：如果混入当前本地执行面板，会让状态判断失真
- 应对：当前主计划只把跨仓任务保留为单独未完成项，不和本仓实现混在一起

---

## 模块映射

- 主容器编排：`src/App.tsx`
- 笔记状态流：`src/hooks/useNotes.ts`
- 编辑保存体验：`src/components/detail/NoteDetail.tsx`
- 列表、多选、排序：`src/components/layout/Sidebar/index.tsx`、`src/components/shared/NoteList.tsx`
- 搜索入口：`src/components/shared/SearchBar.tsx`
- 状态栏与同步可见性：`src/components/StatusBar.tsx`
- 设置弹窗与同步/备份页：`src/components/layout/SettingsPanel/index.tsx`
- 登录与首次同步入口：`src/components/layout/LoginPanel.tsx`
- 冲突处理：`src/components/layout/SyncConflictDialog.tsx`
- 同步编排与诊断：`src/lib/sync.ts`
- 附件归档与复用：`src/lib/assetArchive.ts`
- Rust 数据与同步表：`src-tauri/src/services/db/mod.rs`、`src-tauri/src/services/db/sync.rs`

---

## 更新规则

1. 每次开始做一项时，把该项从“未完成”移动到“正在做”。
2. 每次确认收口后，把该项从“正在做”移动到“已完成”。
3. “正在做”同时最多保留 1 到 3 项。
4. 已经有基础版但还没收口的事项，不放“已完成”，放“正在做”或“未完成”并注明基础版现状。
5. 每条事项都要写清楚：目标、涉及模块、当前状态、下一步、检查点。
6. 后续所有推进记录，默认都维护这一个主文件，不再新开平行状态文档。
