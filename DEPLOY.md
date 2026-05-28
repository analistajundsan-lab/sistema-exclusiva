# Deploy Do Sistema Exclusiva

## Direcao Atual

O deploy oficial fica dividido assim:

- Frontend no Vercel.
- Backend FastAPI no Fly.io.
- Banco PostgreSQL via Fly Postgres ou PostgreSQL gerenciado externo.

Outros provedores de backend nao sao caminhos oficiais deste projeto.

## Dados Necessarios Para Eu Configurar O Fly.io

Passe estes dados localmente quando quiser que eu configure:

1. Nome do app Fly da API:
   Exemplo: `sistema-exclusiva-api`

2. Regiao principal:
   Recomendado: `gru`

3. Banco:
   Escolha uma opcao:
   - criar Fly Postgres novo, ou
   - usar PostgreSQL externo e informar a `DATABASE_URL`.

4. URL final do frontend no Vercel:
   Exemplo: `https://sistema-exclusiva-pied.vercel.app`

5. URL desejada da API:
   Exemplo: `https://sistema-exclusiva-api.fly.dev`

6. `JWT_SECRET_KEY`:
   Uma chave forte, idealmente gerada com:
   `openssl rand -hex 32`

7. Politica de dormencia:
   Recomendado para operacao real: manter `min_machines_running = 1`.

## Configuracao Do Backend No Fly.io

Arquivo canonico: `backend/fly.toml`.

Secrets esperados:

```powershell
fly secrets set JWT_SECRET_KEY="..." --app sistema-exclusiva-api
fly secrets set ALLOWED_ORIGINS='["https://sistema-exclusiva-pied.vercel.app"]' --app sistema-exclusiva-api
fly secrets set EXPOSE_METRICS=false --app sistema-exclusiva-api
```

Se usar Fly Postgres:

```powershell
fly postgres create --name sistema-exclusiva-db --region gru
fly postgres attach sistema-exclusiva-db --app sistema-exclusiva-api
```

Se usar banco externo:

```powershell
fly secrets set DATABASE_URL="postgresql://usuario:senha@host:5432/sistema_exclusiva" --app sistema-exclusiva-api
```

Deploy:

```powershell
cd backend
fly deploy --app sistema-exclusiva-api
```

Validacao:

```powershell
curl https://sistema-exclusiva-api.fly.dev/health
curl https://sistema-exclusiva-api.fly.dev/ready
```

## Configuracao Do Frontend No Vercel

Arquivo canonico: `vercel.json` na raiz.

Variaveis:

```text
VITE_DEMO_MODE=false
VITE_API_URL=https://sistema-exclusiva-api.fly.dev
```

Depois do deploy do Vercel, confirme que a URL final do frontend esta em `ALLOWED_ORIGINS` no Fly.
