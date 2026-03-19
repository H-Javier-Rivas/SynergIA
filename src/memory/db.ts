import Database from 'better-sqlite3';
import { config } from '../config/index.js';

// Inicializar la base de datos
export const db = new Database(config.DB_PATH);

// Habilitar modo WAL para mejor concurrencia
db.pragma('journal_mode = WAL');

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
  `);

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
