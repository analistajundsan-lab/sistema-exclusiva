# Status atual do que foi corrigido e saude do sistema

Data: 16/06/2026

## Correcoes realizadas

### Confirmacao e trocas de escala

- Foi ajustado o fluxo para permitir trocar novamente uma linha ja confirmada.
- Ao abrir uma troca, o sistema agora busca outras linhas do mesmo prefixo na mesma data e unidade.
- Essas outras linhas aparecem como opcoes marcaveis, permitindo registrar trocas em sequencia para o mesmo carro.
- A troca das linhas adicionais nao e obrigatoria: o plantonista escolhe quais linhas tambem devem entrar na troca.
- Quando o carro tiver apenas uma linha prevista, sem outras rotas em sequencia, ele continua seguindo a regra normal dos proximos intervalos de confirmacao.
- O painel lateral de trocas foi corrigido para respeitar unidade e data selecionadas.
- O historico de troca agora pode ser encontrado tanto pelo prefixo que saiu quanto pelo prefixo que entrou.

### Dashboard

- O dashboard passou a atualizar automaticamente as confirmacoes e trocas.
- A atualizacao automatica foi aplicada para todas as unidades/usuarios, nao apenas Caieiras.
- Os cards foram reorganizados para dar mais destaque a confirmadas e pendentes.
- Entradas e saidas ficaram abaixo com fonte menor, como informacao secundaria.

### Perfil Jerusa

- O bootstrap foi ajustado para manter Jerusa como administradora com acesso total.
- O acesso total passa pela flag de super admin no banco, respeitando o modelo atual de permissao.
- Admins/super admins continuam tendo acesso amplo as telas e acoes administrativas.

### Ocorrencias

- A tela de ocorrencias agora faz atualizacao automatica silenciosa, sem ficar piscando carregamento.
- Foi adicionado campo opcional para selecionar/informar o prefixo substituto do carro da ocorrencia.
- O texto de WhatsApp da ocorrencia inclui o prefixo substituto quando informado.
- O botao de WhatsApp agora abre um menu com:
  - WhatsApp pessoal
  - WhatsApp Business
- Quem criou uma ocorrencia pode editar o registro dentro de ate 2 horas.
- Depois de 2 horas, o criador nao consegue mais editar a ocorrencia.
- Usuarios admin/super admin podem editar ou apagar ocorrencias de qualquer usuario.
- A exclusao de ocorrencias ficou restrita a admin/super admin.

## Saude do sistema

### Validacoes locais executadas

- Build do frontend executado com sucesso:
  - `npm run build`
- Testes completos do backend executados com sucesso:
  - `python -m pytest -q`
  - Resultado: 140 testes passaram
- Testes especificos de ocorrencias executados com sucesso:
  - `python -m pytest tests/test_crud.py -q`
  - Resultado: 25 testes passaram
- Testes especificos de escala/troca executados com sucesso:
  - `python -m pytest tests/test_schedule_api.py -q`
  - Resultado: 22 testes passaram

### Saude observada no ultimo deploy validado

- Backend Fly estava respondendo:
  - `/health`: OK
  - `/ready`: OK
- Maquina Fly estava iniciada com health check passando.
- Frontend Vercel estava com deploy em estado `READY`.
- Alias de producao do frontend respondia HTTP 200.
- Asset principal do frontend respondia HTTP 200.

### Observacoes

- Existe um arquivo nao rastreado no projeto que nao foi alterado nestas correcoes:
  - `MODULO SST - SEGURANCA DO TRABALHo.md`
- Durante logs do backend foi visto aviso de Redis recusando conexao local, mas a aplicacao continuou saudavel e respondendo normalmente.
- Antes de um novo deploy, recomenda-se repetir:
  - `npm run build`
  - `python -m pytest -q`

