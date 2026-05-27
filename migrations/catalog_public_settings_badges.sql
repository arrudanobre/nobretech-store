-- Catálogo público — Configurações globais, badges e textos de confiança.
-- Move copy pública (hero tagline, empty state, grid heading, trust badges)
-- de hardcode para configuração por empresa.
-- Idempotente: CREATE IF NOT EXISTS + WHERE NOT EXISTS no seed.

-- ============================================================
-- catalog_settings (singleton por empresa)
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  hero_tagline TEXT,
  empty_state_title TEXT,
  empty_state_description TEXT,
  no_results_title TEXT,
  no_results_description TEXT,
  grid_heading TEXT,
  grid_subheading TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_settings_company_unique UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_settings_company
  ON catalog_settings(company_id);

DROP TRIGGER IF EXISTS trg_catalog_settings_updated_at ON catalog_settings;
CREATE TRIGGER trg_catalog_settings_updated_at
  BEFORE UPDATE ON catalog_settings
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- catalog_trust_badges
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_trust_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  icon_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  show_on_catalog BOOLEAN NOT NULL DEFAULT TRUE,
  show_on_product BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_trust_badges_icon_key_check
    CHECK (icon_key IN ('camera', 'shield_check', 'seal_check', 'chat_circle', 'truck', 'storefront'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_trust_badges_company
  ON catalog_trust_badges(company_id);

CREATE INDEX IF NOT EXISTS idx_catalog_trust_badges_company_active
  ON catalog_trust_badges(company_id, active);

CREATE INDEX IF NOT EXISTS idx_catalog_trust_badges_company_sort
  ON catalog_trust_badges(company_id, sort_order);

DROP TRIGGER IF EXISTS trg_catalog_trust_badges_updated_at ON catalog_trust_badges;
CREATE TRIGGER trg_catalog_trust_badges_updated_at
  BEFORE UPDATE ON catalog_trust_badges
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- SEED Nobretech — copy atual hardcoded migrada para tabela
-- ============================================================

DO $$
DECLARE
  v_company_id UUID;
  v_settings_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE slug = 'nobretech-store' LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'SEED SKIP: empresa nobretech-store nao encontrada.';
    RETURN;
  END IF;

  -- catalog_settings
  SELECT id INTO v_settings_id FROM catalog_settings WHERE company_id = v_company_id LIMIT 1;
  IF v_settings_id IS NULL THEN
    INSERT INTO catalog_settings (
      company_id,
      hero_tagline,
      empty_state_title,
      empty_state_description,
      no_results_title,
      no_results_description,
      grid_heading,
      grid_subheading
    ) VALUES (
      v_company_id,
      'Aparelhos selecionados, fotos reais nos seminovos e atendimento direto pelo WhatsApp.',
      'Seleção em atualização',
      'Publicamos apenas produtos com disponibilidade confirmada. Chame a equipe no WhatsApp para receber a seleção atual.',
      'Nenhum aparelho encontrado',
      'Ajuste a busca ou chame a equipe no WhatsApp. Toda semana entram novidades.',
      'Seleção disponível',
      'Publicamos apenas produtos com disponibilidade confirmada.'
    ) RETURNING id INTO v_settings_id;
    RAISE NOTICE 'SEED OK: catalog_settings id=%', v_settings_id;
  ELSE
    RAISE NOTICE 'SEED SKIP: catalog_settings ja existe id=%', v_settings_id;
  END IF;

  -- catalog_trust_badges (4 badges canônicos)
  IF NOT EXISTS (
    SELECT 1 FROM catalog_trust_badges WHERE company_id = v_company_id AND active = TRUE LIMIT 1
  ) THEN
    INSERT INTO catalog_trust_badges (company_id, icon_key, label, sort_order, show_on_catalog, show_on_product, active) VALUES
      (v_company_id, 'camera',       'Fotos reais',    10, TRUE, FALSE, TRUE),
      (v_company_id, 'shield_check', 'Garantia',       20, TRUE, FALSE, TRUE),
      (v_company_id, 'seal_check',   'Pronta entrega', 30, TRUE, FALSE, TRUE),
      (v_company_id, 'chat_circle',  'WhatsApp',       40, TRUE, FALSE, TRUE);
    RAISE NOTICE 'SEED OK: 4 catalog_trust_badges inseridos';
  ELSE
    RAISE NOTICE 'SEED SKIP: catalog_trust_badges ja existem';
  END IF;
END $$;
