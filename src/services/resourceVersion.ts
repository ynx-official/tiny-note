export function requireResourceVersion(resource: { version?: number } | null | undefined, label = '资源'): number {
  const version = resource?.version
  if (!Number.isInteger(version) || Number(version) <= 0) {
    throw new Error(`${label}缺少版本信息，请刷新后重试`)
  }
  return Number(version)
}
