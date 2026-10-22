// Fechamento de comissão fora do sábado: fecha só até o último sábado 23:59.

const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)

// Sábado: null (fecha normal, até agora). Outro dia: último sábado às 23:59 (horário local).
export function ultimoSabadoFim(agora = new Date()) {
    const dia = agora.getDay()
    if (dia === 6) return null
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - (dia + 1), 23, 59, 0, 0)
    return d
}

// Mesma regra do saldo do Painel (useBarberStats): soma comissao_barbeiro (adiantamento entra
// negativo) depois do último fechamento — ou desde o dia 1º do mês, se não houver — até o limite.
export function saldoAte(lancamentos, limite, agora = new Date()) {
    let ultimoFechamento = null
    for (const l of lancamentos) {
        const d = toDate(l.data)
        if (l.tipo === 'fechamento_comissao' && d && (!ultimoFechamento || d > ultimoFechamento)) ultimoFechamento = d
    }
    const inicio = ultimoFechamento || new Date(agora.getFullYear(), agora.getMonth(), 1)
    if (inicio >= limite) return 0
    let soma = 0
    for (const l of lancamentos) {
        const d = toDate(l.data)
        if (!d || l.tipo === 'fechamento_comissao') continue
        if (d > inicio && d <= limite) soma += parseFloat(l.comissao_barbeiro) || 0
    }
    return Math.round(soma * 100) / 100
}
