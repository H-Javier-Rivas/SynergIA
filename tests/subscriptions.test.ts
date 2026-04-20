import { describe, it, expect, beforeEach } from 'vitest';
import * as dbManager from '../src/memory/db.js';

describe('Flujo de Suscripciones', () => {
  const telegramId = 123456789;
  const adminId = 999999;

  beforeEach(() => {
    dbManager.clearDatabase();
    
    // Configurar admin
    process.env.TELEGRAM_ALLOWED_USER_IDS = adminId.toString();
  });

  it('Debe crear una suscripción pendiente correctamente', () => {
    const user = dbManager.createUser({
      telegram_id: telegramId,
      agent_id: 'test',
      plan: 'free',
      status: 'active',
      name: 'Tester'
    });

    const sub = dbManager.createPendingSubscription({
      user_id: user.id,
      agent_id: 'test',
      plan_id: 'premium',
      status: 'pending'
    });

    expect(sub.status).toBe('pending');
    expect(sub.plan_id).toBe('premium');
    expect(sub.user_id).toBe(user.id);

    const pending = dbManager.getPendingSubscriptions();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(sub.id);
  });

  it('Debe verificar una suscripción y actualizar el plan del usuario', () => {
    const user = dbManager.createUser({
      telegram_id: telegramId,
      agent_id: 'test',
      plan: 'free',
      status: 'active',
      name: 'Tester'
    });

    const sub = dbManager.createPendingSubscription({
      user_id: user.id,
      agent_id: 'test',
      plan_id: 'premium',
      status: 'pending'
    });

    dbManager.verifySubscription(sub.id, adminId);

    const updatedUser = dbManager.getUserById(user.id);
    expect(updatedUser?.plan).toBe('premium');
    expect(updatedUser?.status).toBe('active');

    const updatedSub = dbManager.getSubscriptionById(sub.id);
    expect(updatedSub?.status).toBe('paid');
    expect(updatedSub?.verified_at).not.toBeNull();
    expect(updatedSub?.expires_at).not.toBeNull();
  });

  it('Debe manejar múltiples suscripciones y retornar la historia', () => {
    const user = dbManager.createUser({
      telegram_id: telegramId,
      agent_id: 'test',
      plan: 'free',
      status: 'active',
      name: 'Tester'
    });

    dbManager.createPendingSubscription({ user_id: user.id, agent_id: 'test', plan_id: 'basic' });
    dbManager.createPendingSubscription({ user_id: user.id, agent_id: 'test', plan_id: 'premium' });

    const subs = dbManager.getUserSubscriptions(user.id);
    expect(subs.length).toBe(2);
  });
});
