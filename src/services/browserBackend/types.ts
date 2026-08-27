export interface BrowserItem extends Record<string, unknown> {
  id: string
  name: string
  title: string
  description: string
  category: string
  color: string
  kind: string
  mode: string
  status: string
  role: string
  path: string
  fileName: string
  relativePath: string
  content: string
  contentHtml: string
  contentText: string
  contentMarkdown: string
  contentBase64: string
  dataUri: string
  mimeType: string
  provider: string
  model: string
  prompt: string
  output: string
  outputDelta: string
  errorCode: string | null
  errorMessage: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
  modifiedAt: string | null
  completedAt: string | null
  startedAt: string | null
  deletedAt: string | null
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  startAt: string | null
  dueAt: string | null
  triggerAt: string | null
  nextFireAt: string | null
  stoppedAt: string | null
  lastFiredAt: string | null
  parentId: string | null
  notebookId: string | null
  knowledgeBaseId: string | null
  conversationId: string | null
  modelProfileId: string | null
  imageModelProfileId: string
  generationId: string
  taskId: string
  noteId: string
  sourceNoteId: string
  targetNoteId: string | null
  targetTitle: string
  tagId: string
  listId: string | null
  ownerType: string
  ownerId: string
  proposalId: string | null
  agentRunId: string | null
  requestId: string
  retryOf: string | null
  endpointType: string
  apiKeyConfigured: boolean
  imageEnabled: boolean
  isImageDefault: boolean
  isDefault: boolean
  pinned: boolean
  builtin: boolean
  enabled: boolean
  allDay: boolean
  completed: boolean
  defaultRequireApproval: boolean
  requireApproval: boolean
  size: string | number
  byteSize: number
  width: number | null
  height: number | null
  count: number
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  totalTokens: number
  intervalMinutes: number | null
  offsetMinutes: number | null
  priority: string
  assets: BrowserItem[]
  references: unknown[]
  sources: unknown[]
  cachedTools: BrowserItem[]
  toolNames: string[]
  noteIds: string[]
  inputImages: BrowserItem[]
  maskImage: BrowserItem | null
  dataUrl: string
  reminder: BrowserItem | null
  payload: BrowserItem
  result: unknown
  backup: BrowserItem
  settings: BrowserItem
  profile: BrowserItem
  input: BrowserItem
  request: BrowserItem
  version: number
  notebooks: BrowserItemList
  notes: BrowserItemList
  tags?: BrowserItemList
  noteTags: BrowserItemList
  knowledgeBases: BrowserItemList
  files: BrowserItemList
  templates: BrowserItemList
  links: BrowserItemList
  imageGenerations: BrowserItemList
  imageAssets: BrowserItemList
  calendarEvents: BrowserItemList
  todoLists: BrowserItemList
  todos: BrowserItemList
  reminders: BrowserItemList
  format: string
  ts: number
}

export type BrowserItemInput = Record<string, unknown>
export interface BrowserItemList extends Array<BrowserItem> {
  push(...items: BrowserItemInput[]): number
  unshift(...items: BrowserItemInput[]): number
}

export interface BrowserState extends Record<string, unknown> {
  notes: BrowserItemList
  notebooks: BrowserItemList
  tags: BrowserItemList
  noteTags: BrowserItemList
  kbs: BrowserItemList
  libraryFiles: BrowserItemList
  memories: BrowserItemList
  agentSkills: BrowserItemList
  agentToolPolicies: Record<string, boolean>
  mcpServers: BrowserItemList
  usageRecords: BrowserItemList
  imageGenerations: BrowserItemList
  imageAssets: BrowserItemList
  chatConversations: BrowserItemList
  chatMessages: BrowserItemList
  backgroundTasks: BrowserItemList
  calendarEvents: BrowserItemList
  todos: BrowserItemList
  todoLists: BrowserItemList
  reminders: BrowserItemList
  editProposals: BrowserItemList
  noteRevisions: BrowserItemList
  noteLinks: BrowserItemList
  templates: BrowserItemList
  models: BrowserItemList
  settings: BrowserItem
}

export interface BrowserArgs extends Record<string, unknown> {
  id: string
  runId: string | null
  modelId: string
  assetId: string
  generationId: string
  requestId: string
  conversationId: string
  proposalId: string
  noteId: string
  tagId: string | null
  notebookId: string | null
  knowledgeBaseId: string | null
  parentId: string | null
  ownerType: string
  ownerId: string
  relativePath: string
  newName: string
  name: string
  description: string
  cover: string | null
  search: string | null
  start: string
  end: string
  range: string
  url: string
  role: string
  mode: string
  content: string | number[]
  contentBase64: string
  contentHtml: string
  contentText: string
  contentMarkdown: string
  fileName: string
  modelProfileId: string | null
  agentRunId: string | null
  targetNoteId: string | null
  references: unknown[]
  sources: unknown[]
  completed: boolean
  pinned: boolean | null
  deleted: boolean
  untagged: boolean
  limit: number
  noteIds: string[]
  settings: BrowserItem
  input: BrowserItem
  request: BrowserItem
  profile: BrowserItem
  template: BrowserItem
  apiKey: string | null
}
