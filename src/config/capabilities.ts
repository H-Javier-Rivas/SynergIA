import fs from 'fs';
import path from 'path';

export interface Capabilities {
  commands: {
    [key: string]: boolean;
  };
  features: {
    audio_response: boolean;
    document_analysis: boolean;
    [key: string]: boolean;
  };
}

export function loadCapabilities(): Capabilities {
  const instanceId = process.env.INSTANCE_ID;
  const fileName = instanceId ? `capabilities_${instanceId}.json` : 'capabilities.json';
  const filePath = path.resolve(process.cwd(), 'src/config', fileName);

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as Capabilities;
    } else {
      console.warn(`[Capabilities] Archivo ${fileName} no encontrado. Se usará la configuración por defecto (capabilities.json).`);
      const defaultPath = path.resolve(process.cwd(), 'src/config/capabilities.json');
      if (fs.existsSync(defaultPath)) {
        const data = fs.readFileSync(defaultPath, 'utf-8');
        return JSON.parse(data) as Capabilities;
      }
    }
  } catch (error) {
    console.error(`[Capabilities] Error leyendo ${fileName}:`, error);
  }

  // Fallback ultra-seguro por si no existe ningún JSON
  return {
    commands: {},
    features: { audio_response: true, document_analysis: true }
  };
}

export const capabilities = loadCapabilities();
