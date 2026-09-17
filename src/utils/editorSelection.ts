import { getTextBetween, getTextSerializersFromSchema, type Editor, type Range } from '@tiptap/core'

export function getEditorSelectionText(editor: Editor, range: Range): string {
  // Match Editor.getText() used for saved content, including block and hard-break separators.
  return getTextBetween(editor.state.doc, range, {
    textSerializers: getTextSerializersFromSchema(editor.schema)
  })
}
