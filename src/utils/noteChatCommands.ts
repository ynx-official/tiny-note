function cleanValue(value = '') {
  return String(value).trim().replace(/^[《“"']|[》”"'。！!]+$/g, '').trim()
}

export function isConversationSummaryIntent(message = '') {
  return /(?:总结|整理|归纳)[\s\S]{0,12}(?:对话|聊天|讨论)[\s\S]{0,12}(?:笔记|文章)|(?:对话|聊天|讨论)[\s\S]{0,12}(?:总结|整理|归纳)[\s\S]{0,12}(?:笔记|文章)/i.test(message)
}

export function isNoteEditIntent(message = '') {
  return /(扩写|改写|修改|润色|精炼|替换|翻译|续写|修正|重写|追加|添加|补充|删掉.*内容|rewrite|translate|polish|edit|append)/i.test(message)
}

export function parseNoteCommand(message = '') {
  const text = String(message).trim()
  if (!text || isConversationSummaryIntent(text)) return null

  const rename = text.match(/(?:重命名|改名)(?:为|成|叫)?[：:\s]*[《“"']?([^》”"'，,。]+)[》”"']?/) 
  if (rename) return { action: 'rename', value: cleanValue(rename[1]) }

  const move = text.match(/(?:移动|移到|放到|归类)(?:到|至|进|入)?[：:\s]*[《“"']?([^》”"'，,。]+)[》”"']?(?:笔记本|文件夹)?$/)
  if (move) return { action: 'move', value: cleanValue(move[1].replace(/(?:笔记本|文件夹)$/g, '')) }

  if (/(?:删除|移入回收站|扔进回收站).*(?:笔记|它)|(?:删除|移入回收站|扔进回收站)$/.test(text)) return { action: 'delete' }
  if (/(?:复制|创建副本|拷贝).*(?:笔记|它)|(?:复制|创建副本|拷贝)$/.test(text)) return { action: 'duplicate' }

  if (/(?:创建|新建|新增)(?:一篇|一个|一条)?\s*笔记/.test(text)) {
    const bracketTitle = text.match(/[《“"']([^》”"']+)[》”"']/)?.[1]
    const namedTitle = text.match(/(?:标题|名字|名称)(?:为|是|叫)?[：:\s]*([^，,。\n]+)/)?.[1]
    const content = text.match(/(?:内容|正文)(?:为|是)?[：:\s]*([\s\S]+)$/)?.[1]
    return {
      action: 'create',
      title: cleanValue(bracketTitle || namedTitle || '未命名笔记'),
      content: String(content || '').trim()
    }
  }
  return null
}
