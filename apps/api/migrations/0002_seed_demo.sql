INSERT OR IGNORE INTO coupons (code, type, value, active, minimum_subtotal)
VALUES ('AETHER10', 'percentage', 10, 1, 20000);

INSERT OR IGNORE INTO settings (key, value_json)
VALUES
  ('shipping', '{"freeShippingThreshold":75000,"standard":1200,"express":2900}'),
  ('demo_admin_notice', '{"en":"Public demo mode. Changes are disabled.","es":"Modo de demostracion publica. Los cambios estan deshabilitados."}');

INSERT OR IGNORE INTO admin_permissions (id, role, permission)
VALUES
  ('perm-admin-catalog-read', 'admin', 'catalog:read'),
  ('perm-admin-catalog-write', 'admin', 'catalog:write'),
  ('perm-admin-orders-read', 'admin', 'orders:read'),
  ('perm-admin-orders-write', 'admin', 'orders:write'),
  ('perm-admin-users-read', 'admin', 'users:read'),
  ('perm-admin-settings-write', 'admin', 'settings:write'),
  ('perm-admin-audit-read', 'admin', 'audit:read'),
  ('perm-staff-catalog-read', 'staff', 'catalog:read'),
  ('perm-staff-orders-read', 'staff', 'orders:read');
