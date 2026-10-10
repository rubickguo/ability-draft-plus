import { WindrunBrowserError } from '@shared/windrun-browser-error'
import { BrowserWindow, session } from 'electron'
import type { WindrunFetch } from '@core/scraper/windrun-api-client'

const ORIGIN = 'https://api.windrun.io'
function allowed(url: string, apiOnly = false): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.origin === ORIGIN &&
      !parsed.username &&
      !parsed.password &&
      (!apiOnly || parsed.pathname.startsWith('/api/v2/'))
    )
  } catch {
    return false
  }
}

/** Based on the public recovery design in upstream PR #141:
 * https://github.com/Tiarin-Hino/ability-draft-plus/pull/141
 * A user completes Windrun's ordinary challenge; this never automates solving
 * or copies a browser's cookies/client identifiers from another application. */
export function createWindrunBrowser() {
  let window: BrowserWindow | null = null
  const isOpen = (): boolean => Boolean(window && !window.isDestroyed())
  function open(clientTag?: string): void {
    if (isOpen()) {
      window!.show()
      window!.focus()
      return
    }
    const isolated = session.fromPartition('persist:windrun-browser')
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    isolated.setPermissionCheckHandler(() => false)
    const current = new BrowserWindow({
      width: 1000,
      height: 760,
      title: 'Windrun',
      autoHideMenuBar: true,
      webPreferences: {
        session: isolated,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
    window = current
    current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const guard = (event: Electron.Event, url: string): void => {
      if (!allowed(url)) event.preventDefault()
    }
    current.webContents.on('will-navigate', guard)
    current.webContents.on('will-redirect', guard)
    current.on('closed', () => {
      if (window === current) window = null
    })
    const url = new URL('/api/v2/static/heroes', ORIGIN)
    if (clientTag) url.searchParams.set('idf', clientTag)
    // A visible HTTP challenge can reject loadURL. Keep it for the user.
    void current.loadURL(url.toString()).catch(() => {})
  }
  const fetchRequest: WindrunFetch = async (url, init) => {
    if (!allowed(url, true)) throw new WindrunBrowserError('unsupported')
    const current = window
    if (!current || current.isDestroyed()) throw new WindrunBrowserError('closed')
    if (!allowed(current.webContents.getURL())) throw new WindrunBrowserError('loading')
    if (init.signal?.aborted) throw new WindrunBrowserError('timeout')
    // Query inside the verified origin. session.fetch is not equivalent to a
    // browser page request on some challenge configurations.
    const script = `(async()=>{
      if(location.origin!==${JSON.stringify(ORIGIN)})throw new Error('Wrong origin');
      const response=await fetch(${JSON.stringify(url)},{credentials: 'include',headers:{Accept:'application/json'},cache:'no-store',redirect: 'error',signal:AbortSignal.timeout(30000)});
      return {status:response.status,statusText:response.statusText,contentType:response.headers.get('content-type')||'',body:await response.text()};
    })()`
    return new Promise<Response>((resolve, reject) => {
      let settled = false
      const cleanup = (): void => {
        clearTimeout(timer)
        init.signal?.removeEventListener('abort', abort)
        current.removeListener('closed', closed)
      }
      const fail = (error: WindrunBrowserError): void => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
      const abort = (): void => fail(new WindrunBrowserError('timeout'))
      const closed = (): void => fail(new WindrunBrowserError('closed'))
      const timer = setTimeout(abort, 30_000)
      init.signal?.addEventListener('abort', abort, { once: true })
      current.once('closed', closed)
      void Promise.resolve()
        .then(() => {
          if (settled || current.isDestroyed() || init.signal?.aborted) throw new Error('Cancelled')
          return current.webContents.executeJavaScript(script)
        })
        .then(
          (value: { status: number; statusText: string; contentType: string; body: string }) => {
            if (settled) return
            if (value.status === 200 && !value.contentType.toLowerCase().includes('json')) {
              fail(new WindrunBrowserError('verification'))
              return
            }
            const response = new Response(
              [204, 205, 304].includes(value.status) ? null : value.body,
              {
                status: value.status,
                statusText: value.statusText,
                headers: { 'content-type': value.contentType },
              },
            )
            settled = true
            cleanup()
            resolve(response)
          },
        )
        .catch(() => fail(new WindrunBrowserError('failed')))
    })
  }
  function close(): void {
    if (isOpen()) window!.close()
  }
  return { open, close, isOpen, fetchRequest }
}
