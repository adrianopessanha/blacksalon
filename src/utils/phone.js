// Normaliza para 10/11 dígitos (DDD + número). Sem DDD assume 21.
// Formato usado nos webhooks do Make — não alterar.
export function normalizePhone(raw) {
    if (!raw) return ''
    let digits = String(raw).replace(/\D/g, '')
    if (!digits) return ''
    if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) digits = digits.slice(2)
    if ((digits.length === 12 || digits.length === 11) && digits.startsWith('0')) digits = digits.slice(1)
    if (digits.length === 9 || digits.length === 8) digits = '21' + digits
    return digits
}

// Formato do Firestore (ID de clientes): 55 + DDD + número. '' se inválido.
export function normalizeTelefone55(raw) {
    const d = normalizePhone(raw)
    return d.length === 10 || d.length === 11 ? '55' + d : ''
}

export function formatTelefone(tel55) {
    const d = String(tel55 || '').replace(/^55/, '')
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    return tel55 || ''
}

export function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
