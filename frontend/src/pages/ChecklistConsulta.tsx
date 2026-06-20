import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useChecklist, ChecklistData } from '../hooks/useChecklist'
import { useAuthStore } from '../store/auth'
import {
  ClipboardList, Plus, Search, X, ChevronDown, ChevronUp,
  Camera, FileText, Wifi, CheckCircle2, AlertTriangle, Bus, Pencil, Trash2, Download,
} from 'lucide-react'

function hasPendency(c: ChecklistData): 'red' | 'amber' | 'ok' {
  const camValues = [
    c.camera_frontal, c.camera_lateral_esq, c.camera_lateral_dir,
    c.camera_fadiga, c.camera_ip_motorista, c.camera_salao,
  ]
  if (camValues.some(v => v === 'VISITA_TECNICA')) return 'red'
  if (c.crlv_status === 'VENCIDO' || c.artesp_status === 'VENCIDO' || c.emdec_status === 'VENCIDO') return 'red'
  if (c.licenciamento?.includes('VENCIDO')) return 'red'
  if (c.cartao_artesp === 'SIM_VENCIDO' || c.cartao_artesp === 'NAO_COLOCAR_NOVO') return 'red'
  if (
    c.crlv_status === 'NAO_LOCALIZADO' ||
    c.artesp_status === 'NAO_LOCALIZADO' ||
    c.emdec_status === 'NAO_LOCALIZADO' ||
    c.emtu_status === 'NAO_LOCALIZADO' ||
    c.emtu_status === 'DANIFICADO' ||
    c.bolsa_documentos === 'NAO_TEM'
  ) return 'amber'
  if (c.licenciamento?.includes('NAO_IMPRIMIR_NOVAMENTE')) return 'amber'
  if (c.wifi_status?.some(w => w !== 'SIM_FUNCIONAL')) return 'amber'
  return 'ok'
}

const STATUS_LABELS: Record<string, string> = {
  FUNCIONAL: 'Funcional',
  VISITA_TECNICA: 'Visita Técnica',
  SIM_EM_DIA: 'Sim — em dia',
  NAO_IMPRIMIR_NOVAMENTE: 'Não — imprimir novamente',
  VENCIDO: 'Vencido',
  NAO_LOCALIZADO: 'Não localizado',
  SIM_LOCALIZADO: 'Sim — localizado',
  DANIFICADO: 'Danificado — necessário troca',
  SIM_REMOVIDO_COLOCADO_NOVO: 'Sim — removido e colocado novo',
  EXTRAVIADO_COLOCADO_NOVO: 'Extraviado — colocado novo',
  NAO_MANUTENCAO_FORA_GARAGEM: 'Não — manutenção/fora da garagem',
  JA_POSSUI_CHECKLIST_MES: 'Já possui checklist do mês',
  SEM_CHECKLIST_COLOCAR_NOVO: 'Sem checklist — colocar novo',
  SIM_FUNCIONAL: 'Sim, funcional',
  NAO_SEM_REDE: 'Não — sem rede',
  NAO_APARECE_LISTA: 'Não aparece na lista Wi-Fi',
  NAO_FUNCIONA_FRETADAO: 'Não funciona no Fretadão',
  SIM_VENCIDO: 'Sim — vencido',
  NAO_COLOCAR_NOVO: 'Não — colocar novo',
  TEM: 'Tem',
  NAO_TEM: 'Não tem',
  NA: 'N/A',
}

const SITUATION_FILTER_OPTIONS = [
  { value: 'WIFI_PROBLEMA', label: 'Problema de rede/Wi-Fi' },
  { value: 'DOCUMENTO_FALTANDO', label: 'Algum documento faltando' },
  { value: 'DOCUMENTO_VENCIDO', label: 'Algum documento vencido' },
  { value: 'CAMERA_VISITA_TECNICA', label: 'Câmera em visita técnica' },
  { value: 'CRLV_FALTANDO', label: 'CRLV não localizado' },
  { value: 'CRLV_VENCIDO', label: 'CRLV vencido' },
  { value: 'EMTU_FALTANDO', label: 'EMTU não localizado' },
  { value: 'EMTU_DANIFICADO', label: 'EMTU danificado' },
  { value: 'ARTESP_FALTANDO', label: 'ARTESP não localizado' },
  { value: 'ARTESP_VENCIDO', label: 'ARTESP vencido' },
  { value: 'EMDEC_FALTANDO', label: 'EMDEC não localizado' },
  { value: 'EMDEC_VENCIDO', label: 'EMDEC vencido' },
  { value: 'BOLSA_DOCUMENTOS_NAO_TEM', label: 'Bolsa de documentos faltando' },
  { value: 'CHECKLIST_FISICO_PENDENTE', label: 'Checklist físico pendente' },
]

const lbl = (v?: string | null) => (v ? STATUS_LABELS[v] ?? v : null)
const lblList = (arr?: string[] | null) => arr?.length ? arr.map(v => STATUS_LABELS[v] ?? v).join(' · ') : null
const boolLbl = (v?: boolean | null) => v === true ? 'Sim' : v === false ? 'Não' : null

function SectionRow({ title, value, highlight }: { title: string; value: string | null; highlight?: 'red' | 'amber' | 'green' }) {
  if (!value) return null
  const colorClass = highlight === 'red'
    ? 'text-red-600 dark:text-red-400'
    : highlight === 'amber'
    ? 'text-amber-600 dark:text-amber-400'
    : highlight === 'green'
    ? 'text-green-600 dark:text-green-500'
    : 'text-gray-800 dark:text-gray-200'
  return (
    <div className="flex justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700/60 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{title}</span>
      <span className={`text-xs font-semibold text-right ${colorClass}`}>{value}</span>
    </div>
  )
}

function CameraRow({ label: lbl2, value }: { label: string; value?: string | null }) {
  if (!value) return null
  const isIssue = value === 'VISITA_TECNICA'
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700/60 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">{lbl2}</span>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
        isIssue
          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      }`}>
        {STATUS_LABELS[value] ?? value}
      </span>
    </div>
  )
}

function ChecklistCard({ c, expanded, onToggle, isAdmin, onEdit, onDelete }: {
  c: ChecklistData
  expanded: boolean
  onToggle: () => void
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const status = hasPendency(c)
  const date = new Date(c.created_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })

  const statusConfig = {
    red: { bg: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800', badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', label: 'Pendências', icon: AlertTriangle },
    amber: { bg: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', label: 'Atenção', icon: AlertTriangle },
    ok: { bg: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700', badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', label: 'OK', icon: CheckCircle2 },
  }[status]

  const StatusIcon = statusConfig.icon

  const hasCameras = [c.camera_frontal, c.camera_lateral_esq, c.camera_lateral_dir, c.camera_fadiga, c.camera_ip_motorista, c.camera_salao].some(Boolean)
  const hasAcessorios = c.tem_leitor_embarque != null || c.ar_condicionado != null
  const hasDocs = c.crlv_status || c.emtu_status || c.artesp_status || c.emdec_status || c.bolsa_documentos || (c.checklist_colocado?.length) || c.licenciamento?.length || c.cartao_artesp
  const hasMateriais = c.qr_code != null || c.adesivo_leitor != null || c.placa_senha_wifi != null

  const docHighlight = (v?: string | null) =>
    v === 'VENCIDO' ? 'red' : (v === 'NAO_LOCALIZADO' || v === 'DANIFICADO') ? 'amber' : (v === 'SIM_EM_DIA' || v === 'SIM_LOCALIZADO') ? 'green' : undefined

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${statusConfig.bg}`}>
      {/* Card header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-brand-700/10 dark:bg-brand-700/20 flex items-center justify-center flex-shrink-0">
          <Bus size={18} className="text-brand-700 dark:text-brand-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">{c.prefixo}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">{c.tipo}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${statusConfig.badge}`}>
              <StatusIcon size={10} />
              {statusConfig.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {c.garagem} · {c.auditor_name} · {date}
          </p>
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-700 pt-3">

          {isAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={e => { e.stopPropagation(); onEdit() }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-brand-700 text-brand-700 dark:text-brand-400 dark:border-brand-500 font-semibold text-xs w-full justify-center hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
              >
                <Pencil size={13} /> Editar esta vistoria
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete() }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-red-500 text-red-600 dark:text-red-400 dark:border-red-500 font-semibold text-xs w-full justify-center hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={13} /> Excluir vistoria
              </button>
            </div>
          )}

          {c.tipo === 'MENSAL' && (
            <>
              {/* Câmeras */}
              {hasCameras && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Camera size={10} /> Câmeras
                  </p>
                  <CameraRow label="Frontal" value={c.camera_frontal} />
                  <CameraRow label="Lateral Esquerda" value={c.camera_lateral_esq} />
                  <CameraRow label="Lateral Direita" value={c.camera_lateral_dir} />
                  <CameraRow label="Fadiga" value={c.camera_fadiga} />
                  <CameraRow label="IP Motorista" value={c.camera_ip_motorista} />
                  <CameraRow label="Salão" value={c.camera_salao} />
                </div>
              )}

              {/* Acessórios */}
              {hasAcessorios && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Acessórios</p>
                  <SectionRow title="Leitor de embarque" value={boolLbl(c.tem_leitor_embarque)} />
                  <SectionRow title="Ar condicionado" value={boolLbl(c.ar_condicionado)} />
                </div>
              )}

              {/* Materiais Gráficos */}
              {hasMateriais && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Materiais Gráficos</p>
                  <SectionRow title="QR Code" value={boolLbl(c.qr_code)} />
                  <SectionRow title="Adesivo leitor" value={boolLbl(c.adesivo_leitor)} />
                  <SectionRow title="Placa senha Wi-Fi" value={boolLbl(c.placa_senha_wifi)} />
                </div>
              )}
            </>
          )}

          {/* Documentos */}
          {(c.tipo === 'MENSAL' || c.tipo === 'DOCUMENTOS') && hasDocs && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <FileText size={10} /> Documentos
              </p>
              <SectionRow title="CRLV" value={lbl(c.crlv_status)} highlight={docHighlight(c.crlv_status)} />
              <SectionRow title="EMTU (QR code)" value={lbl(c.emtu_status)} highlight={docHighlight(c.emtu_status)} />
              <SectionRow title="ARTESP" value={lbl(c.artesp_status)} highlight={docHighlight(c.artesp_status)} />
              <SectionRow title="EMDEC" value={lbl(c.emdec_status)} highlight={docHighlight(c.emdec_status)} />
              <SectionRow title="Checklist físico" value={lblList(c.checklist_colocado)} />
              <SectionRow title="Bolsa de documentos" value={lbl(c.bolsa_documentos)} highlight={c.bolsa_documentos === 'NAO_TEM' ? 'amber' : c.bolsa_documentos === 'TEM' ? 'green' : undefined} />
              {/* legado */}
              {c.licenciamento?.length ? <SectionRow title="Licenciamento" value={lblList(c.licenciamento) + (c.licenciamento_outro ? ` (${c.licenciamento_outro})` : '')} /> : null}
              {c.cartao_artesp ? <SectionRow title="Cartão ARTESP" value={lbl(c.cartao_artesp)} /> : null}
            </div>
          )}

          {/* Wi-Fi */}
          {(c.wifi_status?.length || c.wifi_outro) && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Wifi size={10} /> Wi-Fi
              </p>
              <SectionRow
                title="Status"
                value={lblList(c.wifi_status) ? (lblList(c.wifi_status)! + (c.wifi_outro ? ` — ${c.wifi_outro}` : '')) : c.wifi_outro || null}
              />
            </div>
          )}

          {/* Observações */}
          {c.observacoes && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Observações</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded-xl p-3">{c.observacoes}</p>
            </div>
          )}

          {/* Evidências */}
          {c.evidencias && c.evidencias.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Evidências</p>
              <div className="flex gap-2">
                {c.evidencias.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noreferrer">
                    <img src={src} alt="" className="w-20 h-20 rounded-xl object-cover border-2 border-gray-200 dark:border-gray-700" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ChecklistConsulta() {
  const navigate = useNavigate()
  const { role, hasFullAccess } = useAuthStore()
  const { listChecklists, deleteChecklist, downloadChecklistReport } = useChecklist()
  const isAdmin = hasFullAccess || role === 'admin'

  const [items, setItems] = useState<ChecklistData[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  const [prefixo, setPrefixo] = useState('')
  const [tipo, setTipo] = useState('')
  const [situacao, setSituacao] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const load = useCallback(async () => {
    setLoadingList(true)
    try {
      const data = await listChecklists({
        prefixo: prefixo || undefined,
        tipo: tipo || undefined,
        situacao: situacao || undefined,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        limit: 100,
      })
      setItems(data)
    } catch { /* ignore */ } finally {
      setLoadingList(false)
    }
  }, [prefixo, tipo, situacao, dataInicio, dataFim]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const clearFilters = () => { setPrefixo(''); setTipo(''); setSituacao(''); setDataInicio(''); setDataFim('') }
  const hasFilters = prefixo || tipo || situacao || dataInicio || dataFim

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo' })

  const handleEdit = (c: ChecklistData) => {
    navigate('/vistoria/novo', { state: { editData: c } })
  }

  const handleDelete = async (c: ChecklistData) => {
    const ok = confirm(`Excluir vistoria do prefixo ${c.prefixo}?`)
    if (!ok) return
    await deleteChecklist(c.id)
    setItems(items => items.filter(item => item.id !== c.id))
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const blobData = await downloadChecklistReport({
        prefixo: prefixo || undefined,
        tipo: tipo || undefined,
        situacao: situacao || undefined,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
      })
      const blob = new Blob([blobData], { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const date = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '-')
      link.href = url
      link.download = `RELATORIO CHECKLIST ${date}.xlsm`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao baixar o relatório de vistoria. Verifique sua permissão e tente novamente.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ClipboardList size={22} className="text-brand-700" />
            Vistoria
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize mt-0.5">{today}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 border-2 border-brand-700 text-brand-700 dark:text-brand-400 dark:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50 rounded-xl px-3 py-2.5 font-semibold text-sm transition-all"
          >
            <Download size={16} /> {downloading ? 'Baixando' : 'Relatório'}
          </button>
          {(hasFullAccess || role === 'admin' || role === 'analista') && (
            <button
              onClick={() => navigate('/vistoria/novo')}
              className="btn-primary"
            >
              <Plus size={16} /> Novo
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={prefixo}
              onChange={e => setPrefixo(e.target.value.toUpperCase())}
              placeholder="Prefixo"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-transparent text-sm text-gray-700 dark:text-gray-300"
            />
          </div>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="">Todos</option>
            <option value="AVULSO">Avulso</option>
            <option value="MENSAL">Mensal</option>
            <option value="DOCUMENTOS">Documentos</option>
          </select>
        </div>
        <select
          value={situacao}
          onChange={e => setSituacao(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="">Filtrar por situação específica</option>
          {SITUATION_FILTER_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="date"
            value={dataInicio}
            onChange={e => setDataInicio(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300"
          />
          <input
            type="date"
            value={dataFim}
            onChange={e => setDataFim(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300"
          />
          {hasFilters && (
            <button onClick={clearFilters} className="p-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-500">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loadingList ? (
        <div className="flex justify-center py-12 text-gray-400 text-sm">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center text-gray-400">
          <ClipboardList size={40} className="mb-3 opacity-30" />
          <p className="font-medium">Nenhuma vistoria encontrada</p>
          <p className="text-sm mt-1">Use os filtros acima ou registre um novo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(c => (
            <ChecklistCard
              key={c.id}
              c={c}
              expanded={expanded === c.id}
              onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
              isAdmin={isAdmin}
              onEdit={() => handleEdit(c)}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </div>
      )}
    </Layout>
  )
}
