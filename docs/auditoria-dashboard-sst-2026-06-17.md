# Auditoria e plano de evolucao - Dashboard SST

Data: 2026-06-17  
Projeto: Sistema Exclusiva  
Foco: dashboard de Seguranca do Trabalho, sinistros, check-list, liberacao de condutor e saude/bem-estar

## Fontes avaliadas

- Agente de referencia: `C:\Users\User\Videos\MEUS PROJETOS\AGENTES\AGENTE DASHBOARD BI CONTROLADORIA.md`
- Planilha de liberacao de condutor: `Checklist de Liberação do Condutor – Início de Jornada SGSV - Revisado aguardando codificação.xlsx`
- Planilha de sinistros: `Monitoramento de Sinistros - Modelo REV3 (Modelo).xlsx`
- Check-list diario garagem Caieiras: `CHECK LIST DIARIO GARAGEM CAIEIRAS.xlsx`
- Frontend SST: `frontend/src/pages/SSTDashboard.tsx`, `SSTSinistros.tsx`, `SSTOcorrencias.tsx`, `SSTLiberacao.tsx`, `SSTSaude.tsx`, `SSTChecklistView.tsx`, `Safety.tsx`
- Backend SST/Safety: `backend/routes_sst.py`, `backend/routes_safety.py`, `backend/models.py`, `backend/schemas.py`

## Resumo executivo

O sistema ja tem uma base operacional importante: rotas protegidas por perfil, modulo de sinistros, encaminhamento de ocorrencias para SST, check-list veicular, liberacao de condutor, saude/bem-estar e auditoria basica. O problema principal e que o dashboard SST ainda nao atua como produto de BI. Ele mostra contadores isolados, sem tendencia, sem meta, sem comparativo, sem matriz de risco, sem funil de tratativa e sem uma area clara de acoes pendentes.

A oportunidade e grande: as planilhas de referencia contem campos de investigacao, gravidade, probabilidade, indice de risco, turno, cliente, horario, dano, terceiro, afastamento, custo, responsabilidade, bloqueios de condutor e itens impeditivos. Hoje apenas uma parte pequena disso chega ao dashboard.

Recomendacao central: transformar `/sst` em um cockpit profissional de risco e acao, com tres niveis:

1. Visao executiva: risco atual, sinistros, bloqueios, check-list, investigacoes e pendencias criticas.
2. Visao analitica: tendencias, rankings, matriz de risco, Pareto por causa/tipo/unidade/veiculo/condutor.
3. Visao operacional: tabela de acoes com responsavel, prazo, status, prioridade e trilha de auditoria.

## Estado atual

### O que ja existe bem

- Modulo SST separado com rotas em `/sst` e regras de papel para tecnico, engenheiro e admin.
- Dashboard atual com KPIs de sinistros, investigacao, encerrados, ocorrencias, veiculos, bloqueados, liberados e checklists.
- Submodulos para sinistros, ocorrencias encaminhadas, liberacao de condutor e saude/bem-estar.
- Fluxo de check-list veicular com submissao publica, classificacao de status e criacao de ticket de manutencao quando ha item bloqueante.
- Visao consultiva para SST em `/safety/sst-view`, incluindo tickets aprovados pela gerencia.
- Exportacao CSV/XLSX para submissao de check-list.
- Auditoria e historico para sinistros.
- Build frontend validado e testes selecionados de backend passando.

### Fragilidades atuais

1. Dashboard sem serie temporal
   - `SSTDashboard.tsx` mostra cards e rankings, mas nao tem linha mensal, barras por categoria, matriz de risco, funil ou heatmap.

2. KPIs sem comparativo
   - Nao ha variacao versus mes anterior, meta, tolerancia, SLA, tendencia ou severidade visual baseada em regra.

3. Backend de dashboard pequeno demais
   - `backend/routes_sst.py` calcula poucos contadores.
   - `total_motoristas` retorna `0`.
   - `checklists_pendentes` retorna `0`.
   - `ocorrencias_sst` nao aplica o mesmo filtro de unidade usado nos demais blocos.
   - `checklists_hoje` nao aplica escopo por unidade no endpoint `/sst/dashboard`.

4. Modelo de sinistro abaixo da planilha de referencia
   - O Excel de sinistros traz gravidade, probabilidade, indice de risco, turno, cliente/CAD, horario, fator contribuinte, condicao ambiental, falha do condutor, terceiro, lesao, afastamento, custo final, responsabilidade e status RAT.
   - O modelo atual cobre identificacao basica, local, tipo, descricao, danos, evidencias, envolvidos e status, mas nao estrutura varios campos analiticos essenciais.

5. Liberacao de condutor ainda e formulario administrativo
   - A planilha de liberacao separa itens impeditivos e nao impeditivos, fadiga, jornada, psicossocial, higiene, EPI, DDS e declaracao.
   - O sistema tem flags como documentacao, treinamentos, exames, ASO, reciclagem e avaliacoes, mas nao preserva as respostas item a item nem gera score/risco por dimensao.

6. Check-list de garagem ainda nao vira inteligencia
   - A planilha diaria por veiculo mostra itens recorrentes de inspecao: freios, luzes, pneus/TWI, extintor, oleo/agua/combustivel, motor, limpador, buzina, limpeza, documentacao, cintos, espelhos, porta/ar, avarias.
   - O sistema registra check-list, mas o dashboard SST nao mostra conformidade por item, reincidencia por veiculo, itens mais reprovados ou frota sem check-list.

7. Visual ainda amador para um cockpit de gestao
   - Os cards atuais funcionam, mas parecem uma grade simples de numeros.
   - Falta hierarquia visual: risco critico no topo, tendencia no centro, causas/segmentos abaixo e acoes no rodape.
   - Nao ha filtros no topo da pagina SST por periodo, unidade, tipo, gravidade/status.

8. Baixa reutilizacao de componentes BI
   - Nao ha biblioteca de graficos instalada.
   - `KpiCard` e local ao dashboard, nao e um componente reutilizavel com variacao, meta, tooltip e estado.

## Lacunas contra as planilhas de referencia

### Sinistros

Campos que deveriam entrar no modelo ou em tabelas auxiliares:

- `gravidade`
- `probabilidade`
- `indice_risco`
- `turno`
- `tipo_operacao`
- `cliente_cad`
- `horario_ocorrencia` como dimensao analitica
- `fator_contribuinte`
- `condicao_ambiental`
- `falha_condutor`
- `falha_terceiro`
- `houve_terceiro`
- `houve_vitima`
- `tipo_lesao`
- `houve_afastamento`
- `tipo_trajeto`
- `danos_materiais`
- `custo_final`
- `responsabilidade`
- `tratativa_acao`
- `responsavel_acao`
- `prazo_acao`
- `status_acao`

Indicadores recomendados:

- Sinistros por mes e acumulado no ano.
- Taxa de sinistro por veiculo ativo.
- Sinistros por gravidade.
- Matriz probabilidade x gravidade.
- Top condutores, veiculos, linhas, unidades e clientes/CAD.
- Pareto de fator contribuinte.
- Sinistros por turno e faixa horaria.
- Acoes corretivas abertas, vencidas e concluidas.
- Custo final por mes, unidade, tipo e responsabilidade.
- Tempo medio de encerramento.
- % investigados dentro do SLA.

### Liberacao de condutor

Campos/indicadores faltantes:

- Respostas item a item dos impeditivos e nao impeditivos.
- Score de aptidao por condutor/jornada.
- Motivo de bloqueio por categoria: fisica, fadiga, psicossocial, seguranca operacional, jornada.
- Condutores bloqueados hoje.
- Liberados com restricao.
- Reincidencia de bloqueio por condutor.
- Alertas de fadiga: menos de 4h, 4-6h, jornada excessiva, outra atividade nas ultimas 12h.
- Registro de declaracao e aceite.

### Check-list diario de garagem

Campos/indicadores faltantes:

- % da frota com check-list no dia.
- Veiculos sem check-list por unidade.
- Itens mais reprovados.
- Reincidencia por prefixo.
- Falhas bloqueantes por componente.
- Tempo entre registro e tratativa.
- Avarias abertas por mais de X dias.
- Ranking de componentes criticos: freios, pneus, extintor, luzes, documentacao, cintos, espelhos.

## Proposta de dashboard profissional

### Tela `/sst` redesenhada

```text
Topo
Dashboard SST | Periodo | Unidade | Tipo de risco | Status | Exportar

Faixa 1 - Saude operacional hoje
Risco atual | Sinistros mes | Check-list frota hoje | Bloqueios condutor | Acoes vencidas | SLA investigacao

Faixa 2 - Tendencia e risco
Grafico linha: sinistros por mes
Matriz: gravidade x probabilidade
Funil: aberto -> analise -> investigacao -> encerrado

Faixa 3 - Causas e concentracao
Pareto: fatores contribuintes
Barra horizontal: tipos de ocorrencia/sinistro
Ranking: veiculos e condutores com reincidencia

Faixa 4 - Check-list e liberacao
Conformidade de check-list por unidade
Itens mais reprovados
Condutores em alerta de fadiga/psicossocial

Faixa 5 - Plano de acao
Tabela: item | unidade | origem | severidade | responsavel | prazo | dias em atraso | status | acao
```

### Componentes recomendados

- `components/dashboard/KpiCard.tsx`
- `components/dashboard/ChartPanel.tsx`
- `components/dashboard/DashboardFilters.tsx`
- `components/dashboard/RiskMatrix.tsx`
- `components/dashboard/RankingList.tsx`
- `components/dashboard/ActionTable.tsx`
- `components/dashboard/StatusBadge.tsx`
- `components/dashboard/LoadingSkeleton.tsx`
- `components/dashboard/EmptyState.tsx`

### Biblioteca visual

Instalar uma biblioteca de graficos para React:

- Opcao recomendada: `recharts`
- Alternativa mais robusta para BI: `echarts-for-react`

Para este projeto, `recharts` e suficiente para linha, barra, funil simples, area e composicoes. Para heatmap/matriz de risco mais sofisticada, `echarts` pode ser melhor.

## Proposta de contrato de API

Criar endpoint agregado:

```text
GET /sst/dashboard-v2?unit=&date_start=&date_end=&status=&severity=
```

Resposta sugerida:

```json
{
  "summary": {
    "risk_score": 0,
    "sinistros_periodo": 0,
    "sinistros_delta_pct": 0,
    "checklist_compliance_pct": 0,
    "condutores_bloqueados": 0,
    "acoes_vencidas": 0,
    "sla_investigacao_pct": 0
  },
  "trends": {
    "sinistros_por_mes": [],
    "checklists_por_dia": []
  },
  "breakdowns": {
    "por_gravidade": [],
    "por_tipo": [],
    "por_turno": [],
    "por_unidade": [],
    "por_fator_contribuinte": []
  },
  "risk_matrix": [],
  "rankings": {
    "condutores": [],
    "veiculos": [],
    "linhas": [],
    "itens_checklist": []
  },
  "actions": []
}
```

## Melhorias tecnicas priorizadas

### Quick wins

1. Corrigir `checklists_pendentes` e `total_motoristas`, que hoje retornam `0`.
2. Aplicar escopo de unidade em `checklists_hoje` e `ocorrencias_sst` no `/sst/dashboard`.
3. Adicionar filtros no topo do dashboard: periodo e unidade.
4. Extrair `KpiCard` para componente compartilhado com delta, status e tooltip.
5. Adicionar estados profissionais de carregamento e vazio.
6. Adicionar uma linha de tendencia mensal e um ranking visual com barras.

### Medio esforco

1. Criar `dashboard-v2` com agregacoes por periodo, tipo, status, unidade, turno e gravidade.
2. Incluir biblioteca de graficos.
3. Criar tabela de plano de acao para sinistros e ocorrencias SST.
4. Criar dicionario de KPIs em `docs/kpi-sst.md`.
5. Criar testes de API para dashboard SST.
6. Criar seed/demo consistente para validar visualmente os graficos.

### Estrutural

1. Evoluir `Sinistro` para contemplar gravidade, probabilidade, indice de risco, custo, fator contribuinte, terceiro, vitima, afastamento e plano de acao.
2. Criar tabela normalizada para respostas de liberacao de condutor, em vez de apenas flags agregadas.
3. Criar dimensoes/visoes analiticas: unidade, veiculo, condutor, data, status, severidade, categoria de item.
4. Criar mecanismo de SLA: prazo esperado por severidade e tipo de tratativa.
5. Criar auditoria de mudanca de KPI/regra de negocio.

### Futuro avancado

1. Alertas automaticos por reincidencia de condutor/veiculo.
2. Score preditivo simples de risco por veiculo/condutor/unidade.
3. Exportacao executiva PDF/XLSX do dashboard SST.
4. Comparativo mensal por unidade com ranking corporativo.
5. Painel mobile simplificado para tecnico em campo.

## Roadmap recomendado

### Fase 1 - Base BI sem quebrar fluxo atual

- Implementar `/sst/dashboard-v2`.
- Corrigir escopo e valores zerados.
- Adicionar filtros de periodo/unidade.
- Adicionar graficos principais.
- Criar componentes reutilizaveis.
- Cobrir endpoint com testes.

Entrega esperada: dashboard visualmente profissional com os dados ja existentes.

### Fase 2 - Absorver a planilha de sinistros

- Ampliar schema/modelo de sinistro.
- Migrar formulario de sinistro para capturar gravidade, probabilidade, risco, turno, cliente, fator contribuinte, vitima, terceiro, custo e plano de acao.
- Adicionar matriz de risco, Pareto e SLA.

Entrega esperada: dashboard deixa de ser apenas contagem e passa a explicar causa, risco e impacto.

### Fase 3 - Liberacao e check-list como inteligencia operacional

- Modelar respostas item a item para liberacao de condutor.
- Integrar check-list diario com indicadores por item e por prefixo.
- Criar alertas de fadiga, psicossocial e reincidencia.

Entrega esperada: SST consegue agir preventivamente antes do sinistro.

## Riscos e cuidados

- Nao alterar formula oficial de KPI sem validacao do responsavel SST.
- Nao remover indicadores existentes enquanto os novos nao forem homologados.
- Garantir escopo de unidade no backend, nunca apenas no frontend.
- Evitar dashboard bonito com dado errado: cada KPI deve ter formula, fonte, granularidade e owner.
- Cuidado com dados pessoais de condutor: rankings devem respeitar papel/permissao e finalidade.

## Validacoes feitas

- Extraidos metadados e campos das tres planilhas de referencia.
- Mapeados arquivos de frontend/backend relacionados ao SST.
- `npm run build` executado com sucesso no frontend.
- `python -m pytest tests/test_observability.py tests/test_maintenance.py tests/test_authorization.py` executado com sucesso: 20 testes passaram.

## Proxima acao recomendada

Implementar a Fase 1 primeiro. Ela entrega ganho visual e gerencial rapido sem exigir migracao grande de dados: novo endpoint agregado, filtros, cards com contexto, graficos e tabela de acoes. Depois disso, iniciar a Fase 2 para enriquecer sinistros com os campos da planilha REV3.
