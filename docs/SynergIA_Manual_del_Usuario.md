# 🤖 SynergIA - Manual del Usuario (Master)

## 📌 Introducción
**SynergIA** es tu asistente personal inteligente y versátil, diseñado para ser el nodo central de tu ecosistema de bots. Su propósito es ayudar al administrador (Hernán Javier Rivas) en tareas generales de productividad, gestión de información de Google (Gmail, Calendar, Drive) y, lo más importante, supervisar el estado y consumo de los demás bots comerciales como el Tutor.

---

## 🛠️ Comandos Disponibles

| Comando | Última Actualización | Descripción | Ejemplo de Uso |
| :--- | :--- | :--- | :--- |
| **/start** | 01/04/2026 | Inicia el bot, activa el perfil de usuario y muestra el saludo de bienvenida. | `/start` |
| **/reset** | 01/04/2026 | Borra el historial de la conversación actual para "limpiar" la memoria del bot. | `/reset` |
| **/audio** | 01/04/2026 | Configura el modo de respuesta (voz, texto u off). | `/audio voz` |
| **/sync** | 01/04/2026 | Sincroniza la biblioteca local con Google Drive (Solo Admin). | `/sync` |
| **/ayuda** | 01/04/2026 | Muestra la lista de comandos disponibles y tips básicos. | `/ayuda` |

---

## 💰 Sistema de Planes y Facturación (Ecosistema Tutor)

Para los bots comerciales (como @CsAdminTutor_bot), se aplica el siguiente esquema de suscripción mensual:

| Plan | Consultas/Mes | Precio | Extras (Plus+) |
| :--- | :--- | :--- | :--- |
| **Freemium** | 15 | $0.00 | +10 msgs ($1.00) |
| **Básico** | 100 | $4.99 | +20 msgs ($1.00) |
| **Premium** | 300 | $9.99 | +30 msgs ($1.00) |

### 🛡️ Reglas de Uso
1. **Vencimiento Dual:** El acceso se bloquea automáticamente si se agotan las consultas totales O si se cumple un mes desde la fecha de contratación (`expires_at`).
2. **Paquetes Plus+:** Si te quedas sin mensajes, puedes comprar un paquete Plus+ por solo **$1.00**. 
   * *Importante:* Las consultas Plus+ no son acumulables; deben consumirse dentro del período de vigencia del plan actual.
3. **Alertas:** El bot enviará una notificación automática cuando consumas el **90%** de tu capacidad.

---

## 💎 Funciones de Administrador (IA)
SynergIA es un agente autónomo que entiende acciones complejas. Puedes pedírselo por lenguaje natural:

1. **Estado del Ecosistema:** Pregúntale *"¿Cuál es el status de los bots?"* para monitorear usuarios activos, recaudación estimada y porcentaje de consumo de todos los clientes.
2. **Análisis de Documentos:** Envíale archivos PDF o Word para resumer, analizar o extraer datos técnicos.
3. **Gestión de Google WorkSpace:** Control total sobre tu Gmail, Calendar y Drive mediante voz o texto.

---

## 📎 Notas de Versión
*   **v1.6 (01/04/2026):** Implementado el sistema de monetización dual (Cuotas vs Tiempo), paquetes Plus+ no acumulables y reajuste de precios comerciales.
