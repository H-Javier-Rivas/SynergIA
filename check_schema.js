import Database from 'better-sqlite3';
import { config } from './src/config/index.js';

const db = new Database(config.DB_PATH);
const info = db.prepare("PRAGMA table_info(user_prefs)").all();
console.log(JSON.stringify(info, null, 2));
db.close();
