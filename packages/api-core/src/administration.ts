export type AdminUserRecord = Record<string, unknown>;
export type AuditLogRecord = Record<string, unknown>;
export type ApplicationSettingRecord = Record<string, unknown>;

/** Storage port for platform-level administration reads. */
export interface AdministrationRepository {
  listUsers(): Promise<AdminUserRecord[]>;
  listAuditLogs(): Promise<AuditLogRecord[]>;
  listApplicationSettings(): Promise<ApplicationSettingRecord[]>;
}

/**
 * Reusable read operations for an admin surface. Authentication, permissions,
 * route handling and database dialect are intentionally left to adapters.
 */
export class AdministrationService {
  constructor(private readonly repository: AdministrationRepository) {}

  listUsers(): Promise<AdminUserRecord[]> {
    return this.repository.listUsers();
  }

  listAuditLogs(): Promise<AuditLogRecord[]> {
    return this.repository.listAuditLogs();
  }

  listApplicationSettings(): Promise<ApplicationSettingRecord[]> {
    return this.repository.listApplicationSettings();
  }
}
