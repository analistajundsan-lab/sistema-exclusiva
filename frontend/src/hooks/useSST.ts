import api from '../api/client'

export type SinistroStatus =
  | 'aberto'
  | 'em_analise'
  | 'aguardando_documentos'
  | 'em_investigacao'
  | 'encerrado'

export type LiberacaoStatus =
  | 'pendente'
  | 'liberado'
  | 'liberado_com_restricao'
  | 'nao_liberado'

export type SaudeStatus = 'em_acompanhamento' | 'encaminhado' | 'resolvido'

export interface SSTDashboard {
  total_veiculos: number
  total_motoristas: number
  sinistros_mes: number
  sinistros_ano: number
  sinistros_investigacao: number
  sinistros_encerrados: number
  condutores_bloqueados: number
  condutores_liberados: number
  checklists_hoje: number
  checklists_pendentes: number
  colisoes: number
  abalroamentos: number
  ocorrencias_sst: number
  top_condutores: { nome: string; total: number }[]
  top_veiculos: { prefixo: string; total: number }[]
}

export interface Sinistro {
  id: number
  numero: string | null
  unit: string
  empresa: string | null
  prefixo: string | null
  placa: string | null
  modelo: string | null
  frota: string | null
  condutor_nome: string | null
  condutor_matricula: string | null
  condutor_cpf: string | null
  condutor_tempo_empresa: string | null
  data_ocorrencia: string
  hora_ocorrencia: string | null
  local_ocorrencia: string | null
  cidade: string | null
  estado: string | null
  tipo_sinistro: string
  descricao: string | null
  danos_identificados: string[] | null
  evidencias: string[] | null
  envolvidos: string[] | null
  status: SinistroStatus
  created_by: number
  created_at: string
  updated_at: string | null
}

export interface SinistroHistorico {
  id: number
  sinistro_id: number
  user_id: number
  campo: string | null
  valor_anterior: string | null
  valor_novo: string | null
  descricao: string | null
  created_at: string
}

export interface OcorrenciaSST {
  id: number
  prefix_code: string
  incident_type: string
  description: string | null
  line: string | null
  unit: string | null
  status: string
  sst_forwarded_at: string
  sst_forwarded_by: number
  sst_forward_reason: string | null
  sst_forward_priority: string
  created_at: string
}

export interface LiberacaoCondutor {
  id: number
  unit: string
  condutor_nome: string
  condutor_matricula: string | null
  motivo_avaliacao: string
  documentacao_ok: boolean | null
  treinamentos_ok: boolean | null
  exames_ok: boolean | null
  aso_ok: boolean | null
  reciclagem_ok: boolean | null
  avaliacoes_sst_ok: boolean | null
  resultado: LiberacaoStatus
  observacoes: string | null
  restricoes: string | null
  evidencias: string[] | null
  created_by: number
  created_at: string
  updated_at: string | null
}

export interface SaudeCondutor {
  id: number
  unit: string
  condutor_nome: string
  condutor_matricula: string | null
  data_avaliacao: string
  tecnico_responsavel: string | null
  qualidade_sono: string | null
  fadiga: string | null
  alimentacao: string | null
  hidratacao: string | null
  queixas_fisicas: string | null
  estresse: string | null
  ansiedade: string | null
  conflitos_pessoais: string | null
  observacoes_comportamentais: string | null
  jornada_excessiva: boolean | null
  queixas_recorrentes: string | null
  historico_ocorrencias: string | null
  necessidade_treinamento: boolean | null
  plano_acao: string | null
  encaminhamentos: string[] | null
  status: SaudeStatus
  created_by: number
  created_at: string
  updated_at: string | null
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function getSSTDashboard(unit?: string): Promise<SSTDashboard> {
  const params = unit ? { unit } : {}
  const res = await api.get('/sst/dashboard', { params })
  return res.data
}

export interface SSTDashboardV2 {
  period: { start: string; end: string }
  summary: {
    risk_score: number
    sinistros_periodo: number
    sinistros_delta_pct: number
    checklist_compliance_pct: number
    condutores_bloqueados: number
    condutores_restricao: number
    sinistros_investigacao: number
    ocorrencias_sst: number
    total_veiculos: number
  }
  trends: {
    sinistros_por_mes: { mes: string; total: number }[]
    checklists_por_dia: { dia: string; total: number }[]
  }
  breakdowns: {
    por_tipo: { tipo: string; total: number }[]
    por_turno: { turno: string; total: number }[]
    por_unidade: { unidade: string; total: number }[]
    checklist_por_status: { status: string; total: number }[]
    bloqueio_por_motivo: { motivo: string; total: number }[]
  }
  rankings: {
    condutores: { nome: string; total: number }[]
    veiculos: { prefixo: string; total: number }[]
    cidades: { cidade: string; total: number }[]
  }
}

export interface SSTDashboardV2Filters {
  unit?: string
  date_start?: string
  date_end?: string
}

export async function getSSTDashboardV2(
  filters: SSTDashboardV2Filters = {},
): Promise<SSTDashboardV2> {
  const params: Record<string, string> = {}
  if (filters.unit) params.unit = filters.unit
  if (filters.date_start) params.date_start = filters.date_start
  if (filters.date_end) params.date_end = filters.date_end
  const res = await api.get('/sst/dashboard-v2', { params })
  return res.data
}

// ── Sinistros ─────────────────────────────────────────────────────────────────
export async function listSinistros(params: Record<string, unknown> = {}): Promise<Sinistro[]> {
  const res = await api.get('/sst/sinistros', { params })
  return res.data
}

export async function getSinistro(id: number): Promise<Sinistro> {
  const res = await api.get(`/sst/sinistros/${id}`)
  return res.data
}

export async function createSinistro(data: Partial<Sinistro>): Promise<Sinistro> {
  const res = await api.post('/sst/sinistros', data)
  return res.data
}

export async function updateSinistro(id: number, data: Partial<Sinistro>): Promise<Sinistro> {
  const res = await api.put(`/sst/sinistros/${id}`, data)
  return res.data
}

export async function getSinistroHistorico(id: number): Promise<SinistroHistorico[]> {
  const res = await api.get(`/sst/sinistros/${id}/historico`)
  return res.data
}

// ── Ocorrências SST ───────────────────────────────────────────────────────────
export async function listOcorrenciasSST(params: Record<string, unknown> = {}): Promise<OcorrenciaSST[]> {
  const res = await api.get('/sst/ocorrencias', { params })
  return res.data
}

export async function encaminharParaSST(
  incidentId: number,
  reason: string,
  priority: string,
): Promise<void> {
  await api.post(`/sst/ocorrencias/${incidentId}/encaminhar`, { reason, priority })
}

// ── Liberação de Condutor ─────────────────────────────────────────────────────
export async function listLiberacoes(params: Record<string, unknown> = {}): Promise<LiberacaoCondutor[]> {
  const res = await api.get('/sst/liberacoes', { params })
  return res.data
}

export async function createLiberacao(data: Partial<LiberacaoCondutor>): Promise<LiberacaoCondutor> {
  const res = await api.post('/sst/liberacoes', data)
  return res.data
}

export async function updateLiberacao(
  id: number,
  data: Partial<LiberacaoCondutor>,
): Promise<LiberacaoCondutor> {
  const res = await api.put(`/sst/liberacoes/${id}`, data)
  return res.data
}

// ── Saúde e Bem-Estar ─────────────────────────────────────────────────────────
export async function listSaude(params: Record<string, unknown> = {}): Promise<SaudeCondutor[]> {
  const res = await api.get('/sst/saude', { params })
  return res.data
}

export async function createSaude(data: Partial<SaudeCondutor>): Promise<SaudeCondutor> {
  const res = await api.post('/sst/saude', data)
  return res.data
}

export async function updateSaude(id: number, data: Partial<SaudeCondutor>): Promise<SaudeCondutor> {
  const res = await api.put(`/sst/saude/${id}`, data)
  return res.data
}
