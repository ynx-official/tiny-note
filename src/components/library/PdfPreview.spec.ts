import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import PdfPreview from './PdfPreview.vue'
const mocks = vi.hoisted(() => ({ render: vi.fn(), destroy: vi.fn(), getPage: vi.fn() }))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({ numPages: 2, getPage: mocks.getPage }), destroy: mocks.destroy })
}))
it('does not redraw when loading indicators only change stage height', async () => {
  let resize!: ResizeObserverCallback
  const observer = { disconnect: vi.fn(), observe: vi.fn(), unobserve: vi.fn() }
  vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resize = callback }; disconnect = observer.disconnect; observe = observer.observe })
  mocks.destroy.mockResolvedValue(undefined)
  mocks.render.mockImplementation(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
  mocks.getPage.mockResolvedValue({
    getViewport: ({ scale }: { scale: number }) => ({ width: 400 * scale, height: 500 * scale }),
    render: mocks.render, getTextContent: async () => ({ items: [{ str: 'Page content' }] })
  })
  const wrapper = mount(PdfPreview, { props: { bytes: new Uint8Array([1]), title: 'test' } })
  try {
    await flushPromises()
    const size = (height: number) => [{ contentRect: { width: 500, height } }] as ResizeObserverEntry[]
    resize(size(600), observer)
    await flushPromises()
    const count = mocks.render.mock.calls.length
    resize(size(560), observer)
    await flushPromises()
    expect(mocks.render).toHaveBeenCalledTimes(count)
    expect(wrapper.text()).toContain('Page content')
    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(mocks.getPage).toHaveBeenLastCalledWith(2)
  } finally { wrapper.unmount(); vi.unstubAllGlobals() }
  expect(mocks.destroy).toHaveBeenCalled()
})
