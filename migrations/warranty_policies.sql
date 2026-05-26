-- Fase 2A: Tabelas de politica de garantia por empresa.
-- Cria warranty_policies e warranty_policy_terms.
-- Seed inicial da Nobretech representa a realidade atual sem alterar nenhum comportamento existente.
--
-- INCONSISTENCIA DOCUMENTADA:
--   Venda nova (vendas/nova/page.tsx): default 3 meses (hardcoded no estado React)
--   Catalogo publico (catalog/warranty.ts): DEFAULT_USED_WARRANTY_MONTHS = 6
--   Portal (public-purchase-access.ts): warranty_months * 30 dias (nao usa meses civis)
--
--   Esta migration representa as duas realidades como duas politicas distintas.
--   Nenhuma delas esta integrada nos consumidores nesta fase.
--   A decisao sobre politica unica final e escopo de cada consumidor fica para a Fase 2B.

-- ============================================================
-- warranty_policies
-- ============================================================

CREATE TABLE IF NOT EXISTS warranty_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  product_type TEXT,
  product_condition TEXT,
  product_origin TEXT,
  default_months INTEGER,
  default_days INTEGER,
  calculation_mode TEXT NOT NULL DEFAULT 'calendar_months',
  public_label_template TEXT,
  internal_description TEXT,
  requires_customer_identification BOOLEAN NOT NULL DEFAULT FALSE,
  applies_to_sale BOOLEAN NOT NULL DEFAULT FALSE,
  applies_to_catalog BOOLEAN NOT NULL DEFAULT FALSE,
  applies_to_portal BOOLEAN NOT NULL DEFAULT FALSE,
  applies_to_documents BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT warranty_policies_calculation_mode_check
    CHECK (calculation_mode IN ('calendar_months', 'fixed_days', 'manual_dates')),
  CONSTRAINT warranty_policies_default_months_nonneg
    CHECK (default_months IS NULL OR default_months >= 0),
  CONSTRAINT warranty_policies_default_days_nonneg
    CHECK (default_days IS NULL OR default_days >= 0),
  CONSTRAINT warranty_policies_effective_period
    CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_warranty_policies_company
  ON warranty_policies(company_id);

CREATE INDEX IF NOT EXISTS idx_warranty_policies_company_active
  ON warranty_policies(company_id, active);

CREATE INDEX IF NOT EXISTS idx_warranty_policies_company_scope
  ON warranty_policies(company_id, product_type, product_condition, product_origin);

-- Previne multiplas politicas ativas com escopo exatamente igual, inclusive quando
-- product_origin for NULL para representar uma politica de alcance amplo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_warranty_policies_unique_active_scope
  ON warranty_policies(company_id, product_type, product_condition, product_origin)
  NULLS NOT DISTINCT
  WHERE active = TRUE;

DROP TRIGGER IF EXISTS trg_warranty_policies_updated_at ON warranty_policies;
CREATE TRIGGER trg_warranty_policies_updated_at
  BEFORE UPDATE ON warranty_policies
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- warranty_policy_terms
-- ============================================================

CREATE TABLE IF NOT EXISTS warranty_policy_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_policy_id UUID NOT NULL REFERENCES warranty_policies(id) ON DELETE CASCADE,
  term_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT warranty_policy_terms_term_type_check
    CHECK (term_type IN (
      'coverage',
      'exclusion',
      'assistance',
      'refund_exchange',
      'customer_responsibility',
      'legal_note',
      'other'
    ))
);

CREATE INDEX IF NOT EXISTS idx_warranty_policy_terms_policy
  ON warranty_policy_terms(warranty_policy_id);

CREATE INDEX IF NOT EXISTS idx_warranty_policy_terms_policy_active
  ON warranty_policy_terms(warranty_policy_id, active);

CREATE INDEX IF NOT EXISTS idx_warranty_policy_terms_sort
  ON warranty_policy_terms(warranty_policy_id, sort_order);

DROP TRIGGER IF EXISTS trg_warranty_policy_terms_updated_at ON warranty_policy_terms;
CREATE TRIGGER trg_warranty_policy_terms_updated_at
  BEFORE UPDATE ON warranty_policy_terms
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- SEED INICIAL DA NOBRETECH
-- ============================================================
-- Idempotente: usa WHERE NOT EXISTS para nao duplicar em re-execucoes.
--
-- POLITICA 1 — Garantia Nobretech - Seminovo (6 meses)
--   Representa o que o catalogo publico atual promete para aparelhos usados.
--   Todos os applies_to_* = FALSE porque nenhum consumidor esta integrado ainda.
--   Quando a integracao acontecer (Fase 2B), os campos applies_to_* serao ativados
--   e os consumidores passarao a ler desta tabela.
--
-- POLITICA 2 — Garantia Nobretech - Legado Venda Nova (3 meses)
--   Representa o default atual hardcoded no estado React da venda nova (warrantyMonths = "3").
--   Nao esta integrada. Existe para registrar a realidade atual do sistema.
--   active = FALSE: representa politica legada nao vigente no banco; o estado React
--   atualmente a define sem consultar o banco.
--   Quando a decisao de politica unica for tomada, esta entrada sera revisada ou
--   ativada com escopo de venda, e o hardcode no frontend sera removido.
--
-- DECISAO PENDENTE: 3 meses ou 6 meses para venda de aparelho usado?
--   A resposta define qual politica sera ativada e quais applies_to_* serao ligados.

DO $$
DECLARE
  v_company_id UUID;
  v_policy_6m_id UUID;
  v_policy_3m_id UUID;
BEGIN
  SELECT id INTO v_company_id
  FROM companies
  WHERE slug = 'nobretech-store'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'SEED SKIP: empresa nobretech-store nao encontrada.';
    RETURN;
  END IF;

  -- ---- Politica 6 meses (seminovo / catalogo) ----
  SELECT id INTO v_policy_6m_id
  FROM warranty_policies
  WHERE company_id = v_company_id
    AND name = 'Garantia Nobretech - Seminovo'
  LIMIT 1;

  IF v_policy_6m_id IS NULL THEN
    INSERT INTO warranty_policies (
      company_id,
      name,
      product_type,
      product_condition,
      product_origin,
      default_months,
      calculation_mode,
      public_label_template,
      internal_description,
      requires_customer_identification,
      applies_to_sale,
      applies_to_catalog,
      applies_to_portal,
      applies_to_documents,
      active,
      effective_from
    ) VALUES (
      v_company_id,
      'Garantia Nobretech - Seminovo',
      'device',
      'used',
      NULL,
      6,
      'calendar_months',
      '6 meses de Garantia Nobretech',
      'Politica canonica para aparelhos usados/seminovos. Representa o prazo que o catalogo publico atual promete (DEFAULT_USED_WARRANTY_MONTHS = 6 em catalog/warranty.ts). Nenhum consumidor integrado nesta fase.',
      TRUE,
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      TRUE,
      NOW()
    )
    RETURNING id INTO v_policy_6m_id;

    RAISE NOTICE 'SEED OK: warranty_policies — Garantia Nobretech - Seminovo (6 meses), id=%', v_policy_6m_id;

    -- Termos da garantia seminovo — espelham os termos atuais de sale-documents.ts
    INSERT INTO warranty_policy_terms (warranty_policy_id, term_type, title, body, sort_order) VALUES

    (v_policy_6m_id, 'coverage', 'Cobertura da Garantia', 'A garantia cobre defeitos internos de funcionamento que nao tenham sido causados por uso indevido do aparelho. A garantia e valida somente para o item descrito neste termo, e e contada a partir da data de compra conforme o prazo estabelecido.', 10),

    (v_policy_6m_id, 'exclusion', 'Cancelamento Automatico da Garantia', 'A garantia e cancelada automaticamente nos seguintes casos: quedas; esmagamentos; sobrecarga eletrica; exposicao do aparelho a altas temperaturas; umidade ou liquidos; exposicao a poeira, po e/ou limalha de metais; ou quando atestado mau uso do aparelho por parte do comprador; instalacoes, modificacoes ou atualizacoes no sistema operacional; abertura do equipamento ou tentativa de conserto por terceiros.', 20),

    (v_policy_6m_id, 'exclusion', 'Exclusao — Tela', 'Tela do aparelho que apresente mau uso, trincados ou quebrados, riscados, manchados, descolados ou com cabo flex rompido nao fazem parte desta garantia.', 30),

    (v_policy_6m_id, 'customer_responsibility', 'Responsabilidades do Comprador', 'Funcionamento, instalacao e atualizacao de aplicativos, sistema operacional e saude da bateria do aparelho nao fazem parte desta garantia. Limpeza e conservacao do aparelho tambem nao sao cobertos. Qualquer risco, arranhado, marca de queda ou dano que nao havia no aparelho no momento da compra invalida esta garantia. A nao apresentacao deste documento invalida a garantia. Qualquer mau funcionamento apos atualizacoes do sistema operacional ou aplicativos nao faz parte desta garantia.', 40),

    (v_policy_6m_id, 'refund_exchange', 'Processo de Troca e Reembolso', 'Trocas somente serao efetuadas apos analise tecnica dos aparelhos eletronicos pela assistencia tecnica de nossa escolha, com prazo maximo de 30 dias. Caso nao seja possivel a resolucao do problema pela assistencia tecnica apos o prazo de 30 dias, o comprador recebera um novo produto equivalente ao comprado. Apos 30 dias, caso nao seja possivel a troca do produto por outro equivalente, o comprador recebera o reembolso do valor pago (somente o valor original do produto, nao incluindo taxas e juros de parcelamentos).', 50),

    (v_policy_6m_id, 'assistance', 'Assistencia Tecnica', 'A avaliacao e realizada pela assistencia tecnica de escolha da Nobretech. O prazo maximo para resolucao e de 30 dias a partir do acionamento da garantia. Em caso de impossibilidade de resolucao, aplica-se a politica de troca ou reembolso descrita neste termo.', 60);

    RAISE NOTICE 'SEED OK: warranty_policy_terms — 6 termos inseridos para politica Seminovo.';
  ELSE
    RAISE NOTICE 'SEED SKIP: Garantia Nobretech - Seminovo ja existe (id=%).',  v_policy_6m_id;
  END IF;

  -- ---- Politica 3 meses (legado venda nova) ----
  -- active = FALSE: este prazo e o default hardcoded no frontend (warrantyMonths = "3"),
  -- nao uma politica vigente no banco. Registrado aqui para documentar a inconsistencia.
  SELECT id INTO v_policy_3m_id
  FROM warranty_policies
  WHERE company_id = v_company_id
    AND name = 'Garantia Nobretech - Legado Venda Nova'
  LIMIT 1;

  IF v_policy_3m_id IS NULL THEN
    INSERT INTO warranty_policies (
      company_id,
      name,
      product_type,
      product_condition,
      product_origin,
      default_months,
      calculation_mode,
      public_label_template,
      internal_description,
      requires_customer_identification,
      applies_to_sale,
      applies_to_catalog,
      applies_to_portal,
      applies_to_documents,
      active,
      effective_from
    ) VALUES (
      v_company_id,
      'Garantia Nobretech - Legado Venda Nova',
      'device',
      'used',
      NULL,
      3,
      'calendar_months',
      '3 meses de Garantia Nobretech',
      'LEGADO: representa o default atual hardcoded no estado React de vendas/nova/page.tsx (warrantyMonths = "3"). Mantido com active = FALSE para documentar a inconsistencia com a politica de 6 meses do catalogo. DECISAO PENDENTE: quando a politica unica for definida, esta entrada sera revisada. Nao esta integrada em nenhum consumidor.',
      TRUE,
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_policy_3m_id;

    RAISE NOTICE 'SEED OK: warranty_policies — Garantia Nobretech - Legado Venda Nova (3 meses, active=FALSE), id=%', v_policy_3m_id;
  ELSE
    RAISE NOTICE 'SEED SKIP: Garantia Nobretech - Legado Venda Nova ja existe (id=%).' , v_policy_3m_id;
  END IF;

END $$;
