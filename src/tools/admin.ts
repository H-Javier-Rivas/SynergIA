import { registerTool } from './index.js';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

registerTool({
  name: 'get_bots_summary',
  description: 'Obtiene el resumen de todos los bots (instancias) del sistema, incluyendo usuarios activos, planes y consumo total. Solo para uso del administrador.',
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

      let summary = "📊 **Resumen Global de Bots (Status de Cuentas)**\n\n";

      for (const dbFile of dbFiles) {
        const dbPath = path.resolve(rootDir, dbFile);
        const botName = dbFile === 'memory.db' ? 'SynergIA (Master)' : dbFile.replace('memory_', '').replace('.db', '').toUpperCase();
        
        try {
          const tempDB = new Database(dbPath, { readonly: true });
          
          // Obtener usuarios activos
          const usersCount = (tempDB.prepare(`SELECT COUNT(*) as count FROM users WHERE status = 'active'`).get() as any).count;
          
          // Obtener resumen de consumos
          const usageStats = tempDB.prepare(`
            SELECT 
              u.plan, 
              COUNT(u.id) as total_users,
              SUM(us.requests_count) as total_requests,
              p.monthly_requests
            FROM users u
            JOIN user_usage us ON u.id = us.user_id
            JOIN plans p ON u.plan = p.id
            WHERE u.status = 'active'
            GROUP BY u.plan
          `).all() as any[];

          summary += `🤖 **Instancia: ${botName}**\n`;
          summary += `👥 Usuarios Activos: ${usersCount}\n`;

          if (usageStats.length === 0) {
             summary += `🔸 Sin consumo registrado todavía.\n`;
          } else {
             usageStats.forEach(stat => {
                const totalPossible = stat.monthly_requests === -1 ? '∞' : (stat.monthly_requests * stat.total_users);
                const percentage = stat.monthly_requests === -1 ? '0' : ((stat.total_requests / (stat.monthly_requests * stat.total_users)) * 100).toFixed(1);
                
                summary += `🔸 Plan ${stat.plan.toUpperCase()}: ${stat.total_requests} / ${totalPossible} (${percentage}%)\n`;
             });
          }
          
          summary += `\n`;
          tempDB.close();
        } catch (dbErr) {
          summary += `❌ Error al leer ${dbFile}: ${dbErr instanceof Error ? dbErr.message : 'Error desconocido'}\n\n`;
        }
      }

      return summary;
    } catch (e: any) {
      return `Error obteniendo el resumen: ${e.message}`;
    }
  }
});
