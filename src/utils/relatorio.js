// Cálculos da aba Relatórios. Não muda nenhuma regra de comissão: só lê comissao_barbeiro.
import { taxaOnline } from '../config/taxas.js'

export const FORMAS_CAIXA = ['Dinheiro', 'Pix', 'Débito', 'Crédito']
export const LOJAS = ['loja-01', 'loja-02']
const UNIDADE_LOJA = { '01': 'loja-01', '02': 'loja-02' }

const n = (v) => parseFloat(v) || 0
const r2 = (v) => Math.round(v * 100) / 100

export const ehFinanceiro = (d) => ['adiantamento', 'fechamento_comissao'].includes(d.tipo)
// Venda gravada pelo webhook do site (AbacatePay): é online, não é caixa da loja
export const ehOnline = (d) => !!d.webhook_origem
export const ehAtendimento = (d) => !ehFinanceiro(d) && (d.tipo === 'servico' || !d.tipo)

export function tipoAtendimento(d) {
    if (d.forma_pagamento === 'Assinante') return 'assinante'
    if (d.forma_pagamento === 'Vale Presente') return 'vale'
    return 'pago'
}

export const TIPO_VENDA = { venda_assinatura: 'assinatura', renovacao_celcoin: 'assinatura', venda_vale: 'vale', produto: 'produto' }

const vazioCaixa = () => ({ Dinheiro: 0, Pix: 0, 'Débito': 0, 'Crédito': 0, caixa: 0, online: 0, total: 0, adiantamentos: 0 })

// 1. Entrou: caixa das lojas (4 formas) + cobrado online
export function entrou(lancamentos, pagamentos, lojaDe) {
    const res = { 'loja-01': vazioCaixa(), 'loja-02': vazioCaixa(), total: vazioCaixa() }
    const soma = (loja, campo, v) => {
        if (res[loja]) res[loja][campo] += v
        res.total[campo] += v
    }
    for (const d of lancamentos) {
        // Adiantamento sai da gaveta (gravado como comissão negativa); só informativo
        if (d.tipo === 'adiantamento') { soma(lojaDe(d), 'adiantamentos', Math.abs(n(d.comissao_barbeiro))); continue }
        if (ehFinanceiro(d)) continue
        const v = n(d.valor_bruto)
        if (ehOnline(d)) { soma(lojaDe(d), 'online', v); continue }
        if (FORMAS_CAIXA.includes(d.forma_pagamento)) { soma(lojaDe(d), d.forma_pagamento, v); soma(lojaDe(d), 'caixa', v) }
    }
    for (const p of pagamentos) {
        if (!p.receita) continue
        // Sem unidade conhecida: entra só no Total
        soma(UNIDADE_LOJA[p.unidade] || null, 'online', n(p.valor))
    }
    for (const k of Object.keys(res)) {
        for (const c of Object.keys(res[k])) res[k][c] = r2(res[k][c])
        res[k].total = r2(res[k].caixa + res[k].online)
    }
    return res
}

const vazioCom = () => ({ pago: { qtd: 0, valor: 0 }, assinante: { qtd: 0, valor: 0 }, vale: { qtd: 0, valor: 0 }, produto: { qtd: 0, valor: 0 }, total: 0 })

// 2a. Comissões geradas: atendimentos (pago/assinante/vale) + produto (regra atual R$ 5)
export function comissoes(lancamentos, lojaDe) {
    const res = { 'loja-01': vazioCom(), 'loja-02': vazioCom(), total: vazioCom() }
    for (const d of lancamentos) {
        if (ehFinanceiro(d)) continue
        let tipo = null
        if (ehAtendimento(d)) tipo = tipoAtendimento(d)
        else if (d.tipo === 'produto') tipo = 'produto'
        if (!tipo) continue
        const v = n(d.comissao_barbeiro)
        for (const k of [lojaDe(d), 'total']) {
            if (!res[k]) continue
            res[k][tipo].qtd++
            res[k][tipo].valor += v
            res[k].total += v
        }
    }
    for (const k of Object.keys(res)) {
        for (const t of ['pago', 'assinante', 'vale', 'produto']) res[k][t].valor = r2(res[k][t].valor)
        res[k].total = r2(res[k].total)
    }
    return res
}

// 3. Sobrou = entrou − comissões geradas (adiantamento não desconta: já é parte da comissão)
export function sobrou(ent, com) {
    const res = {}
    for (const k of ['loja-01', 'loja-02', 'total']) res[k] = r2(ent[k].total - com[k].total)
    return res
}

// 4. Atendimentos e ticket (só pagos na hora, regra atual)
export function atendimentos(lancamentos) {
    const res = { pago: 0, assinante: 0, vale: 0, total: 0, ticketBase: 0, ticketSoma: 0 }
    for (const d of lancamentos) {
        if (!ehAtendimento(d)) continue
        const t = tipoAtendimento(d)
        res[t]++
        res.total++
        if (t === 'pago') { res.ticketBase++; res.ticketSoma += n(d.valor_bruto) }
    }
    res.ticket = res.ticketBase ? r2(res.ticketSoma / res.ticketBase) : null
    return res
}

// 5. Por barbeiro: atendimentos e comissão nos 3 tipos
export function porBarbeiro(lancamentos) {
    const map = {}
    for (const d of lancamentos) {
        if (ehFinanceiro(d) || !d.barbeiro_id) continue
        const b = (map[d.barbeiro_id] ||= { id: d.barbeiro_id, nome: d.barbeiro_nome, atend: { pago: 0, assinante: 0, vale: 0 }, com: { pago: 0, assinante: 0, vale: 0, produto: 0 }, total: 0, ticketBase: 0, ticketSoma: 0 })
        const v = n(d.comissao_barbeiro)
        if (ehAtendimento(d)) {
            const t = tipoAtendimento(d)
            b.atend[t]++
            b.com[t] += v
            b.total += v
            if (t === 'pago') { b.ticketBase++; b.ticketSoma += n(d.valor_bruto) }
        } else if (d.tipo === 'produto') {
            b.com.produto += v
            b.total += v
        }
    }
    return Object.values(map)
        .map(b => ({ ...b, total: r2(b.total), com: Object.fromEntries(Object.entries(b.com).map(([k, v]) => [k, r2(v)])), ticket: b.ticketBase ? r2(b.ticketSoma / b.ticketBase) : null }))
        .filter(b => b.atend.pago + b.atend.assinante + b.atend.vale > 0 || b.total !== 0)
        .sort((a, b) => b.total - a.total)
}

// 6. Vendas que não são serviço (balcão + site)
export function vendasNaoServico(lancamentos) {
    const res = { assinatura: { qtd: 0, valor: 0 }, vale: { qtd: 0, valor: 0 }, produto: { qtd: 0, valor: 0 } }
    for (const d of lancamentos) {
        const t = TIPO_VENDA[d.tipo]
        if (!t) continue
        res[t].qtd++
        res[t].valor = r2(res[t].valor + n(d.valor_bruto))
    }
    return res
}

// 7. Formas de pagamento: só dinheiro real de caixa, somando 100%
export function formasPagamento(lancamentos) {
    const soma = Object.fromEntries(FORMAS_CAIXA.map(f => [f, { qtd: 0, valor: 0 }]))
    for (const d of lancamentos) {
        if (ehFinanceiro(d) || ehOnline(d) || !soma[d.forma_pagamento]) continue
        soma[d.forma_pagamento].qtd++
        soma[d.forma_pagamento].valor += n(d.valor_bruto)
    }
    const total = Object.values(soma).reduce((s, x) => s + x.valor, 0)
    return { total: r2(total), formas: FORMAS_CAIXA.map(f => ({ forma: f, qtd: soma[f].qtd, valor: r2(soma[f].valor), pct: total ? (soma[f].valor / total) * 100 : 0 })) }
}

// 2b. A pagar no sábado: comissão da semana (domingo a hoje) − adiantamentos da semana
export function aPagarSemana(lancamentosSemana) {
    const map = {}
    for (const d of lancamentosSemana) {
        if (!d.barbeiro_id || d.tipo === 'fechamento_comissao') continue
        const b = (map[d.barbeiro_id] ||= { id: d.barbeiro_id, nome: d.barbeiro_nome, comissao: 0, adiantamentos: 0 })
        const v = n(d.comissao_barbeiro)
        if (d.tipo === 'adiantamento') b.adiantamentos += Math.abs(v)
        else if (ehAtendimento(d) || d.tipo === 'produto') b.comissao += v
    }
    return Object.values(map)
        .map(b => ({ ...b, comissao: r2(b.comissao), adiantamentos: r2(b.adiantamentos), aPagar: r2(b.comissao - b.adiantamentos) }))
        .sort((a, b) => b.aPagar - a.aPagar)
}

// Até este mês a receita Celcoin era digitada à mão no Financeiro e vale como líquido real
export const CELCOIN_AUTO_DESDE = '2026-11'

// 8. Assinaturas no mês da cobrança. liquidoReal: digitado no lápis; liquidoAntigo: Financeiro (até out/2026)
export function monitorAssinaturas(pagamentosMes, lancamentosMes, liquidoReal, mes, liquidoAntigo = null) {
    const online = pagamentosMes.filter(p => p.receita)
    const bruto = r2(online.reduce((s, p) => s + n(p.valor), 0))
    const taxas = r2(online.reduce((s, p) => s + taxaOnline(p.valor), 0))
    const liquidoEstimado = r2(bruto - taxas)
    const digitado = liquidoReal != null && liquidoReal !== ''
    const antigo = !digitado && mes < CELCOIN_AUTO_DESDE && liquidoAntigo != null
    const temReal = digitado || antigo
    const liquido = digitado ? r2(n(liquidoReal)) : antigo ? r2(n(liquidoAntigo)) : liquidoEstimado
    const balcaoItens = lancamentosMes.filter(d => ['venda_assinatura', 'renovacao_celcoin'].includes(d.tipo) && !ehOnline(d) && FORMAS_CAIXA.includes(d.forma_pagamento))
    const balcao = r2(balcaoItens.reduce((s, d) => s + n(d.valor_bruto), 0))
    const atendAssin = lancamentosMes.filter(d => ehAtendimento(d) && d.forma_pagamento === 'Assinante')
    const comissoesAssinante = r2(atendAssin.reduce((s, d) => s + n(d.comissao_barbeiro), 0))
    return {
        cobrancas: online.length, bruto, taxas, liquidoEstimado, liquido, usandoReal: temReal,
        origemLiquido: digitado ? 'extrato' : antigo ? 'financeiro' : 'estimado',
        balcao, balcaoQtd: balcaoItens.length, // informativo: já está no caixa das lojas
        atendimentosAssinante: atendAssin.length, comissoesAssinante,
        lucro: r2(liquido - comissoesAssinante),
    }
}

// Período anterior para comparação: 1 dia -> mesmo dia da semana anterior; intervalo -> mesmo tamanho antes
export function periodoAnterior(inicio, fim) {
    const dia = 864e5
    const ini = new Date(inicio + 'T12:00:00')
    const f = new Date(fim + 'T12:00:00')
    const dias = Math.round((f - ini) / dia) + 1
    const desloc = dias === 1 ? 7 : dias
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    return { inicio: iso(new Date(ini - desloc * dia)), fim: iso(new Date(f - desloc * dia)), mesmoDiaSemana: dias === 1 }
}

// Domingo da semana atual (00:00 local)
export function inicioDaSemana(hoje = new Date()) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    d.setDate(d.getDate() - d.getDay())
    return d
}
