-- Marketing Disclosure (Central de Divulgação) — persistência de campanha por produto
--
-- STATUS: PROPOSTA. Não aplicar automaticamente em produção (Railway).
-- Aditiva, idempotente, sem destrutivos. Inclui company_id para isolamento multi-tenant.
--
-- Objetivo:
--  - Lembrar última configuração de divulgação por produto (preço, desconto, brinde, parcela).
--  - Reaproveitar campanhas anteriores.
--  - Fornecer base factual para a IA do gerador de copy.
--
-- Como aplicar (manual, em janela controlada):
--   psql "$DATABASE_URL" -f migrations/marketing_disclosure_sessions.sql
-- Antes:
--   BEGIN;
--   \i migrations/marketing_disclosure_sessions.sql
--   -- inspecionar pg_tables / \d+ marketing_disclosure_sessions
--   COMMIT; -- ou ROLLBACK;

BEGIN;

CREATE TABLE IF NOT EXISTS marketing_disclosure_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  created_by      UUID NULL,
  objective       TEXT NOT NULL,
  channel         TEXT NOT NULL,
  tone            TEXT NOT NULL DEFAULT 'consultivo',
  urgency_level   TEXT NOT NULL DEFAULT 'none',
  general_cta     TEXT NULL,
  general_note    TEXT NULL,
  angle           TEXT NULL,
  ai_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_disclosure_sessions_company
  ON marketing_disclosure_sessions(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketing_disclosure_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES marketing_disclosure_sessions(id) ON DELETE CASCADE,
  company_id         UUID NOT NULL,
  inventory_id       UUID NULL,
  is_primary         BOOLEAN NOT NULL DEFAULT FALSE,
  base_price         NUMERIC(12,2) NULL,
  disclosure_price   NUMERIC(12,2) NULL,
  discount_amount    NUMERIC(12,2) NULL,
  discount_percent   NUMERIC(6,2) NULL,
  installment_count  INTEGER NOT NULL DEFAULT 0,
  installment_amount NUMERIC(12,2) NULL,
  installment_total  NUMERIC(12,2) NULL,
  gifts_text         TEXT NULL,
  product_note       TEXT NULL,
  product_cta        TEXT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_disclosure_items_session
  ON marketing_disclosure_items(session_id);

CREATE INDEX IF NOT EXISTS idx_mkt_disclosure_items_inventory
  ON marketing_disclosure_items(company_id, inventory_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketing_disclosure_outputs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES marketing_disclosure_sessions(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL,
  channel       TEXT NOT NULL,
  content_json  JSONB NULL,
  content_text  TEXT NULL,
  generated_by  TEXT NOT NULL DEFAULT 'deterministic',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_disclosure_outputs_session
  ON marketing_disclosure_outputs(session_id);

-- Reaproveitamento por produto: view auxiliar para pegar última disclosure por inventory_id.
-- (Opcional. Pode ser removida sem impacto se não for usada.)
CREATE OR REPLACE VIEW v_marketing_last_disclosure_by_inventory AS
SELECT DISTINCT ON (inventory_id)
  company_id,
  inventory_id,
  base_price,
  disclosure_price,
  discount_amount,
  discount_percent,
  installment_count,
  installment_amount,
  gifts_text,
  product_note,
  product_cta,
  updated_at
FROM marketing_disclosure_items
WHERE inventory_id IS NOT NULL
ORDER BY inventory_id, updated_at DESC;

COMMIT;
