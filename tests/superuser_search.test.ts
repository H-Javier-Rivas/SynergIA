import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import * as dbManager from '../src/memory/db.js';
import { searchLibrary } from '../src/agent/library.js';

describe('Búsqueda Global de Superusuario (SynergIA Master)', () => {
  const adminId = 12345;
  const userIdA = 67890;
  const userIdB = 11111;

  beforeAll(() => {
    dbManager.initDB();
  });

  beforeEach(() => {
    dbManager.db.exec('DELETE FROM subscriptions');
    dbManager.db.exec('DELETE FROM user_usage');
    dbManager.db.exec('DELETE FROM personal_library');
    dbManager.db.exec('DELETE FROM users');

    // Crear Administrador
    dbManager.createUser({
      telegram_id: adminId,
      name: 'Admin Master',
      agent_id: 'synergia'
    });

    // Crear Usuario A
    dbManager.createUser({
      telegram_id: userIdA,
      name: 'Usuario Investigador A',
      agent_id: 'tutor'
    });

    // Crear Usuario B
    dbManager.createUser({
      telegram_id: userIdB,
      name: 'Usuario Investigador B',
      agent_id: 'tutor'
    });
  });

  it('Un usuario solo debe ver sus propios documentos en búsqueda normal', () => {
    const userA = dbManager.getUserByTelegramId(userIdA)!;
    const userB = dbManager.getUserByTelegramId(userIdB)!;

    // Usuario A guarda un secreto
    dbManager.saveToPersonalLibrary({
      user_id: userA.id,
      name: 'secreto_a.pdf',
      content: 'La clave del éxito es la perseverancia académica.',
      title: 'Tesis de A'
    });

    // Usuario B guarda otro documento
    dbManager.saveToPersonalLibrary({
      user_id: userB.id,
      name: 'doc_b.pdf',
      content: 'El institucionalismo es una teoría política.',
      title: 'Apuntes de B'
    });

    // Búsqueda de Usuario A: No debe ver lo de B
    const resultsA = searchLibrary('institucionalismo', 5, userA.id, false);
    expect(resultsA.length).toBe(0);

    // Búsqueda de Usuario B: No debe ver lo de A
    const resultsB = searchLibrary('perseverancia', 5, userB.id, false);
    expect(resultsB.length).toBe(0);

    // Búsqueda de Usuario A: Debe ver lo suyo
    const resultsSelfA = searchLibrary('perseverancia', 5, userA.id, false);
    expect(resultsSelfA.length).toBe(1);
    expect(resultsSelfA[0].name).toBe('secreto_a.pdf');
  });

  it('El Superusuario (allUsers=true) debe ver documentos de TODOS los usuarios', () => {
    const userA = dbManager.getUserByTelegramId(userIdA)!;
    const userB = dbManager.getUserByTelegramId(userIdB)!;

    dbManager.saveToPersonalLibrary({
      user_id: userA.id,
      name: 'doc_a.pdf',
      content: 'Contenido de A',
      title: 'Doc A'
    });

    dbManager.saveToPersonalLibrary({
      user_id: userB.id,
      name: 'doc_b.pdf',
      content: 'Contenido de B',
      title: 'Doc B'
    });

    // Búsqueda global (allUsers = true)
    const globalResults = searchLibrary('Contenido', 10, undefined, true);
    
    expect(globalResults.length).toBe(2);
    
    const names = globalResults.map(r => r.name);
    expect(names).toContain('doc_a.pdf');
    expect(names).toContain('doc_b.pdf');

    // Verificar que indica la procedencia
    expect(globalResults.find(r => r.name === 'doc_a.pdf')?.source).toContain('Usuario Investigador A');
    expect(globalResults.find(r => r.name === 'doc_b.pdf')?.source).toContain('Usuario Investigador B');
  });
});
