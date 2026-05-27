-- Adiciona duas policies da Nobretech necessárias para o resolver central:
--   1. "Garantia Apple - Lacrado" — manufacturer, calendar_months, 12 meses, device/sealed.
--      Substitui o uso indevido da policy contratual da loja em produtos lacrados Apple.
--   2. "Garantia Loja - Acessórios" — contractual, calendar_months, 3 meses, accessory.
--      Cobre acessórios duráveis (stylus, fones, carregadores etc.).
-- Idempotente: WHERE NOT EXISTS por nome.

DO $$
DECLARE
  v_co UUID;
BEGIN
  SELECT id INTO v_co FROM companies WHERE slug = 'nobretech-store' LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE 'SKIP: empresa nobretech-store nao encontrada.';
    RETURN;
  END IF;

  -- Habilita applies_to_sale para policies contratuais legadas que o resolver
  -- precisa selecionar (Seminovo 6m e Seminovo 3 meses). Idempotente.
  UPDATE warranty_policies
  SET applies_to_sale = TRUE
  WHERE company_id = v_co
    AND active = TRUE
    AND warranty_nature = 'contractual'
    AND calculation_mode = 'calendar_months'
    AND default_months IN (3, 6)
    AND applies_to_sale = FALSE;

  IF NOT EXISTS (
    SELECT 1 FROM warranty_policies
    WHERE company_id = v_co AND name = 'Garantia Apple - Lacrado'
  ) THEN
    INSERT INTO warranty_policies (
      company_id, name, product_type, product_condition, product_origin,
      default_months, calculation_mode, public_label_template, internal_description,
      requires_customer_identification,
      applies_to_sale, applies_to_catalog, applies_to_portal, applies_to_documents,
      active, effective_from,
      warranty_nature, is_selectable, is_default,
      selection_label, selection_description, legal_basis, priority
    ) VALUES (
      v_co, 'Garantia Apple - Lacrado', 'device', 'sealed', NULL,
      12, 'calendar_months', 'Garantia Apple', 'Garantia do fabricante para produtos lacrados Apple (12 meses a partir da venda).',
      FALSE,
      TRUE, FALSE, TRUE, TRUE,
      TRUE, NOW(),
      'manufacturer', TRUE, FALSE,
      'Garantia Apple (12 meses)', 'Cobertura padrão do fabricante para aparelhos Apple lacrados.',
      NULL, 10
    );
    RAISE NOTICE 'SEED OK: Garantia Apple - Lacrado';
  ELSE
    RAISE NOTICE 'SEED SKIP: Garantia Apple - Lacrado ja existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM warranty_policies
    WHERE company_id = v_co AND name = 'Garantia Loja - Acessorios'
  ) THEN
    INSERT INTO warranty_policies (
      company_id, name, product_type, product_condition, product_origin,
      default_months, calculation_mode, public_label_template, internal_description,
      requires_customer_identification,
      applies_to_sale, applies_to_catalog, applies_to_portal, applies_to_documents,
      active, effective_from,
      warranty_nature, is_selectable, is_default,
      selection_label, selection_description, legal_basis, priority
    ) VALUES (
      v_co, 'Garantia Loja - Acessorios', 'accessory', NULL, NULL,
      3, 'calendar_months', 'Garantia contratual da loja', 'Cobertura contratual padrão para acessórios eletrônicos duráveis (canetas, fones, carregadores etc.).',
      FALSE,
      TRUE, FALSE, TRUE, TRUE,
      TRUE, NOW(),
      'contractual', TRUE, FALSE,
      'Garantia da loja (3 meses)', 'Cobertura contratual para acessórios duráveis.',
      NULL, 30
    );
    RAISE NOTICE 'SEED OK: Garantia Loja - Acessorios';
  ELSE
    RAISE NOTICE 'SEED SKIP: Garantia Loja - Acessorios ja existe';
  END IF;
END $$;
