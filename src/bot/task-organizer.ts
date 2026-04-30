/**
 * @module task-organizer
 * @description Lógica para clasificar y organizar archivos de tareas en carpetas locales.
 */

import fs from 'fs';
import path from 'path';
import { chatCompletion } from '../agent/llm.js';

export async function classifyTaskContent(extractedText: string, fileName: string = ''): Promise<string> {
  // 1. Intentar clasificar por el nombre del archivo primero (más rápido y seguro)
  const name = fileName.toLowerCase();
  if (name.includes('tarea 1') || name.includes('tarea1')) return 'Tarea 1';
  if (name.includes('tarea 2') || name.includes('tarea2')) return 'Tarea 2';

  // 2. Si el nombre no ayuda, usamos la IA
  const prompt = `Analiza el siguiente texto extraído de una tarea de estadística y clasifícalo en una de estas categorías:
- Tarea 1: Historia de la estadística, orígenes, conceptos iniciales.
- Tarea 2: Partes C y D del taller de clase, tablas de frecuencia, cálculos específicos.

Responde ÚNICAMENTE con el nombre de la categoría (ej: "Tarea 1", "Tarea 2" o "Otras").

TEXTO:
${extractedText.substring(0, 2000)}`;

  let category = 'Otras';
  try {
    const response = await chatCompletion([{ role: 'user', content: prompt }]);
    const result = response.content.trim();
    if (result.includes('Tarea 1')) category = 'Tarea 1';
    else if (result.includes('Tarea 2')) category = 'Tarea 2';
  } catch (err) {
    console.error('[Organizer] Fallo en clasificación:', err);
  }
  return category;
}

export async function classifyAndSaveTask(filePath: string, extractedText: string, studentName: string): Promise<string> {
  const baseDir = path.resolve(process.cwd(), 'Tareas_Recibidas');
  const originalFileName = path.basename(filePath);
  
  // 1. Clasificación por IA (o por nombre)
  const category = await classifyTaskContent(extractedText, originalFileName);

  // 2. Crear directorios
  const targetDir = path.join(baseDir, category);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  // 3. Guardar copia con nombre descriptivo
  const ext = path.extname(filePath);
  const safeName = studentName.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  const fileName = `${safeName}_${Date.now()}${ext}`;
  const targetPath = path.join(targetDir, fileName);

  fs.copyFileSync(filePath, targetPath);
  console.log(`[Organizer] Archivo organizado: ${targetPath}`);
  
  return category;
}
