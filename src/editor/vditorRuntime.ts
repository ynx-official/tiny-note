import { mermaidThemeVariables } from '../utils/mermaidRenderer'
import { installVditorDiagramTheme } from './vditorDiagramTheme'

let loading: Promise<void> | undefined

function script(path: string, id: string): Promise<void> {
  if (document.getElementById(id)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const element = document.createElement('script')
    element.src = `/vendor/vditor/dist/${path}`
    element.onload = () => { element.id = id; resolve() }
    element.onerror = () => { element.remove(); reject(new Error('编辑器资源加载失败，请重试')) }
    document.head.append(element)
  })
}

export function loadVditorRuntime(): Promise<void> {
  installVditorDiagramTheme()
  loading ??= Promise.all([
    script('js/i18n/zh_CN.js', 'vditorI18nScriptzh_CN'),
    script('js/lute/lute.min.js', 'vditorLuteScript'),
    script('js/icons/ant.js', 'vditorIconScript'),
    // Use the app's Mermaid version (including swimlane-beta), with strict
    // rendering even though Vditor's bundled renderer requests loose mode.
    import('mermaid').then(({ default: mermaid }) => {
      const bridge = {
        initialize: (options: Parameters<typeof mermaid.initialize>[0]) => mermaid.initialize({
          ...options, theme: 'base',
          themeVariables: mermaidThemeVariables[options?.theme === 'dark' ? 'dark' : 'light'],
          fontFamily: mermaidThemeVariables.light.fontFamily,
          securityLevel: 'strict', startOnLoad: false
        }),
        render: mermaid.render.bind(mermaid)
      }
      Object.assign(window, { mermaid: bridge })
      if (!document.getElementById('vditorMermaidScript')) {
        const marker = document.createElement('meta')
        marker.id = 'vditorMermaidScript'
        document.head.append(marker)
      }
    })
  ]).then(() => {}).finally(() => { loading = undefined })
  return loading
}
