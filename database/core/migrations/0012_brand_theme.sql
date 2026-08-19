INSERT OR IGNORE INTO application_settings (key, value_json)
VALUES
  ('brand', '{"name":"Aether","tagline":{"en":"Technology, elevated.","es":"Tecnologia a otro nivel."},"portfolioUrl":"https://portafolio-aether-commerce.pickofwow.workers.dev"}');

UPDATE application_settings
SET value_json = '{"name":"Aether","tagline":{"en":"Technology, elevated.","es":"Tecnologia a otro nivel."},"logoUrl":"","primaryColor":"#8b5cf6","portfolioUrl":"https://portafolio-aether-commerce.pickofwow.workers.dev","features":{"reviews":true}}',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'brand' AND value_json NOT LIKE '%primaryColor%';
