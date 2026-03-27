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
*Responder con confirmación para proceder*
