import postgres from 'postgres'

let _db: ReturnType<typeof postgres> | null = null

function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
    _db = postgres(process.env.DATABASE_URL, { ssl: 'require' })
  }
  return _db
}

export const sql = (strings: TemplateStringsArray, ...values: any[]) =>
  getDb()(strings, ...values)

sql.unsafe = (query: string, params?: any[]) => getDb().unsafe(query, params ?? [])
