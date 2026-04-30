# Migração Supabase -> Railway

> Status atual: o app ja usa PostgreSQL/Railway via `DATABASE_URL` no servidor. O arquivo `src/lib/supabase.ts` foi mantido como adapter de compatibilidade para reduzir refatoracao no frontend, mas ele chama `/api/db` e nao o Supabase real.

Este projeto hoje usa Supabase para tres coisas diferentes:

- Auth: magic link por e-mail em `supabase.auth`.
- Database: tabelas Postgres acessadas direto pelo browser com RLS.
- Storage: bucket `inventory` para fotos.

Railway resolve bem o Postgres e o deploy, mas nao substitui Supabase Auth/Storage automaticamente. A migracao segura deve ser feita em fases.

## Fase 1 - Parar o consumo de imagens

Ja foi ajustado no app:

- A listagem de estoque nao seleciona mais `photos->0`.
- O detalhe do produto nao renderiza carrossel/fotos.
- O cadastro e edicao de estoque salvam `photos: null`.
- O fluxo de venda/trade-in nao faz mais upload para Supabase Storage.
- A captura de imagens fica reservada para um futuro modulo de assistencia tecnica.

Query opcional para limpar referencias antigas de fotos do estoque:

```sql
UPDATE inventory SET photos = NULL WHERE photos IS NOT NULL;
```

Se quiser limpar tambem fotos de aparelhos recebidos em trade-in:

```sql
UPDATE trade_ins SET photos = NULL WHERE photos IS NOT NULL;
```

## Fase 2 - Criar o banco no Railway

1. Crie um projeto no Railway.
2. Adicione um servico PostgreSQL.
3. Abra o banco e rode:

```sql
-- Conteudo de migrations/railway_schema.sql
```

No terminal, usando `psql`:

```bash
psql "$DATABASE_URL" -f migrations/railway_schema.sql
```

## Fase 3 - Migrar dados do Supabase

Use dump de dados sem schema, porque o schema do Railway ja foi adaptado:

```bash
pg_dump "$SUPABASE_DATABASE_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --exclude-table=schema_migrations \
  --exclude-table=supabase_migrations.schema_migrations \
  > supabase-data.sql
```

Importe no Railway:

```bash
psql "$RAILWAY_DATABASE_URL" -f supabase-data.sql
```

Se o dump trouxer usuarios com referencia a `auth.users`, exporte/importe tabela por tabela ou use CSV. Ordem recomendada:

```sql
-- Ordem de importacao
companies
users
suppliers
product_catalog
checklists
inventory
customers
trade_ins
sales
warranties
problems
problem_updates
quotes
financial_settings
supplier_prices
sales_additional_items
audit_logs
```

## Fase 4 - Camada de dados atual

Esta fase ja foi implementada de forma incremental.

O frontend ainda chama `supabase.from(...)` em varias telas, mas essa chamada nao vai mais para o Supabase. Ela passa pelo adapter local:

```text
src/lib/supabase.ts -> /api/db -> src/lib/db.ts -> Railway PostgreSQL
```

Motivo: preservar o padrao das telas enquanto a migracao era feita, sem refatorar o sistema inteiro de uma vez.

Pontos importantes:

1. `DATABASE_URL` fica apenas no servidor.
2. `/api/db` aplica regras basicas de consulta, normalizacao e hidratacao de dados.
3. `src/lib/db.ts` cria a conexao com `pg` e garante usuario/empresa padrao.
4. O login completo ainda esta temporariamente fora do escopo; o sistema usa usuario padrao enquanto o produto e estabilizado.
5. Uma futura fase pode trocar o adapter por server actions ou APIs especificas por dominio.

## Variaveis novas sugeridas

```env
DATABASE_URL=postgresql://...
APP_BASE_URL=http://localhost:3000
AUTH_SECRET=...
```

As variaveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` nao sao mais usadas pelo adapter temporario.

## Query de verificacao apos importar

```sql
SELECT 'companies' AS table_name, COUNT(*) FROM companies
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'inventory', COUNT(*) FROM inventory
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'warranties', COUNT(*) FROM warranties
UNION ALL SELECT 'problems', COUNT(*) FROM problems
UNION ALL SELECT 'supplier_prices', COUNT(*) FROM supplier_prices;
```

## Ponto critico

Nao coloque `DATABASE_URL` em variavel `NEXT_PUBLIC_*`. Ela precisa ficar apenas no servidor. Expor essa URL no frontend daria acesso direto ao banco.
