import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseService } from '../../../../src/main/services/database-service'
import type { AppStore } from '../../../../src/main/store/app-store'
const mocks = vi.hoisted(() => ({
  scrape: vi.fn(),
  client: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  isOpen: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/test' } }))
vi.mock('fs', () => ({ readFileSync: vi.fn().mockReturnValue('[]') }))
vi.mock('electron-log/main', () => ({
  default: { scope: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}))
vi.mock('@core/scraper', () => ({
  performFullScrape: mocks.scrape,
  performLiquipediaEnrichment: vi.fn(),
  createWindrunApiClient: mocks.client,
}))
vi.mock('../../../../src/main/services/api-config', () => ({ loadClientTag: () => undefined }))
vi.mock('../../../../src/main/services/windrun-browser', () => ({
  createWindrunBrowser: () => ({
    open: mocks.open,
    close: mocks.close,
    isOpen: mocks.isOpen,
    fetchRequest: mocks.fetch,
  }),
}))
import { createScraperService } from '../../../../src/main/services/scraper-service'
describe('user-initiated Windrun browser recovery', () => {
  let db: DatabaseService, store: AppStore
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isOpen.mockReturnValue(false)
    mocks.open.mockImplementation(() => mocks.isOpen.mockReturnValue(true))
    mocks.close.mockImplementation(() => mocks.isOpen.mockReturnValue(false))
    mocks.client.mockReturnValue({})
    db = {
      heroes: {},
      abilities: {},
      synergies: {},
      triplets: {},
      metadata: { get: vi.fn(), getLastScrapeDate: () => null, set: vi.fn() },
      persist: vi.fn(),
    } as unknown as DatabaseService
    store = { setState: vi.fn() } as unknown as AppStore
  })
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
  it('does not open a remote browser on construction or restoring state', () => {
    const service = createScraperService(db, store)
    service.restorePersistedState()
    expect(mocks.open).not.toHaveBeenCalled()
  })
  it('opens verification only after a user update receives 403, then retries through the verified page', async () => {
    mocks.scrape
      .mockResolvedValueOnce({ success: false, error: '403', browserRequired: true })
      .mockResolvedValueOnce({ success: true })
    const service = createScraperService(db, store)
    service.startScrape()
    await flush()
    expect(mocks.open).toHaveBeenCalledOnce()
    expect(store.setState).toHaveBeenCalledWith(
      expect.objectContaining({ scraperMessage: 'windrunBrowser:verification' }),
    )
    service.startScrape()
    await flush()
    expect(mocks.client.mock.calls[1][2]).toBe(mocks.fetch)
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(mocks.scrape.mock.calls[1][0]).toMatchObject({
      heroes: db.heroes,
      abilities: db.abilities,
      metadata: db.metadata,
    })
  })
  it('reopens a user-closed verification window before retrying and does not claim success', async () => {
    mocks.scrape.mockResolvedValue({ success: false, error: '403', browserRequired: true })
    const service = createScraperService(db, store)
    service.startScrape()
    await flush()
    mocks.isOpen.mockReturnValue(false)
    service.startScrape()
    await flush()
    expect(mocks.open).toHaveBeenCalledTimes(2)
    expect(mocks.scrape).toHaveBeenCalledTimes(1)
    expect(store.setState).not.toHaveBeenCalledWith(
      expect.objectContaining({ scraperStatus: 'idle' }),
    )
  })
  it('does not open browser recovery for a normal network/server failure', async () => {
    mocks.scrape.mockResolvedValue({ success: false, error: '503' })
    createScraperService(db, store).startScrape()
    await flush()
    expect(mocks.open).not.toHaveBeenCalled()
    expect(store.setState).toHaveBeenCalledWith({ scraperStatus: 'error', scraperMessage: '503' })
  })
  it('handles a failed verification-window creation with a translated stable error', async () => {
    mocks.open.mockImplementation(() => {
      throw new Error('PRIVATE_URL')
    })
    mocks.scrape.mockResolvedValue({ success: false, error: '403', browserRequired: true })
    createScraperService(db, store).startScrape()
    await flush()
    expect(store.setState).toHaveBeenCalledWith({
      scraperStatus: 'error',
      scraperMessage: 'windrunBrowser:openFailed',
    })
  })
})
