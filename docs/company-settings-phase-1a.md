# Central de Configurações - Fase 1A

## Escopo implementado

A Fase 1A criou a base tipada inicial da configuracao por empresa:

- `company_brand_profile`: identidade exibivel, marca, dominio canonico, cores e assets.
- `company_contact_channels`: canais de contato por tipo, prioridade e visibilidade.
- `company_document_profile`: identidade documental ativa por empresa, com vigencia.
- `src/lib/company-settings/`: nucleo server-side para resolver configuracoes por dominio.

## Consumo interno validado

O layout autenticado em `src/app/(dashboard)/layout.tsx` passa a resolver a identidade da empresa via `resolveCompanyIdentity`.

O unico consumo de interface nesta fase e a exibicao interna do nome da empresa na sidebar/header autenticado. Se a configuracao nao existir, o layout mantem o comportamento anterior usando `context.companyName`.

## Fora do escopo

Esta fase nao altera catalogo publico, portal de transparencia, documentos gerados, recibos, termos, laudos, etiquetas, vendas, financeiro, DRE, garantia, parcelamento, ORION, marketing, metadata publica, favicon publico ou WhatsApp publico.

## Proxima etapa sugerida

A Fase 1B pode adicionar a superficie administrativa para leitura/edicao dessas tres configuracoes, mantendo validacoes server-side e sem migrar regras comerciais criticas para settings genericos.
