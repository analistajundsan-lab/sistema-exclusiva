# Dicionário de KPIs — Cockpit SST

Data: 2026-06-19
Fonte de cálculo: `backend/routes_sst.py` (`/sst/dashboard` e `/sst/dashboard-v2`)
Consumo: `frontend/src/pages/SSTDashboard.tsx`

Este documento define cada indicador do cockpit SST: fórmula, fonte de dados,
granularidade, filtros aplicáveis e responsável (owner). Serve de referência
para auditoria e para evitar "dashboard bonito com dado errado".

Regras gerais:

- Todo KPI respeita o escopo de unidade do usuário (`apply_user_unit_scope`):
  Técnico de Segurança enxerga apenas a sua unidade; Engenheiro de Segurança e
  Admin enxergam todas. O filtro de unidade nunca é só no frontend.
- O período padrão do `dashboard-v2` é os últimos 30 dias (`date_start`/`date_end`).
- "Período anterior" = janela imediatamente anterior de mesma duração, usada para
  calcular variações percentuais.

## KPIs de resumo (`summary`)

| KPI | Fórmula / Definição | Fonte | Granularidade | Owner |
|-----|---------------------|-------|---------------|-------|
| `risk_score` (Índice de atenção) | `min(100, round(sinistros_periodo*8 + condutores_bloqueados*12 + (100 - compliance_pct)*0.4))`. **Heurístico, não é fórmula oficial de risco.** | Sinistros + Liberações + Check-list | Período | SST |
| `sinistros_periodo` | Contagem de sinistros com `data_ocorrencia` dentro do período. | `Sinistro` | Período | SST |
| `sinistros_delta_pct` | `(periodo - anterior) / anterior * 100`. Se anterior = 0: 100% quando há sinistros, senão 0. | `Sinistro` | Período vs anterior | SST |
| `checklist_compliance_pct` | `veículos com check-list hoje ÷ frota ativa × 100`. | `DriverChecklistSubmission` × `SafetyVehicle` | Dia | SST |
| `condutores_bloqueados` | Liberações com `resultado = NAO_LIBERADO`. | `LiberacaoCondutor` | Acumulado | SST |
| `condutores_restricao` | Liberações com `resultado = LIBERADO_COM_RESTRICAO`. | `LiberacaoCondutor` | Acumulado | SST |
| `sinistros_investigacao` | Sinistros com `status = EM_INVESTIGACAO`. | `Sinistro` | Acumulado | SST |
| `ocorrencias_sst` | Ocorrências com `sst_forwarded = true`. | `Incident` | Acumulado | Gerência → SST |
| `total_veiculos` | `SafetyVehicle` ativos no escopo. | `SafetyVehicle` | Atual | SST |
| `custo_total` | Soma de `custo_final` dos sinistros do período. | `Sinistro` | Período | SST/Gestão |
| `acoes_abertas` | Tratativas de sinistro com `status_acao ≠ concluida`. | `Sinistro` | Atual | SST |
| `acoes_vencidas` | Ações abertas com `prazo_acao < hoje`. | `Sinistro` | Atual | SST |
| `acoes_concluidas` | Tratativas com `status_acao = concluida`. | `Sinistro` | Atual | SST |
| `com_vitima` | Sinistros do período com `houve_vitima = true`. | `Sinistro` | Período | SST |
| `com_terceiro` | Sinistros do período com `houve_terceiro = true`. | `Sinistro` | Período | SST |
| `com_afastamento` | Sinistros do período com `houve_afastamento = true`. | `Sinistro` | Período | SST/RH |
| `fadiga_alta` | Avaliações de saúde com `fadiga ∈ {alta, alto, critico, critica}`. | `SaudeBeEstarCondutor` | Acumulado | SST |
| `jornada_excessiva` | Avaliações de saúde com `jornada_excessiva = true`. | `SaudeBeEstarCondutor` | Acumulado | SST |

## Tendências (`trends`)

| Série | Definição | Fonte | Granularidade |
|-------|-----------|-------|---------------|
| `sinistros_por_mes` | Contagem de sinistros por mês nos últimos 12 meses. | `Sinistro` | Mês |
| `checklists_por_dia` | Contagem de submissões de check-list por dia nos últimos 14 dias. | `DriverChecklistSubmission` | Dia |

## Quebras (`breakdowns`)

Todas restritas ao período e ao escopo de unidade.

| Quebra | Dimensão | Fonte |
|--------|----------|-------|
| `por_tipo` | `tipo_sinistro` | `Sinistro` |
| `por_turno` | `turno` informado, ou derivado de `hora_ocorrencia` (Madrugada 0-5, Manhã 6-11, Tarde 12-17, Noite 18-23) | `Sinistro` |
| `por_unidade` | `unit` | `Sinistro` |
| `por_gravidade` | `gravidade` (1-5) | `Sinistro` |
| `por_fator_contribuinte` | `fator_contribuinte` (Pareto de causas) | `Sinistro` |
| `por_responsabilidade` | `responsabilidade` (própria/terceiro/indefinida) | `Sinistro` |
| `checklist_por_status` | `overall_status` da submissão | `DriverChecklistSubmission` |
| `bloqueio_por_motivo` | flags reprovadas (Documentação, Treinamentos, Exames, ASO, Reciclagem, Avaliações SST) | `LiberacaoCondutor` |
| `bloqueio_por_categoria` | `categoria_bloqueio` (física/fadiga/psicossocial/segurança/jornada/documental) | `LiberacaoCondutor` |
| `alerta_fadiga` | `alerta_fadiga` (<4h / 4-6h / jornada_excessiva / outra_atividade_12h) | `LiberacaoCondutor` |

## Matriz de risco (`risk_matrix`)

- Grade 5×5: `probabilidade` (1-5) × `gravidade` (1-5).
- `indice = probabilidade × gravidade`.
- `total` = sinistros do período cuja gravidade e probabilidade caem na célula.
- Bandas visuais (apenas leitura): índice ≥15 crítico (vermelho), ≥10 alto
  (laranja), ≥5 moderado (amarelo), <5 baixo (verde).

## Rankings (`rankings`)

| Ranking | Critério | Fonte |
|---------|----------|-------|
| `condutores` | Top 5 por nº de sinistros no período | `Sinistro.condutor_nome` |
| `veiculos` | Top 5 por nº de sinistros no período | `Sinistro.prefixo` |
| `cidades` | Top 5 por nº de sinistros no período | `Sinistro.cidade` |

> Atenção a dados pessoais: rankings de condutor respeitam papel/permissão e
> finalidade. Não expor a usuários sem necessidade operacional.

## Plano de ação (`actions`)

Lista de tratativas de sinistro (até 50, mais atrasadas primeiro):

| Campo | Definição |
|-------|-----------|
| `numero` | Número do sinistro (`SIN-AAAAMM-NNNN`) |
| `unit` | Unidade do sinistro |
| `responsavel` | `responsavel_acao` |
| `prazo` | `prazo_acao` |
| `dias_atraso` | `max(0, hoje - prazo_acao)` |
| `status_acao` | pendente / em_andamento / concluida |

## Cuidados de governança

- Não alterar fórmula de KPI sem validação do responsável SST.
- Não remover indicadores existentes enquanto novos não forem homologados.
- O `risk_score` é heurístico de priorização visual, **não** substitui a análise
  formal de risco (gravidade × probabilidade da matriz).
