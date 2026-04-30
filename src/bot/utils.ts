export function cleanHtml(text: string): string {
    // 1. Pre-procesar etiquetas de bloque que no soporta Telegram
    let processed = text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p>/gi, '').replace(/<\/p>/gi, '\n\n')
        .replace(/<ul>/gi, '').replace(/<\/ul>/gi, '\n')
        .replace(/<ol>/gi, '').replace(/<\/ol>/gi, '\n')
        .replace(/<li>/gi, '• ').replace(/<\/li>/gi, '\n');

    // 2. Escapar caracteres especiales de HTML
    let html = processed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 3. Restaurar etiquetas permitidas por Telegram
    // Lista: b, i, u, s, strong, em, code, pre, a, blockquote
    const allowedTags = ['b', 'i', 'u', 's', 'strong', 'em', 'code', 'pre', 'a', 'blockquote'];
    
    for (const tag of allowedTags) {
        if (tag === 'a') {
            // Manejo especial para enlaces: <a href="...">...</a>
            const aRegex = /&lt;a\s+href=([\'"])(.*?)\1\s*&gt;(.*?)&lt;\/a&gt;/gis;
            html = html.replace(aRegex, '<a href="$2">$3</a>');
        } else {
            const regex = new RegExp(`&lt;(${tag})&gt;(.*?)&lt;\\/\\1&gt;`, 'gis');
            html = html.replace(regex, `<$1>$2</$1>`);
        }
    }

    // 4. Limpiar cualquier otra etiqueta malformada o no permitida que haya quedado escapada
    // Pero solo si queremos ser estrictos. Telegram simplemente ignorará entidades &lt; si no son parte de un tag.
    // Sin embargo, si quedaron tags escapados que no restauramos, mejor conservarlos como texto plano.
    
    return html.trim();
}

export async function sendLongMessage(ctx: any, text: string) {
    const MAX_LENGTH = 4090;
    const cleanText = cleanHtml(text);
    const opts = { parse_mode: 'HTML' as const };
    
    if (cleanText.length <= MAX_LENGTH) {
        try {
            return await ctx.reply(cleanText, opts);
        } catch (e: any) {
            console.error('Error enviando mensaje HTML:', e.message);
            // Si falla el HTML, enviamos sin formato para que el usuario al menos vea el texto
            return await ctx.reply(text.replace(/<[^>]*>/g, '')); 
        }
    }

    const chunks = [];
    let currentText = cleanText;

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
        try {
            await ctx.api.sendMessage(ctx.chat.id, chunk, opts);
        } catch (e: any) {
            console.error('Error enviando chunk HTML:', e.message);
            await ctx.api.sendMessage(ctx.chat.id, chunk.replace(/<[^>]*>/g, ''));
        }
    }
}

import crypto from 'crypto';

export function hashFileId(fileId: string): string {
    const hash = crypto.createHash('sha256').update(fileId).digest('hex');
    return hash.substring(0, 32);
}
