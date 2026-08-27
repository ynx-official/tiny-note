export function modelProviderLabel(provider: unknown) {
  const value = String(provider || '').trim()
  const normalized = value.toLowerCase()
  if (!value || ['其他', 'custom', 'openai', 'openai-compatible', 'openai compatible'].includes(normalized)) return 'OpenAI 兼容服务'
  return value
}
