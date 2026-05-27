-- Align real accessory inventory rows to structured catalog subcategories.
-- No warranty rule is inferred from names here: subcategories are explicit
-- operational choices and inventory rows are addressed by audited IDs.

DO $$
DECLARE
  company_record RECORD;
  accessories_category_id UUID;
  accessory_policy_id UUID;
  stylus_subcategory_id UUID;
  charger_subcategory_id UUID;
  case_subcategory_id UUID;
  screen_protector_subcategory_id UUID;
BEGIN
  FOR company_record IN SELECT id FROM companies LOOP
    SELECT id
      INTO accessories_category_id
      FROM product_categories
     WHERE company_id = company_record.id
       AND slug = 'accessories'
       AND is_active = TRUE
       AND deleted_at IS NULL
     LIMIT 1;

    IF accessories_category_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id
      INTO accessory_policy_id
      FROM warranty_policies
     WHERE company_id = company_record.id
       AND name = 'Garantia Loja - Acessorios'
       AND warranty_nature = 'contractual'
       AND calculation_mode = 'calendar_months'
       AND default_months = 3
       AND active = TRUE
       AND applies_to_sale = TRUE
     ORDER BY updated_at DESC
     LIMIT 1;

    INSERT INTO product_subcategories (
      company_id,
      category_id,
      name,
      slug,
      legacy_model,
      sort_order,
      is_active,
      normalized_name,
      default_warranty_policy_id
    ) VALUES
      (company_record.id, accessories_category_id, 'Stylus / Caneta', 'stylus-caneta', NULL, 100, TRUE, 'stylus / caneta', accessory_policy_id),
      (company_record.id, accessories_category_id, 'Carregador', 'carregador', NULL, 110, TRUE, 'carregador', accessory_policy_id),
      (company_record.id, accessories_category_id, 'Cabo', 'cabo', NULL, 120, TRUE, 'cabo', accessory_policy_id),
      (company_record.id, accessories_category_id, 'Capa / Case', 'capa-case', NULL, 130, TRUE, 'capa / case', NULL),
      (company_record.id, accessories_category_id, 'Película', 'pelicula', NULL, 140, TRUE, 'película', NULL)
    ON CONFLICT (company_id, category_id, slug)
    DO UPDATE SET
      name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      is_active = TRUE,
      deleted_at = NULL,
      normalized_name = EXCLUDED.normalized_name,
      default_warranty_policy_id = EXCLUDED.default_warranty_policy_id,
      updated_at = NOW();

    SELECT id INTO stylus_subcategory_id
      FROM product_subcategories
     WHERE company_id = company_record.id
       AND category_id = accessories_category_id
       AND slug = 'stylus-caneta'
     LIMIT 1;

    SELECT id INTO charger_subcategory_id
      FROM product_subcategories
     WHERE company_id = company_record.id
       AND category_id = accessories_category_id
       AND slug = 'carregador'
     LIMIT 1;

    SELECT id INTO case_subcategory_id
      FROM product_subcategories
     WHERE company_id = company_record.id
       AND category_id = accessories_category_id
       AND slug = 'capa-case'
     LIMIT 1;

    SELECT id INTO screen_protector_subcategory_id
      FROM product_subcategories
     WHERE company_id = company_record.id
       AND category_id = accessories_category_id
       AND slug = 'pelicula'
     LIMIT 1;

    UPDATE inventory
       SET category_name_snapshot = 'Acessórios',
           subcategory_name_snapshot = 'Stylus / Caneta',
           updated_at = NOW()
     WHERE company_id = company_record.id
       AND status IN ('active', 'in_stock')
       AND product_type = 'accessory'
       AND id IN ('11a1d3f9-5670-4dfb-aa7f-561d6f273a4e'::uuid)
       AND stylus_subcategory_id IS NOT NULL;

    UPDATE inventory
       SET category_name_snapshot = 'Acessórios',
           subcategory_name_snapshot = 'Carregador',
           updated_at = NOW()
     WHERE company_id = company_record.id
       AND status IN ('active', 'in_stock')
       AND product_type = 'accessory'
       AND id IN (
         'b7b5ec76-c48c-4865-9a58-8bd5320cc8fe'::uuid,
         '2f73c6e2-c078-40ca-b577-969157e557d5'::uuid
       )
       AND charger_subcategory_id IS NOT NULL;

    UPDATE inventory
       SET category_name_snapshot = 'Acessórios',
           subcategory_name_snapshot = 'Capa / Case',
           updated_at = NOW()
     WHERE company_id = company_record.id
       AND status IN ('active', 'in_stock')
       AND product_type = 'accessory'
       AND id IN (
         'e2fb3179-af66-4870-a8e4-45e4d785ea30'::uuid,
         'd71725a8-9bcd-4b32-9300-3a86a691e21e'::uuid,
         '09b45ae6-c655-4c14-b22e-019d0787535e'::uuid,
         '2547ab56-3cb6-45f2-82ba-359c7f64331a'::uuid
       )
       AND case_subcategory_id IS NOT NULL;

    UPDATE inventory
       SET category_name_snapshot = 'Acessórios',
           subcategory_name_snapshot = 'Película',
           updated_at = NOW()
     WHERE company_id = company_record.id
       AND status IN ('active', 'in_stock')
       AND product_type = 'accessory'
       AND id IN ('e1041774-6309-4df5-91e7-7e7706a924ea'::uuid)
       AND screen_protector_subcategory_id IS NOT NULL;
  END LOOP;
END $$;
