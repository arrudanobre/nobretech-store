# Migração Supabase -> Railway

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

## Fase 4 - Trocar a camada de dados do app

O app ainda nao esta pronto para usar Railway diretamente, porque quase todas as telas chamam `supabase.from(...)` no client. No Railway, a conexao Postgres deve ficar no servidor, nunca exposta no browser.

Plano recomendado:

1. Criar `DATABASE_URL` no `.env.local`.
2. Instalar uma camada server-side: `pg`, Prisma ou Drizzle.
3. Criar API routes/server actions para cada dominio:
   - estoque
   - vendas
   - clientes
   - fornecedores
   - garantias
   - problemas
   - financeiro
   - precos de fornecedor
4. Substituir chamadas `supabase.from(...)` por chamadas a essas APIs.
5. Substituir `supabase.auth` por Auth.js, Clerk, Better Auth ou login proprio.

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
