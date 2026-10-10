import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { BrowserWindowConstructorOptions } from 'electron'
type MockWindow = EventEmitter & {
  destroyed: boolean
  url: string
  options: BrowserWindowConstructorOptions
  webContents: EventEmitter & {
    setWindowOpenHandler: Mock
    getURL: () => string
    executeJavaScript: Mock
  }
  loadURL: Mock
  show: Mock
  focus: Mock
  isDestroyed: () => boolean
  close: () => void
}
const state = vi.hoisted(() => ({
  windows: [] as MockWindow[],
  partitions: vi.fn(),
  permission: vi.fn(),
  permissionCheck: vi.fn(),
}))
vi.mock('electron', () => ({
  session: { fromPartition: state.partitions },
  BrowserWindow: class extends EventEmitter {
    destroyed = false
    url = 'https://api.windrun.io/api/v2/static/heroes'
    options: BrowserWindowConstructorOptions
    webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: vi.fn(),
      getURL: () => this.url,
      executeJavaScript: vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        contentType: 'application/json',
        body: '{"data":[]}',
      }),
    })
    loadURL = vi.fn().mockResolvedValue(undefined)
    show = vi.fn()
    focus = vi.fn()
    constructor(options: BrowserWindowConstructorOptions) {
      super()
      this.options = options
      state.windows.push(this)
    }
    isDestroyed() {
      return this.destroyed
    }
    close() {
      this.destroyed = true
      this.emit('closed')
    }
  },
}))
import { createWindrunBrowser } from '../../../../src/main/services/windrun-browser'
import { windrunBrowserMessageKey } from '../../../../src/shared/windrun-browser-error'
describe('Windrun user verification browser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.windows.length = 0
    state.partitions.mockReturnValue({
      setPermissionRequestHandler: state.permission,
      setPermissionCheckHandler: state.permissionCheck,
    })
  })
  it('opens only on explicit request and uses an isolated sandboxed session without a private tag', () => {
    const browser = createWindrunBrowser()
    expect(state.windows).toHaveLength(0)
    browser.open()
    expect(state.partitions).toHaveBeenCalledWith('persist:windrun-browser')
    expect(state.windows[0].options.webPreferences).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    })
    expect(state.windows[0].options.webPreferences.preload).toBeUndefined()
    expect(state.windows[0].loadURL).toHaveBeenCalledWith(
      'https://api.windrun.io/api/v2/static/heroes',
    )
    expect(browser.isOpen()).toBe(true)
  })
  it('blocks external navigation, redirects, popups and permissions', () => {
    const browser = createWindrunBrowser()
    browser.open()
    const win = state.windows[0]
    for (const event of ['will-navigate', 'will-redirect']) {
      const preventDefault = vi.fn()
      win.webContents.emit(event, { preventDefault }, 'https://evil.example')
      expect(preventDefault).toHaveBeenCalled()
    }
    expect(win.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: 'deny' })
    const callback = vi.fn()
    state.permission.mock.calls[0][0](null, 'camera', callback)
    expect(callback).toHaveBeenCalledWith(false)
    expect(state.permissionCheck.mock.calls[0][0]()).toBe(false)
  })
  it('performs same-origin JSON fetch only after the user opens verification', async () => {
    const browser = createWindrunBrowser()
    await expect(
      browser.fetchRequest('https://api.windrun.io/api/v2/abilities', {}),
    ).rejects.toThrow('closed')
    browser.open()
    const response = await browser.fetchRequest(
      'https://api.windrun.io/api/v2/abilities?patch=7.40c',
      {},
    )
    expect(await response.json()).toEqual({ data: [] })
    const script = state.windows[0].webContents.executeJavaScript.mock.calls[0][0]
    expect(script).toContain("credentials: 'include'")
    expect(script).toContain('7.40c')
    expect(script).toContain("redirect: 'error'")
  })
  it('rejects non-API routes and credentials in URLs', async () => {
    const browser = createWindrunBrowser()
    browser.open()
    for (const url of [
      'https://evil.example/api/v2/abilities',
      'https://api.windrun.io/user/login',
      'https://user:pass@api.windrun.io/api/v2/abilities',
    ])
      await expect(browser.fetchRequest(url, {})).rejects.toThrow('unsupported')
    expect(state.windows[0].webContents.executeJavaScript).not.toHaveBeenCalled()
  })
  it('recognizes HTML challenge responses even with HTTP 200', async () => {
    const browser = createWindrunBrowser()
    browser.open()
    state.windows[0].webContents.executeJavaScript.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      contentType: 'text/html',
      body: 'challenge',
    })
    await expect(
      browser.fetchRequest('https://api.windrun.io/api/v2/abilities', {}),
    ).rejects.toThrow('verification')
  })
  it('passes 403 through without attempting to solve any challenge', async () => {
    const browser = createWindrunBrowser()
    browser.open()
    state.windows[0].webContents.executeJavaScript.mockResolvedValue({
      status: 403,
      statusText: 'Forbidden',
      contentType: 'text/html',
      body: 'challenge',
    })
    expect((await browser.fetchRequest('https://api.windrun.io/api/v2/abilities', {})).status).toBe(
      403,
    )
  })
  it('resets on close, reopens cleanly and rejects in-flight requests', async () => {
    const browser = createWindrunBrowser()
    browser.open()
    state.windows[0].webContents.executeJavaScript.mockReturnValue(new Promise(() => {}))
    const pending = browser.fetchRequest('https://api.windrun.io/api/v2/abilities', {})
    browser.close()
    await expect(pending).rejects.toThrow('closed')
    expect(browser.isOpen()).toBe(false)
    browser.open()
    expect(state.windows).toHaveLength(2)
  })
  it('never leaks page exception text containing a private URL', async () => {
    const browser = createWindrunBrowser()
    browser.open()
    state.windows[0].webContents.executeJavaScript.mockRejectedValue(
      new Error('https://api.windrun.io/?idf=PRIVATE_TEST'),
    )
    const error = await browser
      .fetchRequest('https://api.windrun.io/api/v2/abilities', {})
      .catch((e) => e)
    expect(error.message).toBe('windrunBrowser:failed')
  })
  it('maps only known recovery codes to translated messages', () => {
    expect(windrunBrowserMessageKey('windrunBrowser:verification')).toBe(
      'scraping.browser.verification',
    )
    expect(windrunBrowserMessageKey('other')).toBeNull()
    expect(windrunBrowserMessageKey(null)).toBeNull()
  })
})
