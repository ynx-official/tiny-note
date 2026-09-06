import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import LibraryPreviewDrawer from './LibraryPreviewDrawer.vue'
import { readLibraryContent } from '../../services/libraryContent'
import { saveExportBlob } from '../../services/exportLocation'
vi.mock('../../services/libraryContent', () => ({ readLibraryContent: vi.fn() }))
vi.mock('../../services/exportLocation', () => ({ saveExportBlob: vi.fn() }))
vi.mock('../../services/exportSuccess', () => ({ showExportSuccess: vi.fn() }))
const create = vi.fn(() => 'blob:preview')
const revoke = vi.fn()
const base = { title: 'file.png', content: '', mimeType: 'image/png', downloadPath: '/knowledge-bases/k/library/content?relativePath=file.png' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readLibraryContent).mockResolvedValue(new Uint8Array([1, 2, 3]))
  vi.mocked(saveExportBlob).mockResolvedValue({ cancelled: true })
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
})
afterEach(() => vi.unstubAllGlobals())
it('displays authenticated images and releases the object URL when closed', async () => {
  const wrapper = mount(LibraryPreviewDrawer, { props: { preview: { ...base, kind: 'image' } } })
  await flushPromises()
  expect(wrapper.get('img').attributes('src')).toBe('blob:preview')
  await wrapper.get('[aria-label="下载原文件"]').trigger('click')
  await flushPromises()
  expect(readLibraryContent).toHaveBeenCalledTimes(1)
  expect(saveExportBlob).toHaveBeenCalledWith(expect.any(Blob), 'file.png')
  wrapper.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:preview')
})
it('ignores a late response after selecting another file', async () => {
  let resolve!: (value: Uint8Array<ArrayBuffer>) => void
  vi.mocked(readLibraryContent).mockReturnValue(new Promise(done => { resolve = done }))
  const wrapper = mount(LibraryPreviewDrawer, { props: { preview: { ...base, kind: 'image' } } })
  await wrapper.setProps({ preview: { ...base, kind: 'text', content: 'new file' } })
  resolve(new Uint8Array([1]))
  await flushPromises()
  expect(wrapper.get('pre').text()).toBe('new file')
  expect(create).not.toHaveBeenCalled()
  wrapper.unmount()
})
it('sanitizes HTML within an opaque sandbox and offers binary downloads', async () => {
  const wrapper = mount(LibraryPreviewDrawer, { props: { preview: { ...base, kind: 'html', content: '<script>alert(1)</script><p onclick="bad()">hello</p>' } } })
  expect(wrapper.get('iframe').attributes('sandbox')).toBe('')
  expect(wrapper.get('iframe').attributes('srcdoc')).toBe('<p>hello</p>')
  await wrapper.setProps({ preview: { ...base, kind: 'binary' } })
  await wrapper.get('[aria-label="下载原文件"]').trigger('click')
  await flushPromises()
  expect(saveExportBlob).toHaveBeenCalledOnce()
  wrapper.unmount()
})
