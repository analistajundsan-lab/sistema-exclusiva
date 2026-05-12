# Publicacao Vercel - Apresentacao

## Objetivo

Publicar o frontend como demonstracao online para a gestao avaliar a usabilidade sem expor dados reais da operacao.

## Configuracao recomendada no Vercel

- Root Directory: `frontend`
- Framework: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

Variaveis:

```txt
VITE_DEMO_MODE=true
VITE_API_URL=https://exclusiva-backend.onrender.com
```

Com `VITE_DEMO_MODE=true`, o app usa dados demonstrativos no proprio navegador.

## Acessos de demonstracao

- CPF Jerusa: `22692036824`
- CPF Vinicius: `41637531842`
- Senha: qualquer texto com 8+ caracteres no modo demonstracao

## Producao real

Para transformar em sistema real online:

```txt
VITE_DEMO_MODE=false
VITE_API_URL=https://URL-REAL-DO-BACKEND
```

No backend:

```txt
ENVIRONMENT=production
JWT_SECRET_KEY=<chave forte>
DATABASE_URL=<postgres gerenciado>
ALLOWED_ORIGINS=https://URL-DO-VERCEL
EXPOSE_METRICS=false
```
