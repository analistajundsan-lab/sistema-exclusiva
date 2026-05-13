# Status Atual - Sistema Exclusiva

Data: 2026-05-13

## Status geral

O projeto esta em versao MVP utilizavel para apresentacao e teste controlado.

O sistema ja pode ser demonstrado para a gestao em modo visual/operacional, com fluxo navegavel, dados demonstrativos no frontend online e dados reais importados no ambiente local.

## O que ja foi feito

### Base do projeto

- Nova base criada em `C:\Users\User\Videos\MEUS PROJETOS\SISTEMA EXCLUSIVA`.
- Estrutura separada em `backend`, `frontend`, `preview`, `tests`, `infra` e documentacao.
- Projeto versionado no GitHub:
  - `https://github.com/analistajundsan-lab/sistema-exclusiva`

### Frontend

- Aplicacao React/Vite criada e organizada.
- Layout responsivo para computador, tablet e celular.
- PWA configurado para instalacao em tablet.
- Manifest, icone e service worker adicionados.
- Login com CPF e senha.
- CPF com formatacao automatica no login e cadastro.
- Dashboard operacional.
- Tela de escala operacional.
- Tela de plantonista.
- Tela de ocorrencias.
- Tela de trocas.
- Tela de usuarios.
- Tela de auditoria.
- Modo demonstracao para Vercel, sem depender do backend e sem expor dados reais.

### Backend

- API FastAPI criada.
- Autenticacao por CPF e senha.
- Hash de senha.
- JWT access token e refresh token.
- Usuarios com perfis:
  - operador
  - supervisor
  - admin
- Obrigatoriedade de troca de senha temporaria.
- Cadastro de usuarios pelo admin.
- Restricao para impedir cadastro publico como admin.
- Importacao de planilha `.xlsx` da escala.
- Preview de importacao antes de salvar.
- Conversao da escala em blocos para formato linear.
- Consulta de linhas por data, unidade, prefixo, motorista, cliente, linha e status.
- Resumo por unidade.
- Confirmacao de linhas pelo plantonista.
- Historico de linhas confirmadas.
- Troca de carro vinculada a linha confirmada.
- Texto de WhatsApp para comunicar trocas.
- Atualizacao, cancelamento e reabertura de confirmacao de linha.
- Auditoria de acoes importantes.
- Exclusao logica de historico com recuperacao em ate 30 dias.
- Permissao de apagar/recuperar historico limitada ao perfil Vinicius.

### Usuarios configurados

- Jerusa ADM
  - CPF: `22692036824`
  - Senha temporaria: `Exclusiva@2026`

- Vinicius ADM
  - CPF: `41637531842`
  - Senha temporaria: `Exclusiva@2026`
  - Permissao especial: apagar/recuperar historico.

- Admin local antigo
  - CPF: `12345678900`
  - Senha: `Admin12345!`

### Escala real

- Planilha real importada no ambiente local:
  - `ESCALA GERAL 13-04-2026 ATUALIZADA..xlsx`
- Data operacional usada no MVP local:
  - `13/04/2026`
- Total importado anteriormente no ambiente local:
  - 569 linhas.

### Segurança aplicada

- Senha temporaria obrigatoria.
- Bloqueio de uso do sistema antes da troca de senha.
- Hash de CPF.
- Hash de senha.
- Tokens JWT.
- Refresh token no frontend.
- CORS configurado para localhost, tablet/rede e futuro dominio.
- Headers de seguranca no backend:
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Content-Security-Policy`
- Docs da API desativaveis em producao.
- `JWT_SECRET_KEY` padrao bloqueado em producao.
- Auditoria de acoes sensiveis.
- Historico protegido.
- `npm audit` corrigido no frontend.

## Correcoes aplicadas

### Deploy Vercel

Problema:
- O Vercel tentava instalar dependencias Python antigas e pesadas da raiz.
- O deploy estava usando uma configuracao experimental que podia falhar.

Correcao:
- `vercel.json` da raiz simplificado para publicar frontend estatico.
- Build configurado para:
  - entrar em `frontend`
  - instalar dependencias
  - executar `npm run build`
  - publicar `frontend/dist`
- Modo demonstracao ativado:
  - `VITE_DEMO_MODE=true`

### Segurança de dependencias

Problema:
- Vercel exibiu vulnerabilidades em dependencias de desenvolvimento do frontend.

Correcao:
- Dependencias do frontend atualizadas.
- `npm audit` passou a retornar `0 vulnerabilities`.
- Build validado com Vite atualizado.

### CPF

Problema:
- Usuario precisava digitar pontos e traco manualmente.

Correcao:
- Criado utilitario de CPF.
- Campo agora aceita numeros e formata automaticamente como `000.000.000-00`.

### Usuarios e senhas

Problema:
- Era necessario cadastrar Jerusa e Vinicius como perfis reais de teste.

Correcao:
- Criado bootstrap de admins.
- Jerusa e Vinicius criados como admin.
- Senha temporaria obrigatoria configurada.
- Vinicius recebeu permissao exclusiva de apagar/recuperar historico.

### Historico

Problema:
- Historico precisava ser recuperavel por 30 dias e apagavel apenas por Vinicius.

Correcao:
- Soft delete implementado.
- Restore em ate 30 dias.
- UI de auditoria mostra apagar/recuperar somente para quem tem permissao.

### Fluxo do plantonista

Problema:
- Precisava confirmar linhas, registrar troca e manter historico.

Correcao:
- Confirmacao de linha criada.
- Linha confirmada sai do painel pendente e entra no historico.
- Troca so pode ser criada para linha confirmada.
- Cancelamento e reabertura de confirmacao adicionados para supervisor/admin.

## Validacoes realizadas

- Frontend build aprovado.
- Backend testado com suite automatizada.
- Resultado atual:
  - `90 passed`
- Auditoria de seguranca documentada em:
  - `SECURITY_AUDIT.md`
- Guia de Vercel documentado em:
  - `VERCEL_PRESENTATION.md`

## Como testar hoje

### Local

- Computador:
  - `http://localhost:5174/login`
- Tablet/rede:
  - `http://192.168.15.14:5174/login`

### Online

O projeto esta pronto para deploy no Vercel como demonstracao.

Config atual:

```txt
VITE_DEMO_MODE=true
VITE_API_URL=/_/backend
```

Nesse modo o app abre online sem backend real e usa dados demonstrativos.

## O que falta para usar 100% em producao real

### 1. Backend online real

Para uso real fora da rede local, precisa publicar o backend em ambiente com persistencia.

Opcoes:

- Render
- Railway
- Fly.io
- VPS propria
- Vercel com arquitetura ajustada para serverless

Recomendacao MVP:
- Backend no Render ou Railway.
- Frontend no Vercel.

### 2. Banco de dados real

Hoje o ambiente local usa SQLite.

Para producao precisa:

- PostgreSQL gerenciado.
- Backup automatico.
- Controle de acesso.
- Rotina de migracao.

Opcoes gratuitas ou baratas:

- Neon
- Supabase
- Railway Postgres
- Render Postgres

### 3. Upload de fotos e videos

Ainda falta implementar a parte completa de anexos em ocorrencias.

Necessario:

- Upload seguro.
- Limite de tamanho.
- Validacao de tipo de arquivo.
- Armazenamento privado.
- Link temporario.
- Relacao com ocorrencia.

Opcoes:

- Cloudflare R2
- Supabase Storage
- AWS S3
- Vercel Blob

### 4. Permissoes por unidade

Hoje existem perfis por papel.

Para uso real completo falta:

- Usuario vinculado a unidade.
- Plantonista ver apenas sua unidade.
- Admin ver tudo.
- Gerencia ver unidades especificas.
- Campinas poder entrar depois como perfil separado.

### 5. Escala editavel completa

Hoje o sistema importa e lista escala.

Para uso 100% falta:

- Editor completo de escala no navegador.
- Criacao manual de linha.
- Edicao em massa.
- Controle de alteracoes por unidade.
- Texto de alteracoes separado por unidade.
- Exportacao Excel no modelo operacional.

### 6. Ocorrencias completas

Hoje existe CRUD de ocorrencias.

Para producao falta:

- Categorias finais.
- Severidade.
- Vinculo obrigatorio com linha/prefixo/data.
- Anexos de foto/video.
- Historico detalhado de status.
- Relatorio por periodo.

### 7. Notificacoes e WhatsApp

Hoje o sistema gera texto para copiar.

Para uso real falta:

- Botao de abrir WhatsApp com texto pronto.
- Padroes separados por cliente/unidade.
- Historico de comunicacao enviada.
- Controle do que ja foi comunicado.

### 8. Auditoria mais forte

Hoje a auditoria ja existe.

Para producao falta:

- Log critico imutavel.
- Registro de IP/dispositivo.
- Motivo obrigatorio em acoes criticas.
- Reautenticacao antes de apagar historico.
- Expurgo automatico apos 30 dias.

### 9. Autenticacao mais forte

Para producao com dados reais:

- Senha forte obrigatoria.
- Recuperacao de senha real por e-mail.
- Bloqueio por tentativas.
- MFA para admins.
- Sessao mais segura por cookie HttpOnly.

### 10. Deploy definitivo

Para uso 100%:

- Definir dominio.
- Configurar HTTPS.
- Configurar variaveis de ambiente.
- Configurar backup.
- Rodar seed inicial.
- Importar escala real.
- Criar usuarios finais.
- Testar fluxo completo com plantonistas.

## Proxima fase recomendada

Fase 1 - Online demonstrativo:
- Finalizar deploy Vercel em modo demo.
- Gerar link publico para gestao.

Fase 2 - Piloto real interno:
- Publicar backend real.
- Usar PostgreSQL.
- Desligar `VITE_DEMO_MODE`.
- Criar usuarios reais.
- Importar escala oficial.
- Testar com uma unidade primeiro.

Fase 3 - Produto comercial:
- Multiempresa.
- Controle por cliente/unidade.
- Plano de usuarios.
- Dominio proprio.
- Relatorios premium.
- Aplicativo instalavel validado em tablets.
