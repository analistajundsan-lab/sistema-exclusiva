# MÓDULO SST - SEGURANÇA DO TRABALHO

## Plano de Implementação - Sistema Exclusiva Turismo

---

# 1. OBJETIVO

Criar um módulo completo de Segurança do Trabalho (SST) dentro do Sistema Exclusiva Turismo, permitindo que Técnicos de Segurança e Engenheiros de Segurança realizem acompanhamento operacional, gestão de sinistros, ocorrências, saúde do condutor e liberações de motoristas.

Todo o módulo deverá operar através de controle de acesso por cargo e unidade operacional.

---

# 2. PERFIS DE ACESSO

## Técnico de Segurança

Possui acesso apenas aos dados da unidade vinculada ao seu cadastro.

### Permissões

* Dashboard da unidade
* Sinistros da unidade
* Condutores da unidade
* Ocorrências encaminhadas para SST
* Checklists da unidade
* Liberações de condutores da unidade
* Saúde e bem-estar dos condutores da unidade

---

## Engenheiro de Segurança

Possui visão corporativa.

### Permissões

* Todas as unidades
* Todos os sinistros
* Todos os indicadores operacionais
* Todas as ocorrências SST
* Todos os condutores
* Todas as liberações de condutor
* Todos os registros de saúde e bem-estar

### Filtros

* Unidade
* Região
* Empresa
* Período

---

# 3. MENU DO TÉCNICO DE SEGURANÇA

1. Dashboard
2. Check-list
3. Registro de Sinistro
4. Registro de Ocorrências SST
5. Liberação de Condutor
6. Saúde e Bem-Estar do Condutor

---

# 4. MENU DO ENGENHEIRO DE SEGURANÇA

1. Dashboard Geral
2. Check-list
3. Registro de Sinistro
4. Registro de Ocorrências SST
5. Liberação de Condutor
6. Saúde e Bem-Estar do Condutor

---

# 5. DASHBOARD SST

## Dashboard Técnico

Exibe apenas informações da unidade vinculada ao usuário.

### Indicadores

* Total de veículos da unidade
* Total de motoristas ativos
* Sinistros do mês
* Sinistros do ano
* Sinistros em investigação
* Sinistros encerrados
* Condutores bloqueados
* Condutores liberados
* Checklists realizados hoje
* Checklists pendentes

### Indicadores Operacionais

* Quantidade de colisões
* Quantidade de abalroamentos
* Quantidade de danos internos
* Quantidade de danos externos
* Quantidade de ocorrências com terceiros

### Rankings

* Motoristas com mais ocorrências
* Veículos com mais sinistros
* Linhas com maior incidência de ocorrências

### Gráficos

* Sinistros por mês
* Sinistros por tipo
* Sinistros por veículo
* Sinistros por motorista
* Evolução de ocorrências por período

---

## Dashboard Engenheiro

Mesma estrutura do dashboard técnico.

### Diferenças

* Visão corporativa
* Exibição de todas as unidades
* Comparativo entre unidades
* Consolidação geral dos indicadores SST

### Filtros

* Unidade
* Empresa
* Região
* Data

---

# 6. REGISTRO DE SINISTRO

## Objetivo

Eliminar controles em papel.

Centralizar histórico.

Garantir rastreabilidade completa das ocorrências envolvendo veículos e condutores.

---

## Fluxo Operacional

Retorno do veículo

↓

Porteiro identifica avaria

↓

Motorista é questionado

↓

Tráfego é acionado

↓

Técnico SST recebe informação

↓

Técnico registra ocorrência

↓

Investigação

↓

Conclusão

↓

Arquivamento

---

## Tela de Cadastro

### Dados Gerais

* Número do Sinistro
* Data
* Hora
* Unidade
* Empresa

### Veículo

* Prefixo
* Placa
* Modelo
* Frota

### Condutor

* Nome
* Matrícula
* CPF
* Tempo de empresa

### Informações da Ocorrência

* Data da ocorrência
* Hora da ocorrência
* Local
* Cidade
* Estado

### Tipo de Sinistro

Cadastro parametrizado.

Exemplos:

* Colisão
* Abalroamento
* Atropelamento
* Queda de passageiro
* Dano patrimonial
* Terceiros
* Acidente sem vítima
* Acidente com vítima

### Descrição

Campo de texto detalhado.

### Danos Identificados

Permitir múltiplos registros.

Exemplos:

* Para-choque dianteiro
* Para-lama esquerdo
* Retrovisor
* Porta
* Vidros
* Lanternas

### Evidências

Upload múltiplo de:

* Fotos
* Vídeos
* Documentos

### Envolvidos

* Condutor
* Passageiro
* Terceiro
* Pedestre

### Status

* Aberto
* Em análise
* Aguardando documentos
* Em investigação
* Encerrado

### Histórico

Registrar:

* Usuário
* Data
* Hora
* Alteração realizada

Auditoria obrigatória.

---

# 7. REGISTRO DE OCORRÊNCIAS SST

## Regra Principal

Ocorrências registradas por:

* Plantonistas
* Equipe de Tráfego

Não devem ser exibidas automaticamente para SST.

---

## Fluxo

Plantonista ou Tráfego

↓

Registra ocorrência

↓

Ocorrência fica disponível para Gerência

↓

Gerência analisa

↓

Decide se SST deve ser envolvido

↓

Encaminha para SST

↓

Ocorrência aparece no painel SST

---

## Nova Funcionalidade

### Encaminhar para SST

Disponível apenas para:

* Gerentes
* Coordenadores autorizados

Ao encaminhar:

Registrar:

* Data do encaminhamento
* Usuário responsável
* Motivo
* Prioridade

---

## Painel SST

O Técnico visualizará:

* Apenas ocorrências encaminhadas
* Apenas ocorrências da sua unidade

---

## Ocorrências Criadas pelo SST

Devem permanecer visíveis para o próprio SST.

Permissões:

* Consultar
* Editar
* Atualizar
* Encerrar

---

# 8. CHECKLIST

Módulo já existente.

Não alterar processo atual.

---

## Funções Disponíveis

### Consulta

Filtros:

* Unidade
* Veículo
* Condutor
* Data
* Status

### Gestão de QR Code

Cada checklist deve possuir:

* Link único
* QR Code único

### Painel SST

Visualizar:

* Checklists realizados
* Pendentes
* Reprovados

---

# 9. LIBERAÇÃO DE CONDUTOR

## Objetivo

Controlar autorização operacional de motoristas.

---

## Situações

* Admissão
* Retorno de afastamento
* Pós-acidente
* Reciclagem obrigatória
* Restrição médica
* Reintegração operacional

---

## Cadastro

* Motorista
* Matrícula
* Unidade
* Motivo da avaliação

---

## Validações

* Documentação
* Treinamentos
* Exames
* ASO
* Reciclagem
* Avaliações SST

---

## Resultado

* Liberado
* Liberado com restrição
* Não liberado

---

## Evidências

Upload de:

* PDF
* Imagens
* Documentos

---

## Histórico

Auditoria completa.

---

# 10. SAÚDE E BEM-ESTAR DO CONDUTOR

## Objetivo

Registrar acompanhamentos preventivos realizados pelo SST.

---

## Cadastro

### Identificação

* Condutor
* Matrícula
* Unidade
* Data
* Técnico responsável

---

## Avaliação Física

* Qualidade do sono
* Fadiga
* Alimentação
* Hidratação
* Queixas físicas

---

## Avaliação Emocional

* Estresse
* Ansiedade
* Conflitos pessoais
* Observações comportamentais

---

## Avaliação Operacional

* Jornada excessiva
* Queixas recorrentes
* Histórico recente de ocorrências
* Necessidade de treinamento

---

## Plano de Ação

Campo descritivo.

---

## Encaminhamentos

* RH
* Medicina Ocupacional
* Psicologia
* Treinamento
* Gestão

---

## Status

* Em acompanhamento
* Encaminhado
* Resolvido

---

# 11. CONTROLE DE ACESSO

## Técnico SST

Filtro automático por unidade.

Regra:

Usuário somente visualiza registros da unidade vinculada ao seu cadastro.

---

## Engenheiro SST

Visualização global.

Sem restrição por unidade.

---

# 12. AUDITORIA

Obrigatória para todos os módulos SST.

Registrar:

* Usuário
* Data
* Hora
* Campo alterado
* Valor anterior
* Valor novo

Aplicar em:

* Sinistros
* Ocorrências SST
* Liberação de Condutor
* Saúde e Bem-Estar

---

# 13. FASES DE IMPLEMENTAÇÃO

## FASE 1 - PRIORIDADE IMEDIATA

1. Estrutura de permissões SST
2. Dashboard Técnico
3. Dashboard Engenheiro
4. Registro de Sinistro
5. Encaminhamento de Ocorrência para SST

---

## FASE 2

6. Liberação de Condutor
7. Saúde e Bem-Estar do Condutor

---

## FASE 3

8. Indicadores avançados
9. Comparativos entre unidades
10. Alertas automáticos
11. Relatórios gerenciais SST

---

# OBSERVAÇÃO IMPORTANTE

Não haverá implementação de informações financeiras, valores de sinistros, custos operacionais ou integração com sistemas de faturamento nesta fase do projeto.

Toda a estrutura do módulo SST será baseada exclusivamente em indicadores operacionais, segurança, ocorrências, sinistros, saúde ocupacional e gestão de condutores.
