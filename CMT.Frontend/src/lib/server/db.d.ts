// Type declarations for db.ts module
declare module '@/lib/server/db' {
  export function query(sql: string, params?: Record<string, any> | any[]): Promise<any[]>
  export function execute(sql: string, params?: Record<string, any> | any[]): Promise<any>
  export function closePool(): Promise<void>
  export function getPool(): Promise<any>
  
  const db: {
    getPool: () => Promise<any>
    query: (sql: string, params?: Record<string, any> | any[]) => Promise<any[]>
    execute: (sql: string, params?: Record<string, any> | any[]) => Promise<any>
    closePool: () => Promise<void>
  }
  
  export default db
}