export interface CachedGet<T> {
  data: T
  etag?: string
  at: number
}

export interface GetCache {
  peek<T>(key: string, maxAgeMs: number, now?: number): T | undefined
  read<T>(key: string): CachedGet<T> | undefined
  put<T>(key: string, data: T, etag: string | undefined, now?: number): void
  fresh(key: string, freshMs: number, now?: number): boolean
  clear(): void
}

export function createGetCache(): GetCache {
  const entries = new Map<string, CachedGet<unknown>>()
  return {
    peek(key, maxAgeMs, now = Date.now()) {
      const hit = entries.get(key)
      if (!hit || now - hit.at > maxAgeMs) return undefined
      return hit.data as never
    },
    read(key) {
      return entries.get(key) as CachedGet<never> | undefined
    },
    put(key, data, etag, now = Date.now()) {
      entries.set(key, { data, ...(etag ? { etag } : {}), at: now })
    },
    fresh(key, freshMs, now = Date.now()) {
      const hit = entries.get(key)
      return Boolean(hit && now - hit.at <= freshMs)
    },
    clear() {
      entries.clear()
    },
  }
}

export const FRESH_GET_MS = 60_000
export const STALE_GET_MS = 5 * 60_000

export const productGetCache = createGetCache()

let featuredTournamentId = ''

export function rememberTournamentId(id: string | undefined): void {
  if (id) featuredTournamentId = id
}

export function knownTournamentId(): string {
  return featuredTournamentId
}

export function resetProductGetCache(): void {
  productGetCache.clear()
  featuredTournamentId = ''
}
