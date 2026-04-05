import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../memory/db.js';
import { config } from '../config/index.js';
import { extractTextFromPdf, extractTextFromDocx } from './document.js';

const execAsync = promisify(exec);

export async function runGogCommand(command: string): Promise<string> {
  const gogPath = path.resolve(process.cwd(), process.platform === 'win32' ? 'gog.exe' : 'gog');
  try {
    const { stdout, stderr } = await execAsync(`"${gogPath}" ${command}`);
    if (stderr && !stdout) {
      console.warn('gog stderr:', stderr);
    }
    return stdout || stderr || '';
  } catch (error: any) {
    console.error(`gog command failed: ${command}`, error);
    throw new Error(`Error ejecutando gog: ${error.message}`);
  }
}

export async function syncLibrary(onProgress?: (msg: string) => void) {
  if (!config.GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID no está configurado.');
  }

  const libDir = path.resolve(process.cwd(), 'docs', 'library');
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }

  const log = (msg: string) => {
    console.log(`[Library Sync] ${msg}`);
    if (onProgress) onProgress(msg);
  };

  log('Obteniendo lista de archivos de Google Drive...');
  
  // Use 'drive ls' with parent ID which is more reliable than 'search' for folder contents
  const folderId = config.GOOGLE_DRIVE_FOLDER_ID;
  const listResultStr = await runGogCommand(`drive ls --parent ${folderId} --json --max 100`);
  
  let files: any[] = [];
  try {
    if (listResultStr.trim()) {
       const parsed = JSON.parse(listResultStr);
       // 'drive ls' results are usually in a 'files' property of the returned object
       if (parsed.files && Array.isArray(parsed.files)) {
           files = parsed.files;
       } else if (Array.isArray(parsed)) {
           files = parsed;
       } else {
           files = [parsed];
       }
    }
  } catch (e: any) {
     if (!listResultStr.includes('0 found')) {
         throw new Error(`Error parseando lista de archivos de Drive: ${e.message}`);
     }
  }

  log(`Se encontraron ${files.length} archivos en la carpeta de Drive.`);

  for (const file of files) {
    const fileId = file.id;
    let fileName = file.name;
    const mimeType = file.mimeType;

    // Tipos de archivo que aceptamos
    const isGoogleDoc = mimeType === 'application/vnd.google-apps.document';
    const isGoogleSheet = mimeType === 'application/vnd.google-apps.spreadsheet';
    const isGoogleSlide = mimeType === 'application/vnd.google-apps.presentation';
    const isStandardPdf = mimeType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    const isStandardDocx = mimeType.includes('wordprocessingml.document') || fileName.toLowerCase().endsWith('.docx');
    const isPlainText = mimeType === 'text/plain' || fileName.toLowerCase().endsWith('.txt');

    if (!isGoogleDoc && !isGoogleSheet && !isGoogleSlide && !isStandardPdf && !isStandardDocx && !isPlainText) {
        log(`Saltando archivo no soportado: ${fileName} (${mimeType})`);
        continue;
    }

    const localPath = path.resolve(libDir, `${fileId}_${fileName}`);
    
    // Check if we already have it in the DB
    const existing = db.prepare('SELECT id, last_sync FROM library_index WHERE file_id = ?').get(fileId) as any;
    
    // Si ya existe y tenemos el archivo local, podríamos validar hash, pero para simplificar verificaremos si existe la entrada en BD.
    if (existing && fs.existsSync(localPath)) {
        log(`✓ Ya indexado: ${fileName}`);
        continue;
    }

    log(`Descargando: ${fileName}...`);
    try {
        let downloadCmd = `drive download ${fileId} --out "${localPath}"`;
        let exportExt = '';

        if (isGoogleDoc) {
            exportExt = '.txt';
            downloadCmd += ` --format txt`;
        } else if (isGoogleSheet) {
            exportExt = '.csv';
            downloadCmd += ` --format csv`;
        } else if (isGoogleSlide) {
            exportExt = '.pdf';
            downloadCmd += ` --format pdf`;
        }

        const finalLocalPath = exportExt ? localPath + exportExt : localPath;

        await runGogCommand(downloadCmd);
        
        log(`Extrayendo texto de: ${fileName}...`);
        let extractedText = '';
        
        if (isStandardPdf || isGoogleSlide) {
             extractedText = await extractTextFromPdf(finalLocalPath);
        } else if (isStandardDocx) {
             extractedText = await extractTextFromDocx(finalLocalPath);
        } else if (isGoogleDoc || isGoogleSheet || isPlainText) {
             // Es un archivo de texto plano (txt o csv)
             extractedText = fs.readFileSync(finalLocalPath, 'utf8');
        }

        if (!extractedText.trim()) {
             log(`⚠️ Archivo vacío o ilegible: ${fileName}`);
             continue;
        }

        log(`Guardando índice en memoria: ${fileName}...`);
        
        const stmt = db.prepare(`
            INSERT INTO library_index (file_id, name, content, last_sync) 
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(file_id) DO UPDATE SET 
                name = excluded.name, 
                content = excluded.content,
                last_sync = CURRENT_TIMESTAMP
        `);
        stmt.run(fileId, fileName, extractedText);
        
        log(`✓ Indexado y guardado: ${fileName}`);

    } catch (error: any) {
        log(`❌ Error procesando ${fileName}: ${error.message}`);
    }
  }

  log('Sincronización de biblioteca completada.');
}

export function searchLibrary(query: string, limit: number = 3, userId?: number, allUsers: boolean = false): { name: string, snippet: string, source: string, page?: number, author?: string, year?: string }[] {
    const keywords = query.toLowerCase().split(' ').filter(k => k.length > 3);
    if (keywords.length === 0) return [];

    let results: any[] = [];

    // 1. Buscar en la biblioteca global (Drive)
    let sqlGlobal = 'SELECT name, content FROM library_index WHERE ';
    const conditionsGlobal = keywords.map(() => 'LOWER(content) LIKE ?').join(' AND ');
    sqlGlobal += conditionsGlobal + ` LIMIT ${limit}`;
    const paramsGlobal = keywords.map(k => `%${k}%`);
    
    const globalRows = db.prepare(sqlGlobal).all(...paramsGlobal) as any[];
    results = globalRows.map(row => ({ ...row, source: 'Biblioteca Global (Drive)' }));

    // 2. Buscar en la biblioteca personal
    if (allUsers) {
        // Búsqueda de Superusuario: Buscar en todos los documentos personales
        let sqlPersonal = `
            SELECT pl.name, pl.content, pl.page_number, pl.author, pl.year, u.name as owner_name 
            FROM personal_library pl
            JOIN users u ON pl.user_id = u.id
            WHERE (`;
        const conditionsPersonal = keywords.map(() => 'LOWER(pl.content) LIKE ?').join(' AND ');
        sqlPersonal += conditionsPersonal + `) LIMIT ${limit * 2}`; // Mayor límite por ser global
        const paramsPersonal = [...keywords.map(k => `%${k}%`)];
        
        const personalRows = db.prepare(sqlPersonal).all(...paramsPersonal) as any[];
        results = [...results, ...personalRows.map(row => ({ 
            ...row, 
            source: `Biblioteca Personal de ${row.owner_name || 'Usuario Desconocido'}` 
        }))];
    } else if (userId) {
        // Búsqueda normal: Solo el usuario actual
        let sqlPersonal = 'SELECT name, content, page_number, author, year FROM personal_library WHERE user_id = ? AND (';
        const conditionsPersonal = keywords.map(() => 'LOWER(content) LIKE ?').join(' AND ');
        sqlPersonal += conditionsPersonal + `) LIMIT ${limit}`;
        const paramsPersonal = [userId, ...keywords.map(k => `%${k}%`)];
        
        const personalRows = db.prepare(sqlPersonal).all(...paramsPersonal) as any[];
        results = [...results, ...personalRows.map(row => ({ ...row, source: 'Mi Biblioteca Personal' }))];
    }

    // Procesar snippets y formatear
    return results.map(row => {
        const contentLower = row.content.toLowerCase();
        let firstMatchIdx = -1;
        for (const word of keywords) {
             const idx = contentLower.indexOf(word);
             if (idx !== -1) {
                 firstMatchIdx = idx;
                 break;
             }
        }
        
        let snippet = '';
        if (firstMatchIdx !== -1) {
            const start = Math.max(0, firstMatchIdx - 150);
            const end = Math.min(row.content.length, firstMatchIdx + 300);
            snippet = row.content.substring(start, end).replace(/\n/g, ' ').trim();
            snippet = `...${snippet}...`;
        } else {
            snippet = row.content.substring(0, 400).replace(/\n/g, ' ').trim() + '...';
        }

        return {
            name: row.name,
            snippet: snippet,
            source: row.source,
            page: row.page_number,
            author: row.author,
            year: row.year
        };
    });
}
