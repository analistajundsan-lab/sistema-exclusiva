import { useMemo, useState } from 'react'
import { Layout } from '../components/Layout'
import { ScheduleFilters, useSchedule } from '../hooks/useSchedule'
import { useAuthStore } from '../store/auth'
import { DEFAULT_OPERATION_DATE } from '../config/demo'

const units = ['', 'Caieiras', 'Jundiai', 'Santana de Parnaiba']

const statusClass = {
  pendente: 'bg-yellow-100 text-yellow-800',
  confirmada: 'bg-green-100 text-green-800',
  alterada: 'bg-blue-100 text-blue-800',
  cancelada: 'bg-red-100 text-red-800',
}

export function Schedule() {
  const [search, setSearch] = useState<ScheduleFilters>({ schedule_date: DEFAULT_OPERATION_DATE })
  const [file, setFile] = useState<File | null>(null)
  const [replace, setReplace] = useState(true)
  const [whatsappText, setWhatsappText] = useState('')
  const role = useAuthStore(s => s.role)
  const isAdmin = role === 'admin'
  const {
    lines, summary, total, page, totalPages, loading, importing, previewing, error, importMessage, importPreview,
    setPage, applyFilters, previewImport, importSchedule, fetchWhatsappText
  } = useSchedule(search)

  const fallbackWhatsappText = useMemo(() => {
    const date = search.schedule_date || '____'
    const unit = search.unit || 'Unidade selecionada'
    const selected = lines.slice(0, 12)
    const body = selected.map(line =>
      `- ${line.start_time} as ${line.end_time} | Linha ${line.line_code} | ${line.direction} | Prefixo ${line.prefix_code} | Motorista: ${line.driver_name}`
    ).join('\n')

    return `ALTERACOES REALIZADAS NA ESCALA\nEntram em vigor a partir do dia: ${date}\n\nUnidade: ${unit}\n\n${body || '- Nenhuma linha filtrada no momento'}`
  }, [lines, search.schedule_date, search.unit])

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    applyFilters(search)
  }

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file || !search.schedule_date) return
    if (!importPreview) {
      await previewImport(file)
      return
    }
    if (replace) {
      const ok = confirm(`Esta acao substituira todos os registros da escala em ${search.schedule_date}. Continuar?`)
      if (!ok) return
    }
    await importSchedule(file, search.schedule_date, replace)
    setFile(null)
    const input = document.getElementById('schedule-file') as HTMLInputElement | null
    if (input) input.value = ''
  }

  const handleGenerateWhatsapp = async () => {
    if (!search.schedule_date || !search.unit) {
      setWhatsappText(fallbackWhatsappText)
      return
    }
    const result = await fetchWhatsappText(search.schedule_date, search.unit, false)
    setWhatsappText(result.text)
  }

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Escala operacional</h1>
            <p className="text-sm text-gray-500">Visualizacao linear das linhas importadas da planilha em blocos.</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-3 grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
          <label className="text-xs text-gray-500">
            Data
            <input type="date" value={search.schedule_date || ''} onChange={e => setSearch(s => ({ ...s, schedule_date: e.target.value }))}
              className="mt-1 border rounded px-2 py-1.5 text-sm w-full" />
          </label>
          <label className="text-xs text-gray-500">
            Unidade
            <select value={search.unit || ''} onChange={e => setSearch(s => ({ ...s, unit: e.target.value }))}
              className="mt-1 border rounded px-2 py-1.5 text-sm w-full">
              {units.map(unit => <option key={unit} value={unit}>{unit || 'Todas'}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            Prefixo
            <input value={search.prefix_code || ''} onChange={e => setSearch(s => ({ ...s, prefix_code: e.target.value }))}
              className="mt-1 border rounded px-2 py-1.5 text-sm w-full" placeholder="1580" />
          </label>
          <label className="text-xs text-gray-500">
            Linha
            <input value={search.line_code || ''} onChange={e => setSearch(s => ({ ...s, line_code: e.target.value }))}
              className="mt-1 border rounded px-2 py-1.5 text-sm w-full" placeholder="7368" />
          </label>
          <label className="text-xs text-gray-500">
            Motorista
            <input value={search.driver_name || ''} onChange={e => setSearch(s => ({ ...s, driver_name: e.target.value }))}
              className="mt-1 border rounded px-2 py-1.5 text-sm w-full" placeholder="E N DA SILVA" />
          </label>
          <button type="submit" className="bg-blue-700 text-white px-3 py-2 rounded text-sm hover:bg-blue-800">
            Buscar
          </button>
        </form>

        {isAdmin && (
          <form onSubmit={handleImport} className="bg-white rounded-lg shadow p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-end border-l-4 border-blue-700">
            <div>
              <h2 className="font-semibold text-gray-800">Importar escala em blocos</h2>
              <p className="text-xs text-gray-500 mb-2">
                Envie a planilha .xlsx atual. O sistema converte as abas Jundiai, Caieiras e Santana para linhas operacionais.
              </p>
              <input
                id="schedule-file"
                type="file"
                accept=".xlsx,.xlsm"
                onChange={e => {
                  setFile(e.target.files?.[0] || null)
                  // A nova selecao exige nova previa.
                  if (e.target.files?.[0]) previewImport(e.target.files[0])
                }}
                className="block w-full text-sm border rounded p-2"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} />
              Substituir escala desta data
            </label>
            <button
              type="submit"
              disabled={!file || !search.schedule_date || importing || previewing}
              className="bg-blue-700 text-white px-4 py-2 rounded text-sm hover:bg-blue-800 disabled:opacity-50"
            >
              {previewing ? 'Lendo planilha...' : importing ? 'Importando...' : importPreview ? 'Confirmar importacao' : 'Gerar previa'}
            </button>
          </form>
        )}

        {isAdmin && importPreview && (
          <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-blue-900">Previa da importacao</h2>
                <p className="text-sm text-blue-800">{importPreview.total} linhas encontradas na planilha.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {importPreview.units.map(unit => (
                    <span key={unit.unit} className="bg-white border border-blue-200 rounded px-3 py-1 text-sm text-blue-900">
                      {unit.unit}: {unit.total}
                    </span>
                  ))}
                </div>
              </div>
              <div className="min-w-64">
                <h3 className="text-sm font-semibold text-blue-900 mb-1">Principais clientes</h3>
                <ul className="text-xs text-blue-800 space-y-1">
                  {importPreview.clients.slice(0, 5).map(client => (
                    <li key={client.client_name}>{client.client_name}: {client.total}</li>
                  ))}
                </ul>
              </div>
            </div>
            {importPreview.warnings.length > 0 && (
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded p-3">
                <h3 className="text-sm font-semibold text-yellow-800">Avisos</h3>
                <ul className="text-xs text-yellow-800 list-disc pl-5">
                  {importPreview.warnings.map(warning => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            )}
          </section>
        )}

        {importMessage && <p className="bg-green-50 text-green-700 border border-green-200 rounded px-3 py-2 text-sm">{importMessage}</p>}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
          <section className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b flex justify-between text-sm text-gray-600">
              <span>{total} linhas encontradas</span>
              {loading && <span>Carregando...</span>}
            </div>
            {error && <p className="text-red-600 text-sm p-4">{error}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-3 py-2 border">Horario</th>
                    <th className="px-3 py-2 border">Unidade</th>
                    <th className="px-3 py-2 border">Prefixo</th>
                    <th className="px-3 py-2 border">Linha</th>
                    <th className="px-3 py-2 border">Sentido</th>
                    <th className="px-3 py-2 border">Cliente</th>
                    <th className="px-3 py-2 border">Motorista</th>
                    <th className="px-3 py-2 border">Rota</th>
                    <th className="px-3 py-2 border">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-8 text-gray-400">Nenhuma linha importada para os filtros atuais</td></tr>
                  )}
                  {lines.map(line => (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border font-mono">{line.start_time} - {line.end_time}</td>
                      <td className="px-3 py-2 border">{line.unit}</td>
                      <td className="px-3 py-2 border font-mono font-semibold">{line.prefix_code}</td>
                      <td className="px-3 py-2 border font-mono">{line.line_code}</td>
                      <td className="px-3 py-2 border">{line.direction}</td>
                      <td className="px-3 py-2 border">{line.client_name}</td>
                      <td className="px-3 py-2 border">{line.driver_name}</td>
                      <td className="px-3 py-2 border text-gray-600">{line.route_name}</td>
                      <td className="px-3 py-2 border">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClass[line.status]}`}>{line.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
              <span>Pagina {page + 1} de {Math.max(totalPages, 1)}</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-white">Anterior</button>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-white">Proxima</button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="bg-white rounded-lg shadow p-4">
              <h2 className="font-semibold text-gray-800 mb-3">Resumo por unidade</h2>
              <div className="space-y-2">
                {summary.length === 0 && <p className="text-sm text-gray-400">Sem dados para resumir.</p>}
                {summary.map(item => (
                  <div key={item.unit} className="border rounded p-3">
                    <div className="flex justify-between font-semibold">
                      <span>{item.unit}</span>
                      <span>{item.total}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Entrada {item.entrada} · Saida {item.saida}</p>
                    <p className="text-xs text-gray-500">Pendentes {item.pending} · Alteradas {item.changed}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-lg shadow p-4">
              <h2 className="font-semibold text-gray-800 mb-2">Texto para WhatsApp</h2>
              <p className="text-xs text-gray-500 mb-2">Selecione uma unidade no filtro para gerar o texto oficial daquela unidade.</p>
              <textarea readOnly value={whatsappText || fallbackWhatsappText} className="w-full h-56 border rounded p-2 text-xs text-gray-700" />
              <button type="button" onClick={handleGenerateWhatsapp}
                className="mt-2 w-full bg-blue-700 text-white px-3 py-2 rounded text-sm hover:bg-blue-800">
                Gerar por unidade
              </button>
              <button type="button" onClick={() => navigator.clipboard?.writeText(whatsappText || fallbackWhatsappText)}
                className="mt-2 w-full bg-green-700 text-white px-3 py-2 rounded text-sm hover:bg-green-800">
                Copiar para WhatsApp
              </button>
            </section>
          </aside>
        </div>
      </div>
    </Layout>
  )
}
