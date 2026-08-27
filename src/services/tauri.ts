import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type { CommandArgs, CommandName, CommandResult, NoCommandArgs } from './commandMap'

const browserBackend = typeof window !== 'undefined' && !window.__TAURI_INTERNALS__
  ? import('./browserBackend')
  : null

type InvokeArgs<K extends CommandName> = CommandArgs<K> extends NoCommandArgs
  ? [args?: CommandArgs<K>]
  : [args: CommandArgs<K>]

export async function invoke<K extends CommandName>(command: K, ...parameters: InvokeArgs<K>): Promise<CommandResult<K>> {
  const args = (parameters[0] ?? {}) as CommandArgs<K> & Record<string, unknown>
  if (window.__TAURI_INTERNALS__) return tauriInvoke<CommandResult<K>>(command, args)

  const { browserInvoke } = await (browserBackend ?? import('./browserBackend'))
  return browserInvoke(command, args)
}
