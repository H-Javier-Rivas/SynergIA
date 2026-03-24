import { config } from './src/config/index';

console.log("--- CONFIG LOAD TEST ---");
console.log("TELEGRAM_BOT_TOKEN:", config.TELEGRAM_BOT_TOKEN);
console.log("DB_PATH:", config.DB_PATH);
console.log("--- /CONFIG LOAD TEST ---");
