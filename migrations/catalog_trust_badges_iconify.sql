-- Vitrine pública — libera chaves de ícone Iconify nos selos de confiança.
-- Antes: icon_key era restrito a 6 valores fixos por CHECK constraint.
-- Agora: aceita qualquer chave Iconify (ex: 'mdi:whatsapp', 'simple-icons:apple').
-- Mudança aditiva e não-destrutiva: apenas remove a restrição de valores.
-- icon_key continua TEXT NOT NULL. Selos existentes ('shield_check', etc.)
-- permanecem válidos e renderizam via mapa de compatibilidade no app.
-- Idempotente: DROP CONSTRAINT IF EXISTS.

ALTER TABLE catalog_trust_badges
  DROP CONSTRAINT IF EXISTS catalog_trust_badges_icon_key_check;
