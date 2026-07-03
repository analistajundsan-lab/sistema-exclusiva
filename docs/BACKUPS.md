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

## Backup automático (GitHub Actions)

Workflow: `.github/workflows/db-backup.yml`. Roda **todo dia às 03:00 BRT**
(06:00 UTC) e também sob demanda (aba **Actions → DB Backup (Neon) → Run
workflow**).

O que ele faz: `pg_dump` do banco de produção → valida que veio dado →
**criptografa com AES256** → sobe como **artifact** (retenção **30 dias**).

Secrets do repositório (GitHub → Settings → Secrets and variables → Actions):
- `BACKUP_DATABASE_URL` — connection string (host **direto**, não pooler) do Neon.
- `BACKUP_PASSPHRASE` — senha usada para criptografar. **Guarde-a no gerenciador
  de senhas**: sem ela o backup é irrecuperável.

### Como baixar e restaurar um backup automático

1. Aba **Actions** → abra a execução desejada → baixe o artifact `neon_backup_*.dump.gpg`.
2. Descriptografe e restaure:

```bash
PGBIN="/c/Program Files/PostgreSQL/18/bin"
# descriptografa (vai pedir/receber a BACKUP_PASSPHRASE)
gpg --batch --yes --passphrase "<BACKUP_PASSPHRASE>" \
    -o neon_backup.dump -d neon_backup_XXXXXXXX.dump.gpg
# restaura num destino vazio (NEWCONN = connection-string do destino)
"$PGBIN/pg_restore" -d "$NEWCONN" --no-owner --no-privileges --schema=public neon_backup.dump
```

> Se a senha do banco for rotacionada, atualize o secret `BACKUP_DATABASE_URL`
> (senão o job passa a falhar na conexão).

## Retenção

- **Automático:** diário, criptografado, 30 dias de retenção (GitHub Actions).
- **Manual:** snapshot antes de cada migração/mudança estrutural ou operação de
  risco (fica em `backups/db/`).
- Recuperação de curtíssimo prazo: o Neon Free ainda mantém **PITR de ~6h**
  (restauração a um ponto no tempo) além destes dumps.
