# Auditoria ORQUESTRADOR - Sistema Exclusiva

Data: 2026-05-21  
Projeto auditado: `C:\Users\User\Videos\MEUS PROJETOS\SISTEMA EXCLUSIVA`  
Agentes acionados: arquitetura/team lead, backend Python, frontend/UX, security/LGPD, banco PostgreSQL, QA/code review. DevOps/SRE foi consolidado localmente por limite de threads.

## Resumo executivo

O Sistema Exclusiva esta funcional como MVP e a base atual ja cobre login, perfis, importacao de escalas, historico simples por vigencia, edicao de linhas, checklist, ocorrencias, trocas, exportacao XLSX e deploy Vercel + Render.

Mesmo assim, para uso operacional com dados reais, os riscos principais ainda estao concentrados em quatro frentes:

1. seguranca de sessao e autorizacao por unidade;
2. banco de dados/migracoes de producao;
3. fluxo de escalas quando ha multiplas versoes/importacoes;
4. pipeline/deploy/documentacao com fontes conflitantes.

## Validacao executada

- `npm run build --prefix frontend`: passou.
- `python -m pytest -q`: passou com 97 testes.
- Avisos relevantes do pytest:
  - `FastAPI @app.on_event("startup")` depreciado.
  - `datetime.utcnow()` depreciado em `backend/metrics_middleware.py`.

## Achados prioritarios

### P0 - Corrigir antes de ampliar uso real

#### 1. Autorizacao por unidade ainda esta incompleta no backend

Evidencias:
- `backend/models.py`: `User` possui `unit` e `units`.
- `backend/routes_schedule.py`: listagem, resumo, confirmacao e WhatsApp dependem principalmente de usuario autenticado e filtros enviados.
- `backend/routes_checklist.py`: limita apenas `ANALISTA` por garagem.
- `frontend/src/pages/Schedule.tsx`: bloqueio visual por unidade existe no frontend.

Impacto:
Um usuario autenticado pode consultar ou acionar dados fora da sua unidade se chamar a API diretamente. Isso afeta escala, motoristas, clientes, ocorrencias, trocas e auditoria operacional.

Recomendacao:
Criar uma politica central server-side, por exemplo `scope_by_user_units(current_user, query, model_unit_field)`, e aplicar em:
- `/schedule/lines`, `/schedule/summary`, `/schedule/whatsapp`, download e mutacoes;
- trocas;
- ocorrencias;
- checklist;
- auditoria operacional.

#### 2. JWT aceito por query string e usado no download XLSX

Evidencias:
- `backend/auth.py`: `get_current_user` aceita `request.query_params.get("token")`.
- `frontend/src/pages/Schedule.tsx`: `handleDownload` monta URL com `token`.
- `tests/test_schedule_api.py`: teste oficializa o download com `?token=`.

Impacto:
Token pode vazar por historico do navegador, logs, proxy, analytics, prints, compartilhamento de link e cabecalho Referer.

Recomendacao:
Baixar XLSX com `fetch` usando header `Authorization`, gerar `Blob` no frontend e remover o fallback de token por query. Se for necessario link direto, usar token curto, assinado, escopado ao arquivo e descartavel.

#### 3. Sessao em localStorage e refresh token sem controle de sessao

Evidencias:
- `frontend/src/store/auth.ts`: access e refresh token ficam em `localStorage`.
- `frontend/src/api/client.ts`: refresh token e reutilizado pelo client.
- `backend/auth.py`: refresh token dura 7 dias e nao ha rotacao persistida/revogacao server-side.

Impacto:
Qualquer XSS no dominio pode roubar access e refresh token. Logout nao revoga sessao no servidor.

Recomendacao:
Para producao, migrar para cookie `HttpOnly; Secure; SameSite=Lax/Strict`, access token curto, refresh token com rotacao, identificador de sessao, revogacao e deteccao de reuso.

#### 4. Cadastro publico e reset de senha incompleto

Evidencias:
- `backend/routes_auth.py`: `POST /auth/register` e publico e cria usuario `OPERATOR`.
- `backend/routes_auth.py`: reset request retorna mensagem, mas nao gera/envia token real.
- `backend/routes_auth.py`: reset aceita JWT generico por parametro simples.

Impacto:
Terceiros podem criar contas em producao. Recuperacao de senha passa falsa sensacao de seguranca e pode aceitar token fora da finalidade correta.

Recomendacao:
Desabilitar `/auth/register` em producao ou exigir convite/admin. Implementar reset por body Pydantic, token de finalidade `password_reset`, expiracao curta, uso unico e hash no banco.

### P1 - Fundacao de producao

#### 5. Producao depende de `create_all` e bootstrap mutavel

Evidencias:
- `backend/main.py`: chama `Base.metadata.create_all(bind=engine)`.
- `backend/bootstrap_mvp.py`: executa `ALTER TABLE` manual e engole excecoes em migracao de enum.
- `backend/requirements.txt`: possui Alembic, mas nao existe trilha de migrations versionadas.

Impacto:
Drift de schema entre SQLite, Postgres e Render; rollback dificil; falhas silenciosas em deploy.

Recomendacao:
Criar Alembic formal, versionar DDL, remover mutacao automatica de schema em producao e separar seed/admin inicial de migracao.

#### 6. Modelo de dados sem integridade relacional suficiente

Evidencias:
- `created_by`, `confirmed_by`, `schedule_line_id`, `import_id` e `user_id` sao inteiros soltos em varios modelos.
- `User.units` e texto/CSV.

Impacto:
Registros orfaos, relatorios inconsistentes e permissao por unidade dificil de garantir.

Recomendacao:
Adicionar FKs com estrategia de rollout segura, indices compostos e tabela `user_units`. Definir `on delete` explicitamente, priorizando historico operacional.

#### 7. Testes passam, mas majoritariamente em SQLite

Evidencias:
- `tests/conftest.py` usa `sqlite:///./test.db`.
- CI principal tambem usa SQLite em parte dos workflows.

Impacto:
SQLite nao cobre enum nativo, locks, constraints, timezone e comportamento real do Postgres.

Recomendacao:
Manter SQLite para testes rapidos, mas adicionar job obrigatorio com Postgres e migrations Alembic.

#### 8. Fluxo de vigencia pode misturar importacoes da mesma data

Evidencias:
- `backend/routes_schedule.py`: importacao ativa usa `max(effective_date)`.
- Quando ha varios imports com a mesma vigencia, todos os `import_id` daquela data entram como ativos.
- Substituicao atual ocorre por `effective_date + filename`.

Impacto:
Se duas planilhas diferentes forem enviadas com a mesma vigencia, a escala vigente pode virar um composto de arquivos. Isso pode ser intencional para complementar por unidade, mas hoje a regra nao esta formalizada.

Recomendacao:
Modelar versao publicada de escala com `effective_from`, `published_at`, `status`, `superseded_at`, unidade/escopo e regra clara:
- reenvio do mesmo arquivo + mesma vigencia substitui;
- arquivo/data diferente preserva historico;
- multiplos arquivos na mesma vigencia devem ser explicitamente por unidade ou por pacote publicado.

### P2 - Produto e operacao

#### 9. PWA força logout quando service worker atualiza

Evidencias:
- `frontend/src/main.tsx`: `forceLogoutAndReload` limpa sessao e redireciona para login.
- `frontend/public/sw.js`: notifica `SW_UPDATED` ao ativar.

Impacto:
Em tablet/PWA, usuario pode sentir que perdeu a sessao durante operacao ou depois de F5.

Recomendacao:
Trocar logout forcado por aviso de nova versao, botao "Atualizar agora" e preservacao de sessao quando possivel.

#### 10. Texto de WhatsApp da escala pode sair parcial

Evidencias:
- `frontend/src/hooks/useSchedule.ts`: existe `fetchWhatsappText`.
- `frontend/src/pages/Schedule.tsx`: `whatsappText` nao e preenchido e fallback usa somente parte das linhas.

Impacto:
Usuario pode enviar uma mensagem parcial achando que e consolidado oficial.

Recomendacao:
Usar o endpoint `/schedule/whatsapp` como fonte unica, exibir total retornado pelo backend e evitar fallback parcial para envio oficial.

#### 11. Checklist precisa de rascunho, validacao e upload governado

Evidencias:
- `frontend/src/pages/ChecklistNovo.tsx`: formulario longo sem rascunho robusto.
- `backend/models.py`: evidencias em `Text` base64.
- `backend/routes_checklist.py`: persiste JSON/base64 sem endpoint de upload dedicado.

Impacto:
Perda de dados no F5/trava do tablet; banco incha; dificil aplicar retencao/LGPD.

Recomendacao:
Salvar rascunho local por usuario/unidade/prefixo, validar por etapa, mover evidencias para storage privado e gravar metadados no banco.

#### 12. OCR online ainda nao esta implementado no backend

Evidencias:
- Nao ha rota OCR dedicada em `backend/routes_checklist.py`.
- Dependencias OCR como `pytesseract`, `Pillow` ou `opencv` nao aparecem no backend.

Impacto:
O checklist ainda nao entrega o OCR totalmente online dentro da plataforma.

Recomendacao:
Implementar endpoint FastAPI com `UploadFile`, limite de tamanho, validacao de MIME/magic bytes, OCR com Tesseract/Python, resposta estruturada e revisao humana antes de gravar.

#### 13. Exportacao XLSX precisa sanitizar formula injection

Evidencias:
- `backend/routes_schedule.py`: campos importados sao escritos direto no XLSX.

Impacto:
Valores com `=`, `+`, `-` ou `@` podem virar formula no Excel.

Recomendacao:
Sanitizar campos textuais no export, prefixando apostrofo quando necessario.

### P3 - DevOps, limpeza e documentacao

#### 14. Workflows GitHub Actions estao redundantes/desalinhados

Evidencias:
- `.github/workflows/ci.yml`, `ci-cd.yml` e `deploy.yml` disparam em `main`.
- `ci-cd.yml` faz deploy via SSH para `/opt/aap-exclusiva`, nome de outro projeto.
- `deploy.yml` contem deploy placeholder.

Impacto:
Falso erro de deploy, risco de publicar no caminho errado e ruido para manutencao.

Recomendacao:
Consolidar um fluxo oficial:
- CI: backend tests, frontend build/lint/test.
- Deploy: Vercel frontend + Render backend, ou deixar deploy externo ao GitHub Actions.
- Remover/pausar workflow SSH legado.

#### 15. Configuracoes Vercel/Render existem em mais de uma fonte

Evidencias:
- `vercel.json` raiz aponta `https://exclusiva-backend-bbzf.onrender.com`.
- `frontend/vercel.json` tambem aponta Render.
- Docs antigos ainda citam URL generica, demo ou Railway em alguns pontos.

Impacto:
Facil subir frontend com backend errado ou manter documentacao defasada.

Recomendacao:
Escolher fonte canonica. Como o deploy atual parece ser pela raiz, manter `vercel.json` raiz e remover/arquivar o `frontend/vercel.json` se nao for usado. Atualizar docs com:
- `VITE_API_URL=https://exclusiva-backend-bbzf.onrender.com`
- `VITE_DEMO_MODE=false`
- `ALLOWED_ORIGINS=["https://sistema-exclusiva-pied.vercel.app"]`

#### 16. Docker prod nao esta pronto como producao real

Evidencias:
- `docker-compose.prod.yml` usa backend com `--reload` e volume montado.
- credenciais padrao aparecem para Postgres/Grafana.
- porta frontend parece incompatibilidade potencial com nginx do Dockerfile.

Impacto:
Se usado por engano como producao, roda com padrao de desenvolvimento.

Recomendacao:
Renomear para staging/local ou endurecer: sem reload, sem bind mount, secrets obrigatorios, portas privadas e healthchecks reais.

#### 17. Artefatos locais e agentes precisam decisao de versionamento

Evidencias:
- `git status --short`: `.agents/`, `.claude/`, `.codex/`, `.mcp.json`, `skills-lock.json` nao rastreados.
- Existem bancos locais `test*.db` no workspace.

Impacto:
Ruido na revisao e risco de exportar/commitar configuracao local.

Recomendacao:
Decidir se `.agents/` e parte oficial do projeto. Se nao for, manter fora do Git. Adicionar padroes como `*.db-journal`, logs locais e caches no `.gitignore`.

## Pontos positivos encontrados

- Build frontend passou.
- Suite backend passou com 97 testes.
- CORS principal para Vercel + Render esta configurado no caminho atual.
- Historico de escala por `ScheduleImport` ja existe e cobre parte importante da regra de vigencia.
- Download XLSX ja existe e funciona com linhas alteradas no estado atual.
- CPF esta autoformatado no fluxo de frontend.
- Ha rate limit em login/register.
- Docs e arquivos de status ja existem, embora precisem consolidacao.

## Sequencia recomendada de execucao

### Fase 1 - Travar seguranca operacional

1. Implementar escopo por unidade no backend.
2. Remover token por querystring e migrar download para fetch/blob.
3. Desabilitar cadastro publico em producao.
4. Corrigir reset de senha.
5. Revisar matriz de roles: `SUPERVISOR`, `SUPERVISAO`, `GERENTE`, `ANALISTA`, `PLANTONISTA`.

### Fase 2 - Fundacao de banco/deploy

1. Criar Alembic e primeira migration oficial.
2. Remover `create_all` e bootstrap mutavel de producao.
3. Adicionar job Postgres no CI.
4. Consolidar workflows GitHub Actions.
5. Consolidar Vercel/Render e docs.

### Fase 3 - Produto operacional

1. Formalizar versoes de escala por vigencia/unidade/pacote publicado.
2. Corrigir WhatsApp para usar fonte unica do backend.
3. Rascunho e validacao por etapa no checklist.
4. Upload governado de evidencias.
5. OCR online com FastAPI + Tesseract/Python.

### Fase 4 - Producao madura

1. Cookies HttpOnly e refresh rotation.
2. Auditoria append-only e soft delete nos dominios operacionais.
3. FKs, indices compostos e `user_units`.
4. Observabilidade com `/ready` validando banco e alertas basicos.
5. Plano LGPD: retencao, expurgo, anonimização e direitos do titular.

## Conclusao

O projeto esta bom como MVP demonstravel e bem encaminhado para piloto controlado. Para virar producao confiavel, o principal nao e "mais tela"; e fechar permissao por unidade, sessao/download seguro, migracoes reais e regras formais de escala. Esses ajustes protegem justamente o que o sistema vai carregar de mais sensivel: pessoas, motoristas, operacao diaria, historico e evidencias.
