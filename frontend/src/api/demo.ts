import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { DEFAULT_OPERATION_DATE } from '../config/demo'

type DemoLine = {
  id: number
  schedule_date: string
  unit: string
  prefix_code: string
  driver_name: string
  line_code: string
  direction: string
  client_name: string
  route_name: string
  start_time: string
  end_time: string
  status: 'pendente' | 'confirmada' | 'alterada' | 'cancelada'
  confirmed_by?: number | null
  confirmed_at?: string | null
}

const initialLines: DemoLine[] = [
  ['Caieiras', '1580', 'E N DA SILVA', '7368', 'ENTRADA', 'M LIVRE - SP-02', 'JD. PINHEIROS / VERA TERESA', '03:50', '04:45'],
  ['Caieiras', '3700', 'FABIO ANDERSON', '7522', 'ENTRADA', 'M LIVRE - SP-02', 'POLVILHO / CAJAMAR', '05:20', '06:15'],
  ['Caieiras', '3700', 'FABIO ANDERSON', '7593', 'SAIDA', 'M LIVRE - SP-02', 'CAJAMAR / POLVILHO', '14:10', '15:00'],
  ['Jundiai', '2250', 'CARLOS', '8110', 'ENTRADA', 'M LIVRE - JUNDIAI', 'CENTRO / CD JUNDIAI', '07:00', '08:00'],
  ['Jundiai', '2288', 'ORLANDO', '8111', 'SAIDA', 'M LIVRE - JUNDIAI', 'CD JUNDIAI / CENTRO', '18:00', '19:05'],
  ['Santana de Parnaiba', '3012', 'AVERALDO', '6902', 'ENTRADA', 'M LIVRE - SP-02', 'FAZENDINHA / SP-02', '06:10', '07:00'],
  ['Santana de Parnaiba', '3044', 'IGOR', '6903', 'SAIDA', 'M LIVRE - SP-02', 'SP-02 / FAZENDINHA', '17:30', '18:25'],
  ['Caieiras', '3750', 'DION', '7601', 'ENTRADA', 'M LIVRE - SP-02', 'LARANJEIRAS / SP-02', '19:00', '19:50'],
].map((row, index) => ({
  id: index + 1,
  schedule_date: DEFAULT_OPERATION_DATE,
  unit: row[0],
  prefix_code: row[1],
  driver_name: row[2],
  line_code: row[3],
  direction: row[4],
  client_name: row[5],
  route_name: row[6],
  start_time: row[7],
  end_time: row[8],
  status: 'pendente',
  confirmed_by: null,
  confirmed_at: null,
} as DemoLine))

const users = [
  { id: 1, email: 'jerusa@exclusivaturismo.com.br', name: 'Jerusa', role: 'admin', is_active: true, must_change_password: false, can_delete_history: false, created_at: '2026-05-12T12:00:00' },
  { id: 2, email: 'vinicius@exclusivaturismo.com.br', name: 'Vinicius', role: 'admin', is_active: true, must_change_password: false, can_delete_history: true, created_at: '2026-05-12T12:00:00' },
]

const audits = [
  { id: 1, user_id: 2, action: 'IMPORT', resource: 'schedule', resource_id: null, details: '8 linhas demonstrativas carregadas', deleted_at: null, deleted_by: null, created_at: '2026-05-12T12:00:00' },
  { id: 2, user_id: 1, action: 'REGISTER', resource: 'user', resource_id: 1, details: 'Perfis administrativos MVP', deleted_at: null, deleted_by: null, created_at: '2026-05-12T12:05:00' },
]

function loadLines(): DemoLine[] {
  const saved = localStorage.getItem('demoLines')
  if (saved) return JSON.parse(saved)
  localStorage.setItem('demoLines', JSON.stringify(initialLines))
  return initialLines
}

function saveLines(lines: DemoLine[]) {
  localStorage.setItem('demoLines', JSON.stringify(lines))
}

function paramsOf(config: InternalAxiosRequestConfig) {
  return (config.params || {}) as Record<string, string>
}

function pathOf(config: InternalAxiosRequestConfig) {
  return config.url || '/'
}

function ok<T>(config: InternalAxiosRequestConfig, data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config }
}

function fakeJwt(role = 'admin') {
  const payload = btoa(JSON.stringify({ sub: '2', role, type: 'access' }))
  return `demo.${payload}.token`
}

function filterLines(lines: DemoLine[], params: Record<string, string>) {
  return lines.filter(line =>
    (!params.schedule_date || line.schedule_date === params.schedule_date) &&
    (!params.unit || line.unit.toLowerCase().includes(params.unit.toLowerCase())) &&
    (!params.status || line.status === params.status) &&
    (!params.line_code || line.line_code.includes(params.line_code)) &&
    (!params.prefix_code || line.prefix_code.includes(params.prefix_code)) &&
    (!params.driver_name || line.driver_name.toLowerCase().includes(params.driver_name.toLowerCase()))
  )
}

export async function demoAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const method = (config.method || 'get').toLowerCase()
  const path = pathOf(config)
  const params = paramsOf(config)
  const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) : config.data || {}
  const lines = loadLines()

  if (path === '/auth/login' && method === 'post') {
    const name = body.cpf === '22692036824' ? 'Jerusa' : 'Vinicius'
    localStorage.setItem('demoUser', name)
    return ok(config, { access_token: fakeJwt('admin'), refresh_token: fakeJwt('admin'), token_type: 'bearer' })
  }
  if (path === '/auth/refresh' && method === 'post') return ok(config, { access_token: fakeJwt('admin'), refresh_token: fakeJwt('admin'), token_type: 'bearer' })
  if (path === '/auth/me') {
    const user = localStorage.getItem('demoUser') === 'Jerusa' ? users[0] : users[1]
    return ok(config, user)
  }
  if (path === '/auth/change-password' && method === 'post') return ok(config, { message: 'Senha alterada com sucesso' })
  if (path === '/auth/users' && method === 'get') return ok(config, users)
  if (path === '/auth/users' && method === 'post') {
    const newUser = { id: users.length + 1, email: body.email, name: body.name, role: body.role || 'operator', is_active: true, must_change_password: true, can_delete_history: false, created_at: new Date().toISOString() }
    users.push(newUser)
    return ok(config, newUser)
  }
  if (path.includes('/auth/users/') && method === 'patch') return ok(config, users[0])

  if (path === '/schedule/lines') return ok(config, filterLines(lines, params).slice(Number(params.skip || 0), Number(params.skip || 0) + Number(params.limit || 100)))
  if (path === '/schedule/lines/count') return ok(config, { total: filterLines(lines, params).length })
  if (path === '/schedule/summary') {
    const grouped = ['Caieiras', 'Jundiai', 'Santana de Parnaiba'].map(unit => {
      const unitLines = lines.filter(line => line.unit === unit)
      return {
        unit,
        total: unitLines.length,
        entrada: unitLines.filter(line => line.direction === 'ENTRADA').length,
        saida: unitLines.filter(line => line.direction === 'SAIDA').length,
        pending: unitLines.filter(line => line.status === 'pendente').length,
        confirmed: unitLines.filter(line => line.status === 'confirmada').length,
        changed: unitLines.filter(line => line.status === 'alterada').length,
        cancelled: unitLines.filter(line => line.status === 'cancelada').length,
      }
    })
    return ok(config, grouped)
  }
  if (path.match(/\/schedule\/lines\/\d+\/confirm/) && method === 'post') {
    const id = Number(path.split('/')[3])
    const line = lines.find(item => item.id === id)
    if (line) {
      line.status = 'confirmada'
      line.confirmed_by = 2
      line.confirmed_at = new Date().toISOString()
      saveLines(lines)
    }
    return ok(config, line)
  }
  if (path.match(/\/schedule\/lines\/\d+\/cancel/) && method === 'post') {
    const id = Number(path.split('/')[3])
    const line = lines.find(item => item.id === id)
    if (line) {
      line.status = 'cancelada'
      saveLines(lines)
    }
    return ok(config, line)
  }
  if (path.match(/\/schedule\/lines\/\d+\/undo-confirm/) && method === 'post') {
    const id = Number(path.split('/')[3])
    const line = lines.find(item => item.id === id)
    if (line) {
      line.status = 'pendente'
      line.confirmed_by = null
      line.confirmed_at = null
      saveLines(lines)
    }
    return ok(config, line)
  }
  if (path === '/schedule/whatsapp') {
    const selected = filterLines(lines, params)
    const text = selected.map(line => `- ${line.start_time} as ${line.end_time} | Linha ${line.line_code} | ${line.direction} | ${line.client_name} | Prefixo ${line.prefix_code} | Motorista: ${line.driver_name}`).join('\n')
    return ok(config, { schedule_date: params.schedule_date, unit: params.unit, total: selected.length, text: `ALTERACOES REALIZADAS NA ESCALA\nEntram em vigor a partir do dia: ${params.schedule_date}\n\nUnidade: ${params.unit}\n\n${text}` })
  }

  if (path === '/swaps/count') return ok(config, { total: Number(localStorage.getItem('demoSwapsTotal') || 0) })
  if (path === '/swaps/' || path === '/swaps') return method === 'post'
    ? ok(config, { id: Date.now(), ...body, schedule_date: DEFAULT_OPERATION_DATE, unit: params.unit || 'Caieiras', client_name: 'M LIVRE - SP-02', created_by: 2, created_at: new Date().toISOString(), whatsapp_text: `Troca operacional confirmada\n\nCarro substituido: ${body.vehicle_out}\nCarro substituto: ${body.vehicle_in}\n\nLinha(s) atendida(s): ${body.lines_covered}` }, 201)
    : ok(config, [])
  if (path === '/swaps/whatsapp/text') return ok(config, { total: 0, text: 'Nenhuma troca registrada para os filtros informados.' })

  if (path === '/incidents/count') return ok(config, { total: params.status === 'fechado' ? 1 : params.status ? 2 : 5 })
  if (path.startsWith('/incidents')) return ok(config, [])
  if (path === '/audit/logs/count') return ok(config, { total: audits.length })
  if (path === '/audit/logs') return ok(config, audits)
  if (path.includes('/audit/logs/') && method === 'delete') return ok(config, { message: 'Historico apagado logicamente por 30 dias' })
  if (path.includes('/audit/logs/') && method === 'post') return ok(config, { message: 'Historico recuperado' })

  return ok(config, {})
}
