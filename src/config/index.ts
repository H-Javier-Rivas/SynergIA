import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export interface Config {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ALLOWED_USER_IDS: number[];
  GROQ_API_KEY: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL: string;
  DB_PATH: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  ELEVENLABS_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

function parseAllowedUsers(userIds: string | undefined): number[] {
  if (!userIds) return [];
  return userIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
}

const requiredKeys = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_USER_IDS', 'GROQ_API_KEY'];

for (const key of requiredKeys) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config: Config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN as string,
  TELEGRAM_ALLOWED_USER_IDS: parseAllowedUsers(process.env.TELEGRAM_ALLOWED_USER_IDS),
  GROQ_API_KEY: process.env.GROQ_API_KEY as string,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'openrouter/free',
  DB_PATH: process.env.DB_PATH || './memory.db',
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};

if (config.TELEGRAM_ALLOWED_USER_IDS.length === 0) {
  throw new Error('TELEGRAM_ALLOWED_USER_IDS must contain at least one valid user ID.');
}
