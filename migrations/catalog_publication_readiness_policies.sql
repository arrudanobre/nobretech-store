-- Catálogo público — Regras de publicação e readiness configuráveis.
-- Cria tabelas de policy por empresa (escopo product_type/condition) + regras de readiness.
-- Seed Nobretech reproduz comportamento atual hardcoded (status active/in_stock, LIMIT 200,
-- seminovo exige foto real/avaliação/itens inclusos, defect score <= 5 bloqueia, lacrado
-- com imagem padrão é warning).
-- Idempotente: CREATE IF NOT EXISTS + WHERE NOT EXISTS no seed.

-- ============================================================
-- catalog_publication_policies
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_publication_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_type TEXT,
  condition TEXT,
  requires_public_price BOOLEAN NOT NULL DEFAULT TRUE,
  requires_real_photo BOOLEAN NOT NULL DEFAULT FALSE,
  requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  requires_included_items BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_inventory_statuses TEXT[] NOT NULL DEFAULT ARRAY['active','in_stock'],
  max_products INTEGER,
  default_availability_label TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_publication_policies_max_products_nonneg
    CHECK (max_products IS NULL OR max_products >= 0),
  CONSTRAINT catalog_publication_policies_allowed_statuses_nonempty
    CHECK (array_length(allowed_inventory_statuses, 1) IS NOT NULL),
  CONSTRAINT catalog_publication_policies_effective_period
    CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_catalog_publication_policies_company
  ON catalog_publication_policies(company_id);

CREATE INDEX IF NOT EXISTS idx_catalog_publication_policies_company_active
  ON catalog_publication_policies(company_id, active);

CREATE INDEX IF NOT EXISTS idx_catalog_publication_policies_company_scope
  ON catalog_publication_policies(company_id, product_type, condition);

-- Evita policy ativa duplicada exatamente para o mesmo escopo (NULLS NOT DISTINCT iguala NULLs).
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_publication_policies_unique_active_scope
  ON catalog_publication_policies(company_id, product_type, condition) NULLS NOT DISTINCT
  WHERE active = TRUE;

DROP TRIGGER IF EXISTS trg_catalog_publication_policies_updated_at ON catalog_publication_policies;
CREATE TRIGGER trg_catalog_publication_policies_updated_at
  BEFORE UPDATE ON catalog_publication_policies
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- catalog_readiness_rules
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_readiness_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_publication_policy_id UUID NOT NULL
    REFERENCES catalog_publication_policies(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  threshold_operator TEXT,
  threshold_value NUMERIC,
  message TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_readiness_rules_severity_check
    CHECK (severity IN ('block','warning')),
  CONSTRAINT catalog_readiness_rules_operator_check
    CHECK (threshold_operator IS NULL OR threshold_operator IN ('lt','lte','eq','gte','gt'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_readiness_rules_policy
  ON catalog_readiness_rules(catalog_publication_policy_id);

CREATE INDEX IF NOT EXISTS idx_catalog_readiness_rules_policy_active
  ON catalog_readiness_rules(catalog_publication_policy_id, active);

DROP TRIGGER IF EXISTS trg_catalog_readiness_rules_updated_at ON catalog_readiness_rules;
CREATE TRIGGER trg_catalog_readiness_rules_updated_at
  BEFORE UPDATE ON catalog_readiness_rules
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- SEED Nobretech — preserva comportamento atual
-- ============================================================
-- Policy 1 (default da empresa, escopo NULL/NULL): status active/in_stock, LIMIT 200,
--   exige preço público. Cobre o filtro SQL geral.
-- Policy 2 (escopo product_type=device, condition=used): exige foto real, avaliação,
--   itens inclusos. Cobre o caminho do seminovo/open_box no mapper público.
--   Regra de readiness: defect_score_max severity=block threshold lte 5.
-- Policy 3 (escopo product_type=device, condition=sealed): NÃO exige foto real,
--   review nem itens inclusos. Cobre o caminho do lacrado.
--   Regra de readiness: real_photo_recommended severity=warning para imagem padrão.

DO $$
DECLARE
  v_company_id UUID;
  v_policy_default UUID;
  v_policy_used UUID;
  v_policy_sealed UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE slug = 'nobretech-store' LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'SEED SKIP: empresa nobretech-store nao encontrada.';
    RETURN;
  END IF;

  -- Default scope (NULL/NULL): filtro global de status + limite.
  SELECT id INTO v_policy_default
  FROM catalog_publication_policies
  WHERE company_id = v_company_id AND product_type IS NULL AND condition IS NULL AND active = TRUE
  LIMIT 1;

  IF v_policy_default IS NULL THEN
    INSERT INTO catalog_publication_policies (
      company_id, product_type, condition,
      requires_public_price, requires_real_photo, requires_review, requires_included_items,
      allowed_inventory_statuses, max_products, default_availability_label,
      active
    ) VALUES (
      v_company_id, NULL, NULL,
      TRUE, FALSE, FALSE, FALSE,
      ARRAY['active','in_stock'], 200, 'Pronta entrega',
      TRUE
    ) RETURNING id INTO v_policy_default;
    RAISE NOTICE 'SEED OK: catalog_publication_policies default id=%', v_policy_default;
  ELSE
    RAISE NOTICE 'SEED SKIP: policy default ja existe id=%', v_policy_default;
  END IF;

  -- Used/seminovo/open_box (device/used): exige foto real + review + itens inclusos.
  SELECT id INTO v_policy_used
  FROM catalog_publication_policies
  WHERE company_id = v_company_id AND product_type = 'device' AND condition = 'used' AND active = TRUE
  LIMIT 1;

  IF v_policy_used IS NULL THEN
    INSERT INTO catalog_publication_policies (
      company_id, product_type, condition,
      requires_public_price, requires_real_photo, requires_review, requires_included_items,
      allowed_inventory_statuses, max_products, default_availability_label,
      active
    ) VALUES (
      v_company_id, 'device', 'used',
      TRUE, TRUE, TRUE, TRUE,
      ARRAY['active','in_stock'], 200, 'Pronta entrega',
      TRUE
    ) RETURNING id INTO v_policy_used;
    RAISE NOTICE 'SEED OK: catalog_publication_policies device/used id=%', v_policy_used;

    INSERT INTO catalog_readiness_rules (
      catalog_publication_policy_id, rule_key, severity, threshold_operator, threshold_value, message
    ) VALUES (
      v_policy_used, 'defect_score_max', 'block', 'lte', 5,
      'Há um defeito informado na avaliação comercial.'
    );
    RAISE NOTICE 'SEED OK: readiness rule defect_score_max para device/used';
  ELSE
    RAISE NOTICE 'SEED SKIP: policy device/used ja existe id=%', v_policy_used;
  END IF;

  -- Lacrado (device/sealed): apenas warning quando usa imagem padrão.
  SELECT id INTO v_policy_sealed
  FROM catalog_publication_policies
  WHERE company_id = v_company_id AND product_type = 'device' AND condition = 'sealed' AND active = TRUE
  LIMIT 1;

  IF v_policy_sealed IS NULL THEN
    INSERT INTO catalog_publication_policies (
      company_id, product_type, condition,
      requires_public_price, requires_real_photo, requires_review, requires_included_items,
      allowed_inventory_statuses, max_products, default_availability_label,
      active
    ) VALUES (
      v_company_id, 'device', 'sealed',
      TRUE, FALSE, FALSE, FALSE,
      ARRAY['active','in_stock'], 200, 'Pronta entrega',
      TRUE
    ) RETURNING id INTO v_policy_sealed;
    RAISE NOTICE 'SEED OK: catalog_publication_policies device/sealed id=%', v_policy_sealed;

    INSERT INTO catalog_readiness_rules (
      catalog_publication_policy_id, rule_key, severity, threshold_operator, threshold_value, message
    ) VALUES (
      v_policy_sealed, 'real_photo_recommended', 'warning', NULL, NULL,
      'Produto lacrado usando imagem padrão. Recomenda-se revisar antes de divulgar.'
    );
    RAISE NOTICE 'SEED OK: readiness rule real_photo_recommended para device/sealed';
  ELSE
    RAISE NOTICE 'SEED SKIP: policy device/sealed ja existe id=%', v_policy_sealed;
  END IF;
END $$;
