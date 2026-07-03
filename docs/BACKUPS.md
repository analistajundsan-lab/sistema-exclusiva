# Backups do banco de dados

O banco de produção é **Neon (PostgreSQL 17)**, projeto `sistema-exclusiva-br`,
região `sa-east-1` (São Paulo). Ver a topologia completa de deploy no restante da
pasta `docs/` e na configuração do Fly (`backend/fly.toml`).

## Onde os backups ficam

```
<raiz do repo>/backups/db/
```

> ⚠️ A pasta `backups/` é **ignorada pelo git** (`.gitignore`) e **nunca deve ser
> versionada** — os dumps contêm dados sensíveis (usuários, hashes de senha,
> sessões, etc.). Este documento registra *onde* os backups ficam; os arquivos em
> si vivem só localmente / no cofre de backup, fora do controle de versão.

Caminho absoluto nesta máquina:
`C:\Users\User\Videos\MEUS PROJETOS\SISTEMA EXCLUSIVA\backups\db\`

### Convenção de nome

```
neon_snapshot_<motivo>_<AAAAMMDD>.dump          # dump em formato custom (-Fc)
neon_snapshot_<motivo>_<AAAAMMDD>_counts.txt    # contagem de linhas por tabela (conferência)
```

Snapshot inicial guardado:
- `neon_snapshot_pre-migracao-sp_20260703.dump` — estado da produção imediatamente
  antes da migração de us-east-1 → sa-east-1 (2026-07-03).

## Como gerar um backup novo

Requer o cliente PostgreSQL (local: `C:\Program Files\PostgreSQL\18\bin`). O
`pg_dump` ≥ versão do servidor consegue dumpar (18 dumpa o servidor 17).

```bash
PGBIN="/c/Program Files/PostgreSQL/18/bin"
# connection-string da branch de produção (sem expor senha no histórico):
CONN=$(npx neonctl connection-string production \
  --project-id winter-rain-67896396 --org-id org-old-salad-88983667 \
  --database-name neondb --role-name neondb_owner)

"$PGBIN/pg_dump" "$CONN" -Fc --no-owner --no-privileges \
  -f "backups/db/neon_snapshot_manual_$(date +%Y%m%d).dump"
```

## Como restaurar (para um banco novo/vazio)

```bash
PGBIN="/c/Program Files/PostgreSQL/18/bin"
# NEWCONN = connection-string do destino
"$PGBIN/pg_restore" -d "$NEWCONN" --no-owner --no-privileges \
  --schema=public "backups/db/<arquivo>.dump"
```

Depois de restaurar, confira a contagem de linhas contra o arquivo `_counts.txt`
correspondente (ou contra a produção) antes de apontar a aplicação.

## Retenção sugerida

- Manter o snapshot de cada migração/mudança estrutural relevante.
- Backup periódico manual antes de operações de risco (migração, limpeza em massa).
- Um backup automatizado (cron/rotina) ainda **não** está configurado — é uma
  melhoria futura recomendada.
