INSERT OR IGNORE INTO application_settings (key, value_json)
VALUES
  ('shipping', '{"freeShippingThreshold":15000,"countries":["US","CO","CA","MX","ES"],"options":[{"id":"standard","label":"International standard","amount":1499,"currency":"USD","estimatedDays":"6-10"},{"id":"express","label":"Express","amount":2999,"currency":"USD","estimatedDays":"3-5"},{"id":"priority","label":"Priority","amount":4499,"currency":"USD","estimatedDays":"1-3"}]}'),
  ('brand', '{"name":"Aether","tagline":{"en":"Technology, elevated.","es":"Tecnologia a otro nivel."},"portfolioUrl":"https://portafolio-aether-commerce.pickofwow.workers.dev"}'),
  ('reservations', '{"ttlMinutes":15}');

INSERT OR IGNORE INTO users (id, clerk_id, email, name, roles_json)
VALUES
  ('usr_demo_customer', 'clerk_demo_customer', 'customer@example.com', 'Demo Customer', '["customer"]'),
  ('usr_demo_admin', 'clerk_demo_admin', 'admin@example.com', 'Demo Admin', '["admin"]');

INSERT OR IGNORE INTO admin_user_roles (id, user_id, role)
VALUES
  ('aur_demo_admin', 'usr_demo_admin', 'admin'),
  ('aur_demo_viewer', 'usr_demo_customer', 'demo_viewer');

INSERT OR IGNORE INTO reviews (id, user_id, product_id, rating, title, body, status)
VALUES
  ('rev_demo_1', 'usr_demo_customer', 'platzi_1', 5, 'Excellent demo purchase', 'The Aether checkout and tracking flow felt polished.', 'approved'),
  ('rev_demo_2', 'usr_demo_customer', 'platzi_2', 4, 'Strong catalog experience', 'Filtering and cart state worked well in the demo.', 'approved');

INSERT OR IGNORE INTO audit_logs (id, actor_id, action, target_type, target_id, payload_json)
VALUES
  ('aud_demo_1', 'usr_demo_admin', 'products.write', 'product_override', 'platzi_1', '{"before":"external","after":"featured override"}'),
  ('aud_demo_2', 'usr_demo_admin', 'orders.write', 'order', 'ord_demo_1', '{"from":"paid","to":"processing"}');
