export const messages = {
  'zh-CN': {
    appName: 'Tiny Note', notes: '笔记', library: '知识库', settings: '设置', allNotes: '全部笔记', recentlyDeleted: '最近删除', notebooks: '笔记本', search: '搜索', newNote: '新建笔记', newNotebook: '新建笔记本', untitled: '未命名笔记', uncategorized: '未分类', save: '已保存', saving: '保存中…', emptyNotes: '还没有笔记', emptyHint: '从一条想法开始吧', newKnowledge: '新建知识库', addToKnowledge: '添加到知识库', importNote: '导入笔记', importToKnowledge: '导入到知识库', referenceContent: '引用内容', referenceNote: '引用笔记', referenceFile: '引用文件', referenceNoNotes: '暂无可引用的笔记', referenceNoFiles: '暂无可引用的文件', removeReference: '移除引用', loading: '正在读取…', noKnowledgeBases: '暂无知识库', personal: '个人知识库', local: '本地知识库', createFolder: '新建文件夹', importFiles: '导入文件', preview: '预览', restore: '恢复', delete: '删除', cancel: '取消', confirm: '确认', theme: '主题', language: '语言', system: '跟随系统', light: '浅色', dark: '深色', general: '常规', appearance: '外观', aiWriting: 'AI 写作', fim: '智能续写（FIM）', fimHint: '停顿 2 秒后根据上下文生成续写', ai: 'AI 写作', model: '模型', models: '模型服务', modelConfiguration: '模型配置', modelConfigHint: 'API Key 仅保存到系统凭据，不会回显明文。', noModels: '还没有配置模型', apiKey: 'API Key', configured: '已配置', notConfigured: '未配置', close: '关闭', back: '返回', noFiles: '此处还没有文件', chooseKb: '选择一个知识库开始', rename: '重命名', trash: '移入回收站', openExternal: '系统打开', noteSaved: '笔记已保存', confirmDelete: '确定要删除吗？', provider: '提供商', baseUrl: 'Base URL', modelName: '模型名称', addModel: '添加模型', name: '名称', action: '操作', undo: '撤销', redo: '重做', bold: '粗体', italic: '斜体', underline: '下划线', heading: '标题', bullet: '项目列表', ordered: '编号列表', quote: '引用', code: '代码', link: '链接', export: '导出 Markdown', stop: '停止', about: '关于', settingsSearch: '搜索设置…', appearanceHint: '主题、语言与界面显示', aiWritingHint: '智能续写与编辑器中的 AI 功能', modelsHint: '配置 AI 厂商、OpenAI 兼容服务与模型', aboutHint: 'Tiny Note 的版本与本地数据说明', languageHint: '界面显示语言', fimCostHint: '开启前请确认模型服务可能产生外部请求和费用。', localFirst: '本地优先', localFirstHint: '笔记与知识库数据保存在本机，Tiny Note 不读取 Friday 数据。', noteScope: '首期聚焦笔记、知识库与 AI 写作。'
  },
  en: {
    appName: 'Tiny Note', notes: 'Notes', library: 'Library', settings: 'Settings', allNotes: 'All notes', recentlyDeleted: 'Recently deleted', notebooks: 'Notebooks', search: 'Search', newNote: 'New note', newNotebook: 'New notebook', untitled: 'Untitled note', uncategorized: 'Uncategorized', save: 'Saved', saving: 'Saving…', emptyNotes: 'No notes yet', emptyHint: 'Start with an idea', newKnowledge: 'New knowledge base', addToKnowledge: 'Add to knowledge base', importNote: 'Import note', importToKnowledge: 'Import to knowledge base', referenceContent: 'References', referenceNote: 'Reference note', referenceFile: 'Reference file', referenceNoNotes: 'No notes available to reference', referenceNoFiles: 'No files available to reference', removeReference: 'Remove reference', loading: 'Loading…', noKnowledgeBases: 'No knowledge bases', personal: 'Personal', local: 'Local', createFolder: 'New folder', importFiles: 'Import files', preview: 'Preview', restore: 'Restore', delete: 'Delete', cancel: 'Cancel', confirm: 'Confirm', theme: 'Theme', language: 'Language', system: 'System', light: 'Light', dark: 'Dark', general: 'General', appearance: 'Appearance', aiWriting: 'AI writing', fim: 'Smart continuation (FIM)', fimHint: 'Generate after a 2 second pause', ai: 'AI writing', model: 'Model', models: 'Model services', modelConfiguration: 'Model configuration', modelConfigHint: 'The API key is stored in system credentials and never shown here.', noModels: 'No models configured', apiKey: 'API Key', configured: 'Configured', notConfigured: 'Not configured', close: 'Close', back: 'Back', noFiles: 'No files here', chooseKb: 'Choose a knowledge base', rename: 'Rename', trash: 'Move to trash', openExternal: 'Open with system', noteSaved: 'Note saved', confirmDelete: 'Delete this item?', provider: 'Provider', baseUrl: 'Base URL', modelName: 'Model name', addModel: 'Add model', name: 'Name', action: 'Action', undo: 'Undo', redo: 'Redo', bold: 'Bold', italic: 'Italic', underline: 'Underline', heading: 'Heading', bullet: 'Bullets', ordered: 'Numbered list', quote: 'Quote', code: 'Code', link: 'Link', export: 'Export Markdown', stop: 'Stop', about: 'About', settingsSearch: 'Search settings…', appearanceHint: 'Theme, language, and interface display', aiWritingHint: 'Smart continuation and editor AI features', modelsHint: 'Configure AI providers and models', aboutHint: 'Tiny Note version and local data notes', languageHint: 'Interface display language', fimCostHint: 'External model requests may incur costs. Review before enabling.', localFirst: 'Local first', localFirstHint: 'Notes and knowledge-base data stay on this device. Tiny Note never reads Friday data.', noteScope: 'The first release focuses on notes, knowledge bases, and AI writing.'
  }
}

Object.assign(messages['zh-CN'], {
  assistantCenter: '助手中心', memoryManagement: '记忆管理', usageStatistics: '用量统计',
  assistantName: 'Tiny Note 助手', birthDate: '创建日期', memoryFiles: '记忆文件',
  memoryHint: '这些文件保存在本机，只有你明确配置的 AI 请求会使用它们。',
  editMemory: '编辑记忆', previewMemory: '预览', words: '字', saveMemory: '保存',
  memorySaved: '记忆已保存', usageRange: '统计范围', today: '今天', last7Days: '近 7 天',
  last30Days: '近 30 天', allTime: '全部', refresh: '刷新', clearUsage: '清空记录',
  clearUsageConfirm: '确定清空所有用量记录吗？', totalTokens: '总 Token',
  promptTokens: '输入 Token', completionTokens: '输出 Token', reasoningTokens: '思考 Token',
  requests: '请求次数', dailyTrend: '每日趋势', byModel: '按模型', bySource: '按来源',
  usageEmpty: '还没有可统计的模型用量', usageHint: '统计数据来自 Tiny Note 发起的模型请求。'
})

Object.assign(messages.en, {
  assistantCenter: 'Assistant center', memoryManagement: 'Memory management', usageStatistics: 'Usage statistics',
  assistantName: 'Tiny Note assistant', birthDate: 'Created', memoryFiles: 'Memory files',
  memoryHint: 'These files stay on this device and are only used by model requests you explicitly configure.',
  editMemory: 'Edit memory', previewMemory: 'Preview', words: 'chars', saveMemory: 'Save',
  memorySaved: 'Memory saved', usageRange: 'Range', today: 'Today', last7Days: 'Last 7 days',
  last30Days: 'Last 30 days', allTime: 'All time', refresh: 'Refresh', clearUsage: 'Clear records',
  clearUsageConfirm: 'Clear all usage records?', totalTokens: 'Total tokens',
  promptTokens: 'Prompt tokens', completionTokens: 'Completion tokens', reasoningTokens: 'Reasoning tokens',
  requests: 'Requests', dailyTrend: 'Daily trend', byModel: 'By model', bySource: 'By source',
  usageEmpty: 'No model usage recorded yet', usageHint: 'Statistics are collected from model requests made by Tiny Note.'
})
