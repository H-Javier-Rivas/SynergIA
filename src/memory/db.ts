import Database from 'better-sqlite3';
import { config } from '../config/index.js';
import fs from 'fs';

// Inicializar la base de datos
export const db = new Database(config.DB_PATH);

// Habilitar modo WAL y llaves foráneas para integridad y concurrencia
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Inicializar esquemas al cargar el módulo
initDB();

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
  expires_at?: string;
  metadata?: string;
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
  extra_requests: number;
  period_start: string;
  period_end: string;
}

export interface Subscription {
  id: number;
  user_id: number;
  agent_id: string;
  plan_id: string;
  status: 'pending' | 'paid' | 'expired' | 'active';
  payment_method?: string;
  payment_reference?: string;
  verified_at?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id INTEGER PRIMARY KEY,
      audio_mode TEXT DEFAULT 'text',
      FOREIGN KEY (user_id) REFERENCES users(id)
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
      last_interaction DATETIME,
      expires_at DATETIME,
      metadata TEXT
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
      extra_requests INTEGER DEFAULT 0,
      period_start DATETIME DEFAULT CURRENT_TIMESTAMP,
      period_end DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_method TEXT,
      payment_reference TEXT,
      verified_at DATETIME,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS personal_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_id TEXT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      page_number INTEGER,
      author TEXT,
      year TEXT,
      title TEXT,
      publisher TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_personal_lib_user ON personal_library(user_id);
    CREATE INDEX IF NOT EXISTS idx_personal_lib_name ON personal_library(name);
    
    CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_users_agent ON users(agent_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
  `);

  // Insertar planes por defecto si no existen
  const existingPlans = db.prepare('SELECT COUNT(*) as count FROM plans').get() as { count: number };
  if (existingPlans.count === 0) {
    console.log('📦 Insertando planes por defecto...');
    db.exec(`
      INSERT INTO plans (id, name, monthly_requests, price_monthly, features) VALUES
      ('free', 'Freemium', 15, 0, '{"docs": true, "voice": false}'),
      ('basic', 'Básico', 100, 4.99, '{"docs": true, "voice": true}'),
      ('premium', 'Premium', 300, 9.99, '{"docs": true, "voice": true, "priority": true}')
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

  const usersInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
  const hasExpiresAt = usersInfo.some(col => col.name === 'expires_at');
  if (!hasExpiresAt) {
    console.log('🔄 Migrando: Agregando columna expires_at a users...');
    db.exec(`ALTER TABLE users ADD COLUMN expires_at DATETIME`);
  }

  const hasMetadata = usersInfo.some(col => col.name === 'metadata');
  if (!hasMetadata) {
    console.log('🔄 Migrando: Agregando columna metadata a users...');
    db.exec(`ALTER TABLE users ADD COLUMN metadata TEXT`);
  }
}

/**
 * Limpia todas las tablas de datos (útil para tests)
 * Respeta el orden de las llaves foráneas.
 */
export function clearDatabase() {
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM subscriptions');
  db.exec('DELETE FROM user_usage');
  db.exec('DELETE FROM personal_library');
  db.exec('DELETE FROM user_prefs');
  db.exec('DELETE FROM users');
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

export function updateUserExpiration(userId: number, expiresAt: string | null): void {
  const stmt = db.prepare('UPDATE users SET expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(expiresAt, userId);
}

export function updateUserMetadata(userId: number, metadata: string | null): void {
  const stmt = db.prepare('UPDATE users SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(metadata, userId);
}

export function updateLastInteraction(telegramId: number): void {
  const stmt = db.prepare('UPDATE users SET last_interaction = CURRENT_TIMESTAMP WHERE telegram_id = ?');
  stmt.run(telegramId);
}

export function deleteUserComplete(telegramId: number): void {
  const user = getUserByTelegramId(telegramId);
  if (!user) return;
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('DELETE FROM messages WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM user_prefs WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM user_usage WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function restoreUserComplete(telegramId: number): boolean {
  try {
    const backupPath = `${config.DB_PATH}.backup`;
    const backupExists = fs.existsSync(backupPath);
    if (!backupExists) return false;

    // 1. Limpiar rastro actual (si existe)
    deleteUserComplete(telegramId);

    // 2. Adjuntar backup y restaurar
    db.exec(`ATTACH DATABASE '${backupPath}' AS backup`);
    db.exec('BEGIN TRANSACTION');

    try {
      // Usuarios
      db.prepare(`
        INSERT INTO main.users (id, telegram_id, agent_id, plan, status, name, username, created_at, updated_at, last_interaction)
        SELECT id, telegram_id, agent_id, plan, status, name, username, created_at, updated_at, last_interaction
        FROM backup.users WHERE telegram_id = ?
      `).run(telegramId);

      const userFromBackup = db.prepare("SELECT id, telegram_id FROM backup.users WHERE telegram_id = ?").get(telegramId) as any;
      if (!userFromBackup) throw new Error("User not in backup");
      
      const backupInternalId = userFromBackup.id;
      const telegramIdNum = userFromBackup.telegram_id;

      // Al restaurar, el nuevo ID en main será el que acabamos de insertar (que debería ser backupInternalId si estaba libre)
      const newUser = getUserByTelegramId(telegramId);
      if (!newUser) throw new Error("Could not find newly created user");
      const newInternalId = newUser.id;

      // Mensajes: Buscamos si los mensajes en el backup están bajo el ID interno o bajo el telegram_id
      const checkMsgsId = db.prepare("SELECT COUNT(*) as c FROM backup.messages WHERE user_id = ?").get(backupInternalId) as any;
      const checkMsgsTg = db.prepare("SELECT COUNT(*) as c FROM backup.messages WHERE user_id = ?").get(telegramIdNum) as any;
      
      const sourceIdForMsgs = (checkMsgsId.c >= checkMsgsTg.c) ? backupInternalId : telegramIdNum;

      db.prepare(`
        INSERT INTO main.messages (user_id, role, content, tool_calls, tool_call_id, created_at)
        SELECT ?, role, content, tool_calls, tool_call_id, created_at
        FROM backup.messages WHERE user_id = ?
      `).run(newInternalId, sourceIdForMsgs);

      // Usage
      const sourceIdForUsage = (db.prepare("SELECT COUNT(*) as c FROM backup.user_usage WHERE user_id = ?").get(backupInternalId) as any).c >= 
                               (db.prepare("SELECT COUNT(*) as c FROM backup.user_usage WHERE user_id = ?").get(telegramIdNum) as any).c 
                               ? backupInternalId : telegramIdNum;

      db.prepare(`
        INSERT INTO main.user_usage (user_id, requests_count, period_start, period_end)
        SELECT ?, requests_count, period_start, period_end
        FROM backup.user_usage WHERE user_id = ?
      `).run(newInternalId, sourceIdForUsage);

      // Prefs
      const sourceIdForPrefs = (db.prepare("SELECT COUNT(*) as c FROM backup.user_prefs WHERE user_id = ?").get(backupInternalId) as any).c >= 
                               (db.prepare("SELECT COUNT(*) as c FROM backup.user_prefs WHERE user_id = ?").get(telegramIdNum) as any).c 
                               ? backupInternalId : telegramIdNum;

      db.prepare(`
        INSERT INTO main.user_prefs (user_id, audio_mode)
        SELECT ?, audio_mode
        FROM backup.user_prefs WHERE user_id = ?
      `).run(newInternalId, sourceIdForPrefs);

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      db.exec("DETACH DATABASE backup");
    }
    return true;
  } catch (error) {
    console.error('Error in restoreUserComplete:', error);
    return false;
  }
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
    console.log(`[DB] Creating new usage record for userId: ${userId}`);
    const stmt = db.prepare(`
      INSERT INTO user_usage (user_id, requests_count, period_start, period_end)
      VALUES (?, 1, ?, ?)
    `);
    try {
      stmt.run(userId, currentMonth, nextMonth);
    } catch (e: any) {
      console.error(`[DB] Error inserting into user_usage: ${e.message}. userId: ${userId}`);
      const userCheck = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      console.log(`[DB] User check result: ${JSON.stringify(userCheck)}`);
      throw e;
    }
  } else {
    // Incrementar contador
    const stmt = db.prepare('UPDATE user_usage SET requests_count = requests_count + 1 WHERE id = ?');
    stmt.run(usage.id);
  }
}

export function decrementUsage(userId: number): void {
  const usage = getUserUsage(userId);
  if (usage && usage.requests_count > 0) {
    const stmt = db.prepare('UPDATE user_usage SET requests_count = requests_count - 1 WHERE id = ?');
    stmt.run(usage.id);
  }
}

export function addExtraRequests(userId: number, amount: number): void {
  const usage = getUserUsage(userId);
  if (usage) {
    const stmt = db.prepare('UPDATE user_usage SET extra_requests = extra_requests + ? WHERE id = ?');
    stmt.run(amount, usage.id);
  }
}

export function checkUserLimit(telegramId: number): { allowed: boolean; remaining: number; plan: string; usagePercentage: number; nearLimit: boolean } {
  const user = getUserByTelegramId(telegramId);
  if (!user) {
    return { allowed: false, remaining: 0, plan: 'none', usagePercentage: 0, nearLimit: false };
  }
  
  if (user.status !== 'active') {
    return { allowed: false, remaining: 0, plan: user.plan, usagePercentage: 1, nearLimit: true };
  }
  
  if (user.expires_at && new Date(user.expires_at) < new Date()) {
    return { allowed: false, remaining: 0, plan: user.plan, usagePercentage: 1, nearLimit: true };
  }
  
  const plan = getPlan(user.plan);
  if (!plan) {
    return { allowed: false, remaining: 0, plan: user.plan, usagePercentage: 0, nearLimit: false };
  }
  
  // -1 significa ilimitado
  if (plan.monthly_requests === -1) {
    return { allowed: true, remaining: -1, plan: user.plan, usagePercentage: 0, nearLimit: false };
  }
  
  const usage = getUserUsage(user.id);
  const used = usage?.requests_count || 0;
  const extra = usage?.extra_requests || 0;
  
  const totalAllowed = plan.monthly_requests + extra;
  const remaining = totalAllowed - used;
  const usagePercentage = used / totalAllowed;
  
  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining),
    plan: user.plan,
    usagePercentage,
    nearLimit: usagePercentage >= 0.9
  };
}

// ============================================
// Funciones para Suscripciones y Pagos
// ============================================

export function createPendingSubscription(subscription: Partial<Subscription>): Subscription {
  const stmt = db.prepare(`
    INSERT INTO subscriptions (user_id, agent_id, plan_id, status, payment_method, payment_reference)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    subscription.user_id,
    subscription.agent_id,
    subscription.plan_id,
    'pending',
    subscription.payment_method || null,
    subscription.payment_reference || null
  );
  
  const id = result.lastInsertRowid as number;
  return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id) as Subscription;
}

export function getSubscriptionById(id: number): Subscription | null {
  return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id) as Subscription | null;
}

export function getPendingSubscriptions(): Subscription[] {
  return db.prepare("SELECT * FROM subscriptions WHERE status = 'pending'").all() as Subscription[];
}

export function verifySubscription(id: number, adminId: number): void {
  // 1. Obtener la suscripción
  const sub = getSubscriptionById(id);
  if (!sub) return;

  // 2. Actualizar suscripción
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 mes de validez

  db.prepare("UPDATE subscriptions SET status = 'paid', verified_at = CURRENT_TIMESTAMP, expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(expiresAt.toISOString(), id);

  // 3. Actualizar al usuario
  db.prepare("UPDATE users SET plan = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(sub.plan_id, sub.user_id);
}

export function getUserSubscriptions(userId: number): Subscription[] {
  return db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Subscription[];
}

// ============================================
// Biblioteca Personal (Memoria a Largo Plazo)
// ============================================

export function saveToPersonalLibrary(data: {
    user_id: number;
    name: string;
    content: string;
    page_number?: number;
    author?: string;
    year?: string;
    title?: string;
    publisher?: string;
}) {
    const stmt = db.prepare(`
        INSERT INTO personal_library (user_id, name, content, page_number, author, year, title, publisher)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
        data.user_id,
        data.name,
        data.content,
        data.page_number || null,
        data.author || null,
        data.year || null,
        data.title || null,
        data.publisher || null
    );
}

export function searchPersonalLibrary(userId: number, query: string, limit: number = 5): any[] {
    const keywords = query.toLowerCase().split(' ').filter(k => k.length > 3);
    if (keywords.length === 0) return [];

    let sql = 'SELECT * FROM personal_library WHERE user_id = ? AND (';
    const conditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' AND ');
    sql += conditions + `) LIMIT ${limit}`;

    const params = [userId, ...keywords.map(k => `%${k}%`)];
    return db.prepare(sql).all(...params) as any[];
}
