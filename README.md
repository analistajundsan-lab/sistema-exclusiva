# Sistema Exclusiva Operacional

Base inicial do novo sistema operacional da Exclusiva Turismo.

Este projeto nasceu a partir do app anterior da Exclusiva, mas agora passa a ser uma base mais ampla para validar a operacao real da empresa com o menor custo possivel.

## Objetivo do MVP

Centralizar informacoes que hoje ficam espalhadas em WhatsApp, planilhas e anotacoes:

- Escala operacional.
- Confirmacao de linhas por unidade.
- Trocas de veiculos.
- Ocorrencias.
- Historico e auditoria.
- Dashboards para gestao.
- Comunicacao pronta para WhatsApp.

## Unidades iniciais

- Caieiras.
- Jundiai.
- Santana de Parnaiba.

Campinas fica fora do primeiro MVP e deve entrar apenas quando houver aprovacao e dados confiaveis.

## Estrutura

```text
backend/   API FastAPI herdada e em adaptacao
frontend/  Aplicacao React/Vite herdada e em adaptacao
tests/     Testes automatizados herdados
infra/     Infraestrutura Docker/observabilidade herdada
preview/   Preview visual estatico para apresentacao
docs/      Documentacao herdada e futura documentacao do novo produto
```

## Base reaproveitada

- Autenticacao JWT.
- Usuarios e perfis.
- CRUD de ocorrencias.
- CRUD de trocas.
- Auditoria.
- Dashboard inicial.
- Docker Compose.
- Testes Pytest.

## Proximos dominios do sistema

- Unidades.
- Clientes.
- Motoristas.
- Veiculos.
- Escalas.
- Linhas da escala em formato linear.
- Confirmacoes de plantao.
- Publicacao de escala.
- Resumo de alteracoes por unidade.
- Geracao de texto para WhatsApp.
- Anexos em ocorrencias.

## Preview visual

O preview estatico esta em:

```text
preview/index.html
```

Ele serve para apresentacao e alinhamento antes da programacao completa.
