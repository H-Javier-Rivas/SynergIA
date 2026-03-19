import { initDB } from './memory/db.js';
import { initFirebase } from './memory/firebase.js';
import { bot } from './bot/telegram.js';

async function bootstrap() {
  console.log('Iniciando SynergIA...');

  try {
    // 1. Inicializar Base de Datos (Memoria local)
    initDB();
    console.log('✅ Base de datos (SQLite) inicializada.');

    // 2. Inicializar Firebase (Nube)
    initFirebase();

    // 3. Manejo de errores global del bot
    bot.catch((err) => {
      const ctx = err.ctx;
      console.error(`Error while handling update ${ctx.update.update_id}:`);
      const e = err.error;
      console.error(e);
    });

    // 4. Iniciar bot (Long Polling)
    console.log('🚀 Iniciando conexión con Telegram (Long Polling)...');
    bot.start({
      drop_pending_updates: true, // Ignorar mensajes antiguos si el bot estuvo inactivo
    });
    
    console.log('✅ SynergIA Bot funcionando en local.');

    // Graceful Shutdown
    process.once('SIGINT', () => bot.stop());
    process.once('SIGTERM', () => bot.stop());

  } catch (error) {
    console.error('❌ Error fatal al iniciar SynergIA:', error);
    process.exit(1);
  }
}

bootstrap();
