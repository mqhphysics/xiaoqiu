import { useEffect, useState } from 'react'
import type { ProductConfiguration } from '../../../../../packages/contracts/src/product-config'
import { productConfigRepository } from './product-config.repository'

/** Refresh on focus; failure leaves feature entry points closed without inventing online success. */
export function useProductConfiguration() {
  const [configuration, setConfiguration] = useState<ProductConfiguration | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let generation = 0
    const refresh = async () => {
      const requestGeneration = ++generation
      try {
        const next = await productConfigRepository.getConfiguration()
        if (active && requestGeneration === generation) {
          setConfiguration(next)
          setError(null)
        }
      } catch {
        if (active && requestGeneration === generation) {
          setConfiguration(null)
          setError('暂时无法读取功能配置，请检查连接后重试')
        }
      }
    }
    void refresh()
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      generation++
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  return { configuration, error }
}
