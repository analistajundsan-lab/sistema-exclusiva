import api from '../api/client'

export interface SafetyVehicle {
  id: number
  prefix: string
  plate?: string
  unit: string
  active: boolean
  public_token: string
}

export interface SafetyItem {
  id: number
  section: string
  position: number
  item_text: string
  severity: 'ok' | 'attention' | 'blocking'
  answer_type: string
}

export interface PublicSafetyChecklist {
  vehicle: SafetyVehicle
  template_id: number
  template_title: string
  template_version: number
  items: SafetyItem[]
}

export interface SafetyDashboard {
  days_without_blocking: number
  active_blocking_tickets: number
  resolved_tickets: number
  submissions_today: number
  vehicles_without_checklist_today: number
}

export interface SafetySubmission {
  id: number
  prefix: string
  unit: string
  driver_name: string
  driver_registration: string
  overall_status: 'ok' | 'attention' | 'blocking'
  submitted_at: string
}

export interface SafetyTicket {
  id: number
  unit: string
  prefix: string
  status: 'open' | 'validated' | 'in_progress' | 'resolved' | 'cancelled'
  blocking_items: string[]
  source_submission_id: number
  created_at: string
  manager_notes?: string
  email_sent: boolean
  sst_approved: boolean
  sst_approved_notes?: string
  sst_approved_at?: string
}

export async function getPublicSafetyChecklist(token: string) {
  const res = await api.get<PublicSafetyChecklist>(`/public/checklists/${token}`)
  return res.data
}

export async function submitPublicSafetyChecklist(token: string, data: {
  driver_name: string
  driver_registration: string
  declaration_accepted: boolean
  answers: { item_id: number; answer: string; observation?: string }[]
}) {
  const res = await api.post(`/public/checklists/${token}/submissions`, data)
  return res.data as { id: number; overall_status: string; maintenance_ticket_id?: number; message: string }
}

export async function getSafetyDashboard() {
  const res = await api.get<SafetyDashboard>('/safety/dashboard')
  return res.data
}

export async function listSafetySubmissions() {
  const res = await api.get<SafetySubmission[]>('/safety/submissions')
  return res.data
}

export async function listSafetyTickets() {
  const res = await api.get<SafetyTicket[]>('/safety/maintenance')
  return res.data
}

export async function listSafetyVehicles() {
  const res = await api.get<SafetyVehicle[]>('/safety/vehicles')
  return res.data
}

export async function updateSafetyTicket(id: number, status: SafetyTicket['status'], manager_notes?: string) {
  const res = await api.patch<SafetyTicket>(`/safety/maintenance/${id}`, { status, manager_notes })
  return res.data
}

export async function approveTicketForSST(id: number, notes?: string) {
  const res = await api.post<SafetyTicket>(`/safety/maintenance/${id}/approve-sst`, { notes })
  return res.data
}

export async function getSSTView() {
  const res = await api.get<{
    submissions: SafetySubmission[]
    tickets: SafetyTicket[]
    is_tecnico: boolean
  }>('/safety/sst-view')
  return res.data
}
