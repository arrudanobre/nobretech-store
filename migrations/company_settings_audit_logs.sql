-- Audit log da Central de Configuracoes por empresa.
-- Registra antes/depois de toda alteracao autenticada em brand, contact e document.

CREATE TABLE IF NOT EXISTS company_settings_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_user_id UUID,
  actor_email TEXT,
  domain TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  before_snapshot JSONB,
  after_snapshot JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_settings_audit_logs_domain_check
    CHECK (domain IN ('brand', 'contact', 'document')),
  CONSTRAINT company_settings_audit_logs_action_check
    CHECK (action IN (
      'update_brand',
      'create_contact',
      'update_contact',
      'deactivate_contact',
      'reactivate_contact',
      'update_document_profile'
    ))
);

CREATE INDEX IF NOT EXISTS idx_company_settings_audit_company_created
  ON company_settings_audit_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_settings_audit_domain
  ON company_settings_audit_logs(company_id, domain);

CREATE INDEX IF NOT EXISTS idx_company_settings_audit_entity
  ON company_settings_audit_logs(entity_table, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_settings_audit_actor
  ON company_settings_audit_logs(actor_user_id)
  WHERE actor_user_id IS NOT NULL;
