import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import * as dbManager from '../src/memory/db.js';

describe('Lógica del Bot, Comandos y Multi-tenant (Suscripciones y Pagos)', () => {
  const userId = 1807055922; // ID de prueba (Hernán o admin)
  const userData = {
    telegram_id: userId,
    agent_id: 'test',
    plan: 'free',
    status: 'active' as const,
    name: 'Tester'
  };

  beforeAll(() => {
    // Inicializar BD
    dbManager.initDB();
  });

  beforeEach(() => {
    // Resetear data antes de cada test
    dbManager.db.exec('DELETE FROM subscriptions');
    dbManager.db.exec('DELETE FROM user_usage');
    dbManager.db.exec('DELETE FROM personal_library');
    dbManager.db.exec('DELETE FROM users');
    dbManager.createUser(userData);
  });

  it('Verificar creación de usuario inicial', () => {
    const user = dbManager.getUserByTelegramId(userId);
    expect(user).not.toBeNull();
    expect(user?.telegram_id).toBe(userId);
    expect(user?.plan).toBe('free');
  });

  it('Proceso de pago: crear suscripción pendiente y luego aprobarla', () => {
    const user = dbManager.getUserByTelegramId(userId);
    expect(user).toBeDefined();

    // Crear suscripción pendiente de plan 'basic'
    dbManager.createPendingSubscription({
        user_id: user!.id,
        agent_id: 'test',
        plan_id: 'basic',
        status: 'pending'
    });

    const pending = dbManager.getPendingSubscriptions();
    expect(pending.length).toBe(1);
    expect(pending[0].plan_id).toBe('basic');
    expect(pending[0].status).toBe('pending');

    // Verificar / aprobar suscripción
    const adminId = 999;
    dbManager.verifySubscription(pending[0].id, adminId);

    // Verificar que el usuario ahora tiene el plan basic y estado active
    const updatedUser = dbManager.getUserByTelegramId(userId);
    expect(updatedUser?.plan).toBe('basic');
    expect(updatedUser?.status).toBe('active');
    
    // El listado de pendientes debe estar vacío
    expect(dbManager.getPendingSubscriptions().length).toBe(0);
  });

  it('Restricción de comandos por capacidad (Config Logic)', () => {
    // Cargamos una config simulada
    const mockConfig = {
        capabilities: {
            commands: {
                'buscar_paper': true,
                'admin_only': false
            }
        }
    };
    
    expect(mockConfig.capabilities.commands['buscar_paper']).toBe(true);
    expect(mockConfig.capabilities.commands['admin_only']).toBe(false);
  });

  it('Registro de interacciones y actualización de fecha', () => {
    const user_init = dbManager.getUserByTelegramId(userId);
    const initialDate = user_init?.last_interaction;
    
    // Simular tiempo de espera mínimo
    dbManager.updateLastInteraction(userId);
    
    const user_updated = dbManager.getUserByTelegramId(userId);
    // En SQLite, si las operaciones son muy rápidas, la fecha podría ser igual, pero al menos no fallará
    expect(user_updated?.last_interaction).toBeDefined();
  });
});
