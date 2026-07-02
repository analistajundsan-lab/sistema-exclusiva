// O backend serializa datetimes em UTC "naive" (sem 'Z' nem offset, ex.:
// "2026-07-02T12:34:56"). new Date(...) interpretaria isso como hora LOCAL e
// o horário apareceria ~3h adiantado no Brasil. Aqui completamos o 'Z' quando
// a string não traz fuso; datas puras (YYYY-MM-DD) e strings já com offset
// passam direto.
export function parseApiDate(s: string): Date {
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s)
  const hasTime = s.includes('T')
  return new Date(hasTime && !hasTimezone ? `${s}Z` : s)
}

// dd/mm/aaaa hh:mm no fuso de Brasília.
export function fmtDateTimeBR(s: string): string {
  return parseApiDate(s).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}
