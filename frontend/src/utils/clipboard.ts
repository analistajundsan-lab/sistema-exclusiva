// Copia texto de forma robusta. No iOS o navigator.clipboard rejeita quando
// chamado depois de um await (perde o "gesto do usuario"); por isso ha o
// fallback com textarea + execCommand. Retorna true se conseguiu copiar.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // cai no fallback abaixo
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Abre o WhatsApp com o texto pre-preenchido. Usa location.href (em vez de
// window.open) porque no mobile o popup e bloqueado apos um await.
export function openWhatsApp(text: string) {
  window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`
}
