import { AdministrationService, type AdministrationRepository } from "@aether/api-core";

/** D1 adapter for common administration read models. */
export function createAdministrationService(db: D1Database): AdministrationService {
  const repository: AdministrationRepository = {
    async listUsers() {
      return (await db.prepare("select id, name, roles_json, created_at from users limit 100").all<Record<string, unknown>>()).results;
    },
    async listAuditLogs() {
      return (await db.prepare("select * from audit_logs order by created_at desc limit 100").all<Record<string, unknown>>()).results;
    },
    async listApplicationSettings() {
      return (await db.prepare("select * from application_settings").all<Record<string, unknown>>()).results;
    }
  };
  return new AdministrationService(repository);
}
