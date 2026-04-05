import { registerTool } from './index.js';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

registerTool({
  name: 'bots_report',
  description: 'Genera un informe estratégico tabular de todos los bots, detallando usuarios, planes, consumos y fechas de vencimiento.',
  parameters: {
    type: 'object',
    properties: {}
  },
  execute: async () => {
    try {
      const rootDir = process.cwd();
      const files = fs.readdirSync(rootDir);
      const dbFiles = files.filter(f => f.startsWith('memory') && f.endsWith('.db'));

      if (dbFiles.length === 0) {
        return "No se encontraron bases de datos de bots configuradas.";
      }

      let tableRows = "";
      let observations = "";
      const now = new Date();

      for (const dbFile of dbFiles) {
        const dbPath = path.resolve(rootDir, dbFile);
        const botName = dbFile === 'memory.db' ? 'SYNERGIA' : dbFile.replace('memory', '').replace('_', '').replace('.db', '').toUpperCase();
        
        try {
          const tempDB = new Database(dbPath, { readonly: true });
          
          const usersDetail = tempDB.prepare(`
            SELECT 
              u.name, 
              u.username,
              u.plan,
              us.requests_count as usage,
              p.monthly_requests as limit_msgs,
              s.expires_at
            FROM users u
            LEFT JOIN (
                SELECT user_id, requests_count, MAX(id) 
                FROM user_usage 
                GROUP BY user_id
            ) us ON u.id = us.user_id
            JOIN plans p ON u.plan = p.id
            LEFT JOIN (
                SELECT user_id, MAX(expires_at) as expires_at 
                FROM subscriptions 
                WHERE status = 'paid' 
                GROUP BY user_id
            ) s ON u.id = s.user_id
            WHERE u.status = 'active'
          `).all() as any[];

          usersDetail.forEach(user => {
              const displayName = (user.name || user.username || 'Anon').substring(0, 10).padEnd(10);
              const planName = user.plan.substring(0, 5).toUpperCase().padEnd(5);
              const expDate = user.expires_at ? new Date(user.expires_at).toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'}) : 'N/A  ';
              const bName = botName.substring(0, 8).padEnd(8);

              tableRows += `${bName} | ${displayName} | ${planName} | ${expDate}\n`;

              // Generar observaciones automáticas
              if (user.expires_at && (new Date(user.expires_at).getTime() - now.getTime()) < 3 * 24 * 60 * 60 * 1000) {
                  observations += `⚠️ El plan de <b>${user.name || user.username}</b> (${botName}) vence pronto (${expDate}).\n`;
              }
              if (user.limit_msgs !== -1 && user.usage >= user.limit_msgs * 0.9) {
                  observations += `📨 <b>${user.name || user.username}</b> ha consumido el 90% de su plan en ${botName}.\n`;
              }
          });
          
          tempDB.close();
        } catch (dbErr: any) {
          observations += `❌ Error en ${botName}: ${dbErr.message}\n`;
        }
      }

      let report = "📊 <b>REPORTE DE ESTRATEGIA SynergIA</b>\n\n";
      report += "<code>";
      report += "BOT      | USUARIO    | PLAN  | VENCE\n";
      report += "---------|------------|-------|-------\n";
      report += tableRows || "Sin usuarios activos.\n";
      report += "</code>\n";
      
      if (observations) {
          report += "📝 <b>Observaciones Pendientes:</b>\n" + observations;
      } else {
          report += "✅ <b>Todo al día:</b> No hay acciones pendientes.";
      }

      report += `\n\n<i>Generado el: ${now.toLocaleString()}</i>`;
      return report;
    } catch (e: any) {
      return `Error generando el reporte tabular: ${e.message}`;
    }
  }
});
