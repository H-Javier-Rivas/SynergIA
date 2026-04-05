import { describe, it, expect, beforeEach } from 'vitest';
import * as dbManager from '../src/memory/db.js';

describe('Limites y Control de Cuotas', () => {
  const telegramId = 999111;

  beforeEach(() => {
    dbManager.db.exec('DELETE FROM subscriptions');
    dbManager.db.exec('DELETE FROM user_usage');
    dbManager.db.exec('DELETE FROM personal_library');
    dbManager.db.exec('DELETE FROM users');
    
    dbManager.createUser({
      telegram_id: telegramId,
      agent_id: 'test',
      plan: 'free',
      status: 'active',
      name: 'Tester'
    });
  });

  it('Debe bloquear al usuario (free) cuando supere 15 consultas mensuales', () => {
    const user = dbManager.getUserByTelegramId(telegramId);
    expect(user).not.toBeNull();
    
    // Forzar tener 15 interacciones
    for(let i = 0; i < 15; i++) {
        dbManager.incrementUsage(user!.id);
    }

    const check = dbManager.checkUserLimit(telegramId);
    expect(check.allowed).toBeFalsy();
    expect(check.remaining).toBe(0);
  });

  it('Debe permitir continuar si añadimos Plus+ (extra_requests)', () => {
    const user = dbManager.getUserByTelegramId(telegramId);
    
    // Consumimos todo (15/15)
    for(let i = 0; i < 15; i++) {
        dbManager.incrementUsage(user!.id);
    }
    
    // El límite dice no
    let check = dbManager.checkUserLimit(telegramId);
    expect(check.allowed).toBe(false);

    // Inyectamos un paquete extra The Plus+ (Ej: 10 extras)
    dbManager.addExtraRequests(user!.id, 10);

    // Ahora deberíamos tener 10 permitidas
    check = dbManager.checkUserLimit(telegramId);
    expect(check.allowed).toBe(true);
    expect(check.remaining).toBe(10);
  });
});
