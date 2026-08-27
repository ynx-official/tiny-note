export const messages = {
  'zh-CN': {
    appName: 'Tiny Note', notes: '笔记', library: '知识库', settings: '设置', allNotes: '全部笔记', recentlyDeleted: '最近删除', notebooks: '笔记本', search: '搜索', newNote: '新建笔记', newNotebook: '新建笔记本', untitled: '未命名笔记', uncategorized: '未分类', save: '已保存', saving: '保存中…', emptyNotes: '还没有笔记', emptyHint: '从一条想法开始吧', newKnowledge: '新建知识库', addToKnowledge: '添加到知识库', importNote: '导入笔记', importToKnowledge: '导入到知识库', referenceContent: '引用内容', referenceNote: '引用笔记', referenceFile: '引用文件', referenceNoNotes: '暂无可引用的笔记', referenceNoFiles: '暂无可引用的文件', removeReference: '移除引用', loading: '正在读取…', noKnowledgeBases: '暂无知识库', personal: '个人知识库', local: '本地知识库', createFolder: '新建文件夹', importFiles: '导入文件', preview: '预览', restore: '恢复', delete: '删除', cancel: '取消', confirm: '确认', theme: '主题', language: '语言', system: '跟随系统', light: '浅色', dark: '深色', general: '常规', appearance: '外观', aiWriting: 'AI 写作', fim: '智能续写（FIM）', fimHint: '停顿 2 秒后根据上下文生成续写', ai: 'AI 写作', model: '模型', models: '模型服务', modelConfiguration: '模型配置', modelConfigHint: 'API Key 仅保存到系统凭据，不会回显明文。', noModels: '还没有配置模型', apiKey: 'API Key', configured: '已配置', notConfigured: '未配置', close: '关闭', back: '返回', noFiles: '此处还没有文件', chooseKb: '选择一个知识库开始', rename: '重命名', trash: '移入回收站', openExternal: '系统打开', noteSaved: '笔记已保存', confirmDelete: '确定要删除吗？', provider: '提供商', baseUrl: 'Base URL', modelName: '模型名称', addModel: '添加模型', name: '名称', action: '操作', undo: '撤销', redo: '重做', bold: '粗体', italic: '斜体', underline: '下划线', heading: '标题', bullet: '项目列表', ordered: '编号列表', quote: '引用', code: '代码', link: '链接', export: '导出 Markdown', stop: '停止', about: '关于', settingsSearch: '搜索设置…', appearanceHint: '主题、语言与界面显示', aiWritingHint: '智能续写与编辑器中的 AI 功能', modelsHint: '配置 AI 厂商、OpenAI 兼容服务与模型', aboutHint: 'Tiny Note 的版本与本地数据说明', languageHint: '界面显示语言', fimCostHint: '开启前请确认模型服务可能产生外部请求和费用。', localFirst: '本地优先', localFirstHint: '笔记与知识库数据保存在本机，Tiny Note 不读取 Friday 数据。', noteScope: '首期聚焦笔记、知识库与 AI 写作。'
  },
  en: {
    appName: 'Tiny Note', notes: 'Notes', library: 'Library', settings: 'Settings', allNotes: 'All notes', recentlyDeleted: 'Recently deleted', notebooks: 'Notebooks', search: 'Search', newNote: 'New note', newNotebook: 'New notebook', untitled: 'Untitled note', uncategorized: 'Uncategorized', save: 'Saved', saving: 'Saving…', emptyNotes: 'No notes yet', emptyHint: 'Start with an idea', newKnowledge: 'New knowledge base', addToKnowledge: 'Add to knowledge base', importNote: 'Import note', importToKnowledge: 'Import to knowledge base', referenceContent: 'References', referenceNote: 'Reference note', referenceFile: 'Reference file', referenceNoNotes: 'No notes available to reference', referenceNoFiles: 'No files available to reference', removeReference: 'Remove reference', loading: 'Loading…', noKnowledgeBases: 'No knowledge bases', personal: 'Personal', local: 'Local', createFolder: 'New folder', importFiles: 'Import files', preview: 'Preview', restore: 'Restore', delete: 'Delete', cancel: 'Cancel', confirm: 'Confirm', theme: 'Theme', language: 'Language', system: 'System', light: 'Light', dark: 'Dark', general: 'General', appearance: 'Appearance', aiWriting: 'AI writing', fim: 'Smart continuation (FIM)', fimHint: 'Generate after a 2 second pause', ai: 'AI writing', model: 'Model', models: 'Model services', modelConfiguration: 'Model configuration', modelConfigHint: 'The API key is stored in system credentials and never shown here.', noModels: 'No models configured', apiKey: 'API Key', configured: 'Configured', notConfigured: 'Not configured', close: 'Close', back: 'Back', noFiles: 'No files here', chooseKb: 'Choose a knowledge base', rename: 'Rename', trash: 'Move to trash', openExternal: 'Open with system', noteSaved: 'Note saved', confirmDelete: 'Delete this item?', provider: 'Provider', baseUrl: 'Base URL', modelName: 'Model name', addModel: 'Add model', name: 'Name', action: 'Action', undo: 'Undo', redo: 'Redo', bold: 'Bold', italic: 'Italic', underline: 'Underline', heading: 'Heading', bullet: 'Bullets', ordered: 'Numbered list', quote: 'Quote', code: 'Code', link: 'Link', export: 'Export Markdown', stop: 'Stop', about: 'About', settingsSearch: 'Search settings…', appearanceHint: 'Theme, language, and interface display', aiWritingHint: 'Smart continuation and editor AI features', modelsHint: 'Configure AI providers and models', aboutHint: 'Tiny Note version and local data notes', languageHint: 'Interface display language', fimCostHint: 'External model requests may incur costs. Review before enabling.', localFirst: 'Local first', localFirstHint: 'Notes and knowledge-base data stay on this device. Tiny Note never reads Friday data.', noteScope: 'The first release focuses on notes, knowledge bases, and AI writing.'
  }
}

Object.assign(messages['zh-CN'], {
  calendar: '日历', todos: '待办',
  tags: '标签', untagged: '未添加标签', searchTags: '搜索标签', newTag: '新建标签', renameTag: '重命名标签', deleteTag: '删除标签', addNotes: '添加笔记', removeFromTag: '移除', noTaggedNotes: '暂无笔记', allNotesTagged: '所有笔记都已经添加了标签', batchAddHint: '可以从全部笔记中批量添加', searchNotes: '搜索笔记', noAvailableNotes: '没有可添加的笔记', add: '添加', notebookPath: '所属笔记本',
  assistantCenter: '助手中心', memoryManagement: '记忆管理', usageStatistics: '用量统计',
  assistantName: 'Tiny Note 助手', birthDate: '创建日期', memoryFiles: '记忆文件',
  memoryHint: '这些文件保存在本机，只有你明确配置的 AI 请求会使用它们。',
  editMemory: '编辑记忆', previewMemory: '预览', words: '字', saveMemory: '保存',
  memorySaved: '记忆已保存', usageRange: '统计范围', today: '今天', last7Days: '近 7 天',
  last30Days: '近 30 天', allTime: '全部', refresh: '刷新', clearUsage: '清空记录',
  clearUsageConfirm: '确定清空所有用量记录吗？', totalTokens: '总 Token',
  promptTokens: '输入 Token', completionTokens: '输出 Token', reasoningTokens: '思考 Token',
  requests: '请求次数', dailyTrend: '每日趋势', byModel: '按模型', bySource: '按来源',
  usageEmpty: '还没有可统计的模型用量', usageHint: '统计数据来自 Tiny Note 发起的模型请求。',
  more: '更多', moreActions: '更多操作', exportAndPrint: '导出与打印', aiVersionHistory: 'AI 版本历史',
  exportMarkdown: '导出 Markdown', exportHtml: '导出 HTML', exportPdf: '导出 PDF', printArticle: '打印', deleteNote: '删除笔记',
  exportingHtml: '正在导出 HTML…', exportingPdf: '正在导出 PDF…', preparingPrint: '正在准备打印…',
  htmlExported: 'HTML 已导出', pdfExported: 'PDF 已导出', markdownExported: 'Markdown 已导出',
  htmlExportFailed: 'HTML 导出失败，请重试', pdfExportFailed: 'PDF 导出失败，请重试', printFailed: '打印失败，请重试',
  pdfTooLong: '文章过长，无法安全生成 PDF。请使用“打印”保存为 PDF，或拆分文章后重试。',
  shortcutSettings: '快捷键', shortcutSettingsHint: '按功能分类查看并自定义应用快捷键', editorShortcuts: '编辑器',
  editorModeShortcut: '切换编辑模式', editorModeShortcutHint: '在即时编辑和 Markdown 之间切换，仅保存在当前设备。',
  recordShortcut: '点击后按下新的组合键', pressShortcut: '请按下新快捷键',
  shortcutRequiresModifier: '请同时按下 Ctrl（macOS 为 ⌘）和一个按键', resetShortcut: '恢复默认'
  , fileSaveLocation: '文件保存位置', fileSaveLocationHint: '设置 Markdown、HTML、PDF 和生成图片的默认保存文件夹', defaultExportDirectory: '默认保存文件夹',
  chooseEveryExport: '每次保存时选择', chooseExportLocation: '选择文件保存位置', chooseExportLocationHint: '选择一个文件夹保存本次文件。已有同名文件时会自动生成新名称。',
  rememberExportLocation: '以后都保存到此目录', rememberExportLocationHint: '可随时在“设置 → 文件保存位置”中更改', selectFolder: '选择文件夹', openingFolderPicker: '正在打开…',
  changeFolder: '更换文件夹', clearFolder: '清除', exportLocationSaved: '文件保存位置已更新', exportLocationCleared: '已恢复为每次导出时选择'
  , exportSucceeded: '保存成功', exportSucceededHint: '“{fileName}”已经保存完成。', openContainingFolder: '打开所在文件夹', openExportedFile: '打开文件', maybeLater: '以后再说'
})

Object.assign(messages.en, {
  calendar: 'Calendar', todos: 'Todos',
  tags: 'Tags', untagged: 'Untagged', searchTags: 'Search tags', newTag: 'New tag', renameTag: 'Rename tag', deleteTag: 'Delete tag', addNotes: 'Add notes', removeFromTag: 'Remove', noTaggedNotes: 'No notes', allNotesTagged: 'Every note has a tag', batchAddHint: 'Add notes from your notebook tree', searchNotes: 'Search notes', noAvailableNotes: 'No notes available', add: 'Add', notebookPath: 'Notebook',
  assistantCenter: 'Assistant center', memoryManagement: 'Memory management', usageStatistics: 'Usage statistics',
  assistantName: 'Tiny Note assistant', birthDate: 'Created', memoryFiles: 'Memory files',
  memoryHint: 'These files stay on this device and are only used by model requests you explicitly configure.',
  editMemory: 'Edit memory', previewMemory: 'Preview', words: 'chars', saveMemory: 'Save',
  memorySaved: 'Memory saved', usageRange: 'Range', today: 'Today', last7Days: 'Last 7 days',
  last30Days: 'Last 30 days', allTime: 'All time', refresh: 'Refresh', clearUsage: 'Clear records',
  clearUsageConfirm: 'Clear all usage records?', totalTokens: 'Total tokens',
  promptTokens: 'Prompt tokens', completionTokens: 'Completion tokens', reasoningTokens: 'Reasoning tokens',
  requests: 'Requests', dailyTrend: 'Daily trend', byModel: 'By model', bySource: 'By source',
  usageEmpty: 'No model usage recorded yet', usageHint: 'Statistics are collected from model requests made by Tiny Note.',
  more: 'More', moreActions: 'More actions', exportAndPrint: 'Export and print', aiVersionHistory: 'AI version history',
  exportMarkdown: 'Export Markdown', exportHtml: 'Export HTML', exportPdf: 'Export PDF', printArticle: 'Print', deleteNote: 'Delete note',
  exportingHtml: 'Exporting HTML…', exportingPdf: 'Exporting PDF…', preparingPrint: 'Preparing to print…',
  htmlExported: 'HTML exported', pdfExported: 'PDF exported', markdownExported: 'Markdown exported',
  htmlExportFailed: 'Could not export HTML. Try again.', pdfExportFailed: 'Could not export PDF. Try again.', printFailed: 'Could not print. Try again.',
  pdfTooLong: 'This article is too long to export safely. Use Print to save as PDF, or split the article and try again.',
  shortcutSettings: 'Shortcuts', shortcutSettingsHint: 'Browse and customize shortcuts by feature', editorShortcuts: 'Editor',
  editorModeShortcut: 'Switch editor mode', editorModeShortcutHint: 'Switch between instant editing and Markdown. Stored on this device only.',
  recordShortcut: 'Click, then press a new shortcut', pressShortcut: 'Press a new shortcut',
  shortcutRequiresModifier: 'Press Ctrl (⌘ on macOS) together with another key', resetShortcut: 'Reset'
  , fileSaveLocation: 'File save location', fileSaveLocationHint: 'Set the default folder for Markdown, HTML, PDF, and generated images', defaultExportDirectory: 'Default save folder',
  chooseEveryExport: 'Choose every time', chooseExportLocation: 'Choose file save location', chooseExportLocationHint: 'Choose a folder for this file. A new name is created when a file already exists.',
  rememberExportLocation: 'Always save to this folder', rememberExportLocationHint: 'You can change it later in Settings → File save location', selectFolder: 'Choose folder', openingFolderPicker: 'Opening…',
  changeFolder: 'Change folder', clearFolder: 'Clear', exportLocationSaved: 'File save location updated', exportLocationCleared: 'Export location will be chosen each time'
  , exportSucceeded: 'Saved', exportSucceededHint: '“{fileName}” has been saved.', openContainingFolder: 'Show in folder', openExportedFile: 'Open file', maybeLater: 'Maybe later'
})

Object.assign(messages['zh-CN'], {
  todoToday: '今天', todoRecent7: '最近 7 天', todoInbox: '收集箱', todoCompleted: '已完成',
  todoSmartLists: '智能列表', todoSmartListsHint: '待办会根据截止时间自动出现在今天和最近 7 天。',
  todoOpenNavigation: '打开待办导航', todoItems: '项', todoSort: '排序', todoSortDue: '按截止时间',
  todoSortPriority: '按优先级', todoSortCreated: '按创建时间', todoQuickPlaceholder: '添加待办，按 Enter 即可创建',
  todoAdding: '添加中…', todoLoading: '正在读取待办…', todoNoCompleted: '还没有已完成待办',
  todoEmpty: '这里已经清空了', todoEmptyHint: '记录下一件需要完成的事情。', todoOverdue: '已过期',
  todoLater: '后续', todoUndated: '无日期', todoNoDue: '无截止时间', todoRestore: '恢复待办',
  todoMarkCompleted: '标记完成', todoDetail: '待办详情', todoTitle: '待办标题', todoNotes: '备注',
  todoNotesPlaceholder: '补充说明…', todoSchedule: '时间安排', todoStart: '开始日期', todoSetStart: '设置日期段的开始日期（可选）', todoDue: '截止 / 结束', todoSetDue: '设置时间点或结束日期', todoRangeInvalid: '结束日期不能早于开始日期', todoPriority: '优先级',
  todoPriorityNone: '无', todoPriorityLow: '低', todoPriorityMedium: '中', todoPriorityHigh: '高',
  todoReminderStopped: '该提醒已停止；重新编辑提醒设置可再次启用。', todoReminderPermissionDenied: '未获得系统通知权限，提醒没有启用。',
  todoDeletePermanent: '永久删除', todoDeleteConfirm: '确定永久删除这个待办吗？', todoSelect: '选择一个待办',
  todoSelectHint: '在右侧查看和编辑完整信息', todoSaving: '正在保存…', todoSaved: '已保存',
  todoSaveFailed: '保存失败', todoTitleRequired: '待办标题不能为空',
  todoLists: '清单', todoListAdd: '添加清单', todoListEdit: '编辑清单', todoListNamePlaceholder: '输入清单名称', todoListColor: '清单颜色', todoListSaving: '保存中…',
  todoListMore: '清单更多操作', todoListDelete: '删除清单', todoListDeleteTitle: '删除清单', todoListDeleteConfirm: '删除“{name}”后，其中的待办会保留并移回未归类状态。',
  todoListNone: '无清单', todoListAssignment: '所属清单', todoListsExpand: '展开清单', todoListsCollapse: '收起清单'
})

Object.assign(messages.en, {
  todoToday: 'Today', todoRecent7: 'Next 7 days', todoInbox: 'Inbox', todoCompleted: 'Completed',
  todoSmartLists: 'Smart lists', todoSmartListsHint: 'Todos appear in Today and Next 7 days automatically based on their due time.',
  todoOpenNavigation: 'Open todo navigation', todoItems: 'items', todoSort: 'Sort', todoSortDue: 'Due date',
  todoSortPriority: 'Priority', todoSortCreated: 'Date created', todoQuickPlaceholder: 'Add a todo and press Enter',
  todoAdding: 'Adding…', todoLoading: 'Loading todos…', todoNoCompleted: 'No completed todos yet',
  todoEmpty: 'All clear', todoEmptyHint: 'Capture the next thing you need to do.', todoOverdue: 'Overdue',
  todoLater: 'Later', todoUndated: 'No date', todoNoDue: 'No due date', todoRestore: 'Restore todo',
  todoMarkCompleted: 'Mark complete', todoDetail: 'Todo details', todoTitle: 'Todo title', todoNotes: 'Notes',
  todoNotesPlaceholder: 'Add notes…', todoSchedule: 'Schedule', todoStart: 'Start date', todoSetStart: 'Set an optional date-range start', todoDue: 'Due / end', todoSetDue: 'Set a time or range end date', todoRangeInvalid: 'End date cannot be before start date', todoPriority: 'Priority',
  todoPriorityNone: 'None', todoPriorityLow: 'Low', todoPriorityMedium: 'Medium', todoPriorityHigh: 'High',
  todoReminderStopped: 'This reminder is stopped. Edit its settings to enable it again.', todoReminderPermissionDenied: 'Notification permission was not granted, so the reminder was not enabled.',
  todoDeletePermanent: 'Delete permanently', todoDeleteConfirm: 'Permanently delete this todo?', todoSelect: 'Select a todo',
  todoSelectHint: 'View and edit its details here', todoSaving: 'Saving…', todoSaved: 'Saved',
  todoSaveFailed: 'Save failed', todoTitleRequired: 'A title is required',
  todoLists: 'Lists', todoListAdd: 'Add list', todoListEdit: 'Edit list', todoListNamePlaceholder: 'Enter a list name', todoListColor: 'List color', todoListSaving: 'Saving…',
  todoListMore: 'List actions', todoListDelete: 'Delete list', todoListDeleteTitle: 'Delete list', todoListDeleteConfirm: 'Deleting “{name}” keeps its todos and moves them back to the unassigned state.',
  todoListNone: 'No list', todoListAssignment: 'List', todoListsExpand: 'Expand lists', todoListsCollapse: 'Collapse lists'
})
