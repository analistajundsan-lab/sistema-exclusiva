import { useEffect, useState } from 'react'
import { Pencil, Trash2, Download, X, Check, Ban, RotateCcw } from 'lucide-react'
import { Layout } from '../components/Layout'
import { ScheduleLine, ScheduleFilters, useSchedule } from '../hooks/useSchedule'
import { useAuthStore } from '../store/auth'
import { DEFAULT_OPERATION_DATE } from '../config/demo'
import api from '../api/client'

const UNIT_TABS = ['Caieiras', 'Santana de Parnaiba', 'Jundiai'] as const
type UnitTab = (typeof UNIT_TABS)[number]
const SCHEDULE_FILTERS_KEY = 'scheduleFilters'

interface EditForm {
  prefix_code: string
  driver_name: string
  start_time: string
  end_time: string
  line_code: string
  direction: string
  client_name: string
  route_name: string
}

function lineToForm(line: ScheduleLine): EditForm {
  return {
    prefix_code: line.prefix_code,
    driver_name: line.driver_name,
    start_time: line.start_time,
    end_time: line.end_time,
    line_code: line.line_code,
    direction: line.direction,
    client_name: line.client_name,
    route_name: line.route_name ?? '',
  }
}

function readSavedScheduleFilters(): ScheduleFilters {
  try {
    const raw = localStorage.getItem(SCHEDULE_FILTERS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function isUnitTab(value?: string | null): value is UnitTab {
  return !!value && (UNIT_TABS as readonly string[]).includes(value)
}

// YYYY-MM-DD -> DD/MM/YYYY (para mostrar a vigencia de forma clara)
function fmtBR(iso?: string): string {
  return iso ? iso.split('-').reverse().join('/') : ''
}

export function Schedule() {
  const [activeTab, setActiveTab] = useState<UnitTab>(() => {
    const s = useAuthStore.getState()
    const r = s.role
    const u = s.userUnit
    const saved = readSavedScheduleFilters()
    const readOnly = !s.hasFullAccess && !['admin', 'gerente', 'supervisao', 'supervisor'].includes(r || '')
    if (readOnly && isUnitTab(u)) return u
    if (isUnitTab(saved.unit)) return saved.unit
    return 'Caieiras'
  })
  const [search, setSearch] = useState<ScheduleFilters>(() => {
    const s = useAuthStore.getState()
    const r = s.role
    const u = s.userUnit
    const saved = readSavedScheduleFilters()
    const readOnly = !s.hasFullAccess && !['admin', 'gerente', 'supervisao', 'supervisor'].includes(r || '')
    return {
      ...saved,
      schedule_date: saved.schedule_date || DEFAULT_OPERATION_DATE,
      unit: (readOnly && u) ? u : (isUnitTab(saved.unit) ? saved.unit : 'Caieiras'),
      // Aba de gestao mostra tambem as linhas desativadas por periodo, para
      // poder reativar. As telas operacionais escondem por padrao.
      include_inactive: 'true',
    }
  })
  const [file, setFile] = useState<File | null>(null)
  const [replace, setReplace] = useState(true)
  const [whatsappText, setWhatsappText] = useState('')
  const [whatsappLoading, setWhatsappLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const role = useAuthStore(s => s.role)
  const unit = useAuthStore(s => s.userUnit)
  const hasFullAccess = useAuthStore(s => s.hasFullAccess)
  const isAdmin = hasFullAccess || role === 'admin'
  const canEdit = hasFullAccess || role === 'admin'
  const isReadOnly = !hasFullAccess && !['admin', 'gerente', 'supervisao', 'supervisor'].includes(role || '')
  const lockedUnit = isReadOnly && unit ? unit : null

  const {
    lines,
    summary,
    total,
    page,
    totalPages,
    loading,
    importing,
    previewing,
    error,
    importMessage,
    importPreview,
    setPage,
    applyFilters,
    previewImport,
    importSchedule,
    deactivateLine,
    reactivateLine,
    fetchWhatsappText,
    refetch,
  } = useSchedule(search)

  useEffect(() => {
    localStorage.setItem(SCHEDULE_FILTERS_KEY, JSON.stringify(search))
  }, [search])

  // Se trocar a Data com um arquivo ja em previa, recalcula a previa para o
  // aviso de vigencia/duplicacao ficar correto para a nova data.
  useEffect(() => {
    if (file && importPreview) previewImport(file, search.schedule_date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.schedule_date])

  useEffect(() => {
    if (!search.schedule_date || !activeTab) {
      setWhatsappText('')
      return
    }
    let cancelled = false
    setWhatsappLoading(true)
    fetchWhatsappText(search.schedule_date, activeTab)
      .then(res => {
        if (!cancelled) setWhatsappText(res.text)
      })
      .catch(() => {
        if (!cancelled) setWhatsappText('Nao foi possivel gerar o texto oficial no momento.')
      })
      .finally(() => {
        if (!cancelled) setWhatsappLoading(false)
      })
    return () => { cancelled = true }
  }, [activeTab, fetchWhatsappText, search.schedule_date])

  // Switch tab: atualiza aba e unit nos filtros, reseta busca texto
  const handleTabChange = (tab: UnitTab) => {
    setActiveTab(tab)
    const next: ScheduleFilters = {
      ...search,
      unit: tab,
      prefix_code: '',
      line_code: '',
      driver_name: '',
    }
    setSearch(next)
    applyFilters(next)
  }

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    applyFilters(search)
  }

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file || !search.schedule_date) return
    if (!importPreview) {
      await previewImport(file, search.schedule_date)
      return
    }
    const vig = fmtBR(search.schedule_date)
    const coexisting = importPreview.existing_other_files ?? []
    if (coexisting.length > 0) {
      const ok = confirm(
        `ATENCAO: ja existe outra escala vigente em ${vig} (${coexisting.join(', ')}).\n\n` +
        `Importar com esta data vai SOMAR as duas (escala duplicada), nao substituir.\n\n` +
        `Se a intencao e trocar a escala, cancele e use no campo Data a DATA DE INICIO desta escala.\n\n` +
        `Importar mesmo assim?`,
      )
      if (!ok) return
    } else if (replace) {
      const ok = confirm(
        `Esta escala passara a valer a partir de ${vig}.` +
        (importPreview.will_replace
          ? ' Vai substituir o envio anterior com este mesmo arquivo e vigencia.'
          : '') +
        '\n\nContinuar?',
      )
      if (!ok) return
    }
    await importSchedule(file, search.schedule_date, replace)
    setFile(null)
    const input = document.getElementById('schedule-file') as HTMLInputElement | null
    if (input) input.value = ''
  }

  const handleEditOpen = (line: ScheduleLine) => {
    setEditingId(line.id)
    setEditForm(lineToForm(line))
  }

  const handleEditCancel = () => {
    setEditingId(null)
    setEditForm(null)
  }

  const handleEditSave = async () => {
    if (editingId === null || !editForm) return
    setSaving(true)
    try {
      await api.patch(`/schedule/lines/${editingId}`, editForm)
      setEditingId(null)
      setEditForm(null)
      refetch()
    } catch {
      alert('Erro ao salvar alteracoes. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    const ok = confirm('Tem certeza? Esta acao nao pode ser desfeita.')
    if (!ok) return
    setDeleting(id)
    try {
      await api.delete(`/schedule/lines/${id}`)
      refetch()
    } catch {
      alert('Erro ao excluir linha. Tente novamente.')
    } finally {
      setDeleting(null)
    }
  }

  const handleToggleActive = async (line: ScheduleLine) => {
    setTogglingId(line.id)
    try {
      if (line.is_active === false) {
        await reactivateLine(line.id)
      } else {
        const ok = confirm(
          `Desativar a linha ${line.line_code}? Ela sai do painel de confirmacoes ate ser reativada (continua no historico, sem ser apagada).`,
        )
        if (!ok) return
        await deactivateLine(line.id)
      }
      refetch()
    } catch {
      alert('Erro ao atualizar a linha. Tente novamente.')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDownload = async () => {
    const params = new URLSearchParams()
    if (search.schedule_date) params.set('schedule_date', search.schedule_date)
    try {
      const res = await api.get(`/schedule/download?${params.toString()}`, {
        responseType: 'blob',
      })
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const date = search.schedule_date?.split('-').reverse().join('-') || 'escala'
      link.href = url
      link.download = `ESCALA GERAL ${date} ATUALIZADA.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao baixar a escala. Verifique sua permissao e tente novamente.')
    }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Escala operacional
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Base de linhas de transporte. Admins e gerentes podem editar e excluir linhas.
            </p>
          </div>
        </div>

        {/* Filtros */}
        <form
          onSubmit={handleSearch}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-3 grid grid-cols-1 md:grid-cols-6 gap-2 items-end border dark:border-gray-700"
        >
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Data
            <input
              type="date"
              value={search.schedule_date || ''}
              onChange={e => setSearch(s => ({ ...s, schedule_date: e.target.value }))}
              className="mt-1 border dark:border-gray-600 rounded px-2 py-1.5 text-sm w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Prefixo
            <input
              value={search.prefix_code || ''}
              onChange={e => setSearch(s => ({ ...s, prefix_code: e.target.value }))}
              className="mt-1 border dark:border-gray-600 rounded px-2 py-1.5 text-sm w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="1580"
            />
          </label>
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Linha
            <input
              value={search.line_code || ''}
              onChange={e => setSearch(s => ({ ...s, line_code: e.target.value }))}
              className="mt-1 border dark:border-gray-600 rounded px-2 py-1.5 text-sm w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="7368"
            />
          </label>
          <label className="text-xs text-gray-500 dark:text-gray-400 col-span-2">
            Motorista
            <input
              value={search.driver_name || ''}
              onChange={e => setSearch(s => ({ ...s, driver_name: e.target.value }))}
              className="mt-1 border dark:border-gray-600 rounded px-2 py-1.5 text-sm w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="E N DA SILVA"
            />
          </label>
          <button
            type="submit"
            className="bg-brand-700 text-white px-3 py-2 rounded text-sm hover:bg-brand-800"
          >
            Buscar
          </button>
        </form>

        {/* Abas de unidade - só mostra se pode trocar */}
        {!lockedUnit && (
          <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
            {UNIT_TABS.map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => handleTabChange(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                  activeTab === tab
                    ? 'bg-brand-700 text-white border-b-2 border-brand-700'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
        {lockedUnit && (
          <div className="border-b border-gray-200 dark:border-gray-700 pb-2">
            <span className="text-sm font-medium text-brand-700 dark:text-brand-400 px-2">
              Unidade: {lockedUnit}
            </span>
          </div>
        )}

        {/* Import (só admin) */}
        {isAdmin && (
          <form
            onSubmit={handleImport}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-end border-l-4 border-brand-700 dark:border-gray-700"
          >
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                Importar escala em blocos
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                A <strong>Data</strong> selecionada acima é a <strong>vigência</strong> (a partir de quando a
                escala vale). Reenvios com o mesmo arquivo e vigência substituem; arquivos
                ou vigências diferentes ficam no histórico.
              </p>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 px-2.5 py-1.5 text-xs font-semibold text-brand-800 dark:text-brand-300">
                Vigência: vale a partir de {fmtBR(search.schedule_date) || '— selecione a Data'}
              </div>
              <input
                id="schedule-file"
                type="file"
                accept=".xlsx,.xlsm"
                onChange={e => {
                  setFile(e.target.files?.[0] || null)
                  if (e.target.files?.[0]) previewImport(e.target.files[0], search.schedule_date)
                }}
                className="block w-full text-sm border dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={replace}
                onChange={e => setReplace(e.target.checked)}
              />
              Substituir reenvio do mesmo arquivo/vigencia
            </label>
            <button
              type="submit"
              disabled={!file || !search.schedule_date || importing || previewing}
              className="bg-brand-700 text-white px-4 py-2 rounded text-sm hover:bg-brand-800 disabled:opacity-50"
            >
              {previewing
                ? 'Lendo planilha...'
                : importing
                  ? 'Importando...'
                  : importPreview
                    ? `Confirmar — vale a partir de ${fmtBR(search.schedule_date)}`
                    : 'Gerar previa'}
            </button>
          </form>
        )}

        {/* Preview da importacao */}
        {isAdmin && importPreview && (
          <section className="bg-brand-50 dark:bg-gray-700 border border-brand-200 dark:border-gray-600 rounded-lg p-4">
            {/* Vigencia em destaque */}
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-brand-200 dark:border-gray-600 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">
                Vigência
              </span>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                vale a partir de {fmtBR(search.schedule_date)}
              </span>
            </div>

            {/* Alerta de coexistencia (duplicacao) */}
            {(importPreview.existing_other_files?.length ?? 0) > 0 && (
              <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700 p-3">
                <p className="text-sm font-bold text-red-800 dark:text-red-300">
                  ⚠️ Já existe outra escala nesta vigência ({fmtBR(search.schedule_date)})
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                  Arquivo(s): {importPreview.existing_other_files?.join(', ')}. Como o nome é
                  diferente, importar com esta data vai <strong>SOMAR as duas (escala duplicada)</strong>,
                  não substituir. Se a intenção é trocar a escala, mude o campo <strong>Data</strong> para a
                  data de início desta escala.
                </p>
              </div>
            )}
            {importPreview.will_replace && (importPreview.existing_other_files?.length ?? 0) === 0 && (
              <div className="mb-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 px-3 py-2">
                <p className="text-xs text-green-800 dark:text-green-300">
                  ✓ Vai substituir o envio anterior com este mesmo arquivo e vigência.
                </p>
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-brand-900 dark:text-gray-100">
                  Previa da importacao
                </h2>
                <p className="text-sm text-brand-800 dark:text-gray-300">
                  {importPreview.total} linhas encontradas na planilha.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {importPreview.units.map(unit => (
                    <span
                      key={unit.unit}
                      className="bg-white dark:bg-gray-600 border border-brand-200 dark:border-gray-500 rounded px-3 py-1 text-sm text-brand-900 dark:text-gray-100"
                    >
                      {unit.unit}: {unit.total}
                    </span>
                  ))}
                </div>
              </div>
              <div className="min-w-64">
                <h3 className="text-sm font-semibold text-brand-900 dark:text-gray-100 mb-1">
                  Principais clientes
                </h3>
                <ul className="text-xs text-brand-800 dark:text-gray-300 space-y-1">
                  {importPreview.clients.slice(0, 5).map(client => (
                    <li key={client.client_name}>
                      {client.client_name}: {client.total}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {importPreview.warnings.length > 0 && (
              <div className="mt-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded p-3">
                <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                  Avisos
                </h3>
                <ul className="text-xs text-yellow-800 dark:text-yellow-300 list-disc pl-5">
                  {importPreview.warnings.map(warning => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {importMessage && (
          <p className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700 rounded px-3 py-2 text-sm">
            {importMessage}
          </p>
        )}

        {/* Conteudo principal */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
          {/* Tabela */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-card overflow-hidden border dark:border-gray-700">
            <div className="px-4 py-3 border-b dark:border-gray-700 flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
              <span>
                {total} linhas em{' '}
                <strong className="text-gray-800 dark:text-gray-200">{activeTab}</strong>
                {loading && ' · Carregando...'}
              </span>
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 bg-green-700 text-white px-3 py-1.5 rounded text-xs hover:bg-green-800 transition-colors"
              >
                <Download size={14} />
                Baixar XLSX
              </button>
            </div>

            {error && (
              <p className="text-red-600 dark:text-red-400 text-sm p-4">{error}</p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700 text-left">
                    <th className="px-3 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                      Horario
                    </th>
                    <th className="px-3 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">
                      Prefixo
                    </th>
                    <th className="px-3 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">
                      Linha
                    </th>
                    <th className="px-3 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">
                      Sentido
                    </th>
                    <th className="px-3 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">
                      Cliente
                    </th>
                    <th className="px-3 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">
                      Motorista
                    </th>
                    <th className="px-3 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">
                      Rota
                    </th>
                    {canEdit && (
                      <th className="px-3 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">
                        Acoes
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr>
                      <td
                        colSpan={canEdit ? 8 : 7}
                        className="text-center py-8 text-gray-400 dark:text-gray-500"
                      >
                        Nenhuma linha importada para os filtros atuais
                      </td>
                    </tr>
                  )}
                  {lines.map(line =>
                    editingId === line.id && editForm ? (
                      /* Linha em modo edicao inline */
                      <tr key={line.id} className="bg-brand-50 dark:bg-gray-700">
                        <td className="px-2 py-1 border dark:border-gray-600">
                          <div className="flex gap-1">
                            <input
                              type="time"
                              value={editForm.start_time}
                              onChange={e =>
                                setEditForm(f => f && { ...f, start_time: e.target.value })
                              }
                              className="border dark:border-gray-500 rounded px-1 py-0.5 text-xs w-20 bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                            />
                            <span className="text-gray-400 self-center">-</span>
                            <input
                              type="time"
                              value={editForm.end_time}
                              onChange={e =>
                                setEditForm(f => f && { ...f, end_time: e.target.value })
                              }
                              className="border dark:border-gray-500 rounded px-1 py-0.5 text-xs w-20 bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        </td>
                        <td className="px-2 py-1 border dark:border-gray-600">
                          <input
                            value={editForm.prefix_code}
                            onChange={e =>
                              setEditForm(f => f && { ...f, prefix_code: e.target.value })
                            }
                            className="border dark:border-gray-500 rounded px-1 py-0.5 text-xs w-full bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                          />
                        </td>
                        <td className="px-2 py-1 border dark:border-gray-600">
                          <input
                            value={editForm.line_code}
                            onChange={e =>
                              setEditForm(f => f && { ...f, line_code: e.target.value })
                            }
                            className="border dark:border-gray-500 rounded px-1 py-0.5 text-xs w-full bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                          />
                        </td>
                        <td className="px-2 py-1 border dark:border-gray-600">
                          <select
                            value={editForm.direction}
                            onChange={e =>
                              setEditForm(f => f && { ...f, direction: e.target.value })
                            }
                            className="border dark:border-gray-500 rounded px-1 py-0.5 text-xs w-full bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                          >
                            <option value="ENTRADA">ENTRADA</option>
                            <option value="SAIDA">SAIDA</option>
                          </select>
                        </td>
                        <td className="px-2 py-1 border dark:border-gray-600">
                          <input
                            value={editForm.client_name}
                            onChange={e =>
                              setEditForm(f => f && { ...f, client_name: e.target.value })
                            }
                            className="border dark:border-gray-500 rounded px-1 py-0.5 text-xs w-full bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                          />
                        </td>
                        <td className="px-2 py-1 border dark:border-gray-600">
                          <input
                            value={editForm.driver_name}
                            onChange={e =>
                              setEditForm(f => f && { ...f, driver_name: e.target.value })
                            }
                            className="border dark:border-gray-500 rounded px-1 py-0.5 text-xs w-full bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                          />
                        </td>
                        <td className="px-2 py-1 border dark:border-gray-600">
                          <input
                            value={editForm.route_name}
                            onChange={e =>
                              setEditForm(f => f && { ...f, route_name: e.target.value })
                            }
                            className="border dark:border-gray-500 rounded px-1 py-0.5 text-xs w-full bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                          />
                        </td>
                        <td className="px-2 py-1 border dark:border-gray-600">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={handleEditSave}
                              disabled={saving}
                              title="Salvar"
                              className="p-1 rounded bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-700 disabled:opacity-50"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={handleEditCancel}
                              title="Cancelar"
                              className="p-1 rounded bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      /* Linha normal */
                      <tr
                        key={line.id}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${line.is_active === false ? 'opacity-60' : ''}`}
                      >
                        <td className="px-3 py-2 border dark:border-gray-700 font-mono text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {line.start_time} - {line.end_time}
                        </td>
                        <td className="px-3 py-2 border dark:border-gray-700 font-mono font-semibold text-gray-900 dark:text-gray-100">
                          <div className="flex items-center gap-1.5">
                            <span>{line.prefix_code}</span>
                            {line.is_active === false && (
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                Desativada
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 border dark:border-gray-700 font-mono text-gray-900 dark:text-gray-100">
                          {line.line_code}
                        </td>
                        <td className="px-3 py-2 border dark:border-gray-700 text-gray-900 dark:text-gray-100">
                          {line.direction}
                        </td>
                        <td className="px-3 py-2 border dark:border-gray-700 text-gray-900 dark:text-gray-100">
                          {line.client_name}
                        </td>
                        <td className="px-3 py-2 border dark:border-gray-700 text-gray-900 dark:text-gray-100">
                          {line.driver_name}
                        </td>
                        <td className="px-3 py-2 border dark:border-gray-700 text-gray-600 dark:text-gray-400">
                          {line.route_name}
                        </td>
                        {canEdit && (
                          <td className="px-3 py-2 border dark:border-gray-700">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditOpen(line)}
                                title="Editar"
                                className="p-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(line)}
                                disabled={togglingId === line.id}
                                title={line.is_active === false ? 'Reativar linha' : 'Desativar (sai do painel ate reativar)'}
                                className={`p-1 rounded disabled:opacity-50 ${
                                  line.is_active === false
                                    ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800'
                                    : 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800'
                                }`}
                              >
                                {line.is_active === false ? <RotateCcw size={14} /> : <Ban size={14} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(line.id)}
                                disabled={deleting === line.id}
                                title="Excluir"
                                className="p-1 rounded bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginacao */}
            <div className="flex items-center justify-between px-4 py-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm text-gray-600 dark:text-gray-400">
              <span>
                Pagina {page + 1} de {Math.max(totalPages, 1)}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1 rounded border dark:border-gray-600 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  Anterior
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1 rounded border dark:border-gray-600 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  Proxima
                </button>
              </div>
            </div>
          </section>

          {/* Painel lateral */}
          <aside className="space-y-4">
            <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-4 border dark:border-gray-700">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">
                Resumo por unidade
              </h2>
              <div className="space-y-2">
                {summary.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Sem dados para resumir.
                  </p>
                )}
                {summary.map(item => (
                  <div
                    key={item.unit}
                    className="border dark:border-gray-700 rounded p-3 bg-gray-50 dark:bg-gray-700/50"
                  >
                    <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-100">
                      <span>{item.unit}</span>
                      <span>{item.total}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Entrada {item.entrada} · Saida {item.saida}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Pendentes {item.pending} · Alteradas {item.changed}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-4 border dark:border-gray-700">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">
                Texto para WhatsApp
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {whatsappLoading ? 'Gerando texto oficial...' : 'Texto oficial gerado pelo backend para a aba selecionada.'}
              </p>
              <textarea
                readOnly
                value={whatsappText}
                className="w-full h-56 border dark:border-gray-600 rounded p-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700"
              />
              <button
                type="button"
                onClick={() => {
                  const text = whatsappText
                  if (!text) return
                  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')
                }}
                disabled={!whatsappText || whatsappLoading}
                className="mt-2 w-full bg-green-700 text-white px-3 py-2 rounded text-sm hover:bg-green-800"
              >
                Enviar para WhatsApp
              </button>
            </section>
          </aside>
        </div>
      </div>
    </Layout>
  )
}
