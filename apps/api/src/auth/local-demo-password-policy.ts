// Explicitly limited to the existing database on this development computer.
export function localDemoShortPasswordsEnabled(env = process.env): boolean {
  if (env.NODE_ENV === 'production' || env.LOCAL_DEMO_SHORT_PASSWORDS !== '1') return false
  try {
    const database = new URL(env.DATABASE_URL ?? '')
    return (
      ['postgres:', 'postgresql:'].includes(database.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) &&
      (database.port || '5432') === '5432' &&
      database.pathname === '/xiaoqiu'
    )
  } catch {
    return false
  }
}
