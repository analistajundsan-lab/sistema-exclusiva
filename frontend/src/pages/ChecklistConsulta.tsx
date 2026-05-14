import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useChecklist, ChecklistData } from '../hooks/useChecklist'
import { useAuthStore } from '../store/auth'
import {
  ClipboardList, Plus, Search, X, ChevronDown, ChevronUp,
  Camera, FileText, Wifi, CheckCircle2, AlertTriangle, Bus,
} from 'lucide-react'

function hasPendency(c: ChecklistData): 'red' | 'amber' | 'ok' {
  const camValues = [
    c.camera_frontal, c.camera_lateral_esq, c.camera_lateral_dir,
    c.camera_fadiga, c.camera_ip_motorista, c.camera_salao,
  ]
  if (camValues.some(v => v === 'VISITA_TECNICA')) return 'red'
  if (c.licenciamento?.includes('VENCIDO')) return 'red'
  if (c.cartao_artesp === 'SIM_VENCIDO' || c.cartao_artesp === 'NAO_COLOCAR_NOVO') return 'red'
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
  NA: 'N/A',
}

const label = (v?: string) => (v ? STATUS_LABELS[v] ?? v : '—')
const labelList = (arr?: string[]) => arr?.length ? arr.map(v => STATUS_LABELS[v] ?? v).join(' · ') : '—'

function DetailRow({ title, value }: { title: string; value: string }) {
  if (!value || value === '—') return null
  return (
    <div className="flex justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{title}</span>
      <span className="text-xs font-medium text-gray-800 dark:text-gray-200 text-right">{value}</span>
    </div>
  )
}

function CameraRow({ label: lbl, value }: { label: string; value?: string }) {
  if (!value) return null
  const isIssue = value === 'VISITA_TECNICA'
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">{lbl}</span>
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

function ChecklistCard({ c, expanded, onToggle }: {
  c: ChecklistData
  expanded: boolean
  onToggle: () => void
}) {
  const status = hasPendency(c)
  const date = new Date(c.created_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const statusConfig = {
    red: { bg: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800', badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', label: 'Pendências', icon: AlertTriangle },
    amber: { bg: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', label: 'Atenção', icon: AlertTriangle },
    ok: { bg: 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800', badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', label: 'OK', icon: CheckCircle2 },
  }[status]

  const StatusIcon = statusConfig.icon

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
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">{c.prefixo}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">{c.tipo}</span>
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
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-3">
          {c.tipo === 'MENSAL' && (
            <>
              {/* Cameras */}
              {[c.camera_frontal, c.camera_lateral_esq, c.camera_lateral_dir, c.camera_fadiga, c.camera_ip_motorista, c.camera_salao].some(Boolean) && (
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
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Acessórios</p>
                <DetailRow title="Leitor de embarque" value={c.tem_leitor_embarque != null ? (c.tem_leitor_embarque ? 'Sim' : 'Não') : '—'} />
                <DetailRow title="Ar condicionado" value={c.ar_condicionado != null ? (c.ar_condicionado ? 'Sim' : 'Não') : '—'} />
              </div>

              {/* Documentos */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FileText size={10} /> Documentos
                </p>
                <DetailRow title="Licenciamento" value={labelList(c.licenciamento) + (c.licenciamento_outro ? ` (${c.licenciamento_outro})` : '')} />
                <DetailRow title="Checklist físico" value={labelList(c.checklist_colocado)} />
                <DetailRow title="Cartão ARTESP" value={label(c.cartao_artesp)} />
              </div>

              {/* Materiais */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Materiais Gráficos</p>
                <DetailRow title="QR Code" value={c.qr_code != null ? (c.qr_code ? 'Sim' : 'Não') : '—'} />
                <DetailRow title="Adesivo leitor" value={c.adesivo_leitor != null ? (c.adesivo_leitor ? 'Sim' : 'Não') : '—'} />
                <DetailRow title="Placa senha Wi-Fi" value={c.placa_senha_wifi != null ? (c.placa_senha_wifi ? 'Sim' : 'Não') : '—'} />
              </div>
            </>
          )}

          {/* Wi-Fi */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Wifi size={10} /> Wi-Fi
            </p>
            <DetailRow title="Status" value={labelList(c.wifi_status) + (c.wifi_outro ? ` — ${c.wifi_outro}` : '')} />
          </div>

          {/* Observações */}
          {c.observacoes && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Observações</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">{c.observacoes}</p>
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
  const { role } = useAuthStore()
  const { listChecklists } = useChecklist()

  const [items, setItems] = useState<ChecklistData[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  const [prefixo, setPrefixo] = useState('')
  const [tipo, setTipo] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const load = useCallback(async () => {
    setLoadingList(true)
    try {
      const data = await listChecklists({
        prefixo: prefixo || undefined,
        tipo: tipo || undefined,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        limit: 100,
      })
      setItems(data)
    } catch { /* ignore */ } finally {
      setLoadingList(false)
    }
  }, [prefixo, tipo, dataInicio, dataFim]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const clearFilters = () => { setPrefixo(''); setTipo(''); setDataInicio(''); setDataFim('') }
  const hasFilters = prefixo || tipo || dataInicio || dataFim

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ClipboardList size={22} className="text-brand-700" />
            Checklist
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize mt-0.5">{today}</p>
        </div>
        {(role === 'admin' || role === 'analista') && (
          <button
            onClick={() => navigate('/checklist/novo')}
            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 text-white rounded-xl px-4 py-2.5 font-semibold text-sm transition-all"
          >
            <Plus size={16} /> Novo
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 mb-4 space-y-3">
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
            className="px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="">Todos</option>
            <option value="AVULSO">Avulso</option>
            <option value="MENSAL">Mensal</option>
          </select>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={dataInicio}
            onChange={e => setDataInicio(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300"
          />
          <input
            type="date"
            value={dataFim}
            onChange={e => setDataFim(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300"
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
          <p className="font-medium">Nenhum checklist encontrado</p>
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
            />
          ))}
        </div>
      )}
    </Layout>
  )
}
