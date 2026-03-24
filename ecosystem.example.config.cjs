/**
 * Plantilla PM2 para Arquitectura Multi-tenant SaaS de SynergIA
 * 
 * Uso: 
 * 1. Renombra este archivo a `ecosystem.config.cjs`
 * 2. Edita las variables de entorno (.env) para cada cliente.
 * 3. Ejecuta `pm2 start ecosystem.config.cjs`
 */

module.exports = {
  apps: [
    {
      name: "synergia-cliente-a",
      script: "npm",
      args: "run start", // Asume que 'npm run start' arranca la versión de producción
      env: {
        INSTANCE_ID: "cliente_a",
        NODE_ENV: "production",
      }
    },
    {
      name: "synergia-cliente-b",
      script: "npm",
      args: "run start",
      env: {
        INSTANCE_ID: "cliente_b",
        NODE_ENV: "production",
      }
    }
  ]
};
