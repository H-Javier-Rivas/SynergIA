import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Determinar el ID de la instancia
const instanceId = process.env.INSTANCE_ID || 'synergia';

// Determinar si debemos cargar un archivo .env específico basado en la instancia
const envPath = path.resolve(process.cwd(), `.env${instanceId === 'synergia' ? '' : '.' + instanceId}`);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, quiet: true });
  console.log(`[Config] Instance ID: ${instanceId}`);
  console.log(`[Config] Cargando variables de entorno desde: ${path.basename(envPath)}`);
} else {
  dotenv.config({ quiet: true });
}

export interface Config {
  // Secretos (vienen de .env)
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ALLOWED_USER_IDS: number[];
  GROQ_API_KEY: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL: string;
  DB_PATH: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  ELEVENLABS_API_KEY?: string;
  GEMINI_API_KEY?: string;

  // Perfil del Bot (vienen de JSON)
  BOT_NAME: string;
  SYSTEM_PROMPT: string;
  KNOWLEDGE: string;
  GOOGLE_DRIVE_FOLDER_ID?: string;
  capabilities: {
    commands: { [key: string]: boolean };
    features: { [key: string]: boolean };
  };
}

// Cargar el perfil JSON
const profilePath = path.resolve(process.cwd(), 'src/config', 'profiles', `${instanceId}.json`);
if (!fs.existsSync(profilePath)) {
    throw new Error(`No se encontró el perfil del bot en: ${profilePath}`);
}

const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

function parseAllowedUsers(userIds: string | undefined): number[] {
  if (!userIds) return [];
  return userIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
}

const requiredEnvKeys = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_USER_IDS', 'GROQ_API_KEY'];
for (const key of requiredEnvKeys) {
  if (!process.env[key]) {
    throw new Error(`Falta variable de entorno crítica: ${key}`);
  }
}

// Cargar conocimiento estático si existe en el perfil
let knowledgeContent = '';
if (profile.knowledge_file) {
  const kPath = path.resolve(process.cwd(), profile.knowledge_file);
  if (fs.existsSync(kPath)) {
    knowledgeContent = fs.readFileSync(kPath, 'utf-8');
  }
}

export const config: Config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN as string,
  TELEGRAM_ALLOWED_USER_IDS: parseAllowedUsers(process.env.TELEGRAM_ALLOWED_USER_IDS),
  GROQ_API_KEY: process.env.GROQ_API_KEY as string,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'openrouter/free',
  DB_PATH: process.env.DB_PATH || (instanceId !== 'synergia' ? `./memory_${instanceId}.db` : './memory.db'),
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // Valores del Perfil
  BOT_NAME: profile.name || process.env.BOT_NAME || 'SynergIA',
  SYSTEM_PROMPT: profile.system_prompt || '',
  KNOWLEDGE: knowledgeContent,
  GOOGLE_DRIVE_FOLDER_ID: profile.google_drive_folder_id,
  capabilities: profile.capabilities || { commands: {}, features: {} }
};

if (config.TELEGRAM_ALLOWED_USER_IDS.length === 0) {
  throw new Error('TELEGRAM_ALLOWED_USER_IDS debe contener al menos un ID válido.');
}
