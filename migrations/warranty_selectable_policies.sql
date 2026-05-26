-- Fase 2C: Politicas de garantia selecionaveis por venda/item.
-- Ajusta o dominio para permitir que 3 e 6 meses coexistam como opcoes futuras.
-- Nenhum consumidor de venda, catalogo, portal ou documentos e integrado nesta fase.

ALTER TABLE warranty_policies
  ADD COLUMN IF NOT EXISTS warranty_nature TEXT NOT NULL DEFAULT 'contractual',
  ADD COLUMN IF NOT EXISTS is_selectable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS selection_label TEXT,
  ADD COLUMN IF NOT EXISTS selection_description TEXT,
  ADD COLUMN IF NOT EXISTS legal_basis TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;

DROP INDEX IF EXISTS idx_warranty_policies_unique_active_scope;

ALTER TABLE warranty_policies
  DROP CONSTRAINT IF EXISTS warranty_policies_warranty_nature_check,
  ADD CONSTRAINT warranty_policies_warranty_nature_check
    CHECK (warranty_nature IN ('legal', 'contractual', 'manufacturer', 'operational_support', 'legacy'));

ALTER TABLE warranty_policies
  DROP CONSTRAINT IF EXISTS warranty_policies_selectable_label_check,
  ADD CONSTRAINT warranty_policies_selectable_label_check
    CHECK (is_selectable = FALSE OR NULLIF(BTRIM(selection_label), '') IS NOT NULL);

ALTER TABLE warranty_policies
  DROP CONSTRAINT IF EXISTS warranty_policies_default_active_check,
  ADD CONSTRAINT warranty_policies_default_active_check
    CHECK (is_default = FALSE OR active = TRUE);

ALTER TABLE warranty_policies
  DROP CONSTRAINT IF EXISTS warranty_policies_duration_by_mode_check,
  ADD CONSTRAINT warranty_policies_duration_by_mode_check
    CHECK (
      (calculation_mode = 'calendar_months' AND default_months IS NOT NULL AND default_months > 0)
      OR (calculation_mode = 'fixed_days' AND default_days IS NOT NULL AND default_days > 0)
      OR (calculation_mode = 'manual_dates')
    );

CREATE INDEX IF NOT EXISTS idx_warranty_policies_selectable
  ON warranty_policies(company_id, is_selectable, active, priority);

CREATE INDEX IF NOT EXISTS idx_warranty_policies_nature
  ON warranty_policies(company_id, warranty_nature, active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warranty_policies_unique_active_default_scope
  ON warranty_policies(company_id, product_type, product_condition, product_origin)
  NULLS NOT DISTINCT
  WHERE active = TRUE
    AND is_default = TRUE;

DO $$
DECLARE
  v_company_id UUID;
  v_policy_6m_id UUID;
  v_policy_3m_id UUID;
  v_policy_legal_id UUID;
  v_policy_manufacturer_id UUID;
BEGIN
  SELECT id INTO v_company_id
  FROM companies
  WHERE slug = 'nobretech-store'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'SEED SKIP: empresa nobretech-store nao encontrada.';
    RETURN;
  END IF;

  SELECT id INTO v_policy_6m_id
  FROM warranty_policies
  WHERE company_id = v_company_id
    AND name = 'Garantia Nobretech - Seminovo'
  LIMIT 1;

  IF v_policy_6m_id IS NULL THEN
    INSERT INTO warranty_policies (
      company_id, name, product_type, product_condition, product_origin,
      warranty_nature, default_months, default_days, calculation_mode,
      public_label_template, internal_description, requires_customer_identification,
      applies_to_sale, applies_to_catalog, applies_to_portal, applies_to_documents,
      active, is_selectable, is_default, selection_label, selection_description,
      priority, effective_from
    ) VALUES (
      v_company_id, 'Garantia Nobretech - Seminovo', 'device', 'used', NULL,
      'contractual', 6, NULL, 'calendar_months',
      '6 meses de Garantia Nobretech',
      'Politica contratual Nobretech para aparelhos usados/seminovos. Nenhum consumidor integrado nesta fase.',
      TRUE, FALSE, FALSE, FALSE, FALSE,
      TRUE, TRUE, TRUE, '6 meses Nobretech',
      'Garantia contratual Nobretech para aparelho seminovo aprovado.',
      10, NOW()
    )
    RETURNING id INTO v_policy_6m_id;
  ELSE
    UPDATE warranty_policies
    SET warranty_nature = 'contractual',
        default_months = 6,
        default_days = NULL,
        calculation_mode = 'calendar_months',
        active = TRUE,
        is_selectable = TRUE,
        is_default = TRUE,
        selection_label = '6 meses Nobretech',
        selection_description = 'Garantia contratual Nobretech para aparelho seminovo aprovado.',
        priority = 10,
        public_label_template = '6 meses de Garantia Nobretech',
        internal_description = 'Politica contratual Nobretech para aparelhos usados/seminovos. Nenhum consumidor integrado nesta fase.'
    WHERE id = v_policy_6m_id;
  END IF;

  SELECT id INTO v_policy_3m_id
  FROM warranty_policies
  WHERE company_id = v_company_id
    AND name IN ('Garantia Nobretech - Seminovo 3 meses', 'Garantia Nobretech - Legado Venda Nova')
  ORDER BY CASE WHEN name = 'Garantia Nobretech - Seminovo 3 meses' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_policy_3m_id IS NULL THEN
    INSERT INTO warranty_policies (
      company_id, name, product_type, product_condition, product_origin,
      warranty_nature, default_months, default_days, calculation_mode,
      public_label_template, internal_description, requires_customer_identification,
      applies_to_sale, applies_to_catalog, applies_to_portal, applies_to_documents,
      active, is_selectable, is_default, selection_label, selection_description,
      priority, effective_from
    ) VALUES (
      v_company_id, 'Garantia Nobretech - Seminovo 3 meses', 'device', 'used', NULL,
      'contractual', 3, NULL, 'calendar_months',
      '3 meses de Garantia Nobretech',
      'Politica contratual Nobretech reduzida para casos especificos. Nenhum consumidor integrado nesta fase.',
      TRUE, FALSE, FALSE, FALSE, FALSE,
      TRUE, TRUE, FALSE, '3 meses Nobretech',
      'Garantia contratual Nobretech reduzida para casos especificos.',
      20, NOW()
    )
    RETURNING id INTO v_policy_3m_id;
  ELSE
    UPDATE warranty_policies
    SET name = 'Garantia Nobretech - Seminovo 3 meses',
        warranty_nature = 'contractual',
        default_months = 3,
        default_days = NULL,
        calculation_mode = 'calendar_months',
        active = TRUE,
        is_selectable = TRUE,
        is_default = FALSE,
        selection_label = '3 meses Nobretech',
        selection_description = 'Garantia contratual Nobretech reduzida para casos especificos.',
        priority = 20,
        public_label_template = '3 meses de Garantia Nobretech',
        internal_description = 'Politica contratual Nobretech reduzida para casos especificos. Nenhum consumidor integrado nesta fase.'
    WHERE id = v_policy_3m_id;
  END IF;

  SELECT id INTO v_policy_legal_id
  FROM warranty_policies
  WHERE company_id = v_company_id
    AND name = 'Garantia legal - Produto duravel 90 dias'
  LIMIT 1;

  IF v_policy_legal_id IS NULL THEN
    INSERT INTO warranty_policies (
      company_id, name, product_type, product_condition, product_origin,
      warranty_nature, default_months, default_days, calculation_mode,
      public_label_template, internal_description, requires_customer_identification,
      applies_to_sale, applies_to_catalog, applies_to_portal, applies_to_documents,
      active, is_selectable, is_default, selection_label, selection_description,
      legal_basis, priority, effective_from
    ) VALUES (
      v_company_id, 'Garantia legal - Produto duravel 90 dias', 'device', NULL, NULL,
      'legal', NULL, 90, 'fixed_days',
      'Garantia legal 90 dias',
      'Prazo legal para reclamacao de vicios aparentes em produto duravel. Nao representa garantia contratual Nobretech.',
      FALSE, FALSE, FALSE, FALSE, FALSE,
      TRUE, FALSE, FALSE, 'Garantia legal 90 dias',
      'Prazo legal para reclamacao de vicios aparentes em produto duravel.',
      'CDC art. 26, produto duravel, 90 dias',
      90, NOW()
    )
    RETURNING id INTO v_policy_legal_id;
  ELSE
    UPDATE warranty_policies
    SET warranty_nature = 'legal',
        default_months = NULL,
        default_days = 90,
        calculation_mode = 'fixed_days',
        active = TRUE,
        is_selectable = FALSE,
        is_default = FALSE,
        selection_label = 'Garantia legal 90 dias',
        selection_description = 'Prazo legal para reclamacao de vicios aparentes em produto duravel.',
        legal_basis = 'CDC art. 26, produto duravel, 90 dias',
        priority = 90,
        public_label_template = 'Garantia legal 90 dias',
        internal_description = 'Prazo legal para reclamacao de vicios aparentes em produto duravel. Nao representa garantia contratual Nobretech.'
    WHERE id = v_policy_legal_id;
  END IF;

  SELECT id INTO v_policy_manufacturer_id
  FROM warranty_policies
  WHERE company_id = v_company_id
    AND name = 'Garantia fabricante - Produto lacrado'
  LIMIT 1;

  IF v_policy_manufacturer_id IS NULL THEN
    INSERT INTO warranty_policies (
      company_id, name, product_type, product_condition, product_origin,
      warranty_nature, default_months, default_days, calculation_mode,
      public_label_template, internal_description, requires_customer_identification,
      applies_to_sale, applies_to_catalog, applies_to_portal, applies_to_documents,
      active, is_selectable, is_default, selection_label, selection_description,
      priority, effective_from
    ) VALUES (
      v_company_id, 'Garantia fabricante - Produto lacrado', 'device', 'sealed', 'manufacturer',
      'manufacturer', NULL, NULL, 'manual_dates',
      'Garantia do fabricante',
      'Garantia vinculada ao fabricante/Apple quando aplicavel, conforme ativacao ou consulta. Nao promete automaticamente Garantia Nobretech.',
      FALSE, FALSE, FALSE, FALSE, FALSE,
      TRUE, TRUE, FALSE, 'Garantia do fabricante',
      'Garantia vinculada ao fabricante/Apple quando aplicavel, conforme ativacao/consulta.',
      30, NOW()
    )
    RETURNING id INTO v_policy_manufacturer_id;
  ELSE
    UPDATE warranty_policies
    SET warranty_nature = 'manufacturer',
        default_months = NULL,
        default_days = NULL,
        calculation_mode = 'manual_dates',
        active = TRUE,
        is_selectable = TRUE,
        is_default = FALSE,
        selection_label = 'Garantia do fabricante',
        selection_description = 'Garantia vinculada ao fabricante/Apple quando aplicavel, conforme ativacao/consulta.',
        priority = 30,
        public_label_template = 'Garantia do fabricante',
        internal_description = 'Garantia vinculada ao fabricante/Apple quando aplicavel, conforme ativacao ou consulta. Nao promete automaticamente Garantia Nobretech.'
    WHERE id = v_policy_manufacturer_id;
  END IF;
END $$;
