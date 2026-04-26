import { describe, it, expect, beforeAll } from 'vitest';
import * as toolsManager from '../src/tools/index.js';

// Importar todas las herramientas para que se registren
import '../src/tools/get_current_time.js';
import '../src/tools/google.js';
import '../src/tools/web.js';
import '../src/tools/library.js';
import '../src/tools/email.js';
import '../src/tools/admin.js';
import '../src/tools/vision.js';

describe('Registro de Herramientas y Funciones (Tools)', () => {

  it('Debe registrar correctamente todas las herramientas base', () => {
    const registry = toolsManager.getAllTools();
    const toolNames = registry.map(t => t.name);

    expect(toolNames).toContain('get_current_time');
    expect(toolNames).toContain('search_library');
    expect(toolNames).toContain('read_url');
    expect(toolNames).toContain('bots_report');
    expect(toolNames).toContain('analyze_image');
  });

  it('Cada herramienta debe tener descripción y parámetros definidos', () => {
    const registry = toolsManager.getAllTools();

    registry.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters).toHaveProperty('type', 'object');
        expect(tool.parameters).toHaveProperty('properties');
    });
  });

  it('getToolsDefinitions debe devolver el formato de OpenAI "function"', () => {
    const definitions = toolsManager.getToolsDefinitions();
    
    definitions.forEach(def => {
        expect(def).toHaveProperty('type', 'function');
        expect(def.function).toHaveProperty('name');
        expect(def.function).toHaveProperty('description');
        expect(def.function).toHaveProperty('parameters');
    });
  });

  it('getTool debe devolver la herramienta específica por nombre', () => {
    const tool = toolsManager.getTool('get_current_time');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('get_current_time');
  });

  it('search_library debe existir y tener parámetros de búsqueda', () => {
    const tool = toolsManager.getTool('search_library');
    expect(tool).toBeDefined();
    expect(tool?.parameters.properties).toHaveProperty('query');
  });
});
