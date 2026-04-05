import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Perfiles de Agentes (Configuración)', () => {
  const profilesDir = path.resolve(process.cwd(), 'src/config/profiles');

  it('Debe existir la carpeta de perfiles', () => {
    expect(fs.existsSync(profilesDir)).toBe(true);
  });

  const profiles = ['synergia.json', 'tutor.json'];

  profiles.forEach(profileName => {
    it(`Perfil ${profileName} debe tener la estructura correcta`, () => {
      const profilePath = path.join(profilesDir, profileName);
      expect(fs.existsSync(profilePath)).toBe(true);
      
      const content = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      
      expect(content).toHaveProperty('name');
      expect(content).toHaveProperty('system_prompt');
      expect(content).toHaveProperty('capabilities');
      expect(content.capabilities).toHaveProperty('commands');
      expect(content.capabilities).toHaveProperty('features');
      
      // Verificar que los comandos configurados sean booleanos
      Object.keys(content.capabilities.commands).forEach(cmd => {
        expect(typeof content.capabilities.commands[cmd]).toBe('boolean');
      });
    });
  });

  it('El perfil Tutor debe tener activadas las capacidades académicas', () => {
    const tutorPath = path.join(profilesDir, 'tutor.json');
    const content = JSON.parse(fs.readFileSync(tutorPath, 'utf8'));
    
    const academicCmds = [
      'buscar_paper',
      'citar',
      'redactar_mejor',
      'corregir',
      'parafrasear',
      'resumir',
      'teorizar'
    ];

    academicCmds.forEach(cmd => {
      expect(content.capabilities.commands[cmd]).toBe(true);
    });
  });
});
