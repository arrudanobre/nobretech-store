# Catalog Settings Admin

Esta tela (`/configuracoes/catalogo`) permite a gestão das configurações públicas do catálogo e dos selos de confiança (Trust Badges).

## O que a tela edita
- **Textos Públicos (`catalog_settings`)**: Permite alterar o "Hero Tagline", títulos e descrições dos grids e dos estados vazios (empty state / sem resultados).
- **Selos de Confiança (`catalog_trust_badges`)**: Permite criar, editar, reordenar, e desativar os badges exibidos na loja pública e na página individual de produto.

## O que ela NÃO edita
- Não gerencia permissões de exibição de produto (`catalog_publication_policies`, `catalog_readiness_rules`).
- Não gerencia políticas de preços, parcelamentos ou taxas (`settings.finance`).
- Não gerencia garantias de produto nem o status financeiro de vendas.
- Não edita as opções de marca (Brand Profile) que estão na Central da Empresa (`/configuracoes/empresa`).

## Permissões
- Para acessar a tela é exigido `settings.view`.
- Para realizar alterações (mutações), o sistema exige e valida server-side a permissão `settings.edit`.

## Validações
- Todo `companyId` utilizado nas operações é derivado estritamente do Auth Context, garantindo isolamento total do Multitenant e prevenindo escalada de privilégios via input do Client-Side.
- Validação server-side dos limites de inputs e do tipo aceito para `icon_key`.

## Próximos Blocos Recomendados
- **Gestão de Políticas de Publicação (`catalog_publication_policies`)**: Módulo sensível onde serão tratadas as regras críticas do que pode ou não ir ao ar no catálogo.
- **Regras de Readiness (`catalog_readiness_rules`)**: Administração das regras que determinam se um produto ou variação está apto a ser publicado (ex: ter fotos reais aprovadas, revisão de bateria completa).
