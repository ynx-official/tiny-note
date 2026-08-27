import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'
import { mountEditor, note } from './NoteEditor.testHarness'

describe('NoteEditor content editing', () => {
  it('derives legacy Markdown lazily without updating the note until an edit', async () => {
    const legacy = note('note-legacy')
    legacy.contentMarkdown = ''
    const wrapper = await mountEditor(legacy)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    expect(source.vm.view.state.doc.toString()).toContain('# 标题')
    expect(legacy.contentMarkdown).toBe('')
    source.vm.view.dispatch({ changes: { from: source.vm.view.state.doc.length, insert: '\n补充' } })
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[0].trigger('click')
    await flushPromises()
    expect(legacy.contentMarkdown).toContain('补充')
    wrapper.unmount()
  })

  it('renders source edits in preview and restores them in instant editing', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    source.vm.view.dispatch({
      changes: {
        from: 0,
        to: source.vm.view.state.doc.length,
        insert: '## 源码标题\n\n- [x] 已完成\n\n**加粗内容**'
      }
    })
    await new Promise(resolve => setTimeout(resolve, 180))
    expect(wrapper.get('.split-preview-pane').html()).toContain('<h1 data-note-title="true">源码标题</h1>')
    expect(wrapper.get('.split-preview-pane').text()).toContain('已完成')

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[0].trigger('click')
    await flushPromises()
    expect(wrapper.get('.note-prose').html()).toContain('<h1 data-note-title="true">源码标题</h1>')
    expect(wrapper.get('.note-prose').html()).toContain('<strong>加粗内容</strong>')
    wrapper.unmount()
  })

  it('reads the note title from the first non-empty editor line like Friday', async () => {
    const active = note('note-title')
    const wrapper = await mountEditor(active)
    expect(wrapper.find('.title-input').exists()).toBe(false)
    expect(active.title).toBe('标题')

    wrapper.vm.editor.commands.setContent('<h2>新的文档标题</h2><p>正文</p>')
    await flushPromises()
    expect(active.title).toBe('新的文档标题')
    expect(active.contentMarkdown).toContain('## 新的文档标题')

    const longTitle = '很长的标题'.repeat(12)
    wrapper.vm.editor.commands.setContent(`<h1>${longTitle}</h1><p>正文</p>`)
    await flushPromises()
    expect(active.title).toBe(longTitle.slice(0, 50))
    wrapper.unmount()
  })

  it('starts a body paragraph when Enter is pressed at the end of the title', async () => {
    const wrapper = await mountEditor(note('note-title-enter'))
    wrapper.vm.editor.commands.setTextSelection(3)
    wrapper.get('.note-prose').element.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()

    const blocks = wrapper.find('.note-prose').element.children
    expect(blocks[0].tagName).toBe('H1')
    expect(blocks[0].getAttribute('data-note-title')).toBe('true')
    expect(blocks[1].tagName).toBe('P')
    wrapper.unmount()
  })

  it('does not let heading controls convert the Friday-style title node', async () => {
    const wrapper = await mountEditor(note('note-title-heading'))
    wrapper.vm.editor.commands.setTextSelection(2)

    await wrapper.get('.heading-menu-anchor > button[title="标题"]').trigger('click')
    await wrapper.findAll('.editor-heading-menu button')[2].trigger('click')
    await flushPromises()

    expect(wrapper.get('.note-prose > h1').attributes('data-note-title')).toBe('true')
    expect(wrapper.get('.note-prose > h1').text()).toBe('标题')
    wrapper.unmount()
  })

  it('shows and applies the complete Friday heading hierarchy in instant editing', async () => {
    const wrapper = await mountEditor(note('note-heading-hierarchy'))
    wrapper.vm.editor.commands.setTextSelection(6)

    await wrapper.get('.heading-menu-anchor > button[title="标题"]').trigger('click')
    const options = wrapper.findAll('.editor-heading-menu button')
    expect(options.map(item => item.text())).toEqual(['标题', '标题 1', '标题 2', '标题 3', '正文', '小正'])
    expect(options[0].attributes('disabled')).toBeDefined()
    await options[5].trigger('click')
    await flushPromises()

    expect(wrapper.get('.note-prose p[data-small-text]').text()).toBe('正文')
    expect(wrapper.get('.heading-menu-anchor > button[title="标题"]').text()).toContain('小正')
    wrapper.unmount()
  })

  it('renders Markdown pasted into the rich editor', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.note-prose').trigger('paste', {
      clipboardData: {
        getData: type => type === 'text/plain' ? '# 粘贴标题\n\n**加粗内容**' : ''
      },
    })
    await flushPromises()
    expect(wrapper.get('.note-prose').element.innerHTML).toContain('<h1>粘贴标题</h1>')
    expect(wrapper.get('.note-prose').element.innerHTML).toContain('<strong>加粗内容</strong>')
    expect(wrapper.get('.markdown-paste-notice').text()).toContain('已按 Markdown 渲染')

    await wrapper.get('.markdown-paste-source').trigger('click')
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('Markdown')
    expect(wrapper.findComponent(MarkdownSourceEditor).text()).toContain('# 粘贴标题')
    wrapper.unmount()
  })

  it('prefers Markdown from a clipboard that also contains HTML', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.note-prose').trigger('paste', {
      clipboardData: {
        getData: type => type === 'text/plain' ? '## 剪贴板标题\n\n- 第一项\n- 第二项' : '<p>## 剪贴板标题</p>'
      }
    })
    await flushPromises()
    const html = wrapper.get('.note-prose').element.innerHTML
    expect(html).toContain('<h2>剪贴板标题</h2>')
    expect(html).toContain('<li><p>第一项</p></li>')
    wrapper.unmount()
  })

  it('renders pasted Markdown quotes and defaults language-less code blocks to auto', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.note-prose').trigger('paste', {
      clipboardData: {
        getData: type => type === 'text/plain'
          ? '> 引用内容\n\n```\nconst value = 1\n```'
          : ''
      }
    })
    await flushPromises()

    const quote = wrapper.get('.note-prose blockquote')
    expect(quote.text()).toBe('引用内容')
    const language = wrapper.get('.code-block-component .language-select')
    expect(language.element.value).toBe('')
    expect(language.find('option:checked').text()).toBe('auto')
    wrapper.unmount()
  })

  it('renders pasted Mermaid flowcharts as diagrams without persisting generated SVG', async () => {
    const active = note('note-mermaid')
    const wrapper = await mountEditor(active)
    const source = [
      '```mermaid',
      'swimlane-beta LR',
      '  subgraph author [申请人]',
      '    submit[提交申请]',
      '  end',
      '  subgraph reviewer [审批人]',
      '    approve{是否批准}',
      '  end',
      '  submit --> approve',
      '```'
    ].join('\n')

    await wrapper.get('.note-prose').trigger('paste', {
      clipboardData: { getData: type => type === 'text/plain' ? source : '' }
    })
    await flushPromises()

    expect(wrapper.get('.mermaid-diagram-test').attributes('data-source')).toContain('swimlane-beta LR')
    expect(active.contentMarkdown).toContain('```mermaid')
    expect(active.contentMarkdown).toContain('subgraph reviewer')
    expect(active.contentHtml).toContain('language-mermaid')
    expect(active.contentHtml).not.toContain('<svg')
    wrapper.unmount()
  })

  it('offers accessible flowchart and swimlane starters from the insert menu', async () => {
    const active = note('note-insert-diagram')
    const wrapper = await mountEditor(active)

    await wrapper.get('.toolbar-menu-anchor > button[title="插入"]').trigger('click')
    expect(wrapper.get('.insert-mermaid-flowchart').text()).toContain('流程图')
    expect(wrapper.get('.insert-mermaid-swimlane').text()).toContain('泳道图')

    await wrapper.get('.insert-mermaid-swimlane').trigger('click')
    await flushPromises()

    expect(wrapper.get('.code-block-component').classes()).toContain('is-source-visible')
    expect(wrapper.get('.code-block-content').text()).toContain('swimlane-beta LR')
    const tabEvent = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    wrapper.get('.language-select').element.dispatchEvent(tabEvent)
    expect(tabEvent.defaultPrevented).toBe(false)
    expect(active.contentMarkdown).toContain('accTitle: 示例审批泳道')
    expect(active.contentMarkdown).toContain('```mermaid')

    await wrapper.get('.diagram-source-toggle').trigger('click')
    expect(wrapper.get('.mermaid-diagram-test').attributes('data-source')).toContain('swimlane-beta LR')
    wrapper.unmount()
  })

  it('keeps pasted Markdown table headers separate from normal-weight body cells', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.note-prose').trigger('paste', {
      clipboardData: {
        getData: type => type === 'text/plain'
          ? '| 信息对象 | 权威系统 | 处理 |\n| --- | --- | --- |\n| 项目编号 | 立项工具 | 原始主数据 |'
          : ''
      }
    })
    await flushPromises()

    expect(wrapper.findAll('.note-prose th')).toHaveLength(3)
    expect(wrapper.findAll('.note-prose td')).toHaveLength(3)
    expect(wrapper.findAll('.note-prose th > p')).toHaveLength(3)
    expect(wrapper.findAll('.note-prose td > p')).toHaveLength(3)
    expect(wrapper.findAll('.note-prose table [data-note-title]')).toHaveLength(0)
    expect(wrapper.findAll('.note-prose td strong')).toHaveLength(0)
    wrapper.unmount()
  })

  it('repairs legacy table cells that were persisted as note titles', async () => {
    const legacy = note('note-legacy-table-titles')
    legacy.contentHtml = '<h1 data-note-title="true">文档标题</h1><table><tbody><tr><th><h1 data-note-title="true"><strong>表头</strong></h1></th></tr><tr><td><h1 data-note-title="true">正文单元格</h1></td></tr></tbody></table>'
    const wrapper = await mountEditor(legacy)

    expect(wrapper.findAll('.note-prose > h1[data-note-title]')).toHaveLength(1)
    expect(wrapper.findAll('.note-prose table [data-note-title]')).toHaveLength(0)
    expect(legacy.title).toBe('文档标题')
    expect(wrapper.get('.note-prose th > p').text()).toBe('表头')
    expect(wrapper.get('.note-prose td > p').text()).toBe('正文单元格')
    wrapper.unmount()
  })
})
