import { db } from './src/memory/db.js';
import { config } from './src/config/index.js';
import fs from 'fs';
import path from 'path';

async function verifySystem() {
    console.log("🔍 === INICIANDO VERIFICACIÓN DE SISTEMA SynergIA ===\n");

    let errors = 0;

    // 1. Verificar Estructura de Carpetas
    const requiredDirs = ['temp', 'src/config/profiles', 'docs/library'];
    console.log("📁 Verificando directorios...");
    requiredDirs.forEach(dir => {
        if (!fs.existsSync(path.resolve(process.cwd(), dir))) {
            console.log(`   ❌ Carpeta faltante: ${dir}`);
            errors++;
        } else {
            console.log(`   ✅ Carpeta OK: ${dir}`);
        }
    });

    // 2. Verificar Base de Datos
    console.log("\n🗄️ Verificando Base de Datos SQLite...");
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        const tableNames = tables.map(t => t.name);
        const requiredTables = ['users', 'plans', 'subscriptions', 'messages'];
        
        requiredTables.forEach(t => {
            if (tableNames.includes(t)) {
                console.log(`   ✅ Tabla encontrada: ${t}`);
            } else {
                console.log(`   ❌ Tabla FALTANTE: ${t}`);
                errors++;
            }
        });
    } catch (e) {
        console.log(`   ❌ Error al conectar con DB: ${e.message}`);
        errors++;
    }

    // 3. Verificar Configuración y APIs
    console.log("\n🔑 Verificando variables críticas...");
    const criticalKeys = ['TELEGRAM_BOT_TOKEN', 'GROQ_API_KEY'];
    criticalKeys.forEach(key => {
        if (config[key] && config[key] !== 'tu_token_aqui') {
            console.log(`   ✅ ${key} está configurado.`);
        } else {
            console.log(`   ❌ ${key} NO configurado correctamente en .env`);
            errors++;
        }
    });

    // 4. Verificar Perfil del Bot
    console.log("\n🤖 Verificando Perfil del Agente...");
    if (config.BOT_NAME) {
        console.log(`   ✅ Nombre del Agente: ${config.BOT_NAME}`);
        console.log(`   ✅ Capacidades activas: ${Object.keys(config.capabilities.commands).length} comandos.`);
    } else {
        console.log(`   ❌ Perfil del agente no cargado.`);
        errors++;
    }

    console.log("\n-------------------------------------------");
    if (errors === 0) {
        console.log("🚀 ¡SISTEMA LISTO! No se encontraron problemas.");
    } else {
        console.log(`⚠️ SE ENCONTRARON ${errors} PROBLEMAS. Revisa los mensajes anteriores.`);
    }
    console.log("-------------------------------------------\n");
}

verifySystem().catch(console.error);

