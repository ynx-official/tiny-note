import type { BrowserArgs, BrowserItem, BrowserItemList, BrowserState } from './types'
import type { BrowserHandlerResult } from './planner'

type ToolDefault = readonly [string, string, boolean]
function item(value: Record<string, unknown>): BrowserItem { return value as BrowserItem }
function items(values: Record<string, unknown>[]): BrowserItemList { return values as BrowserItemList }

function agentTools(state: BrowserState, defaults: ToolDefault[]) {
  return defaults.map(([name, description, defaultRequireApproval]) => ({ name, description, defaultRequireApproval, requireApproval: Object.hasOwn(state.agentToolPolicies, name) ? state.agentToolPolicies[name] : defaultRequireApproval }))
}

export function handleAgentCommand(command: string, args: BrowserArgs, state: BrowserState, now: string, skillSeed: Array<Record<string, unknown>>, toolDefaults: ToolDefault[]): BrowserHandlerResult | null {
  if (command === 'settings_get') return { result: state.settings }
  if (command === 'settings_update') { state.settings = args.settings; return { result: state.settings } }
  if (command === 'memory_list') return { result: state.memories }
  if (command === 'memory_update') { const memory = state.memories.find(value => value.fileName === args.fileName); if (!memory) throw new Error('记忆文件不存在'); memory.content = String(args.content || ''); memory.size = memory.content.length; memory.updatedAt = now; return { result: memory } }
  if (command === 'agent_skill_list') return { result: state.agentSkills.map(skill => ({ name: skill.name, description: skill.description, fileName: skill.fileName, builtin: skill.builtin, updatedAt: skill.updatedAt })) }
  if (command === 'agent_skill_read') return { result: state.agentSkills.find(skill => skill.fileName === `${args.name}/SKILL.md`) || null }
  if (command === 'agent_skill_upsert') { const request = args.request; const match = String(request.content || '').match(/description:\s*(.+)/); const skill = item({ name: request.name, description: match?.[1]?.trim() || '自定义 Agent 技能', fileName: `${request.name}/SKILL.md`, builtin: skillSeed.some(value => value.name === request.name), content: request.content || '', updatedAt: now }); state.agentSkills = items([...state.agentSkills.filter(value => value.fileName !== skill.fileName), skill]); return { result: skill } }
  if (command === 'agent_skill_delete') { state.agentSkills = state.agentSkills.filter(skill => skill.builtin || skill.fileName !== `${args.name}/SKILL.md`); return { result: null } }
  if (command === 'agent_mcp_list') return { result: state.mcpServers }
  if (command === 'agent_mcp_upsert') { const request = args.request; const previous = state.mcpServers.find(value => value.id === request.id); const server = item({ id: request.id, name: request.name, command: request.command, args: request.args || [], enabled: request.enabled !== false, cachedTools: previous?.cachedTools || [], lastError: null, updatedAt: now }); state.mcpServers = items([...state.mcpServers.filter(value => value.id !== server.id), server]); return { result: server } }
  if (command === 'agent_mcp_refresh') { const server = state.mcpServers.find(value => value.id === args.id); if (!server) throw new Error('MCP 服务不存在'); server.cachedTools ||= []; server.lastError = '浏览器预览不能启动本机 MCP 服务，请在桌面应用中刷新。'; server.updatedAt = now; return { result: server } }
  if (command === 'agent_mcp_delete') { state.mcpServers = state.mcpServers.filter(value => value.id !== args.id); return { result: null } }
  if (command === 'usage_get_stats') { const range = args.range || 'all'; const start = range === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : range === '7d' ? Date.now() - 7 * 86_400_000 : range === '30d' ? Date.now() - 30 * 86_400_000 : 0; const records = state.usageRecords.filter(value => value.ts >= start); const summary = records.reduce((total, value) => { total.totalPrompt += value.promptTokens; total.totalCompletion += value.completionTokens; total.totalTokens += value.totalTokens; total.totalReasoning += value.reasoningTokens || 0; return total }, { totalPrompt: 0, totalCompletion: 0, totalTokens: 0, totalReasoning: 0, totalRequests: records.length }); return { result: { range, summary, byModel: [], byDay: [], bySource: [] } } }
  if (command === 'usage_clear') { state.usageRecords = []; return { result: null } }
  if (command === 'agent_get_pending_run' || command === 'agent_get_run' || command === 'agent_cancel' || command === 'agent_resume') return { result: null }
  if (command === 'agent_list_tools') return { result: agentTools(state, toolDefaults) }
  if (command === 'agent_tool_policy_update') { const request = args.request; const known = new Set(toolDefaults.map(([name]) => name)); if (!request.toolNames?.length || request.toolNames.some(name => !known.has(name))) throw new Error('工具审批策略无效'); for (const name of request.toolNames) { if (request.requireApproval === null || request.requireApproval === undefined) delete state.agentToolPolicies[name]; else state.agentToolPolicies[name] = Boolean(request.requireApproval) } return { result: agentTools(state, toolDefaults) } }
  if (command === 'model_list') return { result: state.models.map(model => ({ ...model, imageEnabled: Boolean(model.imageEnabled), isImageDefault: Boolean(model.isImageDefault) })) }
  if (command === 'model_fetch_models') { const provider = String(args.request.provider || '').toLowerCase(); const presets = provider.includes('deepseek') ? ['deepseek-chat', 'deepseek-reasoner'] : provider.includes('智谱') || provider.includes('zhipu') ? ['glm-4-flash', 'glm-4-plus'] : provider.includes('kimi') || provider.includes('moonshot') ? ['moonshot-v1-8k', 'moonshot-v1-32k'] : provider.includes('minimax') ? ['MiniMax-Text-01'] : provider.includes('千问') || provider.includes('qwen') ? ['qwen-turbo', 'qwen-plus', 'qwen-max'] : ['gpt-4o-mini', 'gpt-4.1-mini']; return { result: presets.map(id => ({ id, name: id, ownedBy: args.request.provider || 'OpenAI-compatible' })) } }
  if (command === 'model_test') return { result: { ok: true, message: '连接成功', latencyMs: 86 } }
  if (command === 'model_query_balance') { const model = state.models.find(value => value.id === args.modelId); return { result: { supported: false, available: null, currency: null, totalBalance: 0, grantedBalance: 0, toppedUpBalance: 0, voucherBalance: 0, cashBalance: 0, updatedAt: now, error: model?.provider?.toLowerCase().includes('deepseek') ? '余额查询需要桌面端凭据服务。' : null } } }
  if (command === 'model_upsert') { const profile = item({ ...args.profile, endpointType: args.profile.endpointType || 'openaiChat', imageEnabled: Boolean(args.profile.imageEnabled), isImageDefault: Boolean(args.profile.isImageDefault), apiKeyConfigured: Boolean(args.apiKey) || args.profile.apiKeyConfigured }); state.models = items([...state.models.filter(model => model.id !== profile.id), profile]); return { result: profile } }
  if (command === 'model_delete') { state.models = state.models.filter(model => model.id !== args.id); return { result: null } }
  return null
}
