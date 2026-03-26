import { initDB } from './src/memory/db.js';
import { memory } from './src/memory/history.js';

async function testMessageHistory() {
  console.log('=== PRUEBA DE HISTORIAL DE MENSAJES ===\n');

  try {
    // 1. Inicializar BD
    initDB();
    console.log('✅ Base de datos inicializada');

    // 2. Probar guardar mensajes
    const testUserId = 999999;
    console.log('\n📝 Guardando mensajes de prueba...');

    await memory.saveMessage({
      user_id: testUserId,
      role: 'user',
      content: 'Hola, esta es una prueba 1'
    });

    await memory.saveMessage({
      user_id: testUserId,
      role: 'assistant',
      content: '¡Hola! Recibido tu mensaje de prueba'
    });

    await memory.saveMessage({
      user_id: testUserId,
      role: 'user',
      content: 'Esta es la prueba número 2'
    });

    await memory.saveMessage({
      user_id: testUserId,
      role: 'assistant',
      content: 'Todo funciona correctamente'
    });

    console.log('✅ 4 mensajes guardados');

    // 3. Obtener historial
    console.log('\n📋 Obteniendo historial (últimos 10 mensajes)...');
    const history = memory.getHistory(testUserId, 10);

    console.log(`📊 Total mensajes recuperados: ${history.length}`);
    history.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.role}] ${msg.content.substring(0, 50)}...`);
    });

    // 4. Verificar orden (debería estar en orden cronológico)
    console.log('\n🔍 Verificando orden cronológico...');
    let isOrdered = true;
    for (let i = 1; i < history.length; i++) {
      const prev = new Date(history[i - 1].created_at || 0);
      const curr = new Date(history[i].created_at || 0);
      if (prev > curr) {
        isOrdered = false;
        console.log(`❌ ORDEN INCORRECTO en índice ${i}: ${prev} > ${curr}`);
      }
    }
    if (isOrdered) {
      console.log('✅ Historial en orden cronológico correcto');
    }

    // 5. Probar borrado
    console.log('\n🗑️ Borrando historial...');
    await memory.clearHistory(testUserId);
    const afterClear = memory.getHistory(testUserId, 10);
    console.log(`📊 Mensajes después de borrar: ${afterClear.length}`);

    if (afterClear.length === 0) {
      console.log('✅ Historial borrado correctamente');
    } else {
      console.log('❌ Error: El historial no se borró completamente');
    }

    console.log('\n=== PRUEBA COMPLETADA ===');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR EN LA PRUEBA:', error);
    process.exit(1);
  }
}

testMessageHistory();
