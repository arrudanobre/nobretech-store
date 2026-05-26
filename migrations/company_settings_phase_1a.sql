-- Central de Configuracoes por empresa - Fase 1A
-- Base tipada para identidade, canais de contato e perfil documental.

CREATE TABLE IF NOT EXISTS company_brand_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  legal_name TEXT,
  short_name TEXT,
  slogan TEXT,
  public_description TEXT,
  canonical_domain TEXT,
  city TEXT,
  state TEXT,
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  primary_color TEXT,
  accent_color TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  apple_icon_url TEXT,
  og_image_url TEXT,
  theme_mode TEXT NOT NULL DEFAULT 'system',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_brand_profile_theme_mode_check
    CHECK (theme_mode IN ('light', 'dark', 'system')),
  CONSTRAINT company_brand_profile_primary_color_check
    CHECK (primary_color IS NULL OR primary_color ~* '^#[0-9a-f]{6}$'),
  CONSTRAINT company_brand_profile_accent_color_check
    CHECK (accent_color IS NULL OR accent_color ~* '^#[0-9a-f]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_company_brand_profile_company_id
  ON company_brand_profile(company_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_brand_profile_one_active
  ON company_brand_profile(company_id)
  WHERE active;

CREATE TABLE IF NOT EXISTS company_contact_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_contact_channels_type_check
    CHECK (channel_type IN ('whatsapp', 'instagram', 'email', 'phone', 'website', 'address', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_company_contact_channels_company_id
  ON company_contact_channels(company_id);

CREATE INDEX IF NOT EXISTS idx_company_contact_channels_company_active_order
  ON company_contact_channels(company_id, active, sort_order);

CREATE INDEX IF NOT EXISTS idx_company_contact_channels_company_type
  ON company_contact_channels(company_id, channel_type, active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_contact_channels_one_primary_type
  ON company_contact_channels(company_id, channel_type)
  WHERE active AND is_primary;

CREATE TABLE IF NOT EXISTS company_document_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  issuer_name TEXT NOT NULL,
  legal_name TEXT,
  document_number TEXT,
  address_line TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  email TEXT,
  default_seller_name TEXT,
  signature_label TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_document_profile_effective_range_check
    CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_company_document_profile_company_id
  ON company_document_profile(company_id);

CREATE INDEX IF NOT EXISTS idx_company_document_profile_company_active_effective
  ON company_document_profile(company_id, active, effective_from DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_document_profile_one_active
  ON company_document_profile(company_id)
  WHERE active;

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_brand_profile_updated_at ON company_brand_profile;
CREATE TRIGGER trg_company_brand_profile_updated_at
  BEFORE UPDATE ON company_brand_profile
  FOR EACH ROW
  EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_company_contact_channels_updated_at ON company_contact_channels;
CREATE TRIGGER trg_company_contact_channels_updated_at
  BEFORE UPDATE ON company_contact_channels
  FOR EACH ROW
  EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_company_document_profile_updated_at ON company_document_profile;
CREATE TRIGGER trg_company_document_profile_updated_at
  BEFORE UPDATE ON company_document_profile
  FOR EACH ROW
  EXECUTE FUNCTION trg_set_updated_at();

DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id
  FROM companies
  WHERE slug = 'nobretech-store'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id
    FROM companies
    WHERE UPPER(name) = 'NOBRETECH STORE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    INSERT INTO companies (name, slug)
    VALUES ('NOBRETECH STORE', 'nobretech-store')
    ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name,
          updated_at = NOW()
    RETURNING id INTO v_company_id;
  END IF;

  INSERT INTO company_brand_profile (
    company_id,
    display_name,
    legal_name,
    short_name,
    slogan,
    public_description,
    canonical_domain,
    city,
    state,
    locale,
    primary_color,
    accent_color,
    logo_url,
    favicon_url,
    apple_icon_url,
    og_image_url,
    theme_mode,
    active
  )
  SELECT
    v_company_id,
    'Nobretech Store',
    'Nobretech Store',
    'Nobretech',
    'Quem entende, compra certo',
    'Tecnologia original, procedência verificada e atendimento direto em São Luís.',
    'https://www.nobretechstore.com.br',
    'São Luís',
    'MA',
    'pt-BR',
    '#07162f',
    '#3A6BC4',
    '/logo-nobretech.png',
    '/favicon.ico',
    '/apple-touch-icon.png',
    '/og-nobretech-v2.png',
    'dark',
    TRUE
  WHERE NOT EXISTS (
    SELECT 1
    FROM company_brand_profile
    WHERE company_id = v_company_id
      AND active = TRUE
  );

  INSERT INTO company_contact_channels (
    company_id,
    channel_type,
    label,
    value,
    url,
    is_primary,
    is_public,
    sort_order,
    active
  )
  SELECT v_company_id, 'whatsapp', 'WhatsApp principal', '5598988265655', 'https://wa.me/5598988265655', TRUE, TRUE, 10, TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM company_contact_channels
    WHERE company_id = v_company_id AND channel_type = 'whatsapp' AND active = TRUE
  );

  INSERT INTO company_contact_channels (
    company_id,
    channel_type,
    label,
    value,
    url,
    is_primary,
    is_public,
    sort_order,
    active
  )
  SELECT v_company_id, 'instagram', 'Instagram', '@nobretechstore', 'https://instagram.com/nobretechstore', TRUE, TRUE, 20, TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM company_contact_channels
    WHERE company_id = v_company_id AND channel_type = 'instagram' AND active = TRUE
  );

  INSERT INTO company_contact_channels (
    company_id,
    channel_type,
    label,
    value,
    url,
    is_primary,
    is_public,
    sort_order,
    active
  )
  SELECT v_company_id, 'email', 'E-mail documental', 'nobretechstoreslz@gmail.com', 'mailto:nobretechstoreslz@gmail.com', TRUE, FALSE, 30, TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM company_contact_channels
    WHERE company_id = v_company_id AND channel_type = 'email' AND active = TRUE
  );

  INSERT INTO company_contact_channels (
    company_id,
    channel_type,
    label,
    value,
    url,
    is_primary,
    is_public,
    sort_order,
    active
  )
  SELECT v_company_id, 'address', 'Endereço documental', 'Rua Santa Inês, 16, São Luís - MA', NULL, TRUE, FALSE, 40, TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM company_contact_channels
    WHERE company_id = v_company_id AND channel_type = 'address' AND active = TRUE
  );

  INSERT INTO company_document_profile (
    company_id,
    issuer_name,
    legal_name,
    document_number,
    address_line,
    city,
    state,
    phone,
    email,
    default_seller_name,
    signature_label,
    active,
    effective_from
  )
  SELECT
    v_company_id,
    'Nobretech Store',
    'Nobretech Store',
    NULL,
    'Rua Santa Inês, 16',
    'São Luís',
    'MA',
    '98981680080',
    'nobretechstoreslz@gmail.com',
    'Vinicius Arruda Nobre',
    'Responsável pela venda',
    TRUE,
    NOW()
  WHERE NOT EXISTS (
    SELECT 1
    FROM company_document_profile
    WHERE company_id = v_company_id
      AND active = TRUE
  );
END $$;
