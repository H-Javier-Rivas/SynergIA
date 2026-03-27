# Plan: Sistema de Registro de Usuarios

## Objetivo
Crear la base del sistema multi-tenant: tabla de usuarios dinámica y comando `/start` con flujo de registro.

---

## Paso 1: Schema de Base de Datos

### Nueva tabla `users`

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  agent_id TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active',
  name TEXT,
  username TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_interaction DATETIME
);

CREATE INDEX idx_users_telegram ON users(telegram_id);
CREATE INDEX idx_users_agent ON users(agent_id);
```

### Nueva tabla `plans`

```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_requests INTEGER DEFAULT 0,
  price_monthly REAL DEFAULT 0,
  features TEXT -- JSON con features adicionales
);
```

---

## Paso 2: Insertar Planes Iniciales

```sql
INSERT INTO plans (id, name, monthly_requests, price_monthly, features) VALUES
('free', 'Freemium', 50, 0, '{"docs": true, "voice": false}'),
('basic', 'Básico', 500, 9.99, '{"docs": true, "voice": true}'),
('premium', 'Premium', -1, 19.99, '{"docs": true, "voice": true, "priority": true}');
```

(-1 = ilimitado)

---

## Paso 3: Modificar `src/memory/db.ts`

- Agregar función `initMultiTenantTables()`
- Incluir creación de tablas `users` y `plans`
- Funciones helper:
  - `getUserByTelegramId(telegramId: number): User | null`
  - `createUser(user: Partial<User>): User`
  - `updateUserPlan(userId: number, plan: string): void`
  - `getPlan(planId: string): Plan | null`
  - `getUserUsage(userId: number): UsageStats`
  - `incrementUsage(userId: number): void`

---

## Paso 4: Modificar `src/bot/telegram.ts`

### Nuevo flujo `/start`

```
1. Usuario envía /start
2. Buscar en DB por telegram_id
3. SI existe:
   - Saludar: "Bienvenido de vuelta, {name}!"
   - Mostrar plan actual
4. SI NO existe:
   - Mostrar menú de planes (inline keyboard)
   - Usuario selecciona plan
   - Crear usuario en DB
   - Bienvenida: "¡Bienvenido! Plan: {plan}"
```

### Keyboard inline

```typescript
const planKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🆓 Freemium (50 msgs)', callback_data: 'plan_free' }],
      [{ text: '💎 Básico ($9.99/mes)', callback_data: 'plan_basic' }],
      [{ text: '👑 Premium ($19.99/mes)', callback_data: 'plan_premium' }]
    ]
  }
};
```

### Manejo de callbacks

```typescript
bot.callbackQuery(/plan_(.+)/, async (ctx) => {
  const plan = ctx.match[1];
  // Crear usuario con el plan seleccionado
  // Confirmar selección
});
```

---

## Paso 5: Middleware de Verificación

### Funciones en `src/memory/db.ts`

```typescript
export interface User {
  id: number;
  telegram_id: number;
  agent_id: string;
  plan: string;
  status: string;
  name?: string;
  username?: string;
  created_at: string;
  updated_at: string;
  last_interaction?: string;
}

export interface Plan {
  id: string;
  name: string;
  monthly_requests: number;
  price_monthly: number;
  features: string;
}

export interface UsageStats {
  user_id: number;
  requests_count: number;
  period_start: string;
  period_end: string;
}
```

### Verificación antes de procesar mensaje

- Verificar que usuario existe en DB
- Verificar que tiene requests disponibles
- Si excedió, mostrar mensaje de upgrade de plan

---

## Paso 6: Migrar Usuarios Existentes

### Script de migración

```typescript
// Migrar de TELEGRAM_ALLOWED_USER_IDS a DB
const existingIds = config.TELEGRAM_ALLOWED_USER_IDS;
for (const id of existingIds) {
  const existing = getUserByTelegramId(id);
  if (!existing) {
    createUser({
      telegram_id: id,
      agent_id: 'synergia',
      plan: 'free',
      status: 'active'
    });
  }
}
```

---

## Estructura de Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/memory/db.ts` | + tablas users/plans, + funciones helper |
| `src/bot/telegram.ts` | + flujo /start, + keyboard, + callback handler, + middleware |
| `src/memory/history.ts` | + filtrar por user_id (ya hecho) |

---

## Orden de Implementación

1. **DB** - Crear tablas y funciones helper
2. **Planes** - Insertar planes iniciales
3. **Bot** - Nuevo flujo /start con keyboard
4. **Callbacks** - Manejo de selección de plan
5. **Middleware** - Verificación de límites
6. **Migración** - Pasar usuarios actuales al nuevo sistema

---

## Pendiente de Confirmar

1. ¿Los números de planes (50, 500, ilimitado) están bien?
2. ¿Los precios ($9.99, $19.99) están bien?
3. ¿Prefieres que el flujo /start pregunte código de invitación antes de asignar plan?

---

*Documento creado: 27 de marzo de 2026*
*Proyecto: SynergIA - Fase 3 Multi-tenant*
