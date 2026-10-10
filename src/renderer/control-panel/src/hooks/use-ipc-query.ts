import { useState, useEffect, useReducer, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { localizeDisplayData } from '@shared/localization/dota-names'
import type { IpcInvokeMap } from '@shared/ipc/api'

interface UseIpcQueryReturn<K extends keyof IpcInvokeMap> {
  data: IpcInvokeMap[K]['response'] | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useIpcQuery<K extends keyof IpcInvokeMap>(
  channel: K,
  ...args: IpcInvokeMap[K]['request'] extends void ? [] : [IpcInvokeMap[K]['request']]
): UseIpcQueryReturn<K> {
  const { i18n } = useTranslation()
  const [data, setData] = useState<IpcInvokeMap[K]['response'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchKey, refetch] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const request = window.electronApi.invoke(channel, ...args)

    request
      .then((result) => {
        if (!cancelled) {
          setData(result as IpcInvokeMap[K]['response'])
          setError(null)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, fetchKey])

  const displayData = useMemo(() => localizeDisplayData(data, i18n.language), [data, i18n.language])
  return { data: displayData, loading, error, refetch }
}
