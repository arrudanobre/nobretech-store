# Phase 2D.7 — Marca configuravel em documentos e etiquetas

## Removidos do codigo operacional

Este bloco remove hardcodes de marca e contato dos pontos documentais/operacionais:

- etiquetas de estoque e compra verificada;
- laudos gerados por estoque/venda/garantia;
- labels de embalagem propria na venda;
- suporte WhatsApp do portal de compra verificada;
- helpers HTML antigos de laudo/garantia.

## Fonte dos dados

No ambiente interno, o layout resolve a identidade da empresa no servidor usando `resolveCompanyIdentity` e entrega ao client apenas dados seguros:

- `displayName`;
- `shortName`;
- `logoUrl`;
- Instagram publico configurado.

No portal publico, o WhatsApp passa a vir de `company_contact_channels` publico/ativo. O fallback e ocultar o botao quando nao houver canal configurado.

## Fallback neutro

Quando a marca nao esta disponivel, os textos usam fallback neutro:

- `Loja`;
- `loja`;
- `Caixa da loja`;
- `Garantia da loja`;
- `Sem garantia contratual da loja vinculada a este item.`

## Achados mantidos fora do escopo

Ocorrencias em marketing, catalogo publico, ORION, landing page, testes, seeds/migrations e nomes internos de componentes nao foram alteradas neste bloco.

Esses pontos exigem fases proprias porque misturam copy comercial, identidade publica do site, prompts de IA ou dados historicos de seed/teste.
