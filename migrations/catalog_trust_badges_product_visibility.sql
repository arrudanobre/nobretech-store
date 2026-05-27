-- Catálogo público — habilita badges de produto.
-- Marca badges existentes da Nobretech como show_on_product = TRUE para preservar
-- o visual atual da página de produto, e insere "Procedência verificada"
-- (texto antes hardcoded em /catalogo/[slug]) como badge configurável.
-- Idempotente: usa WHERE show_on_product = FALSE no UPDATE e WHERE NOT EXISTS no INSERT.

DO $$
DECLARE
  v_co UUID;
BEGIN
  SELECT id INTO v_co FROM companies WHERE slug = 'nobretech-store' LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE 'SKIP: empresa nobretech-store nao encontrada.';
    RETURN;
  END IF;

  -- Flip shield_check (Garantia) e seal_check (Pronta entrega) para aparecer no produto.
  UPDATE catalog_trust_badges
  SET show_on_product = TRUE
  WHERE company_id = v_co
    AND active = TRUE
    AND icon_key IN ('shield_check', 'seal_check')
    AND show_on_product = FALSE;

  -- Insere "Procedência verificada" se ainda nao existir (era hardcoded no produto).
  IF NOT EXISTS (
    SELECT 1 FROM catalog_trust_badges
    WHERE company_id = v_co AND label = 'Procedência verificada'
  ) THEN
    INSERT INTO catalog_trust_badges (
      company_id, icon_key, label, description, sort_order,
      show_on_catalog, show_on_product, active
    ) VALUES (
      v_co, 'seal_check', 'Procedência verificada',
      'Disponibilidade conferida antes da publicação.',
      50, FALSE, TRUE, TRUE
    );
    RAISE NOTICE 'SEED OK: badge Procedencia verificada inserido';
  ELSE
    RAISE NOTICE 'SEED SKIP: badge Procedencia verificada ja existe';
  END IF;
END $$;
