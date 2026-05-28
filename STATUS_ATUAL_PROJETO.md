# Status Atual - Sistema Exclusiva

Atualizado em 2026-05-28.

## Direcao De Deploy

- Frontend: Vercel.
- Backend: Fly.io.
- Banco: PostgreSQL via Fly Postgres ou PostgreSQL gerenciado externo.
- API publica esperada: `https://sistema-exclusiva-api.fly.dev`.
- Frontend esperado: URL final gerada no Vercel.

O backend nao deve mais ser direcionado para outros provedores. O arquivo canonico do Fly fica em `backend/fly.toml`.

## Estado Funcional

O sistema possui:

- Login com CPF e JWT.
- Usuarios e perfis administrativos.
- Importacao e edicao de escala.
- Confirmacao de escala.
- Trocas com prefixo substituto, motorista substituto ou ambos.
- Ocorrencias.
- Checklist.
- Auditoria.
- Exportacao XLSX.
- Modo demo do frontend para apresentacao sem dados reais.

## Configuracoes Canonicas

- Frontend Vercel: `vercel.json`.
- Frontend env local/producao: `frontend/.env.production`.
- Backend Fly: `backend/fly.toml`.
- Backend Docker: `backend/Dockerfile`.
- Backend env exemplo: `backend/.env.example`.
- Guia de deploy: `DEPLOY.md` e `DEPLOY_FLY_VERCEL.md`.

## Dados Necessarios Para Configurar Fly.io

- Nome do app Fly da API.
- Regiao principal.
- Decisao de banco: Fly Postgres novo ou `DATABASE_URL` de banco externo.
- URL final do frontend no Vercel para CORS.
- `JWT_SECRET_KEY` forte.
- Politica de maquina sempre ligada, recomendado `min_machines_running = 1`.

## Validacoes Recomendadas

Antes de publicar:

```powershell
python -m pytest tests -q
cd frontend
npm run build
```

Depois do backend no Fly:

```powershell
curl https://sistema-exclusiva-api.fly.dev/health
curl https://sistema-exclusiva-api.fly.dev/ready
```

Depois do frontend no Vercel:

- Confirmar que `VITE_API_URL` aponta para a API Fly.
- Confirmar que a URL do Vercel esta liberada em `ALLOWED_ORIGINS`.
- Testar login, confirmacao de escala e troca operacional.
