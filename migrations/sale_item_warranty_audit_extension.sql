-- Fase 2D.2: Extensao das constraints de audit log para garantia por item de venda.
-- Expande os valores aceitos sem remover os existentes.
-- Idempotente: DROP IF EXISTS + ADD.

ALTER TABLE company_settings_audit_logs
  DROP CONSTRAINT IF EXISTS company_settings_audit_logs_action_check,
  ADD CONSTRAINT company_settings_audit_logs_action_check
    CHECK (action IN (
      'update_brand',
      'create_contact',
      'update_contact',
      'deactivate_contact',
      'reactivate_contact',
      'update_document_profile',
      'create_warranty_policy',
      'update_warranty_policy',
      'deactivate_warranty_policy',
      'create_warranty_term',
      'update_warranty_term',
      'deactivate_warranty_term',
      'create_sale_item_warranty',
      'update_sale_item_warranty',
      'deactivate_sale_item_warranty'
    ));
