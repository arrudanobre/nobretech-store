# Banco local de homologacao

Este guia cria um PostgreSQL local via Docker para desenvolvimento da Nobretech. O objetivo e fazer `localhost` usar uma copia local do banco, nunca o banco real da Railway.

## Diagnostico atual

- A aplicacao usa `DATABASE_URL` no servidor, lida por `src/lib/db.ts`.
- O driver real e `pg`/`node-postgres`.
- O frontend ainda possui um adapter com cara de Supabase em `src/lib/supabase.ts`, mas ele chama `/api/db`; a API usa PostgreSQL via `DATABASE_URL`.
- As migrations ficam em `migrations/`.
- Nao ha Prisma nem Drizzle configurados.
- Nao havia `docker-compose.yml` neste projeto.
- `package.json` nao tinha scripts de banco; apenas `dev`, `build`, `start` e `lint`.
- `.env.local` existe, esta ignorado por `.gitignore`, e deve continuar fora do Git.
- Antes desta mudanca, `.env.local` tinha `DATABASE_URL` com aparencia de Railway. Nao sobrescreva esse arquivo com automacao.

## Arquivos adicionados/alterados

- `docker-compose.yml`: Postgres 16 local em `localhost:5433`.
- `scripts/check-local-database.mjs`: checagem segura para impedir uso local de URL Railway.
- `src/lib/db.ts`: trava em runtime de desenvolvimento contra `DATABASE_URL` com cara de Railway.
- `.gitignore`: ignora dumps locais e diretorios temporarios de backup.

## .env.local seguro

Edite manualmente `.env.local` e troque somente a URL do banco local. Nao commite este arquivo.

```env
DATABASE_URL=postgresql://nobretech:nobretech@localhost:5433/nobretech_local

# Nao use DATABASE_PROVIDER=railway em desenvolvimento local.
# DATABASE_PROVIDER=
# DATABASE_SSL_CA=
# DATABASE_SSL_ALLOW_UNVERIFIED=

SEED_USER_ID="00000000-0000-0000-0000-000000000001"
SEED_USER_EMAIL="seu-email@exemplo.com"
```

## Subir o banco local

```bash
cd "/Users/nobre/Documents/Vibe Code/Nobretech/nobretech-store"
docker compose up -d postgres
docker compose ps
```

## Gerar dump logico do Railway sem alterar producao

Use a URL real do Railway apenas em uma variavel temporaria de terminal. Nao cole segredo em arquivo versionado.

```bash
mkdir -p db-dumps
pg_dump "$RAILWAY_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "db-dumps/railway-$(date +%Y%m%d-%H%M%S).dump"
```

Esse comando e leitura logica. Ele nao executa `UPDATE`, `DELETE`, migration ou teste destrutivo no Railway.

## Restaurar o dump no banco local

Confirme antes que o destino e local:

```bash
node scripts/check-local-database.mjs
```

Restaure no Docker:

```bash
export LOCAL_DATABASE_URL="postgresql://nobretech:nobretech@localhost:5433/nobretech_local"

pg_restore "$LOCAL_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --verbose \
  "db-dumps/railway-YYYYMMDD-HHMMSS.dump"
```

`--clean --if-exists` e destrutivo somente para o banco apontado por `LOCAL_DATABASE_URL`. Nao use esse comando com URL Railway.

## Confirmar que as tabelas chegaram

```bash
psql "postgresql://nobretech:nobretech@localhost:5433/nobretech_local" \
  -c "SELECT COUNT(*) AS public_tables FROM information_schema.tables WHERE table_schema = 'public';"
```

Checagem com conexao via Node:

```bash
node scripts/check-local-database.mjs --connect
```

## Confirmar que localhost esta usando Docker local

1. `.env.local` deve conter `DATABASE_URL=postgresql://nobretech:nobretech@localhost:5433/nobretech_local`.
2. Rode:

```bash
node scripts/check-local-database.mjs --connect
npm run dev
```

3. Se `DATABASE_URL` tiver cara de Railway, `src/lib/db.ts` vai bloquear o runtime local com erro antes de consultar o banco real.

## Parar e resetar

Parar sem apagar dados:

```bash
docker compose stop postgres
```

Subir novamente:

```bash
docker compose up -d postgres
```

Resetar o banco local apagando o volume Docker:

```bash
docker compose down -v
docker compose up -d postgres
```

Depois do reset, restaure o dump novamente.

## Alternativa: migrations existentes no local

Para um banco local vazio, sem dados de Railway, existe o script local de teste:

```bash
DATABASE_URL_TEST="postgresql://nobretech:nobretech@localhost:5433/nobretech_test" npx tsx scripts/apply-test-migrations.ts
```

Ele e voltado para banco de teste `nobretech_test`, nao para restaurar a copia de homologacao `nobretech_local`.

## Riscos e limitacoes

- O dump contem dados reais. Trate `db-dumps/` como sensivel e nunca commite.
- Restaurar dump local com `--clean` apaga o banco local antes de recriar objetos.
- Se houver extensoes, roles ou permissoes especificas do Railway, pode ser necessario ajustar o restore local.
- O app local ainda pode usar outros servicos externos se variaveis como R2, OpenAI ou Clerk estiverem configuradas.
- Esta tarefa nao altera regra de negocio, schema da aplicacao ou dados do Railway.

## O que nao foi feito

- Nao executei `pg_dump` no Railway.
- Nao executei `pg_restore`.
- Nao executei migration no Railway.
- Nao rodei teste destrutivo no Railway.
- Nao sobrescrevi `.env.local`.
- Nao commitei segredo nem dump.
