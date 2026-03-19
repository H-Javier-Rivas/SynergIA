import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';

export async function extractTextFromPdf(filePath: string): Promise<string> {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        throw new Error('No se pudo extraer el texto del PDF.');
    }
}

export async function extractTextFromDocx(filePath: string): Promise<string> {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (error) {
        console.error('Error extracting text from DOCX:', error);
        throw new Error('No se pudo extraer el texto del documento Word.');
    }
}
