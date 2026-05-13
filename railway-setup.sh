#!/bin/bash
# ============================================================
# RAILWAY SETUP — Sistema Exclusiva
# Execute este script com: bash railway-setup.sh
# Requer: railway CLI instalado (npm install -g @railway/cli)
# ============================================================

set -e

echo "=== 1. Login no Railway ==="
railway login

echo ""
echo "=== 2. Vinculando ao projeto ==="
railway link

echo ""
echo "=== 3. Configurando Root Directory para 'backend' ==="
# Isso garante que o Railway builda a partir da pasta /backend
railway service update --root-directory backend

echo ""
echo "=== 4. Definindo variaveis de ambiente ==="

# ⚠️  SUBSTITUA os valores abaixo antes de rodar

# Supabase: Project Settings > Database > Connection string > URI
railway variables set DATABASE_URL="postgresql://postgres:SUASENHA@db.SEUPROJECTREF.supabase.co:5432/postgres"

# Gere com: openssl rand -hex 32
railway variables set JWT_SECRET_KEY="TROQUE-POR-UMA-CHAVE-ALEATORIA-MINIMO-32-CHARS"

railway variables set ENVIRONMENT="production"
railway variables set ALLOWED_ORIGINS="https://sistema-exclusiva-pied.vercel.app"
railway variables set EXPOSE_METRICS="false"

echo ""
echo "=== 5. Fazendo deploy ==="
railway up --detach

echo ""
echo "=== 6. Aguardando servico subir ==="
sleep 20

echo ""
echo "=== 7. Verificando health check ==="
RAILWAY_URL=$(railway domain)
curl -f "https://${RAILWAY_URL}/health" && echo " OK" || echo " FALHOU - veja os logs"

echo ""
echo "=== 8. URL do backend ==="
echo "https://${RAILWAY_URL}"
echo ""
echo "Copie a URL acima e configure no Vercel:"
echo "  VITE_API_URL  = https://${RAILWAY_URL}"
echo "  VITE_DEMO_MODE = false"
