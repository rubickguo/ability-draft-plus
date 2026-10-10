import { test, expect, _electron as electron } from '@playwright/test'
import { join, resolve } from 'node:path'
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'

async function launchIsolatedApp() {
  const main = resolve(__dirname, '../../out/main/index.js')
  // An old build would ignore the test switch and open the real Beta profile.
  expect(readFileSync(main, 'utf8')).toContain('ADP_PUBLIC_BETA_SMOKE_APP_DATA')
  const profile = mkdtempSync(join(tmpdir(), 'adp-public-beta-smoke-'))
  const app = await electron.launch({
    args: [main, '--adp-public-beta-smoke'],
    env: { ...process.env, ADP_PUBLIC_BETA_SMOKE_APP_DATA: profile },
  })
  try {
    const userData = await app.evaluate(({ app }) => app.getPath('userData'))
    expect(realpathSync(userData)).toBe(realpathSync(join(profile, 'ability-draft-plus-cn-beta')))
    console.log(`Isolated smoke profile: ${profile}`)
    return app
  } catch (error) {
    await app.close()
    throw error
  }
}

async function unusedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No free loopback port found')
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  return address.port
}

test('app launches and shows control panel', async () => {
  const app = await launchIsolatedApp()
  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    const title = await window.title()
    expect(title).toContain('Ability Draft Plus')
  } finally {
    await app.close()
  }
})

test('stream server serves the board and SSE endpoint', async () => {
  const port = await unusedPort()
  const app = await launchIsolatedApp()
  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Start the stream server through the same IPC surface the Streaming page uses
    const startResult = await window.evaluate(async (port) => {
      return window.electronApi.invoke('stream:start', { port })
    }, port)
    expect(startResult).toMatchObject({ success: true })

    // The board SPA is served from out/renderer
    const pageResponse = await fetch(`http://127.0.0.1:${port}/stream`)
    expect(pageResponse.status).toBe(200)
    const html = await pageResponse.text()
    expect(html).toContain('Stream Board')

    // SSE endpoint pushes a versioned state envelope on connect
    const sseResponse = await fetch(`http://127.0.0.1:${port}/events`, {
      headers: { Accept: 'text/event-stream' },
    })
    expect(sseResponse.status).toBe(200)
    expect(sseResponse.headers.get('content-type')).toContain('text/event-stream')
    const reader = sseResponse.body?.getReader()
    expect(reader).toBeDefined()
    const { value } = await reader!.read()
    const firstChunk = new TextDecoder().decode(value)
    expect(firstChunk).toContain('"type":"state"')
    expect(firstChunk).toContain('"phase":"waiting"')
    await reader!.cancel()
  } finally {
    await app.close()
  }
})
