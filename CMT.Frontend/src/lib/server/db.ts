// url=LOCAL_FILE/src/lib/server/db.ts
// MSSQL database helper using `mssql` package configured for your server.
// Replace usage paths if needed. Install dependency: npm install mssql
import mssql, { IResult } from 'mssql'

const config: mssql.config = {
  user: process.env.DB_USER || 'CMT_Task_MGM_System_User',
  password: process.env.DB_PASSWORD || '1234@Abcd',
  server: process.env.DB_SERVER || 'SVDRSQLT02\\MSSQL2017', // use hostname as requested
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME || 'CMT_Task_MGM_System',
  options: {
    encrypt: false, // your note: Encrypt=False
    enableArithAbort: true,
    trustServerCertificate: true, // set true if not using proper certs
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
}

// Single global pool to reuse across lambda/hot-reload
let pool: mssql.ConnectionPool | null = null
let poolConnect: Promise<mssql.ConnectionPool> | null = null

async function getPool(): Promise<mssql.ConnectionPool> {
  if (pool && pool.connected) return pool
  if (poolConnect) {
    pool = await poolConnect
    return pool!
  }
  pool = new mssql.ConnectionPool(config)
  poolConnect = pool.connect()
  try {
    await poolConnect
    // attach error handler
    pool.on('error', (err) => {
      console.error('MSSQL Pool Error', err)
    })
    return pool
  } catch (err) {
    pool = null
    poolConnect = null
    console.error('Failed to connect to MSSQL', err)
    throw err
  }
}

/**
 * Execute a parametrized SQL query.
 * Returns rows (array of objects) like mysql2.
 * Usage:
 *  const rows = await query('SELECT * FROM tasks WHERE task_id = @id', { id: 1 })
 */
export async function query(sql: string, params: Record<string, any> | any[] = {}): Promise<any[]> {
  const p = await getPool()
  const request = p.request()

  // Support both array-style params or named object params.
  if (Array.isArray(params)) {
    // positional: map to @p0, @p1 ...
    params.forEach((val, idx) => {
      request.input(`p${idx}`, val)
    })
    // convert placeholders in SQL from ? to @pN if present
    // If SQL uses '?' tokens, replace them sequentially with @pN
    let replacedSql = sql
    if (sql.includes('?')) {
      let i = 0
      replacedSql = sql.replace(/\?/g, () => `@p${i++}`)
    }
    const result: IResult<any> = await request.query(replacedSql)
    return result.recordset
  } else {
    // named params: attach each as input and expect SQL placeholders like @name
    for (const [key, value] of Object.entries(params || {})) {
      // mssql will infer type; for explicit types you can adjust request.input(key, mssql.VarChar, value)
      request.input(key, value)
    }
    const result: IResult<any> = await request.query(sql)
    return result.recordset
  }
}

/**
 * Execute a non-query (INSERT/UPDATE/DELETE) and return the raw result.
 * For inserts you can examine result.recordset / result.rowsAffected depending on your needs.
 */
export async function execute(sql: string, params: Record<string, any> | any[] = {}): Promise<IResult<any>> {
  const p = await getPool()
  const request = p.request()
  if (Array.isArray(params)) {
    params.forEach((val, idx) => request.input(`p${idx}`, val))
    let replacedSql = sql
    if (sql.includes('?')) {
      let i = 0
      replacedSql = sql.replace(/\?/g, () => `@p${i++}`)
    }
    return request.query(replacedSql)
  } else {
    for (const [key, value] of Object.entries(params || {})) {
      request.input(key, value)
    }
    return request.query(sql)
  }
}

export async function closePool() {
  if (pool) {
    try {
      await pool.close()
    } catch (err) {
      console.error('Error closing MSSQL pool', err)
    } finally {
      pool = null
      poolConnect = null
    }
  }
}

// Default export for module compatibility
export default { getPool, query, execute, closePool }