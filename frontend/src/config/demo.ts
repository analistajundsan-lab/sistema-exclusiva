// Data operacional "de hoje" no fuso de Brasilia (YYYY-MM-DD). O 'en-CA' ja
// formata em ISO. Recalcular SEMPRE (funcao, nao const) garante que o painel
// diario rode para o proximo dia a partir das 00:00 BRT, sem depender de reload.
export function currentOperationDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// Valor inicial (carregamento do modulo). Telas que precisam virar o dia ao vivo
// devem usar currentOperationDate() num intervalo (ver Dashboard).
export const DEFAULT_OPERATION_DATE = currentOperationDate()
