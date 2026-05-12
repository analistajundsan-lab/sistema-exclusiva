# Auditoria de Segurança - MVP Sistema Exclusiva

Data: 2026-05-12

## Status

O MVP esta pronto para demonstracao e teste operacional controlado. Para uso produtivo com dados reais de clientes, manter as variaveis de ambiente fortes e publicar o backend com banco gerenciado.

## Controles aplicados

- Senha temporaria obrigatoria no primeiro acesso.
- Cadastro administrativo real separado do cadastro publico.
- Cadastro publico nao consegue criar perfil admin.
- Vinicius e o unico perfil autorizado a apagar/recuperar historico.
- Historico usa exclusao logica com janela de recuperacao de 30 dias.
- Alteracoes de escala, confirmacoes, cancelamentos, trocas e usuarios geram auditoria.
- Endpoints de importacao e gestao de usuarios exigem admin.
- Cancelar linha e reabrir confirmacao exigem supervisor/admin.
- Headers de seguranca adicionados no backend.
- CORS configurado para localhost, tablet na rede e futuro dominio online.
- Documentacao OpenAPI fica desativada quando `ENVIRONMENT=production`.
- Segredo JWT padrao e recusado em producao.

## Pontos de atencao antes de producao

- Ativar backend com HTTPS, banco PostgreSQL gerenciado e Redis gerenciado.
- Definir `JWT_SECRET_KEY` forte e exclusivo.
- Remover ou proteger `/metrics` em producao com `EXPOSE_METRICS=false` ou rede privada.
- Adotar politica LGPD formal para retencao de historico, CPFs e anexos.
- Trocar armazenamento de token no frontend para cookie HttpOnly quando houver dominio definitivo.
- Incluir MFA para usuarios administrativos.
- Implementar upload seguro de fotos/videos com antivirus, limite de tamanho e links privados.
- Criar rotina agendada para expurgo definitivo de dados apagados apos 30 dias.

## Publicacao para apresentacao

O frontend pode ser publicado no Vercel em modo demonstracao (`VITE_DEMO_MODE=true`). Esse modo permite mostrar usabilidade com dados ficticios sem expor rotas reais, clientes ou escala sensivel.

Para teste real com dados vivos, publicar tambem o backend e configurar:

- `VITE_DEMO_MODE=false`
- `VITE_API_URL=https://URL-DO-BACKEND`
- `ALLOWED_ORIGINS=https://URL-DO-VERCEL`
