import { mdToPdf } from 'md-to-pdf';
import path from 'path';
import fs from 'fs';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs');

async function convertManual(fileName, outputName) {
    const inputPath = path.join(docsDir, fileName);
    const outputPath = path.join(docsDir, outputName);

    console.log(`⏳ Generando ${outputName}...`);
    
    try {
        const pdf = await mdToPdf({ path: inputPath }, {
            dest: outputPath,
            pdf_options: {
                format: 'A4',
                margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
                printBackground: true,
                displayHeaderFooter: true,
                footerTemplate: `
                    <div style="font-size: 8px; width: 100%; text-align: center; color: #999;">
                        SynergIA - Manual de Usuario - Página <span class="pageNumber"></span> de <span class="totalPages"></span>
                    </div>
                `,
            },
            // Estilos CSS para el PDF
            stylesheet_encoding: 'utf-8',
            css: `
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
                h1 { color: #1a237e; border-bottom: 2px solid #1a237e; padding-bottom: 10px; margin-top: 0; }
                h2 { color: #0d47a1; margin-top: 30px; border-left: 5px solid #0d47a1; padding-left: 10px; }
                code { background: #f4f4f4; padding: 2px 5px; border-radius: 4px; font-family: 'Consolas', monospace; color: #d32f2f; }
                blockquote { background: #e3f2fd; border-left: 10px solid #2196f3; margin: 20px 0; padding: 10px 20px; font-style: italic; }
                img { max-width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); margin: 20px 0; display: block; margin-left: auto; margin-right: auto; }
                hr { border: 0; border-top: 1px solid #ddd; margin: 40px 0; }
                ul li { margin-bottom: 10px; }
                strong { color: #1a237e; }
            `
        });

        if (pdf) {
            console.log(`✅ ¡Éxito! Manual guardado en: ${outputPath}`);
        }
    } catch (error) {
        console.error(`❌ Error convirtiendo ${fileName}:`, error.message);
    }
}

async function start() {
    await convertManual('manual_tutor.md', 'SynergIA_Manual_Tutor.pdf');
    await convertManual('manual_synergia.md', 'SynergIA_Manual_Master.pdf');
}

start();
