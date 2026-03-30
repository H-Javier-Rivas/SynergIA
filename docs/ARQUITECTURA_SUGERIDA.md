# Arquitectura Multi-tenant SynergIA - Propuesta

## Tu Modelo de Negocio

```
SYNERGIA (Plataforma Central - Orquestador de IA)
     |
     +---> Agente TUTOR -----> Usuario A, Usuario B, Usuario C...
     +---> Agente VENTAS ---> Usuario X, Usuario Y...
     +---> Agente LEGAL ----> Usuario 1, Usuario 2...
     |
     Cada AGENTE ESPECIALIZADO maneja VARIOS USUARIOS (suscriptores)
     Cada USUARIO tiene:
       - Privacidad (historial propio)
       - Plan (free/basic/premium)
       - Documentos privados en Drive
```

## Recomendación: Mejor Estructura

### 1. Base de Datos Unica

Una sola BD SQLite con `agent_id`:

```
users (telegram_id, agent_id, plan_id, ...)
plans (agent_id, name, price, ...)
usage (user_id, requests_count, ...)
```

### 2. Config por Agente (JSON)

```
src/config/agents/
  synergia.json   (propósito general)
  tutor.json      (investigación académica)
  ventas.json     (gestión comercial)
```

### 3. Un Solo Bot de Telegram

Un solo bot que detecta el agente según el usuario.

## Estructura de Datos

| Tabla | Descripción |
|-------|-------------|
| agents | Lista de agentes disponibles |
| users | Usuarios con su agente y plan |
| plans | Planes por agente (free, basic, premium) |
| subscriptions | Estado de suscripción |

## Resumen

- BD: Una sola con agent_id
- Config: JSON por agente
- Telegram: Un solo bot con routing
- Un AGENTE tiene VARIOS USUARIOS (suscriptores)
- Cada USUARIO se suscribe a UNO o VARIOS agentes según su necesidad

---

## Sistema de Pagos y Registro

### Flujo de Registro con Pago

```
1. Usuario nuevo -> /start
2. Selecciona plan (Free/Básico/Premium)
3. Si es FREE: registro inmediato
4. Si es PAGO (Básico/Premium):
   - Mostrar opciones de pago
   - Usuario realiza el pago
   - Usuario envía comprobante/referencia
   - Admin verifica el pago
   - Admin registra al usuario
```

### Métodos de Pago

| Método | Datos a Mostrar |
|--------|-----------------|
| **Pago Móvil** | Teléfono 04268947660, C.I. V-8033311, Banco Mercantil (0105) | Monto del plan básico: 5 USD  Monto del plan premium: 10 USD
| **PayPal.Me** | Plan Básico: https://paypal.me/negociosonline2023/10USD | Plan Premium: https://paypal.me/negociosonline2023/20USD
| **USDT (Binance Pay)** | Monto del plan básico: 5 USD | Monto del plan premium: 10 USD

### Mensaje de Pago (Propuesto)

```
💳 Pago para activar plan {PLAN_NAME}
Para activar tu plan, realiza el pago de ${PRECIO}/mes:

Opción 1 - Pago Móvil:
• Teléfono: +58 426-894-7660
• C.I.: V-8033311
• Banco: Mercantil

Opción 2 - PayPal:
• PayPal.Me: https://paypal.me/negociosonline2023/

Opción 3 - USDT (Binance Pay):
• Binance ID: 762130981
• Código QR: [ENLACE_QR]

📎 Envía tu comprobante de pago + tu correo electrónico
   Una vez verificado, recibirás un código de registro.
```

### Estructura de Suscripción en BD

```sql
subscriptions:
  - user_id
  - agent_id  
  - plan_id
  - payment_status (pending/paid/expired)
  - payment_method
  - payment_reference
  - verified_at (cuando admin aprueba)
  - expires_at
```

---
*Responder con confirmación para proceder*
