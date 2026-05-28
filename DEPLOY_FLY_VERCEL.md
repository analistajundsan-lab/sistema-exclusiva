# Deploy - Vercel Frontend + Fly.io Backend

## Arquitetura Oficial

- Frontend: Vercel, servindo `frontend/dist`.
- Backend: Fly.io, app FastAPI em `backend/`.
- Banco: PostgreSQL via Fly Postgres ou outro PostgreSQL gerenciado, sempre via `DATABASE_URL`.
- Demo: `VITE_DEMO_MODE=true` apenas para apresentacao sem dados reais.

## Backend no Fly.io

O arquivo canonico do backend e `backend/fly.toml`.

Valores que preciso para configurar localmente:

- Nome do app Fly da API, exemplo: `sistema-exclusiva-api`.
- Regiao principal, recomendado Brasil: `gru`.
- URL final esperada da API, exemplo: `https://sistema-exclusiva-api.fly.dev`.
- Banco desejado:
  - criar Fly Postgres novo, ou
  - usar PostgreSQL externo e informar a `DATABASE_URL`.
- `JWT_SECRET_KEY` forte.
- Origem final do frontend no Vercel para CORS, exemplo: `https://sistema-exclusiva-pied.vercel.app`.
- Se a API deve ficar sempre acordada: recomendado `min_machines_running = 1`.

Secrets esperados no Fly:

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

Se usar PostgreSQL externo:

```powershell
fly secrets set DATABASE_URL="postgresql://usuario:senha@host:5432/sistema_exclusiva" --app sistema-exclusiva-api
```

Deploy do backend:

```powershell
cd backend
fly deploy --app sistema-exclusiva-api
fly status --app sistema-exclusiva-api
fly logs --app sistema-exclusiva-api
```

## Frontend no Vercel

O arquivo canonico do frontend no Vercel e `vercel.json` na raiz.

Variaveis no Vercel:

```text
VITE_DEMO_MODE=false
VITE_API_URL=https://sistema-exclusiva-api.fly.dev
```

Depois que o Vercel gerar a URL final do frontend, inclua essa URL no `ALLOWED_ORIGINS` do backend no Fly.

## Validacao

Backend:

```powershell
curl https://sistema-exclusiva-api.fly.dev/health
curl https://sistema-exclusiva-api.fly.dev/ready
```

Frontend:

- Abrir URL do Vercel.
- Login.
- Confirmacao de escala.
- Criar troca com prefixo, motorista ou ambos.
- Conferir chamadas de API apontando para Fly.
