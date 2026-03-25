import { Bot, InputFile } from 'grammy';
import { config } from '../config/index.js';
import { processUserMessage } from '../agent/loop.js';
import { transcribeAudio } from '../agent/transcription.js';
import { generateSpeech } from '../agent/tts.js';
import { extractTextFromPdf, extractTextFromDocx } from '../agent/document.js';
import { syncLibrary } from '../agent/library.js';
import { memory } from '../memory/history.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
const streamPipeline = promisify(pipeline);
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Configurar menú de comandos en Telegram de forma dinámica
const baseCommands = [
    { command: 'start', description: 'Iniciar y recibir saludo' },
    { command: 'reset', description: 'Borrar historial' },
    { command: 'audio', description: 'Configurar voz/texto' },
    { command: 'sync', description: 'Sincronizar Drive' },
    { command: 'ayuda', description: 'Ver ayuda y tips' }
];

// Añadir comandos de IA si están habilitados en el perfil
const iaCommands = Object.keys(config.capabilities.commands || {})
    .filter(cmd => config.capabilities.commands[cmd] === true)
    .map(cmd => ({
        command: cmd,
        description: `IA: ${cmd.replace(/_/g, ' ')}`
    }));

bot.api.setMyCommands([...baseCommands, ...iaCommands]);

// Middleware: Whitelist de usuarios (Seguridad Primero)
bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!userId) {
        console.warn('Mensaje ignorado: No se pudo determinar el ID del usuario.');
        return;
    }

    if (!config.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) {
        console.warn(`Mensaje ignorado: Usuario no autorizado (ID: ${userId}).`);
        return;
    }

    await next();
});

// Comandos
bot.command('start', async (ctx) => {
    await ctx.reply(`¡Hola! Soy <b>${config.BOT_NAME}</b>, tu agente personal. ¿En qué te puedo ayudar hoy?`, { parse_mode: 'HTML' });
});

bot.command('reset', async (ctx) => {
    if (ctx.from) {
        await memory.clearHistory(ctx.from.id);
        await ctx.reply('✅ Historial borrado. Empecemos de nuevo.');
    }
});

// Soporte para /ayuda, /help y /?
bot.command(['ayuda', 'help'], async (ctx) => await showHelp(ctx));
bot.hears(/^\/\?$/, async (ctx) => await showHelp(ctx));

async function showHelp(ctx: any) {
    const helpMessage =
`🤖 <b>Comandos de ${config.BOT_NAME}:</b>

• /start - Inicia el bot y recibe el saludo inicial.
• /reset - Borra el historial de la conversación actual.
• /audio - Ver el modo de audio actual.
• /audio voz - Activar respuestas con voz.
• /audio texto - Responder solo con texto.
• /audio off - Desactivar audio.
• /sync - Actualizar la base de conocimientos desde Google Drive (Administrador).
• /ayuda o /help - Ver esta lista de ayuda.

<b>Tips:</b>
• Puedes enviarme PDFs o archivos Word para que los analice.
• Puedes enviarme mensajes de voz y te responderé según tu configuración de /audio.`;

    await ctx.reply(helpMessage, { parse_mode: 'HTML' });
}


bot.command('audio', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.match?.trim().toLowerCase();

    if (!args) {
        const currentMode = memory.getAudioMode(userId);
        const modeDesc = currentMode === 'voice' ? '🎙️ Voz' : currentMode === 'text' ? '✍️ Texto' : '🔇 Desactivado';
        return await ctx.reply(`🔊 Modo de audio actual: <b>${modeDesc}</b>\n\nUsa '/audio voz', '/audio texto' o '/audio off' para cambiarlo.`, { parse_mode: 'HTML' });
    }

    if (args === 'voz' || args === 'voice') {
        memory.setAudioMode(userId, 'voice');
        await ctx.reply('🎙️ Modo de audio configurado a: <b>Voz</b>. Ahora te responderé con mensajes de audio.', { parse_mode: 'HTML' });
    } else if (args === 'texto' || args === 'text' || args === '--texto') {
        memory.setAudioMode(userId, 'text');
        await ctx.reply('✍️ Modo de audio configurado a: <b>Texto</b>. Responderé solo con mensajes escritos.', { parse_mode: 'HTML' });
    } else if (args === 'off' || args === 'desactivar') {
        memory.setAudioMode(userId, 'off');
        await ctx.reply('🔇 Modo de audio configurado a: <b>Desactivado</b>.', { parse_mode: 'HTML' });
    } else {
        await ctx.reply("❌ Opción no válida. Usa 'voz', 'texto' o 'off'.");
    }
});

bot.command('sync', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!config.GOOGLE_DRIVE_FOLDER_ID) {
        return await ctx.reply('❌ No hay una carpeta de Google Drive configurada en esta instancia (GOOGLE_DRIVE_FOLDER_ID).');
    }

    const initialMsg = await ctx.reply('🔄 Iniciando sincronización de biblioteca con Google Drive...\n<i>Por favor espera, esto puede tardar un momento si hay archivos nuevos o grandes.</i>', { parse_mode: 'HTML' });
    
    // Función auxiliar para actualizar el mensaje de estado sin spam, solo lo actualiza cada 2.5s si es necesario
    let lastUpdate = Date.now();
    const updateProgress = async (msg: string) => {
         if (Date.now() - lastUpdate > 2500) {
              try {
                  await ctx.api.editMessageText(ctx.chat.id, initialMsg.message_id, `🔄 <b>Sincronizando:</b>\n<i>${msg}</i>`, { parse_mode: 'HTML' });
                  lastUpdate = Date.now();
              } catch (e) { /* ignore */ }
         }
    };

    try {
        await syncLibrary(updateProgress);
        await ctx.api.editMessageText(ctx.chat.id, initialMsg.message_id, '✅ <b>¡Sincronización completada!</b>\nLos documentos están listos para ser consultados.', { parse_mode: 'HTML' });
    } catch (e: any) {
        console.error('Error en /sync:', e);
        await ctx.reply(`❌ <b>Error durante la sincronización:</b>\n${e.message}`, { parse_mode: 'HTML' });
    }
});


// Manejador de documentos
bot.on('message:document', async (ctx) => {
    const userId = ctx.from.id;
    const document = ctx.message.document;
    const fileId = document.file_id;
    let fileName = document.file_name || 'documento_desconocido';
    const caption = ctx.message.caption || ''; // Lo que el usuario escribió junto al documento
    
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (ext !== 'pdf' && ext !== 'docx') {
        return ctx.reply('Lo siento, de momento solo puedo procesar archivos PDF y Word (.docx).');
    }

    await ctx.replyWithChatAction('typing');

    try {
        const file = await ctx.api.getFile(fileId);
        const filePath = file.file_path;
        if (!filePath) throw new Error('No se pudo obtener la ruta del archivo de Telegram.');

        const tempDir = path.resolve(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        const localPath = path.resolve(tempDir, `doc_${Date.now()}.${ext}`);

        const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${filePath}`;
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error('Falló la descarga del documento de Telegram');
        
        // @ts-ignore
        await streamPipeline(response.body, fs.createWriteStream(localPath));

        let extractedText = '';
        if (ext === 'pdf') {
            extractedText = await extractTextFromPdf(localPath);
        } else if (ext === 'docx') {
            extractedText = await extractTextFromDocx(localPath);
        }

        // Limpiar el archivo temporal
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

        // Preparamos el mensaje para el LLM. Ej: "Comenta su contenido \n\n --- Contenido del documento --- \n [TEXTO]"
        let finalPrompt = '';
        if (caption.trim().length > 0) {
            finalPrompt = `${caption}\n\n--- Documento adjunto (${fileName}) ---\n${extractedText}`;
        } else {
            finalPrompt = `Por favor analiza este documento (${fileName}):\n\n${extractedText}`;
        }
        
        // Truncar si el documento es absurda y groseramente largo (esto previene pasarse del context window masivamente, 
        // aunque Llama-3 de groq soporta mucho, es buena práctica)
        const MAX_DOC_CHARS = 100000;
        if (finalPrompt.length > MAX_DOC_CHARS) {
             finalPrompt = finalPrompt.substring(0, MAX_DOC_CHARS) + '\n\n... [Texto truncado por límite de longitud]';
             ctx.reply('El documento es muy grande. Solo procesaré las primeras partes del texto.');
        }

        const replyText = await processUserMessage(userId, finalPrompt);
        await sendLongMessage(ctx, replyText);

        // Responder también con voz solo si está activado
        if (memory.getAudioMode(userId) === 'voice') {
            const audioPath = await generateSpeech(replyText);
            if (audioPath) {
                await ctx.replyWithVoice(new InputFile(audioPath));
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            }
        }

    } catch (error: any) {
        console.error('Error procesando documento:', error);
        await ctx.reply(`Error al procesar el documento: ${error.message}`);
    }
});

// Manejador de voz/audio
bot.on(['message:voice', 'message:audio'], async (ctx) => {
    const userId = ctx.from.id;
    const file = await ctx.getFile();
    const filePath = file.file_path;
    
    if (!filePath) return;

    const tempDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    let ext = filePath.split('.').pop() || 'ogg';
    // Telegram usa .oga para mensajes de voz, pero Groq prefiere .ogg para reconocer el formato
    if (ext === 'oga') ext = 'ogg';

    const localPath = path.resolve(tempDir, `voice_${Date.now()}.${ext}`);

    await ctx.replyWithChatAction('typing');

    try {
        const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${filePath}`;
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error('Fallo la descarga del audio de Telegram');
        
        // @ts-ignore
        await streamPipeline(response.body, fs.createWriteStream(localPath));


        const transcribedText = await transcribeAudio(localPath);
        
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);



        const replyText = await processUserMessage(userId, transcribedText);
        await sendLongMessage(ctx, replyText);

        // Responder también con voz solo si está activado
        if (memory.getAudioMode(userId) === 'voice') {
            const audioPath = await generateSpeech(replyText);
            if (audioPath) {
                await ctx.replyWithVoice(new InputFile(audioPath));
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            }
        }
    } catch (error: any) {
        console.error('Error procesando audio:', error);
        await ctx.reply(`Error con el audio: ${error.message}`);
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }
});

// Función auxiliar para forzar la limpieza de Markdown terco a HTML amigable para Telegram
function formatForTelegramHtml(text: string): string {
    let html = text;
    
    // Convertir Títulos Markdown a negrita HTML
    html = html.replace(/^#{1,4}\s+(.*)$/gm, '<b>$1</b>');
    
    // Convertir Negritas Markdown a HTML
    html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    
    // Convertir Tachado
    html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');
    
    // Transformar listas Markdown (* o -) a viñetas seguras (•) para evitar fallos de itálicas
    html = html.replace(/^\s*[\*-]\s+/gm, '• ');

    return html;
}

// Función auxiliar para dividir mensajes largos
async function sendLongMessage(ctx: any, text: string) {
    const formattedText = formatForTelegramHtml(text);
    const MAX_LENGTH = 4090;
    const opts = { parse_mode: 'HTML' as const };
    
    if (formattedText.length <= MAX_LENGTH) {
        return await ctx.reply(formattedText, opts);
    }

    const chunks = [];
    let currentText = formattedText;

    while (currentText.length > 0) {
        if (currentText.length <= MAX_LENGTH) {
            chunks.push(currentText);
            break;
        }

        let cutIndex = currentText.lastIndexOf('\n', MAX_LENGTH);
        if (cutIndex === -1) cutIndex = MAX_LENGTH;

        chunks.push(currentText.substring(0, cutIndex));
        currentText = currentText.substring(cutIndex).trimStart();
    }

    for (const chunk of chunks) {
        await ctx.reply(chunk, opts);
    }
}

// Manejador dinámico de comandos de IA
bot.on('message:entities:bot_command', async (ctx, next) => {
    const text = ctx.message.text || ctx.message.caption || '';
    const match = text.match(/^\/([a-zA-Z0-9_]+)/);
    
    if (!match) return next();
    
    const cmdName = match[1].toLowerCase();
    
    // Verificamos si es un comando controlado por perfiles
    if (config.capabilities.commands && config.capabilities.commands[cmdName] !== undefined) {
        if (config.capabilities.commands[cmdName] === true) {
            await ctx.replyWithChatAction('typing');
            try {
                const userId = ctx.from.id;
                const extraText = text.replace(`/${cmdName}`, '').trim();
                const instruction = `[INSTRUCCIÓN INTERNA AL SISTEMA] El usuario ha invocado el comando "/${cmdName}". Tu tarea es ejecutar la acción correspondiente de manera elegante y narrativa, aplicando tu estilo profesional al contexto actual o al texto adjunto: "${extraText}". NO respondas con viñetas mecánicas ni enumeraciones markdown innecesarias, aplica un estilo fluido, descriptivo y académico.`;
                
                const replyText = await processUserMessage(userId, instruction);
                await sendLongMessage(ctx, replyText);

                if (memory.getAudioMode(userId) === 'voice') {
                    const audioPath = await generateSpeech(replyText);
                    if (audioPath) {
                        await ctx.replyWithVoice(new InputFile(audioPath));
                        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                    }
                }
            } catch (error: any) {
                console.error(`Error procesando comando dinámico ${cmdName}:`, error);
                await ctx.reply(`Error procesando comando: ${error.message}`);
            }
        } else {
            // Comando apagado en configuración
            await ctx.reply('🔒 Este comando no está habilitado en mi configuración actual (plan/versión).');
        }
    } else {
        // No es un comando cubierto por capabilities, delegamos
        await ctx.reply('Comando no reconocido. Escribe /ayuda para ver mis opciones.');
    }
});

// Manejador principal de mensajes
bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    await ctx.replyWithChatAction('typing');

    try {
        const replyText = await processUserMessage(userId, text);
        await sendLongMessage(ctx, replyText);

        // Responder también con voz solo si está activado
        if (memory.getAudioMode(userId) === 'voice') {
            const audioPath = await generateSpeech(replyText);
            if (audioPath) {
                await ctx.replyWithVoice(new InputFile(audioPath));
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            }
        }
    } catch (error: any) {
        console.error('Error al procesar mensaje:', error);
        await ctx.reply(`Error procesando solicitud: ${error.message}`);
    }
});
