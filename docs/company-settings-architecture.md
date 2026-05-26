# Arquitetura da Central de Configurações — Nobretech ERP

Data: 2026-05-26  
Escopo: modelagem técnica. Este documento não implementa migrations, telas, rotas, refactors, remoção de hardcodes ou alteração de comportamento.

## 1. Objetivo

A Central de Configurações por empresa deve transformar a Nobretech de uma constante espalhada pelo código em uma empresa configurada no ERP. Hoje, valores como nome público, WhatsApp, metadata, garantia, parcelamento, taxa de maquininha, política de catálogo, portal de transparência, documentos e playbooks comerciais aparecem em constantes, textos e regras acopladas a componentes, helpers, APIs e migrations antigas.

O objetivo é criar uma arquitetura onde cada empresa tenha identidade, canais, documentos e políticas próprias, sem quebrar os fluxos atuais da Nobretech. A Nobretech deve virar o primeiro seed real dessas configurações, não a regra universal do sistema.

## 2. Princípios de modelagem

- Configuração crítica não deve ser key/value genérico. Regras financeiras, garantia, portal, catálogo, documentos, estoque, venda, DRE e LGPD exigem tabelas tipadas, campos explícitos, validação e rastreabilidade.
- Regra financeira não pode ter fallback silencioso para Sidepay. Se uma empresa não possui tabela de taxas vigente, o fluxo financeiro deve bloquear ou sinalizar configuração obrigatória ausente.
- Garantia deve ser domínio único. Prazo, cálculo de vencimento, label público, termo legal, documento, portal e ORION devem ler a mesma política versionada.
- Portal público precisa separar segurança, transparência, LGPD e branding. PIN/rate limit, mascaramento, procedência e copy visual são responsabilidades diferentes.
- Catálogo não deve esconder política comercial dentro de mapper. Readiness, publicação, badges, CTA, disponibilidade, parcelas e templates públicos devem vir de política configurada.
- ORION deve consumir contexto de regras configuradas, não promessas hardcoded. IA pode organizar e recomendar, mas não deve inventar garantia, parcelamento, canal ou política comercial.
- Toda política crítica deve ter `company_id`.
- Onde fizer sentido, política deve ter `active`, `effective_from`, `effective_until`, `created_at`, `updated_at`.
- Onde fizer sentido, política deve ser versionável, especialmente garantia, documento, taxa, DRE, portal/LGPD, catálogo e playbooks comerciais.
- Settings simples podem existir para valores básicos, como slogan, Instagram, WhatsApp, cor, logo e copy curta. Eles não substituem políticas tipadas.
- O campo atual `companies.settings` deve ser tratado como legado ou preferências leves, não como motor de regra crítica.

## 3. Mapa de domínios

| Domínio | Problema atual | Risco | Solução proposta | Prioridade |
| --- | --- | --- | --- | --- |
| Empresa / identidade | Nome, slug, metadata e seed Nobretech aparecem como padrão | Marca errada em login, SEO, seed e documentos | Perfil de empresa explícito e seed inicial da Nobretech | Alta |
| Marca / aparência | Logo, favicon, PWA, landing e catálogo usam assets/textos fixos | Multiempresa herda marca Nobretech | `company_brand_profile` com assets, tema e metadata | Alta |
| Contatos / canais | WhatsApp, Instagram e canais comerciais fixos | CTA e vendas apontam para canal errado | `company_contact_channels` e `sales_channels` | Alta |
| Documentos | Recibo, termo e laudo têm dados e termos fixos | Documento oficial incorreto ou juridicamente frágil | Templates versionados e perfil documental | Alta |
| Garantia | 3 meses em venda, 6 meses no catálogo, 30 dias por mês no portal | Divergência operacional e jurídica | `warranty_policies` como fonte única | Crítica |
| Financeiro / parcelamento | Sidepay, 18x, margem e DRE por texto estão no código | Cálculo, DRE e preço público errados | Tabelas de provedores, métodos, parcelas, taxas e mapeamentos DRE | Crítica |
| Portal de transparência | PIN, rate limit, LGPD, procedência e branding misturados | Exposição indevida e promessa pública fixa | Políticas separadas para segurança, transparência, mascaramento e numbering | Crítica |
| Catálogo público | Readiness, publicação, disponibilidade e copy estão no mapper | Produto publicado com política errada | Políticas de publicação, readiness, badges e CTA | Alta |
| Avaliação / estoque | Checklist, score, trade-in e status inicial têm thresholds fixos | Valuation e disponibilidade incorretos | Políticas de avaliação, status e trade-in | Alta |
| IA / ORION / marketing | Garantia, WhatsApp-first, hashtags e playbooks estão hardcoded | IA recomenda promessa não configurada | Contexto de regras e playbooks por empresa | Média/Alta |
| Integrações | Importador e exportações assumem WhatsApp/Nobretech | Dados importados/exportados com origem errada | Configuração de canais, fornecedores e nomes de arquivo | Média |

## 4. Tabelas propostas

### Observação sobre fusões e separações

A lista candidata é adequada, mas alguns limites precisam ser claros:

- `companies.settings` não deve ser removido agora, mas deve ficar fora das regras críticas.
- `company_brand_profile` pode absorver assets simples de marca; só separar `company_brand_assets` se houver histórico/variações por canal.
- `installment_policies` e `payment_fee_tables` devem ser separadas: limite/experiência de parcela não é a mesma coisa que taxa da adquirente.
- `document_templates` e `document_template_versions` devem ficar separados para permitir publicação controlada de novos termos sem sobrescrever histórico.
- `orion_business_rules_context` deve ser materialização/visão operacional das políticas, não uma nova fonte de verdade conflitante.

### Núcleo da empresa

#### `companies`

- Responsabilidade: entidade raiz do tenant/empresa.
- Campos principais: `id`, `name`, `slug`, `plan`, `logo_url` legado, `settings` legado, `created_at`, `updated_at`.
- Relacionamentos: pai de todas as políticas por `company_id`.
- Tipo: entidade núcleo, não setting simples.
- Vigência: não.
- Versionamento: não, exceto via auditoria futura.
- Resolve hardcodes: seed `NOBRETECH STORE`, slug `nobretech-store`, empresa padrão.
- Riscos: usar `settings JSONB` para regra crítica recria o problema de key/value genérico.

#### `company_brand_profile`

- Responsabilidade: identidade visual e metadata pública/interna da empresa.
- Campos principais: `company_id`, `display_name`, `legal_name`, `short_name`, `slogan`, `public_description`, `canonical_domain`, `city`, `state`, `locale`, `primary_color`, `accent_color`, `logo_url`, `favicon_url`, `apple_icon_url`, `og_image_url`, `theme_mode`, `active`, timestamps.
- Relacionamentos: `company_id -> companies.id`.
- Tipo: setting simples estruturado.
- Vigência: opcional.
- Versionamento: opcional.
- Resolve hardcodes: `src/app/layout.tsx`, `src/app/page.tsx`, landing, catálogo shell, favicon, logo, OG.
- Riscos: misturar política comercial no perfil de marca; exemplo: "garantia" e "pronta entrega" não pertencem aqui.

#### `company_contact_channels`

- Responsabilidade: canais oficiais de atendimento e CTA.
- Campos principais: `id`, `company_id`, `channel_type` (`whatsapp`, `instagram`, `email`, `phone`, `site`, `store_address`), `label`, `value`, `url`, `is_primary`, `is_public`, `sort_order`, `active`, timestamps.
- Relacionamentos: `company_id`.
- Tipo: setting simples estruturado.
- Vigência: opcional.
- Versionamento: não inicialmente.
- Resolve hardcodes: WhatsApp `5598988265655`, `@nobretechstore`, email/telefone/endereço de documentos, CTA do catálogo e landing.
- Riscos: permitir múltiplos primários sem validação; expor canal interno no portal público.

#### `company_document_profile`

- Responsabilidade: dados fixos de emissão documental.
- Campos principais: `company_id`, `issuer_name`, `legal_name`, `document_number`, `address_line`, `city`, `state`, `phone`, `email`, `default_seller_name`, `signature_label`, `active`, timestamps.
- Relacionamentos: usado por `document_templates` e geração de recibos/garantia.
- Tipo: política tipada leve.
- Vigência: sim, recomendada.
- Versionamento: sim, por documento emitido ou auditoria.
- Resolve hardcodes: `STORE_NAME`, `STORE_PHONE`, `STORE_EMAIL`, `STORE_ADDRESS`, `DEFAULT_SELLER`.
- Riscos: documento histórico mudar retroativamente se não houver snapshot no momento da venda.

### Garantia / documentos

#### `warranty_policies`

- Responsabilidade: fonte única de prazo, cálculo, cobertura e label de garantia.
- Campos principais: `id`, `company_id`, `name`, `product_type`, `condition`, `origin`, `default_months`, `calculation_mode` (`calendar_months`, `fixed_days`, `manual_dates`), `default_days`, `public_label_template`, `requires_customer_identification`, `applies_to_portal`, `applies_to_catalog`, `active`, `effective_from`, `effective_until`, timestamps.
- Relacionamentos: opcionalmente referenciada por venda, item, catálogo e documento.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: venda `3` meses, catálogo `6` meses, garantia Apple/Nobretech, portal `warranty_months * 30`, labels de garantia, recomendação de cliente identificado.
- Riscos: se não houver snapshot por venda/documento, alteração futura muda interpretação de compras passadas.

#### `warranty_policy_terms`

- Responsabilidade: termos legais/comerciais vinculados a uma política de garantia.
- Campos principais: `id`, `warranty_policy_id`, `term_type`, `title`, `body`, `sort_order`, `is_bold`, `active`, timestamps.
- Relacionamentos: `warranty_policy_id -> warranty_policies.id`.
- Tipo: política tipada.
- Vigência: herdada da policy.
- Versionamento: sim.
- Resolve hardcodes: `WARRANTY_TERMS`, HTML de garantia em helpers, exclusões, troca/reembolso, juros, assistência técnica.
- Riscos: termo mal versionado pode invalidar documento histórico ou expor promessa legal errada.

#### `document_templates`

- Responsabilidade: cadastro lógico de tipos de documento.
- Campos principais: `id`, `company_id`, `template_key` (`receipt`, `warranty_term`, `inspection_report`, `label`), `name`, `scope`, `active`, timestamps.
- Relacionamentos: pai de versões.
- Tipo: política tipada.
- Vigência: não no cadastro; sim na versão.
- Versionamento: via `document_template_versions`.
- Resolve hardcodes: recibo, garantia, laudo e etiqueta com layout/copy Nobretech.
- Riscos: tratar template como HTML livre sem validação pode quebrar PDF ou expor dados sensíveis.

#### `document_template_versions`

- Responsabilidade: conteúdo renderizável e versionado dos documentos.
- Campos principais: `id`, `document_template_id`, `version`, `status` (`draft`, `active`, `retired`), `renderer` (`pdf_js`, `html`, `label`), `content_schema`, `content`, `required_fields`, `effective_from`, `effective_until`, `created_by`, timestamps.
- Relacionamentos: `document_template_id`.
- Tipo: política tipada versionada.
- Vigência: sim.
- Versionamento: obrigatório.
- Resolve hardcodes: cabeçalho de PDF, laudo HTML, termo de garantia, textos de recibo, assinatura.
- Riscos: publicar versão sem preview/teste visual pode quebrar recibo/garantia em produção.

### Financeiro / parcelamento

#### `payment_providers`

- Responsabilidade: adquirentes/provedores de pagamento.
- Campos principais: `id`, `company_id`, `name`, `provider_type` (`sidepay`, `manual`, `bank`, `pix`, `cash`), `settlement_model`, `default_settlement_days`, `active`, timestamps.
- Relacionamentos: pai de tabelas de taxa.
- Tipo: política tipada.
- Vigência: opcional; taxas têm vigência própria.
- Versionamento: não inicialmente.
- Resolve hardcodes: Sidepay como adquirente implícita.
- Riscos: misturar provedor com método ou com taxa dificulta D+1 e conciliação.

#### `payment_methods`

- Responsabilidade: métodos aceitos pela empresa.
- Campos principais: `id`, `company_id`, `provider_id`, `method_key`, `label`, `method_type` (`cash`, `pix`, `debit`, `credit`, `transfer`, `trade_in_credit`, `other`), `is_financial`, `requires_receivable`, `sort_order`, `active`.
- Relacionamentos: `provider_id`, usado por vendas, catálogo e financeiro.
- Tipo: política tipada.
- Vigência: opcional.
- Versionamento: opcional.
- Resolve hardcodes: `PAYMENT_METHODS`, `credit_1x` a `credit_18x`, labels de pagamento, `trade_in_credit`.
- Riscos: trocar key sem migração quebra histórico de venda.

#### `installment_policies`

- Responsabilidade: experiência de parcelamento permitida.
- Campos principais: `id`, `company_id`, `payment_method_id`, `scope` (`internal_sale`, `public_catalog`, `campaign`), `max_installments`, `min_installment_amount`, `default_installment_count`, `customer_fee_responsibility`, `settlement_behavior` (`d_plus_1`, `per_installment`, `manual`), `active`, `effective_from`, `effective_until`.
- Relacionamentos: `payment_method_id`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: máximo 18x, default de parcelas do catálogo, texto "inclui acréscimo da maquininha", D+1/recebimento.
- Riscos: confundir parcelamento do cliente com recebimento da empresa, violando a separação caixa vs recebíveis.

#### `payment_fee_tables`

- Responsabilidade: cabeçalho/versionamento de tabela de taxas.
- Campos principais: `id`, `company_id`, `provider_id`, `name`, `fee_responsibility` (`customer_passed_through`, `merchant_absorbed`, `mixed`), `precision`, `active`, `effective_from`, `effective_until`, `created_by`, timestamps.
- Relacionamentos: `provider_id`, filhos em `payment_fee_table_items`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: `SIDEPAY_FEE_PCTS`, `LEGACY_SIDEPAY_FEE_PCTS`, defaults em `financial_settings`.
- Riscos: fallback silencioso para tabela antiga gera preço, lucro e DRE errados.

#### `payment_fee_table_items`

- Responsabilidade: linhas de taxa por método/parcela.
- Campos principais: `id`, `payment_fee_table_id`, `payment_method_id`, `installment_count`, `fee_pct`, `fixed_fee_amount`, `calculation_mode` (`markup_to_net`, `discount_from_gross`, `fixed`), `rounding_mode`.
- Relacionamentos: `payment_fee_table_id`, `payment_method_id`.
- Tipo: política tipada.
- Vigência: herdada da tabela.
- Versionamento: via tabela pai.
- Resolve hardcodes: percentuais de pix, débito, crédito 1x-18x.
- Riscos: modo de cálculo errado inverte taxa repassada e taxa absorvida.

#### `financial_category_mappings`

- Responsabilidade: mapear categorias/métodos/eventos para plano financeiro e DRE.
- Campos principais: `id`, `company_id`, `source_type`, `source_key`, `chart_account_id`, `dre_section`, `affects_cash`, `affects_dre`, `active`, `effective_from`, `effective_until`.
- Relacionamentos: contas financeiras/DRE existentes.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: categorias "Taxa de maquininha", "Juros de parcelamento", "Taxas bancárias", "Frete / entrega".
- Riscos: DRE por texto duplica ou classifica receita/despesa incorretamente.

### Portal público

#### `public_portal_settings`

- Responsabilidade: branding e comportamento público geral do portal.
- Campos principais: `company_id`, `portal_enabled`, `brand_title`, `intro_copy`, `support_channel_id`, `allow_receipt_download`, `allow_warranty_download`, `show_assistance`, `show_provenance`, `active`, timestamps.
- Relacionamentos: `company_id`, `support_channel_id`.
- Tipo: setting simples estruturado.
- Vigência: opcional.
- Versionamento: opcional.
- Resolve hardcodes: "NOBRETECH STORE", "Compra verificada", "Ambiente seguro", suporte do portal.
- Riscos: misturar com segurança/LGPD e perder governança.

#### `public_portal_security_policies`

- Responsabilidade: PIN, token, tentativas e rate limit.
- Campos principais: `id`, `company_id`, `token_prefix`, `pin_length`, `max_failed_attempts`, `lock_minutes`, `intro_ip_limit`, `verify_ip_limit`, `verify_token_limit`, `window_seconds`, `active`, `effective_from`, `effective_until`.
- Relacionamentos: `company_id`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: `ntcv_`, 6 dígitos, 5 tentativas, lock 15 min, 30/min, 10/min, 5/min.
- Riscos: política frouxa expõe dados; política agressiva bloqueia cliente legítimo.

#### `transparency_policies`

- Responsabilidade: textos e regras de procedência pública.
- Campos principais: `id`, `company_id`, `origin_type`, `public_description`, `origin_label`, `technical_status_label`, `privacy_note`, `show_supplier_publicly`, `show_previous_owner_masked`, `active`, `effective_from`, `effective_until`.
- Relacionamentos: `company_id`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: procedência trade-in/fornecedor/lacrado/desconhecido, política interna Nobretech, mensagens LGPD.
- Riscos: expor fornecedor ou dono anterior além do permitido.

#### `privacy_masking_policies`

- Responsabilidade: regras de mascaramento de CPF, nome, IMEI, serial, telefone e dados sensíveis.
- Campos principais: `id`, `company_id`, `field_type`, `mask_strategy`, `visible_prefix`, `visible_suffix`, `min_length`, `replacement_char`, `active`, timestamps.
- Relacionamentos: `company_id`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: CPF `***.xxx.xxx-**`, nomes com asteriscos, IMEI/serial final 4.
- Riscos: vazamento LGPD ou mascaramento inútil.

#### `purchase_numbering_policies`

- Responsabilidade: prefixos e formatos de números públicos.
- Campos principais: `id`, `company_id`, `number_type` (`sale`, `portal`, `receipt`, `warranty`), `prefix`, `format`, `sequence_mode`, `active`, timestamps.
- Relacionamentos: `company_id`.
- Tipo: política tipada leve.
- Vigência: opcional.
- Versionamento: opcional.
- Resolve hardcodes: `NT-XXXXXXXX`, nomes de arquivos e prefixos de recibo.
- Riscos: colisão de número público ou quebra de rastreabilidade.

### Catálogo público

#### `catalog_settings`

- Responsabilidade: configuração geral da vitrine pública.
- Campos principais: `company_id`, `catalog_enabled`, `canonical_url`, `title`, `description`, `default_og_image_url`, `max_products`, `default_availability_label`, `active`.
- Relacionamentos: `company_id`.
- Tipo: setting simples estruturado.
- Vigência: opcional.
- Versionamento: não inicialmente.
- Resolve hardcodes: canonical, título, descrição, limite 200, "Pronta entrega".
- Riscos: colocar readiness crítica aqui em vez de policy.

#### `catalog_publication_policies`

- Responsabilidade: regras para publicar/despublicar produtos.
- Campos principais: `id`, `company_id`, `product_type`, `condition`, `requires_public_price`, `requires_real_photo`, `requires_review`, `requires_included_items`, `allowed_inventory_statuses`, `workflow`, `active`, `effective_from`, `effective_until`.
- Relacionamentos: `company_id`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: seminovo só publica com foto real/review/itens, status `published`/`draft`, preço obrigatório.
- Riscos: produto sensível ir ao público sem conferência.

#### `catalog_readiness_rules`

- Responsabilidade: critérios de bloqueio/aviso antes da publicação.
- Campos principais: `id`, `catalog_publication_policy_id`, `rule_key`, `severity` (`block`, `warning`), `threshold_operator`, `threshold_value`, `message`, `active`.
- Relacionamentos: `catalog_publication_policy_id`.
- Tipo: política tipada.
- Vigência: herdada da policy.
- Versionamento: via policy.
- Resolve hardcodes: defeito `<= 5`, "Adicione pelo menos uma imagem", warning de lacrado com imagem padrão.
- Riscos: duplicar regra da policy pai; mensagens divergirem da validação real.

#### `catalog_trust_badges`

- Responsabilidade: badges públicos de confiança.
- Campos principais: `id`, `company_id`, `label`, `icon_key`, `description`, `sort_order`, `show_on_catalog`, `show_on_product`, `active`.
- Relacionamentos: `company_id`.
- Tipo: setting simples estruturado.
- Vigência: opcional.
- Versionamento: não.
- Resolve hardcodes: "Fotos reais", "Garantia", "Pronta entrega", "WhatsApp", "Procedência verificada".
- Riscos: badge prometer algo que a policy não garante.

#### `catalog_cta_settings`

- Responsabilidade: CTAs e mensagens do catálogo.
- Campos principais: `company_id`, `primary_channel_id`, `cta_label`, `product_message_template`, `generic_message_template`, `share_text_template`, `active`.
- Relacionamentos: `company_id`, `company_contact_channels`.
- Tipo: setting simples estruturado.
- Vigência: opcional.
- Versionamento: opcional.
- Resolve hardcodes: "Falar no WhatsApp", mensagem "vi no catálogo da Nobretech".
- Riscos: template usar campos não disponíveis ou canal inativo.

#### `product_public_copy_templates`

- Responsabilidade: fallback de descrição pública por tipo/condição.
- Campos principais: `id`, `company_id`, `product_type`, `condition`, `template_key`, `body_template`, `active`, timestamps.
- Relacionamentos: `company_id`.
- Tipo: política tipada leve.
- Vigência: opcional.
- Versionamento: sim, recomendado.
- Resolve hardcodes: "Produto lacrado de fábrica...", "Unidade selecionada pela Nobretech...".
- Riscos: copy pública contradizer garantia ou disponibilidade.

### Comercial / estoque

#### `sales_channels`

- Responsabilidade: canais/origens de venda e CRM.
- Campos principais: `id`, `company_id`, `channel_key`, `label`, `channel_type`, `is_default`, `is_public`, `active`, `sort_order`.
- Relacionamentos: `company_id`.
- Tipo: política tipada leve.
- Vigência: opcional.
- Versionamento: não inicialmente.
- Resolve hardcodes: WhatsApp, Instagram, OLX, tráfego pago, indicação, loja física, default `whatsapp`.
- Riscos: vendas novas sem canal ou canal antigo quebrando relatório.

#### `packaging_types`

- Responsabilidade: tipos de embalagem por empresa.
- Campos principais: `id`, `company_id`, `packaging_key`, `label`, `public_label`, `requires_notes`, `is_default`, `active`.
- Relacionamentos: `company_id`.
- Tipo: política tipada leve.
- Vigência: opcional.
- Versionamento: opcional.
- Resolve hardcodes: "Caixa Nobretech", "Caixa original", "Sem caixa".
- Riscos: portal/documento mostrar embalagem errada.

#### `sales_customer_policies`

- Responsabilidade: regras de identificação de cliente por tipo de venda/produto.
- Campos principais: `id`, `company_id`, `product_type`, `sale_type`, `requires_customer`, `allows_walk_in`, `requires_cpf`, `portal_allowed`, `warranty_allowed`, `warning_message`, `active`, `effective_from`, `effective_until`.
- Relacionamentos: `company_id`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: venda avulsa, cliente identificado recomendado para aparelho, portal/garantia.
- Riscos: permitir venda sem dados quando garantia/portal exige identificação.

#### `inventory_status_policies`

- Responsabilidade: disponibilidade operacional e status inicial.
- Campos principais: `id`, `company_id`, `status_key`, `label`, `lifecycle_group`, `is_sellable`, `is_public_catalog_eligible`, `initial_for_origin`, `active`.
- Relacionamentos: `company_id`.
- Tipo: política tipada.
- Vigência: opcional.
- Versionamento: opcional.
- Resolve hardcodes: `active`, `in_stock`, `pending`, `sold`, `returned`, `under_repair`, `trade_in_received`, status inicial.
- Riscos: item indisponível virar vendável/publicável.

#### `product_evaluation_policies`

- Responsabilidade: checklist, score e escala de condição.
- Campos principais: `id`, `company_id`, `product_type`, `metric_key`, `label`, `weight`, `min_score`, `max_score`, `public_label_rules`, `defect_threshold`, `active`, `effective_from`, `effective_until`.
- Relacionamentos: `company_id`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: checklist iPhone, score 0-10, labels de tela/bateria/câmera/áudio, defeito `<= 5`.
- Riscos: score público não refletir avaliação técnica real.

#### `trade_in_valuation_policies`

- Responsabilidade: precificação de recebimento/trade-in.
- Campos principais: `id`, `company_id`, `product_type`, `grade`, `grade_factor`, `battery_min`, `battery_max`, `battery_factor`, `manual_override_allowed`, `rounding_unit`, `suggested_range_min_pct`, `suggested_range_max_pct`, `active`, `effective_from`, `effective_until`.
- Relacionamentos: `company_id`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: fatores A+/B, bateria 95/90/85/80/70, default 0.7, base 0.8, range 92%-108%, arredondamento para 10.
- Riscos: avaliação errada afeta margem, estoque e negociação.

### IA / marketing

#### `company_ai_profile`

- Responsabilidade: identidade, tom e limites gerais da IA por empresa.
- Campos principais: `company_id`, `assistant_name`, `tone`, `forbidden_claims`, `allowed_domains`, `public_brand_summary`, `active`, timestamps.
- Relacionamentos: `company_id`.
- Tipo: setting simples estruturado.
- Vigência: opcional.
- Versionamento: opcional.
- Resolve hardcodes: "Nobretech" em ORION e respostas executivas.
- Riscos: IA usar tom/copy incompatível com políticas comerciais.

#### `marketing_playbooks`

- Responsabilidade: campanhas, hashtags, canais, argumentos e templates de divulgação.
- Campos principais: `id`, `company_id`, `name`, `channel_key`, `goal`, `copy_guidelines`, `hashtags`, `cta_template`, `warranty_claim_policy`, `active`, `effective_from`, `effective_until`.
- Relacionamentos: `sales_channels`, `company_contact_channels`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: WhatsApp-first, Meta Ads, hashtags Nobretech/Apple/iPhone, copy de garantia.
- Riscos: campanha prometer garantia/parcelamento não vigente.

#### `sales_playbooks`

- Responsabilidade: argumentos e scripts comerciais por canal/produto/contexto.
- Campos principais: `id`, `company_id`, `channel_key`, `product_type`, `scenario`, `script_template`, `objection_handlers`, `allowed_promises`, `active`, `effective_from`, `effective_until`.
- Relacionamentos: `sales_channels`, `warranty_policies`, `installment_policies`.
- Tipo: política tipada.
- Vigência: sim.
- Versionamento: sim.
- Resolve hardcodes: mensagens de lead, pronta entrega, parcelamento, garantia Nobretech.
- Riscos: vendedor/ORION usar promessa sem base operacional.

#### `orion_business_rules_context`

- Responsabilidade: contexto resolvido para ORION consumir regras sem hardcode.
- Campos principais: `id`, `company_id`, `context_version`, `source_policy_refs`, `summary_json`, `active`, `generated_at`, `expires_at`.
- Relacionamentos: referências às policies vigentes.
- Tipo: materialização de políticas, não fonte primária.
- Vigência: curta/cache.
- Versionamento: sim, por geração.
- Resolve hardcodes: `execution-payload`, `strategic-copilot`, `orion-client` com garantias/canais/promessas fixas.
- Riscos: se virar fonte manual, ORION diverge das regras reais.

## 5. Estratégia de fallback

Fallback permitido:

- Identidade visual opcional: cor, slogan, favicon alternativo, imagem OG genérica.
- Textos não críticos de UI administrativa, quando não afetam cliente, dinheiro, garantia, portal ou documento.
- Preferências leves que podem usar defaults seguros e neutros, sem marca Nobretech.

Fallback proibido:

- Financeiro, parcelamento, taxas, DRE e categorias financeiras.
- Garantia, termos, documentos oficiais e cálculo de vencimento.
- Portal público: PIN, rate limit, LGPD, mascaramento, procedência e downloads.
- Publicação de catálogo, readiness, disponibilidade, preço público e promessa de entrega.
- Venda: política de cliente, brinde, trade-in, caixa/embalagem quando aparece em documento/portal.
- ORION quando a resposta cita garantia, parcelas, taxa, canal, política comercial, procedência ou financeiro.

Seed inicial da Nobretech:

1. Criar registros tipados para a Nobretech com os valores atuais, sem mudar comportamento.
2. Marcar políticas críticas como `active = true` e `effective_from` no dia da migração.
3. Registrar versão inicial de garantia, documento, taxa, portal e catálogo.
4. Gerar snapshots nos documentos/vendas futuras quando a regra impactar histórico.

Como evitar constante financeira hardcoded em produção:

- Fluxos financeiros devem chamar resolvedor de configuração obrigatória.
- Se não houver `payment_fee_tables` vigente, retornar erro operacional de configuração ausente.
- Sidepay pode existir apenas como seed da Nobretech ou fixture de teste, nunca como fallback global.
- Build/test pode manter fixtures explícitas com nomes de teste, mas não pode usá-las em runtime autenticado.

Empresa sem configuração obrigatória:

- Em tela administrativa: mostrar checklist de configuração incompleta.
- Em API crítica: bloquear com erro claro, por exemplo `CONFIGURATION_REQUIRED`.
- Em rota pública: ocultar ação que depende da política ou retornar indisponibilidade controlada.

Configurações opcionais:

- Podem cair em defaults neutros: sem slogan, sem Instagram, cor padrão do sistema, CTA genérico interno.
- Nunca devem injetar "Nobretech" como default para outra empresa.

## 6. Ordem de implementação recomendada

### Fase 1: Empresa, marca, contatos e documento básico

- Por que vem nessa ordem: reduz hardcodes públicos de baixo risco operacional e cria base para todas as outras policies.
- Módulos futuramente afetados: `src/app/layout.tsx`, `src/app/page.tsx`, landing, `CatalogShell`, `label-utils`, `sale-documents`, login/Clerk copy.
- Riscos a testar: metadata por domínio, assets ausentes, telefone/WhatsApp inválido, documentos usando perfil errado.
- Hardcodes eliminados: nome Nobretech, WhatsApp, Instagram, favicon/logo, domínio, endereço, email, vendedor default.

### Fase 2: Garantia e documentos versionados

- Por que vem nessa ordem: garantia está fragmentada e afeta venda, portal, catálogo e documentos.
- Módulos futuramente afetados: `src/lib/sale-documents.ts`, `src/lib/helpers.ts`, `src/lib/catalog/warranty.ts`, `src/lib/public-purchase-access.ts`, venda nova, detalhes da venda, portal.
- Riscos a testar: 3 vs 6 meses, cálculo de mês civil vs dias fixos, documento histórico, PDF, portal e labels públicos.
- Hardcodes eliminados: `warrantyMonths = "3"`, `DEFAULT_USED_WARRANTY_MONTHS = 6`, `warranty_months * 30`, termos fixos.

### Fase 3: Financeiro, parcelamento, taxas e DRE

- Por que vem nessa ordem: maior risco de dinheiro; só deve vir depois da base de empresa e garantia.
- Módulos futuramente afetados: `src/lib/constants.ts`, `financeiro/taxas`, venda nova, catálogo pricing, DRE, extrato, relatórios, `sale-payments`.
- Riscos a testar: receita duplicada, taxa repassada vs absorvida, D+1, recebíveis, DRE por ID e não texto, ausência de tabela vigente.
- Hardcodes eliminados: Sidepay global, 18x fixo, margem 15%, categorias financeiras por label, copy de acréscimo.

### Fase 4: Portal público, segurança, LGPD e transparência

- Por que vem nessa ordem: depende de garantia/documentos e tem risco público/LGPD.
- Módulos futuramente afetados: `public-purchase-access`, APIs do portal, página `compra-verificada`, rate limit, helpers de mascaramento.
- Riscos a testar: PIN, lockout, rate limit, dados mascarados, dono anterior, fornecedor, downloads e venda avulsa.
- Hardcodes eliminados: `ntcv_`, PIN 6, tentativas, lock 15 min, textos de procedência/LGPD, prefixo `NT`.

### Fase 5: Catálogo, publicação e readiness

- Por que vem nessa ordem: catálogo público depende de marca, garantia, parcelamento e portal/CTA.
- Módulos futuramente afetados: `catalog/queries`, `catalog/readiness`, `catalog/pricing`, APIs de publicação, componentes públicos do catálogo.
- Riscos a testar: seminovo sem foto real, status vendável, preço público, promoção, parcelamento, readiness e SEO.
- Hardcodes eliminados: foto real/review/itens obrigatórios, status `active/in_stock`, defeito `<= 5`, limite 200, "Pronta entrega".

### Fase 6: ORION, marketing e playbooks comerciais

- Por que vem nessa ordem: IA deve consumir regras já resolvidas, não ser a primeira fonte.
- Módulos futuramente afetados: `orion/execution-payload`, `strategic-copilot`, `orion-client`, `marketing/copy-generator`, divulgação.
- Riscos a testar: ORION citar garantia/parcelamento incorreto, recomendar canal inativo, inventar campanha, confundir caixa real/recebível.
- Hardcodes eliminados: WhatsApp-first, Meta Ads, garantia Nobretech, hashtags, scripts de lead e promessas comerciais.

## 7. Contrato de resolução de configuração

Função conceitual, sem implementação nesta etapa:

```ts
resolveCompanySettings(companyId, domain)
```

Entrada:

- `companyId`: empresa autenticada ou resolvida por domínio público.
- `domain`: domínio lógico, por exemplo `brand`, `contacts`, `warranty`, `documents`, `payments`, `portal`, `catalog`, `inventory`, `ai`.
- Contexto opcional futuro: data de vigência, canal, produto, condição, tipo de documento, rota pública/interna.

Saída:

- Configuração tipada e validada para o domínio.
- Referências de versão/policy usadas.
- Metadados: `effective_from`, `effective_until`, `source`, `is_complete`, `warnings`.

Erros esperados:

- `COMPANY_NOT_FOUND`
- `CONFIGURATION_REQUIRED`
- `CONFIGURATION_INACTIVE`
- `CONFIGURATION_EXPIRED`
- `CONFIGURATION_CONFLICT`
- `CONFIGURATION_UNSAFE_FOR_PUBLIC_USE`

Comportamento quando config obrigatória não existe:

- API crítica retorna erro operacional claro.
- UI interna mostra bloqueio/configuração pendente.
- Rota pública não deve inventar fallback Nobretech; deve ocultar ação ou retornar indisponibilidade.

Config pública vs interna:

- Pública: somente campos seguros para cliente, sem custos, fornecedor sensível, taxa interna, documento bruto ou regras administrativas.
- Interna: pode incluir políticas operacionais, mas sempre filtrada por permissão.

Cache possível:

- Cache por `companyId + domain + version/effective date`.
- TTL curto para público e financeiro.
- Invalidação por alteração de policy.
- ORION pode consumir materialização (`orion_business_rules_context`) com expiração.

Segurança:

- Resolver por `companyId` do auth context em APIs internas.
- Resolver por domínio/slug público em rotas públicas.
- Nunca aceitar `companyId` arbitrário do client sem autorização.

Uso em SSR/API/client:

- SSR público: resolver brand/catálogo/portal por domínio.
- API interna: resolver políticas pelo auth context.
- Client: receber apenas DTO já filtrado; não consultar tabela crítica diretamente.

## 8. Matriz de migração futura

| Hardcode atual | Arquivo atual | Tabela futura | Campo futuro | Prioridade | Risco | Fase de migração |
| --- | --- | --- | --- | --- | --- | --- |
| "Nobretech Store" metadata | `src/app/layout.tsx`, `src/app/page.tsx` | `company_brand_profile` | `display_name`, `public_description`, `canonical_domain` | Alta | Marca/SEO errado | Fase 1 |
| WhatsApp `5598988265655` | `landing`, `catalog/whatsapp.ts` | `company_contact_channels` | `channel_type`, `url`, `value` | Alta | Cliente chama canal errado | Fase 1 |
| `STORE_NAME`, telefone, email, endereço | `src/lib/sale-documents.ts` | `company_document_profile` | `issuer_name`, `phone`, `email`, `address_line` | Alta | Documento oficial errado | Fase 1 |
| Garantia venda 3 meses | `vendas/nova/page.tsx` | `warranty_policies` | `default_months` | Crítica | Obrigação comercial errada | Fase 2 |
| Garantia catálogo 6 meses | `src/lib/catalog/warranty.ts` | `warranty_policies` | `public_label_template`, `default_months` | Crítica | Promessa pública divergente | Fase 2 |
| Garantia `months * 30` | `src/lib/public-purchase-access.ts` | `warranty_policies` | `calculation_mode`, `default_days` | Crítica | Data de vencimento errada | Fase 2 |
| Termos de garantia fixos | `src/lib/sale-documents.ts`, `src/lib/helpers.ts` | `warranty_policy_terms` | `body`, `sort_order` | Crítica | Risco legal/documental | Fase 2 |
| Tabela Sidepay | `src/lib/constants.ts` | `payment_fee_tables` | `name`, `fee_responsibility` | Crítica | Preço/lucro/DRE errado | Fase 3 |
| Taxas por parcela | `src/lib/constants.ts` | `payment_fee_table_items` | `installment_count`, `fee_pct`, `calculation_mode` | Crítica | Cálculo financeiro errado | Fase 3 |
| Máximo 18x | `catalog/pricing.ts`, `catalog/publications/route.ts` | `installment_policies` | `max_installments` | Crítica | Parcelamento indevido | Fase 3 |
| Categorias DRE por texto | `financeiro/dre/page.tsx`, `extrato/page.tsx` | `financial_category_mappings` | `chart_account_id`, `dre_section` | Crítica | DRE incorreto | Fase 3 |
| Token prefix `ntcv_` | `public-purchase-access.ts` | `public_portal_security_policies` | `token_prefix` | Alta | Identidade/segurança fixa | Fase 4 |
| PIN 6, 5 tentativas, 15 min | `public-purchase-access.ts` | `public_portal_security_policies` | `pin_length`, `max_failed_attempts`, `lock_minutes` | Crítica | Acesso inseguro/bloqueio | Fase 4 |
| Procedência e LGPD | `public-purchase-access.ts` | `transparency_policies` | `public_description`, `privacy_note` | Crítica | Exposição pública indevida | Fase 4 |
| Mascaramento CPF/nome/IMEI | `public-purchase-access.ts`, portal | `privacy_masking_policies` | `mask_strategy`, `visible_suffix` | Crítica | LGPD | Fase 4 |
| Catálogo exige foto/review/itens | `catalog/queries.ts`, `catalog/readiness.ts` | `catalog_publication_policies` | `requires_real_photo`, `requires_review`, `requires_included_items` | Alta | Publicação insegura | Fase 5 |
| Defeito `<= 5` | `catalog/readiness.ts` | `catalog_readiness_rules` | `threshold_value`, `severity` | Alta | Produto bloqueado/liberado errado | Fase 5 |
| "Pronta entrega" | `catalog/queries.ts`, componentes catálogo | `catalog_settings` | `default_availability_label` | Média | Promessa operacional errada | Fase 5 |
| Badges "Fotos reais/Garantia/WhatsApp" | `catalog-trust-cards.tsx` | `catalog_trust_badges` | `label`, `icon_key` | Média | Promessa pública fixa | Fase 5 |
| Canais de venda | `vendas/nova/page.tsx` | `sales_channels` | `channel_key`, `label`, `is_default` | Alta | Relatório/CRM errado | Fase 1/6 |
| Caixa Nobretech | `vendas/nova/page.tsx`, portal | `packaging_types` | `packaging_key`, `public_label` | Média | Documento/portal errado | Fase 1/4 |
| Trade-in factors | `src/lib/helpers.ts` | `trade_in_valuation_policies` | `grade_factor`, `battery_factor`, `rounding_unit` | Alta | Margem e compra erradas | Após Fase 5 |
| ORION garantia/WhatsApp | `orion/execution-payload.ts`, `orion-client.tsx` | `orion_business_rules_context` | `summary_json`, `source_policy_refs` | Alta | IA promete regra inexistente | Fase 6 |
| Hashtags Nobretech | `marketing/copy-generator.ts` | `marketing_playbooks` | `hashtags`, `copy_guidelines` | Média | Marketing fixo | Fase 6 |

## 9. Impacto na interface futura

A futura Central de Configurações deve ter áreas separadas por risco e domínio:

- Empresa: nome, slug, plano, dados básicos e checklist de configuração.
- Marca e aparência: logo, favicon, cores, domínio, metadata, OG e identidade pública.
- Canais de atendimento: WhatsApp, Instagram, email, telefone, endereço, canais públicos e internos.
- Documentos: perfil documental, templates, versões, preview e publicação controlada.
- Garantia: políticas por tipo/condição/origem, termos, vigência, labels públicos e testes de data.
- Financeiro e parcelamento: provedores, métodos, parcelas, taxas vigentes, responsabilidade da taxa, D+1, mapeamentos DRE.
- Portal de transparência: habilitação, PIN, rate limit, downloads, suporte, procedência, LGPD e mascaramento.
- Catálogo público: SEO, CTA, badges, readiness, regras de publicação, disponibilidade e copy fallback.
- Estoque e avaliação: status vendáveis, checklist, score público, trade-in e regras de entrada.
- IA e marketing: perfil da IA, playbooks, canais permitidos, templates de campanha e contexto ORION.
- Integrações: fornecedor/importador, exports, nomes de arquivo, canais externos e defaults de ambiente.

A interface deve separar claramente "settings simples" de "políticas críticas". Políticas críticas precisam de status, vigência, versão, preview/teste e aviso de impacto antes de publicar.

## 10. Decisões críticas pendentes

- Garantia padrão de usados será 3 ou 6 meses?
- Garantia por produto deve sobrescrever garantia por empresa?
- Garantia por condição/origem deve valer para catálogo, venda, documento e portal do mesmo jeito?
- Cálculo de garantia será por meses civis, dias fixos ou datas manuais?
- Parcelamento máximo é por empresa, canal, produto ou campanha?
- Taxa da maquininha é sempre repassada ao cliente?
- D+1 vale para todos os pagamentos de cartão, todas as adquirentes e todos os parcelamentos?
- O ERP deve bloquear venda quando não houver tabela de taxa vigente?
- Portal de transparência será obrigatório para toda venda de aparelho?
- Venda avulsa pode gerar garantia e documento público para aparelho?
- Produto seminovo sempre exigirá foto real?
- Produto seminovo sempre exigirá avaliação comercial completa?
- Fornecedor parceiro deve aparecer como procedência pública ou permanecer sempre oculto?
- Quais dados de dono anterior podem aparecer mascarados?
- ORION pode sugerir campanhas com garantia/parcelamento automaticamente?
- ORION pode citar taxa, parcela e D+1 ou deve apenas referenciar condições configuradas?
- `companies.settings` será mantido apenas para preferências leves ou deprecado formalmente?

## 11. Recomendação final

Recomendo avançar primeiro para migrations da **Fase 1**, com cuidado para criar apenas base de empresa, marca, contatos e perfil documental. Essa fase reduz hardcodes públicos e prepara o resolvedor sem tocar ainda nos cálculos financeiros, garantia operacional, portal ou catálogo.

Antes de migrar Fase 2 e Fase 3, é importante decidir a regra única de garantia e a política de taxas/parcelamento. Sem essas decisões, o risco é só mover o hardcode de lugar. A arquitetura deve manter a Nobretech como seed configurado e bloquear fluxos críticos quando a configuração obrigatória estiver ausente.

## Observações

- A auditoria mostrou uma inconsistência relevante: garantia aparece como 3 meses na venda, 6 meses no catálogo e `warranty_months * 30` dias no portal. Isso deve ser resolvido antes de qualquer UI da central prometer "garantia configurável".
- O schema atual já possui `companies.settings JSONB` e `financial_settings`, mas ambos são insuficientes para políticas críticas versionadas. Eles podem servir como ponte, não como desenho final.
- `financial_settings` hoje mistura margem, taxas e garantia padrão. A modelagem futura deve separar garantia, tabela de taxa, política de parcelamento e mapeamento financeiro.
