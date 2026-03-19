import { db } from './db.js';
import { firebaseMemory } from './firebase.js';

export interface Message {
  id?: number;
  user_id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: any;
  tool_call_id?: string | null;
  created_at?: string;
}

export const memory = {
  // Guardar un mensaje en la base de datos local y Firebase
  saveMessage: async (msg: Message) => {
    const stmt = db.prepare(`
      INSERT INTO messages (user_id, role, content, tool_calls, tool_call_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      msg.user_id,
      msg.role,
      msg.content,
      msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
      msg.tool_call_id || null
    );

    // Guardado en la nube (ahora esperamos a que se complete para evitar pérdidas)
    await firebaseMemory.saveMessage(msg.user_id, msg, true).catch(err => console.error("Firebase Sync Error:", err));
    
    return result.lastInsertRowid;
  },

  // Obtener el historial reciente de un usuario (últimos limit mensajes)
  getHistory: (user_id: number, limit: number = 20): Message[] => {
    const stmt = db.prepare(`
      SELECT * FROM messages 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    
    const messages = stmt.all(user_id, limit) as Message[];
    
    return messages.reverse().map(msg => ({
      ...msg,
      tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls as string) : undefined
    }));
  },

  // Borrar el historial de un usuario (local y nube)
  clearHistory: async (user_id: number) => {
    const stmt = db.prepare(`DELETE FROM messages WHERE user_id = ?`);
    stmt.run(user_id);

    // Borrado en la nube
    await firebaseMemory.clearHistory(user_id).catch(err => console.error("Firebase Sync Error:", err));
  },

  // Gestión de preferencias de audio persistentes (modo)
  getAudioMode: (user_id: number): string => {
    const stmt = db.prepare(`SELECT audio_mode FROM user_prefs WHERE user_id = ?`);
    const row = stmt.get(user_id) as { audio_mode: string } | undefined;
    return row?.audio_mode ?? 'text';
  },

  setAudioMode: (user_id: number, mode: 'text' | 'voice' | 'off'): void => {
    const stmt = db.prepare(`
        INSERT INTO user_prefs (user_id, audio_mode)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET audio_mode = excluded.audio_mode
    `);
    stmt.run(user_id, mode);
  }
};
