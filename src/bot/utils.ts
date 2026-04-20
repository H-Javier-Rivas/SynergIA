export function cleanHtml(text: string): string {
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const allowedTags = ['b', 'i', 'u', 's', 'strong', 'em', 'code', 'pre', 'br', 'p', 'ul', 'ol', 'li', 'a', 'blockquote'];
    for (const tag of allowedTags) {
        const regex = new RegExp(`&lt;(${tag})&gt;((?:(?!&lt;\\/${tag}&gt;).)*?)&lt;\\/${tag}&gt;`, 'gis');
        html = html.replace(regex, `<$1>$2</$1>`);
    }
    html = html.replace(/&lt;a\s+(href=["\'][^"\']+["\'])\s*&gt;/gis, '<a $1>');
    html = html.replace(/&lt;\/?[a-z][a-z0-9]*([^>]*)&gt;/gi, '');
    return html;
}

export async function sendLongMessage(ctx: any, text: string) {
    const MAX_LENGTH = 4090;
    const cleanText = cleanHtml(text);
    const opts = { parse_mode: 'HTML' as const };
    
    if (cleanText.length <= MAX_LENGTH) {
        try {
            return await ctx.reply(cleanText, opts);
        } catch (e: any) {
            return await ctx.reply(cleanText);
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
            await ctx.api.sendMessage(ctx.chat.id, chunk);
        }
    }
}
