-- ============================================================================
-- AUTO-ONBOARDING: quando um novo usuário faz signup, criar company + financial_settings automaticamente
-- ============================================================================

-- Trigger que roda após inserção de novo usuário em auth.users
CREATE OR REPLACE FUNCTION public.fn_auto_onboard_new_user()
RETURNS trigger AS $$
DECLARE
  v_company_id UUID;
  v_company_name TEXT;
  v_company_slug TEXT;
BEGIN
  -- Gera nome da empresa baseado no email
  v_company_name := SPLIT_PART(NEW.email, '@', 1) || '''s Store';
  v_company_slug := SPLIT_PART(NEW.email, '@', 1) || '-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6);

  -- Cria a empresa
  INSERT INTO companies (name, slug)
  VALUES (v_company_name, v_company_slug)
  RETURNING id INTO v_company_id;

  -- Cria configurações financeiras padrão
  INSERT INTO financial_settings (company_id) VALUES (v_company_id);

  -- Registra o usuário na tabela users
  INSERT INTO users (id, company_id, full_name, role)
  VALUES (NEW.id, v_company_id, NEW.email, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remova trigger antiga se existir (idempotente)
DROP TRIGGER IF EXISTS trg_auto_onboard ON auth.users;

-- Cria trigger — roda após INSERT na tabela auth.users
CREATE TRIGGER trg_auto_onboard
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_onboard_new_user();
