import { extractTextFromDocx } from './src/agent/document.js';
import fs from 'fs';
import path from 'path';

async function main() {
    try {
        const docPath = path.resolve(process.cwd(), 'docs/Documentación técnica.docx');
        console.log('Reading:', docPath);
        const text = await extractTextFromDocx(docPath);
        fs.writeFileSync('docs/Documentación técnica.txt', text);
        console.log('Extracted to docs/Documentación técnica.txt');
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
