import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type { CommandArgs, CommandName, CommandResult, NoCommandArgs } from './commandMap'

const platformCommands = new Set<CommandName>([
  'app_take_pending_markdown_files', 'external_markdown_list', 'external_markdown_read', 'external_markdown_clear',
  'export_write_file', 'export_open_file', 'export_reveal_file', 'app_update_check', 'app_update_download', 'tray_open_main'
])

const browserBackend = typeof window !== 'undefined' && !window.__TAURI_INTERNALS__
  ? import('./browserBackend')
  : null

type InvokeArgs<K extends CommandName> = CommandArgs<K> extends NoCommandArgs
  ? [args?: CommandArgs<K>]
  : [args: CommandArgs<K>]

export async function invoke<K extends CommandName>(command: K, ...parameters: InvokeArgs<K>): Promise<CommandResult<K>> {
  const args = (parameters[0] ?? {}) as CommandArgs<K> & Record<string, unknown>
  if (import.meta.env.MODE === 'test' && window.__TAURI_INTERNALS__) return tauriInvoke<CommandResult<K>>(command, args)
  if (window.__TAURI_INTERNALS__ && platformCommands.has(command)) return tauriInvoke<CommandResult<K>>(command, args)

  if (import.meta.env.MODE !== 'test') {
    const { remoteInvoke } = await import('./remoteCommands')
    return remoteInvoke(command, args)
  }

  const { browserInvoke } = await (browserBackend ?? import('./browserBackend'))
  return browserInvoke(command, args)
}
