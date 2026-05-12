# ðŸš€ Guia de Deploy â€” Sistema Exclusiva
## Custo: R$0/mÃªs (planos gratuitos)

---

## OPÃ‡ÃƒO A â€” Usar localmente na empresa (R$0, 5 minutos)

> Ideal para comeÃ§ar. A equipe acessa pelo IP da mÃ¡quina na rede local.

```bash
# 1. Copie o .env
copy .env.example .env
# Edite .env: troque JWT_SECRET_KEY por uma chave forte

# 2. Suba os containers
docker compose up -d

# 3. Acesse
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000/docs

# 4. Crie o primeiro admin via API (acesse http://localhost:8000/docs)
# POST /auth/register com role: "admin"

# 5. Compartilhe na rede local
# Outros computadores acessam: http://IP_DA_MAQUINA:5173
```

---

## OPÃ‡ÃƒO B â€” Nuvem gratuita permanente (R$0/mÃªs)

### Stack gratuita:
| ServiÃ§o | Plano | Limite gratuito |
|---------|-------|-----------------|
| **Render.com** | Free Web Service | 750h/mÃªs (dorme apÃ³s 15min sem uso) |
| **Neon.tech** | Free | 0.5GB PostgreSQL, sempre ativo |
| **Upstash** | Free | 10.000 req/dia Redis |
| **Vercel** | Hobby | Ilimitado para frontend estÃ¡tico |

> âš ï¸ O backend no Render.com free "dorme" apÃ³s 15 minutos sem requisiÃ§Ãµes.
> A primeira requisiÃ§Ã£o apÃ³s dormir demora ~30s para acordar.
> Para uso contÃ­nuo, considere o plano Render Starter ($7/mÃªs).

---

### PASSO 1 â€” Banco de dados (Neon.tech)

1. Acesse [neon.tech](https://neon.tech) e crie conta gratuita
2. Crie um projeto: `sistema-exclusiva`
3. Copie a **Connection String** (formato: `postgresql://user:pass@ep-XXX.neon.tech/neondb?sslmode=require`)
4. Guarde â€” serÃ¡ usada no Render

---

### PASSO 2 â€” Redis (Upstash)

1. Acesse [upstash.com](https://upstash.com) e crie conta gratuita
2. Crie um database Redis: `exclusiva-redis`, regiÃ£o `us-east-1`
3. Copie a **REST URL** e o **REST Token** (formato: `rediss://default:TOKEN@ENDPOINT.upstash.io:6379`)

---

### PASSO 3 â€” Backend (Render.com)

1. Acesse [render.com](https://render.com) e crie conta gratuita
2. **New > Web Service > Connect Repository** â†’ Selecione `sistema-exclusiva`
3. Configure:
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Em **Environment Variables**, adicione:
   ```
   DATABASE_URL    = (URL do Neon.tech)
   REDIS_URL       = (URL do Upstash)
   JWT_SECRET_KEY  = (gere com: python -c "import secrets; print(secrets.token_hex(32))")
   JWT_ALGORITHM   = HS256
   JWT_EXPIRATION_MINUTES = 60
   ALLOWED_ORIGINS = ["https://SEU-APP.vercel.app"]
   PYTHONPATH      = /opt/render/project/src/backend
   ```
5. Clique **Create Web Service**
6. Aguarde o deploy (~3 minutos)
7. Copie a URL: `https://exclusiva-backend.onrender.com`

---

### PASSO 4 â€” Frontend (Vercel)

1. Acesse [vercel.com](https://vercel.com) e crie conta (pode usar GitHub)
2. **New Project > Import** â†’ Selecione `sistema-exclusiva`
3. Configure:
   - **Root Directory**: `frontend`
   - **Framework**: Vite
4. Em **Environment Variables**, adicione:
   ```
   VITE_API_URL = https://exclusiva-backend.onrender.com
   ```
5. Clique **Deploy**
6. Aguarde (~2 minutos)
7. Sua URL serÃ¡: `https://sistema-exclusiva-XXXX.vercel.app`

---

### PASSO 5 â€” Atualizar CORS no Render

Volte ao Render.com e atualize a variÃ¡vel:
```
ALLOWED_ORIGINS = ["https://sistema-exclusiva-XXXX.vercel.app"]
```
Clique **Save Changes** â†’ Render farÃ¡ redeploy automÃ¡tico.

---

### PASSO 6 â€” Criar o primeiro admin

Acesse `https://exclusiva-backend.onrender.com/docs` e chame:

```json
POST /auth/register
{
  "cpf": "000.000.000-00",
  "email": "admin@suaempresa.com",
  "name": "Administrador",
  "password": "SenhaForte123!",
  "role": "admin"
}
```

---

## Resumo de URLs

| Recurso | URL |
|---------|-----|
| Frontend | `https://sistema-exclusiva-XXXX.vercel.app` |
| Backend API | `https://exclusiva-backend.onrender.com` |
| API Docs | `https://exclusiva-backend.onrender.com/docs` |
| MÃ©tricas | `https://exclusiva-backend.onrender.com/metrics` |

---

## Atualizar apÃ³s mudanÃ§as no cÃ³digo

```bash
git add .
git commit -m "feat: minha melhoria"
git push origin main
# Render e Vercel fazem redeploy automÃ¡tico via GitHub!
```
