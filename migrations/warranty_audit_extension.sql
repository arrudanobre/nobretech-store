-- Fase 2A: Extensao das constraints de audit log para o dominio warranty.
-- Expande os valores aceitos sem remover os existentes.
-- Idempotente: DROP IF EXISTS + ADD garante que rodar duas vezes nao quebra.

ALTER TABLE company_settings_audit_logs
  DROP CONSTRAINT IF EXISTS company_settings_audit_logs_domain_check,
  ADD CONSTRAINT company_settings_audit_logs_domain_check
    CHECK (domain IN ('brand', 'contact', 'document', 'warranty'));

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
      'deactivate_warranty_term'
    ));
