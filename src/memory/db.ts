import Database from 'better-sqlite3';
import { config } from '../config/index.js';

// Inicializar la base de datos
export const db = new Database(config.DB_PATH);

// Habilitar modo WAL para mejor concurrencia
db.pragma('journal_mode = WAL');

// Interfaces para Multi-tenant
export interface User {
  id: number;
  telegram_id: number;
  agent_id: string;
  plan: string;
  status: string;
  name?: string;
  username?: string;
  created_at: string;
  updated_at: string;
  last_interaction?: string;
}

export interface Plan {
  id: string;
  name: string;
  monthly_requests: number;
  price_monthly: number;
  features: string;
}

export interface UserUsage {
  id: number;
  user_id: number;
  requests_count: number;
  period_start: string;
  period_end: string;
}

// Inicializar esquemas
export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT CHECK(role IN ('user', 'assistant', 'system', 'tool')) NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_call_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id INTEGER PRIMARY KEY,
      audio_mode TEXT DEFAULT 'text'
    );

    CREATE TABLE IF NOT EXISTS library_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      last_sync DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Multi-tenant tables
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      agent_id TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active',
      name TEXT,
      username TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_interaction DATETIME
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      monthly_requests INTEGER DEFAULT 0,
      price_monthly REAL DEFAULT 0,
      features TEXT
    );

    CREATE TABLE IF NOT EXISTS user_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      requests_count INTEGER DEFAULT 0,
      period_start DATETIME DEFAULT CURRENT_TIMESTAMP,
      period_end DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_users_agent ON users(agent_id);
  `);

  // Insertar planes por defecto si no existen
  const existingPlans = db.prepare('SELECT COUNT(*) as count FROM plans').get() as { count: number };
  if (existingPlans.count === 0) {
    console.log('📦 Insertando planes por defecto...');
    db.exec(`
      INSERT INTO plans (id, name, monthly_requests, price_monthly, features) VALUES
      ('free', 'Freemium', 50, 0, '{"docs": true, "voice": false}'),
      ('basic', 'Básico', 500, 9.99, '{"docs": true, "voice": true}'),
      ('premium', 'Premium', -1, 19.99, '{"docs": true, "voice": true, "priority": true}')
    `);
  }

  // Migraciones: Asegurar que las columnas existan si la tabla ya existía
  const messagesInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];
  const hasToolCalls = messagesInfo.some(col => col.name === 'tool_calls');
  const hasToolCallId = messagesInfo.some(col => col.name === 'tool_call_id');

  if (!hasToolCalls) {
    console.log('🔄 Migrando: Agregando columna tool_calls a messages...');
    db.exec(`ALTER TABLE messages ADD COLUMN tool_calls TEXT`);
  }
  if (!hasToolCallId) {
    console.log('🔄 Migrando: Agregando columna tool_call_id a messages...');
    db.exec(`ALTER TABLE messages ADD COLUMN tool_call_id TEXT`);
  }

  const userPrefsInfo = db.prepare("PRAGMA table_info(user_prefs)").all() as any[];
  const hasAudioMode = userPrefsInfo.some(col => col.name === 'audio_mode');
  
  if (!hasAudioMode) {
    console.log('🔄 Migrando base de datos: Agregando columna audio_mode a user_prefs...');
    db.exec(`ALTER TABLE user_prefs ADD COLUMN audio_mode TEXT DEFAULT 'text'`);
  }
}

// Asegurarse de cerrar la base de datos al salir
process.on('SIGINT', () => {
  db.close();
  process.exit();
});

process.on('SIGTERM', () => {
  db.close();
  process.exit();
});

// ============================================
// Funciones helper para Multi-tenant
// ============================================

export function getUserByTelegramId(telegramId: number): User | null {
  const stmt = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
  return stmt.get(telegramId) as User | null;
}

export function getUserById(id: number): User | null {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id) as User | null;
}

export function createUser(user: Partial<User>): User {
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, agent_id, plan, status, name, username)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    user.telegram_id,
    user.agent_id || 'synergia',
    user.plan || 'free',
    user.status || 'active',
    user.name || null,
    user.username || null
  );
  return getUserById(result.lastInsertRowid as number)!;
}

export function updateUserPlan(userId: number, plan: string): void {
  const stmt = db.prepare('UPDATE users SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(plan, userId);
}

export function updateUserStatus(userId: number, status: string): void {
  const stmt = db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(status, userId);
}

export function updateLastInteraction(telegramId: number): void {
  const stmt = db.prepare('UPDATE users SET last_interaction = CURRENT_TIMESTAMP WHERE telegram_id = ?');
  stmt.run(telegramId);
}

export function getPlan(planId: string): Plan | null {
  const stmt = db.prepare('SELECT * FROM plans WHERE id = ?');
  return stmt.get(planId) as Plan | null;
}

export function getAllPlans(): Plan[] {
  const stmt = db.prepare('SELECT * FROM plans ORDER BY monthly_requests');
  return stmt.all() as Plan[];
}

export function getUserUsage(userId: number): UserUsage | null {
  const stmt = db.prepare('SELECT * FROM user_usage WHERE user_id = ? ORDER BY id DESC LIMIT 1');
  return stmt.get(userId) as UserUsage | null;
}

export function incrementUsage(userId: number): void {
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
  const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 7) + '-01';
  
  let usage = getUserUsage(userId);
  
  if (!usage || !usage.period_end || new Date(usage.period_end) < new Date()) {
    // Nuevo período
    const stmt = db.prepare(`
      INSERT INTO user_usage (user_id, requests_count, period_start, period_end)
      VALUES (?, 1, ?, ?)
    `);
    stmt.run(userId, currentMonth, nextMonth);
  } else {
    // Incrementar contador
    const stmt = db.prepare('UPDATE user_usage SET requests_count = requests_count + 1 WHERE id = ?');
    stmt.run(usage.id);
  }
}

export function checkUserLimit(telegramId: number): { allowed: boolean; remaining: number; plan: string } {
  const user = getUserByTelegramId(telegramId);
  if (!user) {
    return { allowed: false, remaining: 0, plan: 'none' };
  }
  
  if (user.status !== 'active') {
    return { allowed: false, remaining: 0, plan: user.plan };
  }
  
  const plan = getPlan(user.plan);
  if (!plan) {
    return { allowed: false, remaining: 0, plan: user.plan };
  }
  
  // -1 significa ilimitado
  if (plan.monthly_requests === -1) {
    return { allowed: true, remaining: -1, plan: user.plan };
  }
  
  const usage = getUserUsage(user.id);
  const used = usage?.requests_count || 0;
  const remaining = plan.monthly_requests - used;
  
  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining),
    plan: user.plan
  };
}
