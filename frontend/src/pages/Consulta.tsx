import { useState } from 'react'
import type { ReactNode } from 'react'
import { Layout } from '../components/Layout'
import {
  Search, Bus, ArrowLeftRight, AlertTriangle, Calendar,
  CheckCircle2, ClipboardList,
} from 'lucide-react'
import api from '../api/client'

interface SwapResult {
  id: number
  schedule_date: string
  unit: string
  vehicle_out: string
  vehicle_in?: string
  driver_in?: string
  lines_covered?: string
  client_name?: string
  whatsapp_text?: string
  created_at: string
}

interface IncidentResult {
  id: number
  prefix_code: string
  incident_type: string
  line?: string
  direction?: string
  description?: string
  victim_status?: string
  status: string
  created_at: string
}

interface ScheduleResult {
  id: number
  schedule_date: string
  unit: string
  prefix_code: string
  driver_name: string
  line_code: string
  direction: string
  client_name: string
  route_name?: string
  start_time: string
  end_time: string
  status: string
  confirmed_at?: string
}

interface ChecklistResult {
  id: number
  garagem: string
  prefixo: string
  tipo: string
  auditor_name: string
  observacoes?: string
  created_at: string
}

export function Consulta() {
  const [filters, setFilters] = useState({
    date: '',
    prefix: '',
    line: '',
    driver: '',
  })
  const [swaps, setSwaps] = useState<SwapResult[]>([])
  const [incidents, setIncidents] = useState<IncidentResult[]>([])
  const [scheduleLines, setScheduleLines] = useState<ScheduleResult[]>([])
  const [checklists, setChecklists] = useState<ChecklistResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!filters.date && !filters.prefix && !filters.line && !filters.driver) {
      setError('Preencha ao menos um filtro para buscar.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const swapParams = new URLSearchParams({ limit: '200' })
      if (filters.date) swapParams.set('schedule_date', filters.date)
      if (filters.prefix) swapParams.set('vehicle_out', filters.prefix)
      if (filters.line) swapParams.set('line', filters.line)
      if (filters.driver) swapParams.set('driver_name', filters.driver)

      const incidentParams = new URLSearchParams({ limit: '200' })
      if (filters.date) incidentParams.set('incident_date', filters.date)
      if (filters.prefix) incidentParams.set('prefix_code', filters.prefix)
      if (filters.line) incidentParams.set('line', filters.line)

      const scheduleParams = new URLSearchParams({ limit: '500' })
      if (filters.date) scheduleParams.set('schedule_date', filters.date)
      if (filters.prefix) scheduleParams.set('prefix_code', filters.prefix)
      if (filters.line) scheduleParams.set('line_code', filters.line)
      if (filters.driver) scheduleParams.set('driver_name', filters.driver)

      const checklistParams = new URLSearchParams({ limit: '200' })
      if (filters.date) {
        checklistParams.set('data_inicio', filters.date)
        checklistParams.set('data_fim', filters.date)
      }
      if (filters.prefix) checklistParams.set('prefixo', filters.prefix)

      const [swapRes, incidentRes, scheduleRes, checklistRes] = await Promise.all([
        api.get(`/swaps/?${swapParams}`),
        api.get(`/incidents/?${incidentParams}`),
        api.get(`/schedule/lines?${scheduleParams}`),
        api.get(`/checklist/?${checklistParams}`),
      ])

      setSwaps(swapRes.data)
      setIncidents(incidentRes.data)
      setScheduleLines(scheduleRes.data)
      setChecklists(checklistRes.data)
      setSearched(true)
    } catch {
      setError('Erro ao buscar dados. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (dateStr: string) =>
    new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })

  const incidentTypeColor: Record<string, string> = {
    Avaria: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    Acidente: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    'Falha Mecanica': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    'Falha Mecânica': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    Pneu: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    Outro: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Search size={22} className="text-brand-600 dark:text-brand-400" />
            Consulta
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Pesquise escala, confirmacoes, trocas, ocorrencias e vistoria por data, prefixo, linha ou motorista.
          </p>
        </div>

        <form
          onSubmit={handleSearch}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
        >
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex flex-col gap-1">
            <span className="flex items-center gap-1"><Calendar size={11} /> Data</span>
            <input
              type="date"
              value={filters.date}
              onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
              className="border dark:border-gray-600 rounded-lg px-2 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex flex-col gap-1">
            <span className="flex items-center gap-1"><Bus size={11} /> Prefixo</span>
            <input
              value={filters.prefix}
              onChange={e => setFilters(f => ({ ...f, prefix: e.target.value }))}
              className="border dark:border-gray-600 rounded-lg px-2 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="Ex: 1580"
            />
          </label>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex flex-col gap-1">
            <span>Linha</span>
            <input
              value={filters.line}
              onChange={e => setFilters(f => ({ ...f, line: e.target.value }))}
              className="border dark:border-gray-600 rounded-lg px-2 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="Ex: 7368"
            />
          </label>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex flex-col gap-1">
            <span>Motorista</span>
            <input
              value={filters.driver}
              onChange={e => setFilters(f => ({ ...f, driver: e.target.value }))}
              className="border dark:border-gray-600 rounded-lg px-2 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="Ex: SILVA"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50"
          >
            <Search size={15} />
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {searched && !loading && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ResultSection
              icon={<CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />}
              title={`Escala e confirmacoes (${scheduleLines.length})`}
              empty="Nenhuma linha encontrada."
            >
              {scheduleLines.map(line => (
                <div key={line.id} className="px-5 py-3.5 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <span className="font-mono bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded text-xs">L - {line.line_code}</span>
                      <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">Prefixo {line.prefix_code}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${line.status === 'confirmada' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                        {line.status}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{line.schedule_date}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {line.unit} · {line.start_time} - {line.end_time} · {line.direction} · {line.driver_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {line.client_name}{line.route_name ? ` · ${line.route_name}` : ''}
                    {line.confirmed_at ? ` · Confirmada em ${fmt(line.confirmed_at)}` : ''}
                  </p>
                </div>
              ))}
            </ResultSection>

            <ResultSection
              icon={<ArrowLeftRight size={16} className="text-brand-600 dark:text-brand-400" />}
              title={`Trocas (${swaps.length})`}
              empty="Nenhuma troca encontrada."
            >
              {swaps.map(swap => (
                <div key={swap.id} className="px-5 py-3.5 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <span className="font-mono bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded text-xs">SAI {swap.vehicle_out}</span>
                      {swap.vehicle_in && <span className="font-mono bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-xs">ENTRA {swap.vehicle_in}</span>}
                      {swap.driver_in && <span className="font-mono bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded text-xs">MOTORISTA {swap.driver_in}</span>}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{swap.schedule_date}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {swap.unit && <span className="mr-2 text-gray-500">{swap.unit}</span>}
                    {swap.lines_covered && <span>Linhas: {swap.lines_covered}</span>}
                  </p>
                </div>
              ))}
            </ResultSection>

            <ResultSection
              icon={<AlertTriangle size={16} className="text-red-500" />}
              title={`Ocorrencias (${incidents.length})`}
              empty="Nenhuma ocorrencia encontrada."
            >
              {incidents.map(inc => (
                <div key={inc.id} className="px-5 py-3.5 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
                        {inc.prefix_code}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${incidentTypeColor[inc.incident_type] || incidentTypeColor.Outro}`}>
                        {inc.incident_type}
                        {inc.victim_status === 'com_vitimas' && ' · Com vitimas'}
                        {inc.victim_status === 'sem_vitimas' && ' · Sem vitimas'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{fmt(inc.created_at)}</span>
                  </div>
                  {(inc.line || inc.direction) && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {inc.line && <span className="mr-2">Linha {inc.line}</span>}
                      {inc.direction && <span>{inc.direction}</span>}
                    </p>
                  )}
                  {inc.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{inc.description}</p>
                  )}
                </div>
              ))}
            </ResultSection>

            <ResultSection
              icon={<ClipboardList size={16} className="text-brand-600 dark:text-brand-400" />}
              title={`Vistorias (${checklists.length})`}
              empty="Nenhuma vistoria encontrada."
            >
              {checklists.map(check => (
                <div key={check.id} className="px-5 py-3.5 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
                        {check.prefixo}
                      </span>
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300">
                        {check.tipo}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{fmt(check.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {check.garagem} · {check.auditor_name}
                  </p>
                  {check.observacoes && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{check.observacoes}</p>
                  )}
                </div>
              ))}
            </ResultSection>
          </div>
        )}

        {!searched && !loading && (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <Search size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Use os filtros acima para buscar tudo que aconteceu no dia, prefixo ou linha.</p>
          </div>
        )}
      </div>
    </Layout>
  )
}

function ResultSection({
  icon,
  title,
  empty,
  children,
}: {
  icon: ReactNode
  title: string
  empty: string
  children: ReactNode
}) {
  const isEmpty = Array.isArray(children) && children.length === 0
  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        {icon}
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{title}</h2>
      </div>
      {isEmpty ? (
        <p className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">{empty}</p>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-gray-700/50">{children}</div>
      )}
    </section>
  )
}
