import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import * as dbManager from '../src/memory/db.js';

describe('Homework Delivery and Student Metadata Flow', () => {
    const studentTelegramId = 5452316811;
    let studentId: number;

    beforeAll(() => {
        dbManager.initDB();
    });

    beforeEach(() => {
        dbManager.db.exec('DELETE FROM users');
        const user = dbManager.createUser({
            telegram_id: studentTelegramId,
            agent_id: 'test',
            plan: 'premium',
            status: 'active',
            name: 'Luis'
        });
        studentId = user.id;
    });

    it('Debe guardar y recuperar la metadata del estudiante correctamente', () => {
        const metadataObj = {
            cedula: "V32060039",
            nombre: "RODRIGUEZ MONTAÑO, LUIS FELIPE",
            seccion: "1"
        };
        const metadataStr = JSON.stringify(metadataObj);

        // Guardar metadata
        dbManager.updateUserMetadata(studentId, metadataStr);

        // Recuperar
        const updatedUser = dbManager.getUserByTelegramId(studentTelegramId);
        
        expect(updatedUser).toBeDefined();
        // TypeScript puede quejarse de properties no existentes en test si no se mapea,
        // pero validamos como tipado 'any'.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = (updatedUser as any).metadata;
        expect(meta).toBe(metadataStr);
        
        const parsed = JSON.parse(meta);
        expect(parsed.cedula).toBe('V32060039');
        expect(parsed.seccion).toBe('1');
    });

    it('Habilitar modo esperando_tarea para el usuario', () => {
        const user = dbManager.getUserByTelegramId(studentTelegramId);
        expect(user?.status).toBe('active');

        // Cambiar estado
        dbManager.updateUserStatus(user!.id, 'esperando_tarea');

        const userWaiting = dbManager.getUserByTelegramId(studentTelegramId);
        expect(userWaiting?.status).toBe('esperando_tarea');
    });
});
