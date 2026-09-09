import { beforeEach, describe, expect, it } from 'vitest'
import { invoke } from './tauri'

describe('browser Agent catalog', () => {
  beforeEach(() => {
    localStorage.clear()
    delete window.__TAURI_INTERNALS__
  })

  it('seeds the notebook skill and exposes the restored 31-tool catalog without retrieval tools', async () => {
    const skills = await invoke('agent_skill_list')
    const tools = await invoke('agent_list_tools')

    expect(skills.map(skill => skill.name)).toEqual([
      'knowledge-research',
      'note-organizer',
      'notebook-manager'
    ])
    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'list_notes',
      'search_notes',
      'get_note',
      'list_notebooks',
      'create_notebook',
      'update_notebook',
      'move_notebook',
      'delete_notebook'
    ]))
    expect(tools.map(tool => tool.name)).not.toContain('retrieve_knowledge')
    expect(tools).toHaveLength(31)
    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'request_user_input',
      'run_sandbox_script',
      'write_agent_file',
      'create_note_in_knowledge_base',
      'create_todo',
      'create_calendar_event'
    ]))
  })

  it('adds newly built-in skills and removes a legacy retrieval policy without changing custom skills', async () => {
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({
      agentSkills: [{ name: 'custom-workflow', description: '自定义', fileName: 'custom-workflow/SKILL.md', builtin: false, content: '# 自定义' }],
      agentToolPolicies: { retrieve_knowledge: false, create_note: false }
    }))

    await invoke('agent_skill_list')

    const state = JSON.parse(localStorage.getItem('tiny-note-browser-state'))
    expect(state.agentSkills.find(skill => skill.name === 'custom-workflow')?.content).toBe('# 自定义')
    expect(state.agentSkills.map(skill => skill.name)).toEqual(expect.arrayContaining([
      'knowledge-research',
      'note-organizer',
      'notebook-manager'
    ]))
    expect(state.agentToolPolicies).toEqual({ create_note: false })
  })
})
