# Auditoria de hardcodes para Central de Configurações

Data: 2026-05-26  
Escopo: Etapa 1, apenas mapeamento. Nenhum comportamento, texto, cálculo, migration ou tela foi alterado.

Esta auditoria identifica pontos em que a Nobretech aparece como verdade fixa no código ou onde regras operacionais estão acopladas a constantes, textos, thresholds e fallbacks. A recomendação geral é tratar a Nobretech como uma empresa configurada, com políticas e mensagens versionáveis por empresa.

Legenda:

- **Tabela tipada**: regra/política com estrutura, histórico, validação, escopo por empresa, vigência, auditoria ou relacionamento.
- **Setting simples**: valor único por empresa/ambiente, sem necessidade inicial de histórico complexo.

## Identidade da empresa

| Arquivo | Trecho ou valor encontrado | Tipo de hardcode | Criticidade | Impacto | Sugestão de configuração futura | Modelo |
| --- | --- | --- | --- | --- | --- | --- |
| `src/app/layout.tsx:34-60` | "Entrar na Nobretech Store", `metadataBase`, título e descrição pública | Marca, domínio e copy institucional | MÉDIO | Login, SEO e compartilhamento ficam presos à Nobretech e São Luís | `company_brand_profile`: nome público, domínio canônico, descrição curta, cidade e locale | Tabela tipada |
| `src/app/page.tsx:4-18` | Metadata da home com "Nobretech Store" e "São Luís" | Metadata pública | MÉDIO | Multiempresa herdaria SEO e promessa comercial da Nobretech | Perfil público por empresa/tenant com metadata por rota | Tabela tipada |
| `src/lib/db.ts:106-114` | Seed cria `NOBRETECH STORE` e slug `nobretech-store` | Empresa padrão/seed | MÉDIO | Ambientes novos nascem com identidade fixa | Seed parametrizado por variáveis ou fixture de tenant inicial | Setting simples |
| `src/lib/sale-documents.ts:60-64` | `STORE_NAME`, telefone, email, endereço e vendedor default | Identidade legal/comercial em documento | CRÍTICO | Recibo e termo de garantia podem sair com dados errados em outra empresa | `company_document_profile` com razão/nome, contato, endereço, vendedor/emissor padrão | Tabela tipada |
| `src/components/landing/nobretech-landing-page.tsx:459-649` | Nome da marca, fundador, slogan e Instagram fixos | Identidade pública | MÉDIO | Landing não pode ser reutilizada por outra empresa sem trocar código | Conteúdo institucional versionado por empresa | Tabela tipada |
| `src/components/layout/sidebar.tsx:146,213,386,747` | `NobretechLogoMark` e marca fixa na navegação | Identidade interna | MÉDIO | ERP multiempresa exibiria marca operacional errada | Logo/nome curto por empresa no shell autenticado | Setting simples |

## Marca e aparência

| Arquivo | Trecho ou valor encontrado | Tipo de hardcode | Criticidade | Impacto | Sugestão de configuração futura | Modelo |
| --- | --- | --- | --- | --- | --- | --- |
| `public/logo-nobretech.png`, `src/app/favicon.ico`, `src/app/icon.png`, `public/favicon.ico`, `public/icon.svg`, `public/apple-touch-icon.png` | Assets da Nobretech usados como favicon/logo | Asset de marca | MÉDIO | Favicon, PWA e documentos continuam Nobretech | `company_brand_assets`: logo, favicon, apple icon, OG image | Tabela tipada |
| `src/app/layout.tsx:74-87` | Lista fixa de ícones e `appleWebApp.title` | PWA/brand metadata | MÉDIO | Instalável/mobile fica preso à Nobretech | Manifest/icons resolvidos por tenant/domínio | Tabela tipada |
| `src/components/catalog/catalog-shell.tsx:18-41` | `NOBRETECH`, "Store · Catálogo oficial" e escudo visual | Marca do catálogo | MÉDIO | Catálogo público não troca identidade por empresa | Header público parametrizado por perfil de marca | Setting simples |
| `src/components/catalog/catalog-shell.tsx:58-60` | "Nobretech Store · São Luís, MA" e entrega presencial | Rodapé público | MÉDIO | Cidade e promessa de entrega ficam incorretas | Rodapé público por empresa com localidade e canais | Setting simples |
| `src/components/landing/nobretech-landing-page.tsx:117-171` | Cards "Garantia Nobretech", curadoria, atendimento, fundador | Proposta de valor fixa | MÉDIO | Mensagens comerciais não refletem outra operação | Blocos de valor/prova configuráveis por empresa | Tabela tipada |
| `src/components/landing/nobretech-landing-page.tsx:213-250,360-438` | Paleta, imagens de produto e narrativa Apple fixa | Aparência e posicionamento | BAIXO | Marca visual não se adapta a outros nichos | Tema visual público e imagens hero por empresa/campanha | Tabela tipada |

## Vitrine pública / catálogo

| Arquivo | Trecho ou valor encontrado | Tipo de hardcode | Criticidade | Impacto | Sugestão de configuração futura | Modelo |
| --- | --- | --- | --- | --- | --- | --- |
| `src/app/catalogo/page.tsx:11-34` | URL e descrição do catálogo Nobretech | SEO/catálogo | MÉDIO | Catálogo multiempresa aponta para domínio e copy errados | Configuração de domínio e metadata por catálogo | Tabela tipada |
| `src/components/catalog/catalog-hero.tsx:18-48` | "Catálogo Nobretech", procedência, WhatsApp | Texto público comercial | MÉDIO | Copy pública não parametrizada | Conteúdo de vitrine por empresa/campanha | Tabela tipada |
| `src/components/catalog/catalog-trust-cards.tsx:3-8` | "Fotos reais", "Garantia", "Pronta entrega", "WhatsApp" | Badges de confiança | MÉDIO | Promessas comerciais podem variar por empresa | Lista ordenada de trust badges | Tabela tipada |
| `src/app/catalogo/[slug]/page.tsx:41-63` | Canonical, OG e título com Nobretech Store | Metadata de produto | MÉDIO | Compartilhamento público usa marca fixa | Metadata por empresa + produto | Tabela tipada |
| `src/app/catalogo/[slug]/page.tsx:199-213` | "Atendimento pelo WhatsApp e entrega presencial em São Luís"; "Procedência verificada" | Texto público e promessa operacional | MÉDIO | Entrega/localidade/procedência viram verdade global | Política de entrega, atendimento e procedência por empresa | Tabela tipada |
| `src/app/catalogo/[slug]/page.tsx:293-299` | "Chame a Nobretech no WhatsApp" | CTA público | MÉDIO | CTA não acompanha marca/canal configurado | CTA de venda por canal preferencial | Setting simples |
| `src/lib/catalog/queries.ts:509-515` | Seminovo só publica com foto real, avaliação e itens inclusos | Regra de publicação | CRÍTICO | Regra operacional do catálogo está fixa no mapper | `catalog_publication_policy` por empresa/tipo/condição | Tabela tipada |
| `src/lib/catalog/queries.ts:528-529` | Garantia calculada e `availabilityLabel = "Pronta entrega"` | Garantia/disponibilidade fixa | CRÍTICO | Produto público pode prometer garantia/entrega indevida | Campos explícitos de garantia e disponibilidade no catálogo | Tabela tipada |
| `src/lib/catalog/queries.ts:568-572` | Fallback de descrição "Produto lacrado..." / "Unidade selecionada..." | Copy pública fallback | MÉDIO | Texto Nobretech aparece sem revisão editorial | Templates de fallback por condição/categoria | Tabela tipada |
| `src/lib/catalog/queries.ts:620-627` | Lista pública filtra `i.status IN ('active', 'in_stock')` e limita 200 | Regra de exibição | CRÍTICO | Critério de disponibilidade e limite são globais | Política de elegibilidade/limite do catálogo | Tabela tipada |
| `src/app/api/catalog/publications/route.ts:45-50,135-145` | Parcelamento máximo permitido 18x | Regra comercial | CRÍTICO | Empresa com outro limite não consegue configurar | `payment_policy.max_installments` por empresa/canal | Tabela tipada |
| `src/app/api/catalog/publications/route.ts:171-176` | Status `published`/`draft` fixos no publish/unpublish | Regra de publicação | CRÍTICO | Workflow editorial não é configurável | Workflow de publicação tipado | Tabela tipada |
| `src/lib/catalog/readiness.ts:20-68` | Status permitidos, exigência de foto real/review/itens e defeito `<= 5` | Regra de readiness | CRÍTICO | Política de vitrine fica presa ao código | `catalog_readiness_rules` por tipo de produto | Tabela tipada |

## Portal de transparência

| Arquivo | Trecho ou valor encontrado | Tipo de hardcode | Criticidade | Impacto | Sugestão de configuração futura | Modelo |
| --- | --- | --- | --- | --- | --- | --- |
| `src/lib/public-purchase-access.ts:8-11` | `TOKEN_PREFIX = "ntcv_"`, PIN 6 dígitos, 5 tentativas, lock 15 min | Segurança/PIN | CRÍTICO | Política de acesso ao portal é global e não auditável por empresa | `public_portal_security_policy`: prefixo, tamanho PIN, tentativas, lockout | Tabela tipada |
| `src/app/api/public/purchase-portal/[token]/route.ts:15-19` | Intro rate limit 30/min por IP | Segurança/rate limit | CRÍTICO | Proteção do portal não acompanha risco por empresa | Rate-limit policy por rota/empresa | Tabela tipada |
| `src/app/api/public/purchase-portal/[token]/verify/route.ts:16-28` | Verificação: 10/min por IP e 5/min por token | Segurança/rate limit | CRÍTICO | Política de PIN fixa para todos os tenants | Rate-limit policy por rota/empresa | Tabela tipada |
| `src/lib/public-purchase-access.ts:285-287` | Número da venda `NT-XXXXXXXX` | Identificador público | MÉDIO | Prefixo Nobretech aparece no comprovante/portal | Prefixo de documentos/vendas por empresa | Setting simples |
| `src/lib/public-purchase-access.ts:312-319` | "Caixa Nobretech" como tipo de embalagem | Política/branding de embalagem | MÉDIO | Embalagem própria não é genérica | Tipos de embalagem por empresa | Tabela tipada |
| `src/lib/public-purchase-access.ts:339-360` | Garantia por `warranty_months * 30` dias | Regra de garantia | CRÍTICO | Pode divergir de meses civis/termo legal e da regra da empresa | Política de cálculo de garantia por produto/condição | Tabela tipada |
| `src/lib/public-purchase-access.ts:367-401` | Textos de procedência, fornecedor parceiro, LGPD e política interna Nobretech | Transparência/LGPD | CRÍTICO | Portal público expõe promessas e política de privacidade fixas | `transparency_policy` com textos aprovados e regras de mascaramento | Tabela tipada |
| `src/app/compra-verificada/[token]/page.tsx:376-394` | "NOBRETECH STORE", ambiente seguro, compra realizada na Nobretech | Texto público do portal | MÉDIO | Portal multiempresa herdaria marca Nobretech | Conteúdo/brand do portal por empresa | Setting simples |
| `src/app/compra-verificada/[token]/page.tsx:227-241` | Mensagens de status da garantia | Texto/regra pública | CRÍTICO | Interpretação de garantia não é configurável | Política de copy de garantia por status | Tabela tipada |

## Regras comerciais

| Arquivo | Trecho ou valor encontrado | Tipo de hardcode | Criticidade | Impacto | Sugestão de configuração futura | Modelo |
| --- | --- | --- | --- | --- | --- | --- |
| `src/app/(dashboard)/vendas/nova/page.tsx:140-149,756` | Origem padrão `whatsapp`; canais fixos WhatsApp/Instagram/OLX/etc. | Política comercial/CRM | CRÍTICO | Canais de venda não configuráveis por empresa | `sales_channels` tipado por empresa, com default | Tabela tipada |
| `src/app/(dashboard)/vendas/nova/page.tsx:151-157` | Tipos de caixa: original, Nobretech, sem caixa, outro | Política de embalagem | MÉDIO | Caixa própria da Nobretech hardcoded em venda | Catálogo de embalagens por empresa | Tabela tipada |
| `src/app/(dashboard)/vendas/nova/page.tsx:749` | Garantia padrão inicial `3` meses | Regra de garantia | CRÍTICO | Venda nova nasce com prazo fixo | Garantia padrão por empresa/tipo/condição/categoria | Tabela tipada |
| `src/app/(dashboard)/vendas/nova/page.tsx:2415-2505` | Venda avulsa não cria cliente; aparelho recomenda cliente identificado por garantia/procedência/portal | Política de venda/portal | CRÍTICO | Comportamento operacional e obrigação de identificação são fixos | `sales_customer_policy` por tipo de produto/canal | Tabela tipada |
| `src/app/api/sales/route.ts:581-626` | Fallback "Cliente avulso" e campos de venda inseridos com regras fixas | Regra de venda | CRÍTICO | Operação multiempresa não configura rótulo/política de venda avulsa | Política de venda avulsa por empresa | Tabela tipada |
| `src/lib/sale-documents.ts:71-86` | Termos de garantia, exclusões, assistência técnica, troca/reembolso e juros | Política legal/comercial | CRÍTICO | Documento oficial carrega termos fixos e potencialmente legais | `warranty_terms` versionado por empresa/produto/condição | Tabela tipada |
| `src/lib/sale-documents.ts:170,414` | `DEFAULT_SELLER = "Vinicius Arruda Nobre"` | Emissor/vendedor padrão | MÉDIO | Documento pode sair com vendedor incorreto | Emissor padrão por usuário/empresa | Setting simples |
| `src/lib/helpers.ts:373-424` | HTML de garantia com termos e contato São Luís/MA | Documento/termo comercial | CRÍTICO | Política de garantia duplicada em outro renderer | Unificar templates de documentos por empresa | Tabela tipada |

## Financeiro / parcelamento

| Arquivo | Trecho ou valor encontrado | Tipo de hardcode | Criticidade | Impacto | Sugestão de configuração futura | Modelo |
| --- | --- | --- | --- | --- | --- | --- |
| `src/lib/constants.ts:520-536` | Métodos `credit_1x` a `credit_18x` e `maxInstallments` fixo | Parcelamento | CRÍTICO | Limite/cartões não configuráveis por empresa/adquirente | `payment_methods` e `installment_plans` por empresa | Tabela tipada |
| `src/lib/constants.ts:546-568` | `SIDEPAY_FEE_PCTS` com taxas até 18x | Taxas de maquininha | CRÍTICO | Percentuais financeiros ficam no bundle se config ausente | `payment_fee_table` por adquirente, vigência e empresa | Tabela tipada |
| `src/lib/constants.ts:570-592` | `LEGACY_SIDEPAY_FEE_PCTS` | Taxas legadas | CRÍTICO | Regras antigas sem vigência formal | Histórico de tabelas de taxa | Tabela tipada |
| `src/app/(dashboard)/financeiro/taxas/page.tsx:13-35` | Default margin 15%, pix/cash/debit/credit por Sidepay | Política financeira default | CRÍTICO | Empresa nova herda margem e adquirente Nobretech | Config inicial de financeiro por empresa | Tabela tipada |
| `src/app/(dashboard)/financeiro/taxas/page.tsx:237-241` | Copy "18x = 18,5818..." | Texto de regra financeira | MÉDIO | Explicação assume tabela Sidepay | Texto gerado a partir da taxa vigente | Setting simples |
| `src/lib/catalog/payment-settings.ts:6-10` | Catálogo sempre considera 18 métodos de crédito e fallback Sidepay | Parcelamento público | CRÍTICO | Vitrine pode mostrar parcelas fora da política da empresa | Política pública de parcelamento por canal | Tabela tipada |
| `src/lib/catalog/pricing.ts:36-56,63-77` | `Math.min(18)`, "Inclui acréscimo da maquininha" | Cálculo e copy de parcelamento | CRÍTICO | Regra de maquininha e limite ficam globais | `payment_policy` com max parcelas, texto de taxa e responsabilidade | Tabela tipada |
| `src/app/(dashboard)/vendas/nova/page.tsx:774-775,1004-1038` | Venda usa Sidepay como fallback quando não há config | Regra financeira fallback | CRÍTICO | Venda pode calcular com taxas Nobretech se config ausente | Bloquear sem financial_settings ou exigir seed por empresa | Tabela tipada |
| `src/app/(dashboard)/financeiro/extrato/page.tsx:66` | Categorias "Taxa de maquininha", "Frete / entrega" etc. | Plano/categorias financeiras | CRÍTICO | Categorias financeiras fixas afetam classificação | Plano financeiro/DRE por empresa com defaults clonáveis | Tabela tipada |
| `src/app/(dashboard)/financeiro/dre/page.tsx:260` | Categorias de despesa financeira por nomes: "Juros de parcelamento", "Taxas bancárias", "Multas" | Regra DRE por texto | CRÍTICO | Classificação depende de label hardcoded | Classificação DRE por conta/ID, não texto | Tabela tipada |

## Avaliação de produtos / estoque

| Arquivo | Trecho ou valor encontrado | Tipo de hardcode | Criticidade | Impacto | Sugestão de configuração futura | Modelo |
| --- | --- | --- | --- | --- | --- | --- |
| `src/lib/constants.ts:1-140` | Catálogo de modelos, cores, storages Apple | Catálogo de produto | MÉDIO | ERP nasce Apple-first, não multiempresa genérico | Catálogo de categorias/modelos/atributos por empresa ou marketplace interno | Tabela tipada |
| `src/lib/constants.ts:604-620` | Checklist técnico iPhone fixo | Avaliação técnica | CRÍTICO | Critérios de inspeção e status não configuráveis | Templates de checklist por categoria/modelo | Tabela tipada |
| `src/lib/helpers.ts:545-552` | Fatores de bateria para trade-in | Regra de avaliação | CRÍTICO | Precificação de recebimento fica fixa | Tabela de depreciação por métrica/categoria | Tabela tipada |
| `src/lib/helpers.ts:566-575` | Grade factor default 0.7, base 0.8 sem grade, arredondamento para 10 | Regra de trade-in | CRÍTICO | Valor sugerido pode não refletir política comercial | Política de valuation com fatores e arredondamento por empresa | Tabela tipada |
| `src/lib/helpers.ts:690-705` | Range 92%-108% e labels de grade A+/B | Avaliação/negociação | CRÍTICO | Faixa de negociação e descrição de condição fixas | Regras de range e labels por empresa/categoria | Tabela tipada |
| `src/lib/helpers.ts:727-764` | Status inicial `active`/`pending` via readiness | Regra de estoque | CRÍTICO | Entrada de estoque/trade-in assume política única | Política de status inicial por origem/tipo | Tabela tipada |
| `src/lib/catalog/queries.ts:349-417` | Escalas e labels de condição para tela, bateria, câmeras etc. | Exibição de condição | CRÍTICO | Cliente vê avaliação pública por critérios fixos | Escala pública de condição por checklist/categoria | Tabela tipada |
| `src/lib/catalog/queries.ts:419-481` | Prefixos legados removidos de notas públicas | Fallback/normalização visual | MÉDIO | Sanitização pública depende de lista fixa | Dicionário de labels/prefixos por checklist | Tabela tipada |

## Textos e mensagens

| Arquivo | Trecho ou valor encontrado | Tipo de hardcode | Criticidade | Impacto | Sugestão de configuração futura | Modelo |
| --- | --- | --- | --- | --- | --- | --- |
| `src/lib/catalog/whatsapp.ts:6-23` | WhatsApp `5598988265655` e mensagem "vi no catálogo da Nobretech" | Canal/CTA público | MÉDIO | WhatsApp e copy não variam por empresa | Canais de atendimento e templates de mensagem | Tabela tipada |
| `src/components/landing/nobretech-landing-page.tsx:14` | `WHATSAPP_URL = https://wa.me/5598988265655` | Canal público | MÉDIO | Landing usa telefone fixo | `company_contact_channels.whatsapp` | Setting simples |
| `src/lib/label-utils.ts:5-6,136-177` | `@nobretechstore`, URL Vercel, "Caixa Nobretech", etiqueta com PIN/Garantia | Etiqueta/contato | MÉDIO | Etiquetas e labels carregam marca fixa | Config de etiqueta pública por empresa | Tabela tipada |
| `src/lib/helpers.ts:340-367` | Laudo com "NOBRETECH STORE" e "Documento válido..." | Documento público/técnico | MÉDIO | Laudo técnico não troca marca/política | Templates de laudo por empresa | Tabela tipada |
| `src/lib/sale-documents.ts:189-203,418-455` | Recibo/garantia com layout e cabeçalho Nobretech | Documento oficial | CRÍTICO | Documentos fiscais/contratuais herdariam dados incorretos | Templates de documento versionados | Tabela tipada |
| `src/app/(dashboard)/orion/orion-client.tsx:814-824,1898` | Mensagens sugeridas com garantia/parcelamento/pronta entrega e "Nobretech" | Copilot comercial | MÉDIO | ORION assume linguagem comercial da Nobretech | Playbooks comerciais configuráveis para IA | Tabela tipada |
| `src/lib/orion/execution-payload.ts:412-508` | Canais "WhatsApp + base própria", "Meta Ads + WhatsApp", garantia Nobretech | Estratégia comercial IA | CRÍTICO | IA recomenda operação fixa sem configuração de empresa | Estratégias/canais permitidos e promessas comerciais por empresa | Tabela tipada |
| `src/lib/marketing/copy-generator.ts:1776` | Hashtags `#nobretech #apple #iphone #tecnologia #seminovo` | Marketing | MÉDIO | Conteúdo gerado fica com marca/nicho fixos | Hashtags e guidelines de copy por empresa/campanha | Tabela tipada |

## Integrações

| Arquivo | Trecho ou valor encontrado | Tipo de hardcode | Criticidade | Impacto | Sugestão de configuração futura | Modelo |
| --- | --- | --- | --- | --- | --- | --- |
| `src/lib/db.ts:18-44` | Detecção Railway por string e URL local `postgresql://nobretech:nobretech@localhost:5433/nobretech_local` | Infra/dev guardrail | BAIXO | Não é regra multiempresa, mas nome aparece em erro/guardrail | Mensagens e URL de dev parametrizadas por ambiente | Setting simples |
| `docker-compose.yml:4-21` | Container, usuário, senha e DB `nobretech_local` | Ambiente local | BAIXO | Apenas dev, sem impacto de regra de negócio | Opcional parametrizar por `.env` | Setting simples |
| `src/lib/supplier-offers/persistence.ts:93` | Canal padrão `'whatsapp'` em oferta de fornecedor | Integração/canal | MÉDIO | Importador assume WhatsApp como origem | Canais de importação por empresa | Tabela tipada |
| `src/lib/supplier-offers/ai.ts:77-78,146` | Tipos de garantia incluem `nobretech` e exemplos "Garantia Apple..." | Parsing IA de fornecedor | CRÍTICO | Classificador aprende tipos fixos de garantia | Taxonomia de garantias por empresa/fornecedor | Tabela tipada |
| `src/app/(dashboard)/fornecedores/ofertas/page.tsx:136` | Opção de garantia "Nobretech" | Fornecedor/garantia | MÉDIO | Fluxo de fornecedor acopla marca | Tipos de garantia configuráveis | Tabela tipada |
| `src/app/(dashboard)/fornecedores/ofertas/importar/page.tsx:46,167-173` | Opção e label de garantia Nobretech no importador | Fornecedor/garantia | MÉDIO | Importação multiempresa mantém marca | Tipos de garantia por tenant | Tabela tipada |
| `src/app/(reseller)/revendedor/page.tsx:398` | Export `catalogo-revendedor-nobretech-...xlsx` | Integração/export | BAIXO | Nome de arquivo fica Nobretech | Prefixo de arquivo por empresa | Setting simples |

## Metadata / SEO / favicon

| Arquivo | Trecho ou valor encontrado | Tipo de hardcode | Criticidade | Impacto | Sugestão de configuração futura | Modelo |
| --- | --- | --- | --- | --- | --- | --- |
| `src/app/layout.tsx:54-88` | Metadata global, OG, Twitter, icons e PWA | SEO global | MÉDIO | Multiempresa por domínio fica incorreto | Resolver metadata por domínio/empresa | Tabela tipada |
| `src/app/page.tsx:4-20` | Metadata específica da home | SEO home | MÉDIO | Home não muda por tenant | Conteúdo de página pública por empresa | Tabela tipada |
| `src/app/catalogo/page.tsx:11-34` | Canonical e descrição do catálogo | SEO catálogo | MÉDIO | Catálogo aponta para domínio fixo | Canonical por empresa/canal | Tabela tipada |
| `src/app/catalogo/[slug]/page.tsx:41-72` | Produto canonical e OG fallback `/og-nobretech-v2.png` | SEO produto | MÉDIO | Compartilhamento herdaria OG Nobretech | OG default por empresa/categoria | Tabela tipada |
| `src/app/catalogo/opengraph-image.tsx:193` | Texto `nobretechstore.com.br/catalogo` | Imagem OG dinâmica | MÉDIO | Preview social fixo | Template OG por empresa | Tabela tipada |
| `public/product-assets/README.md:1-3` | "Nobretech iPhone Assets" | Documentação/assets | BAIXO | Baixo impacto operacional | Documentar origem do asset pack por tenant/catálogo | Setting simples |

## Riscos encontrados

- **Regras financeiras e comerciais críticas estão hardcoded ou têm fallback Nobretech/Sidepay**: taxas de maquininha, limite 18x, margem default 15%, textos de acréscimo, canais padrão e categorias financeiras aparecem em código.
- **Garantia está fragmentada**: venda usa default 3 meses, catálogo público usa 6 meses para usados, portal calcula `warranty_months * 30`, documentos têm termos próprios e helpers HTML têm outro texto de garantia.
- **Portal público concentra risco LGPD/transparência**: textos de procedência, mascaramento, tentativas de PIN, lockout e rate limit existem no código e não em uma política auditável.
- **Catálogo público tem políticas fortes no mapper**: seminovo exige foto real, avaliação e itens inclusos; publicação depende de status `active`/`in_stock`; defeito `<= 5` bloqueia readiness.
- **Nobretech aparece em múltiplas camadas públicas**: metadata, landing, catálogo, portal, documentos, etiquetas, WhatsApp, Instagram, arquivos exportados e assets.
- **IA/ORION/marketing assumem o playbook Nobretech**: canais, promessas de garantia, WhatsApp-first, hashtags e copy comercial estão codificados.
- **Há duplicidade de fontes para política**: financial_settings já existe para taxas, mas o bundle ainda contém fallback Sidepay; garantia existe em venda, catálogo, portal e documentos com regras diferentes.

## Recomendação para a próxima etapa

1. Modelar primeiro as tabelas tipadas de maior risco, sem migrar ainda: `company_brand_profile`, `company_contact_channels`, `company_document_profile`, `payment_methods`, `payment_fee_tables`, `warranty_policies`, `public_portal_security_policies`, `transparency_policies`, `catalog_publication_policies`, `catalog_readiness_rules`, `sales_channels`, `packaging_types` e `marketing_playbooks`.
2. Definir contrato de resolução de configuração: empresa atual -> configuração vigente -> fallback explícito de seed por empresa. Evitar fallback silencioso para constantes Nobretech em fluxos financeiros, garantia e portal.
3. Unificar garantia como domínio próprio antes de mover textos: prazo, cálculo de vencimento, termo legal, label público, documentos e portal devem ler a mesma política versionada.
4. Separar configurações simples de políticas auditáveis. WhatsApp, Instagram e slogan podem começar como settings simples; taxas, garantia, LGPD, catálogo, parcelamento, trade-in e documentos devem ser tabelas tipadas.
5. Criar uma matriz de migração futura: para cada constante crítica, definir fonte atual, tabela futura, seed inicial da Nobretech, validação, rota consumidora e plano de rollback.
6. Só depois da modelagem, implementar a Central de Configurações por fatias: identidade/contato primeiro, documentos/garantia, financeiro/parcelamento, catálogo/portal, IA/marketing.

Resumo aproximado: foram mapeados **55 achados** relevantes. As categorias de maior risco são **Financeiro / parcelamento**, **Portal de transparência**, **Regras comerciais**, **Garantia/documentos** e **Vitrine pública / catálogo**.
