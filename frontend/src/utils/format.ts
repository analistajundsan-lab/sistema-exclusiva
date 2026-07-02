// "1 linha" / "3 linhas" — evita rótulos como "1 pendentes" ou "linha(s)".
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  confirmada: 'Confirmada',
  alterada: 'Alterada',
  cancelada: 'Cancelada',
}

// Enum de status da escala -> rótulo de UI (não expor o valor cru do banco).
export function scheduleStatusLabel(status: string): string {
  return SCHEDULE_STATUS_LABELS[status] ?? status
}
