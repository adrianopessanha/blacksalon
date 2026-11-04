// Aba Financeiro: categorias, DRE e fluxo de caixa por loja (com rateio do que é Geral) e contas a pagar.
// As regras de comissão e taxa de cartão são as mesmas de antes; muda só:
// - o que é "Geral" (store_id 'global') entra em cada loja pela fatia do faturamento (antes entrava inteiro nas duas)
// - receita de assinatura online (Celcoin + Pix manual) dividida pelos atendimentos de assinante de cada loja
// - despesas e receitas manuais separadas em pago e previsto (pendente); provisionado continua fora
// - pró-labore fora das despesas operacionais, depois do resultado
// - só competência: o lançamento entra apenas no mês da competência
import { ehAtendAssinante, formaCobranca, CELCOIN_AUTO_DESDE } from './assinaturas.js'

export const CATEGORIAS = [
    { id: 'aluguel_imovel', label: 'Aluguel e imóvel', grupo: 'despesa_operacional', dica: 'aluguel, IPTU, condomínio, seguro' },
    { id: 'energia', label: 'Energia', grupo: 'despesa_operacional' },
    { id: 'agua', label: 'Água', grupo: 'despesa_operacional' },
    { id: 'internet_telefone', label: 'Internet/Telefone', grupo: 'despesa_operacional' },
    { id: 'produtos_insumos', label: 'Produtos e insumos', grupo: 'despesa_operacional' },
    { id: 'sistemas_assinaturas', label: 'Sistemas e assinaturas', grupo: 'despesa_operacional' },
    { id: 'marketing', label: 'Marketing', grupo: 'despesa_operacional' },
    { id: 'manutencao', label: 'Manutenção', grupo: 'despesa_operacional' },
    { id: 'pessoal', label: 'Pessoal (salários e complementos)', grupo: 'despesa_operacional' },
    { id: 'outros', label: 'Outros', grupo: 'despesa_operacional' },
    { id: 'impostos', label: 'Impostos', grupo: 'imposto' },
    { id: 'pro_labore', label: 'Pró-labore (retirada do dono)', grupo: 'pro_labore' },
    { id: 'receita_celcoin', label: 'Receita – assinatura Celcoin', grupo: 'receita_celcoin' },
    { id: 'receita_diversa', label: 'Receita diversa', grupo: 'receita_diversa' },
]
export const CATEGORIAS_DESPESA = CATEGORIAS.filter(c => !c.grupo.startsWith('receita'))
const CATEGORIA_POR_ID = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]))
export const categoriaDe = (id) => CATEGORIA_POR_ID[id] || null

// store_id continua 'loja01' | 'loja02' | 'global' (rótulo "Geral")
export const LOJAS = [{ id: 'loja01', label: 'Loja 01' }, { id: 'loja02', label: 'Loja 02' }, { id: 'global', label: 'Geral' }]
export const rotuloLoja = (id) => LOJAS.find(l => l.id === id)?.label || id || '—'
export const FORMAS_PAGAMENTO = ['Pix', 'Boleto', 'Débito automático', 'Cartão de crédito', 'Dinheiro', 'Transferência']

// Grupo do DRE: pela categoria nova; lançamento antigo sem categoria usa o finance_category
export const grupoDe = (d) => categoriaDe(d.categoria)?.grupo || d.finance_category || null
export const ehReceitaManual = (d) => ['receita_celcoin', 'receita_diversa'].includes(grupoDe(d))
const rotuloCategoria = (d) => categoriaDe(d.categoria)?.label || 'Sem categoria'

const n = (v) => parseFloat(v) || 0
const r2 = (v) => Math.round(v * 100) / 100
const UNIDADE_PARA_LOJA = { '01': 'loja01', '02': 'loja02' }

// Mesma lógica de antes para lançamentos do app
const isFinancial = (item) => ['adiantamento', 'fechamento_comissao'].includes(item.tipo)
const isNonCashRevenue = (item) => ['Assinante', 'Vale Presente'].includes(item.forma_pagamento)
const isService = (item) => !isFinancial(item)
const isRevenue = (item) => !isFinancial(item) && !isNonCashRevenue(item)
const ehCredito = (pm) => pm.includes('crédit') || pm.includes('credit') || pm === 'crédito' || pm === 'credito'
const ehDebito = (pm) => pm.includes('débit') || pm.includes('debit') || pm === 'débito' || pm === 'debito'

export function lojaDoLancamento(d, barbers = []) {
    const barber = barbers.find(b => b.id === d.barbeiro_id)
    const store = barber?.store || d.loja_id || 'loja-01'
    return store.replace('loja-', 'loja').replace('-', '')
}
export const lojaDoCelcoin = (d) => UNIDADE_PARA_LOJA[d.unidade] || 'global'

// Só competência: o lançamento entra no mês da competência (sem competência, o mês da data)
export const doMesCompetencia = (financeiro, mes) => financeiro.filter(d => (d.competence_month || String(d.date || '').slice(0, 7)) === mes)

// Receita de assinatura online do mês, sem contar duas vezes:
// até out/2026 o líquido do extrato (lápis da aba Assinaturas), senão o digitado no Financeiro;
// de nov/2026 em diante os pagamentos aprovados da Celcoin. Lançamento manual que sobra é ignorado (conflito).
export function receitaAssinaturaOnline({ mes, lapis = null, celcoin = [], financeiro = [] }) {
    const manuais = financeiro.filter(d => grupoDe(d) === 'receita_celcoin' && d.status !== 'provisionado')
    const somaManual = r2(manuais.reduce((s, d) => s + n(d.amount), 0))
    if (mes >= CELCOIN_AUTO_DESDE) return { fonte: 'automatico', valor: r2(celcoin.reduce((s, d) => s + n(d.valor), 0)), ignorados: manuais }
    if (lapis != null && lapis !== '') return { fonte: 'extrato', valor: r2(n(lapis)), ignorados: manuais }
    return { fonte: manuais.length ? 'manual' : 'sem_dado', valor: somaManual, ignorados: [] }
}

// Pix manual (fora da Celcoin): recebido no mês enquanto ativo, como na aba Assinaturas
export const receitaPixManual = (assinantes, mes) => r2(assinantes
    .filter(a => formaCobranca(a) === 'pix_manual' && a.status_assinatura === 'ativa' && (!a.inicio_contrato || a.inicio_contrato.slice(0, 7) <= mes))
    .reduce((s, a) => s + n(a.valor), 0))

// Fatia de cada loja na receita de assinatura online = atendimentos de assinante da loja no mês
export function rateioAtendimentos(lancamentos, barbers = []) {
    const atend = lancamentos.filter(ehAtendAssinante)
    const a1 = atend.filter(d => lojaDoLancamento(d, barbers) === 'loja01').length
    const a2 = atend.length - a1
    const p1 = atend.length ? a1 / atend.length : 0.5
    return { loja01: p1, loja02: 1 - p1, atendimentos: { loja01: a1, loja02: a2 } }
}

// Receita de vendas da loja (base do rateio das despesas gerais): a dela + a fatia da assinatura online
function receitaVendasDaLoja(lancs, assinaturaOnline) {
    const rev = lancs.filter(isRevenue)
    const soma = (f) => rev.filter(f).reduce((s, d) => s + n(d.valor_bruto), 0)
    return soma(d => d.tipo === 'servico' || !d.tipo) + soma(d => d.tipo === 'venda_assinatura' || d.tipo === 'renovacao_celcoin')
        + soma(d => d.tipo === 'venda_vale') + soma(d => d.tipo === 'produto') + assinaturaOnline
}

// Fatia de cada loja no que é Geral = participação no faturamento do mês (sem faturamento: meio a meio)
export function calcularRateio({ lancamentos = [], barbers = [], assinaturaOnline = 0, atend = rateioAtendimentos(lancamentos, barbers) }) {
    const f = (loja) => receitaVendasDaLoja(lancamentos.filter(d => lojaDoLancamento(d, barbers) === loja), assinaturaOnline * atend[loja])
    const f1 = f('loja01'), f2 = f('loja02')
    const total = f1 + f2
    const p1 = total > 0 ? f1 / total : 0.5
    return { loja01: p1, loja02: 1 - p1, faturamento: { loja01: r2(f1), loja02: r2(f2) } }
}

// Lançamentos manuais com o peso da loja: os dela inteiros, os Gerais pela fatia
function comPeso(financeiro, loja, fatia) {
    if (loja === 'consolidado') return financeiro.map(d => ({ ...d, peso: 1 }))
    return financeiro
        .filter(d => d.store_id === loja || d.store_id === 'global')
        .map(d => ({ ...d, peso: d.store_id === 'global' ? fatia : 1, geral: d.store_id === 'global' }))
}
const valorP = (d) => n(d.amount) * d.peso

// Soma de um grupo manual separando pago e previsto (pendente); provisionado não entra
function somaGrupo(itens, grupo) {
    const doGrupo = itens.filter(d => grupoDe(d) === grupo && d.status !== 'provisionado')
    const pago = doGrupo.filter(d => d.status === 'pago').reduce((s, d) => s + valorP(d), 0)
    const previsto = doGrupo.filter(d => d.status !== 'pago').reduce((s, d) => s + valorP(d), 0)
    return { total: r2(pago + previsto), pago: r2(pago), previsto: r2(previsto), itens: doGrupo }
}

// Linhas do detalhe por categoria; numa loja, o que é Geral vira uma linha só de rateio
function linhasPorCategoria(itens, loja, rotuloRateio) {
    const linhas = new Map()
    const poe = (chave, label, d) => {
        const l = linhas.get(chave) || { label, total: 0, previsto: 0, geral: false }
        l.total += valorP(d)
        if (d.status !== 'pago') l.previsto += valorP(d)
        linhas.set(chave, l)
        return l
    }
    for (const d of itens) {
        if (loja !== 'consolidado' && d.geral) poe('__geral', rotuloRateio, d).geral = true
        else poe(d.categoria || `sem_${d.finance_category}`, rotuloCategoria(d), d)
    }
    return [...linhas.values()].map(l => ({ ...l, total: r2(l.total), previsto: r2(l.previsto) }))
        .sort((a, b) => Number(a.geral) - Number(b.geral) || b.total - a.total)
}

// Não recorrente (ex.: manutenção pós-furto): o "resultado sem não recorrentes" devolve o que entrou só desta vez
function naoRecorrentes(itens) {
    const doMes = itens.filter(d => d.nao_recorrente && d.status !== 'provisionado' && grupoDe(d) !== 'pro_labore' && grupoDe(d) !== 'receita_celcoin')
    const receitas = doMes.filter(ehReceitaManual).reduce((s, d) => s + valorP(d), 0)
    const despesas = doMes.filter(d => !ehReceitaManual(d)).reduce((s, d) => s + valorP(d), 0)
    return { receitas: r2(receitas), despesas: r2(despesas) }
}

function dreDe({ lancs, itens, assinaturaOnline, loja, rotuloRateio }) {
    const services = lancs.filter(isService)
    const revenueItems = lancs.filter(isRevenue)
    const somaRev = (f) => revenueItems.filter(f).reduce((s, d) => s + n(d.valor_bruto), 0)

    // (+) Receita de vendas
    const vendaServico = somaRev(d => d.tipo === 'servico' || !d.tipo)
    const vendaAssinaturaLoja = somaRev(d => d.tipo === 'venda_assinatura' || d.tipo === 'renovacao_celcoin')
    // Celcoin + Pix manual (já na fatia da loja); o lançamento manual de Celcoin entra por receitaAssinaturaOnline
    const vendaCelcoin = assinaturaOnline
    const vendaAssinaturas = vendaAssinaturaLoja + vendaCelcoin
    const vendaVale = somaRev(d => d.tipo === 'venda_vale')
    const vendaProduto = somaRev(d => d.tipo === 'produto')
    const receitaVendas = vendaServico + vendaAssinaturas + vendaVale + vendaProduto

    // (−) Impostos
    const impostos = somaGrupo(itens, 'imposto')
    const receitaLiquida = receitaVendas - impostos.total

    // (−) Despesas de vendas (comissões e taxa de cartão automáticas, como antes)
    const comissaoReceita = services.filter(d => d.tipo === 'servico' || !d.tipo).filter(d => !isNonCashRevenue(d))
        .reduce((s, d) => s + n(d.comissao_barbeiro), 0)
    const comissaoAssinVale = services.filter(d => d.tipo === 'servico' || !d.tipo).filter(d => isNonCashRevenue(d))
        .reduce((s, d) => s + n(d.comissao_barbeiro), 0)
    const comissaoProduto = services.filter(d => d.tipo === 'produto')
        .reduce((s, d) => { const com = n(d.comissao_barbeiro); return s + (com > 0 ? com : 5) }, 0)
    const taxaCartao = revenueItems.reduce((s, d) => {
        const pm = d.forma_pagamento?.toLowerCase() || ''
        const val = n(d.valor_bruto)
        if (ehCredito(pm)) return s + val * 0.05
        if (ehDebito(pm)) return s + val * 0.02
        return s
    }, 0)
    const despVenda = somaGrupo(itens, 'despesa_venda')
    const totalDespVenda = comissaoReceita + comissaoAssinVale + comissaoProduto + taxaCartao + despVenda.total
    const lucroBruto = receitaLiquida - totalDespVenda

    // (−) Despesas operacionais
    const operacionais = somaGrupo(itens, 'despesa_operacional')
    const lucroOperacional = lucroBruto - operacionais.total

    // (+/−) Diversas
    const receitasDiversas = somaGrupo(itens, 'receita_diversa')
    const despesasDiversas = somaGrupo(itens, 'despesa_diversa')
    const saldoDiversas = receitasDiversas.total - despesasDiversas.total
    const lucroFinal = lucroOperacional + saldoDiversas

    // Depois do resultado: pró-labore (retirada do dono, não é despesa operacional)
    const proLabore = somaGrupo(itens, 'pro_labore')
    const sobra = lucroFinal - proLabore.total

    // Previsto (contas a pagar e receitas pendentes): o resultado "só com o pago" tira o que ainda não aconteceu
    const despesasPrevistas = impostos.previsto + despVenda.previsto + operacionais.previsto + despesasDiversas.previsto
    const receitasPrevistas = receitasDiversas.previsto
    const lucroFinalPago = lucroFinal + despesasPrevistas - receitasPrevistas
    const geralOperacional = r2(operacionais.itens.filter(d => d.geral).reduce((s, d) => s + valorP(d), 0))
    const nr = naoRecorrentes(itens)

    return {
        vendaServico, vendaAssinaturaLoja, vendaAssinaturas, vendaVale, vendaProduto, vendaCelcoin, receitaVendas,
        naoRecorrentesDespesas: nr.despesas, naoRecorrentesReceitas: nr.receitas,
        lucroFinalSemNaoRecorrentes: lucroFinal + nr.despesas - nr.receitas,
        impostos: impostos.total, impostosPrevisto: impostos.previsto, impostosLinhas: linhasPorCategoria(impostos.itens, loja, rotuloRateio),
        receitaLiquida,
        comissaoReceita, comissaoAssinVale, comissaoProduto, taxaCartao,
        despVendaManual: despVenda.total, despVendaLinhas: linhasPorCategoria(despVenda.itens, loja, rotuloRateio), totalDespVenda,
        lucroBruto,
        despOperacionais: operacionais.total, despOperacionaisPrevisto: operacionais.previsto, geralOperacional,
        despOperacionaisLinhas: linhasPorCategoria(operacionais.itens, loja, rotuloRateio),
        lucroOperacional,
        receitasDiversas: receitasDiversas.total, despesasDiversas: despesasDiversas.total, saldoDiversas,
        diversasLinhas: [...linhasPorCategoria(receitasDiversas.itens, loja, rotuloRateio).map(l => ({ ...l, positivo: true })), ...linhasPorCategoria(despesasDiversas.itens, loja, rotuloRateio)],
        lucroFinal,
        proLabore: proLabore.total, proLaborePrevisto: proLabore.previsto, proLaboreLinhas: linhasPorCategoria(proLabore.itens, loja, rotuloRateio),
        sobra,
        despesasPrevistas: r2(despesasPrevistas + proLabore.previsto), receitasPrevistas: r2(receitasPrevistas),
        lucroFinalPago, sobraPago: lucroFinalPago - (proLabore.total - proLabore.previsto),
    }
}

function caixaDe({ lancs, itens, assinaturaOnline }) {
    const services = lancs.filter(isService)
    const revenueItems = lancs.filter(isRevenue)
    const somaPm = (f) => revenueItems.filter(d => f(d.forma_pagamento?.toLowerCase() || '')).reduce((s, d) => s + n(d.valor_bruto), 0)
    const dinheiro = somaPm(pm => pm.includes('dinheiro'))
    const pix = somaPm(pm => pm.includes('pix'))
    const debito = somaPm(ehDebito)
    const credito = somaPm(ehCredito)
    // Assinatura online (Celcoin + Pix manual), na fatia da loja
    const celcoinPago = assinaturaOnline
    const totalEntradas = dinheiro + pix + debito + credito + celcoinPago
    // Saídas pagas (inclui pró-labore: sai do caixa)
    const despesasManuais = itens.filter(d => d.status === 'pago' && !ehReceitaManual(d)).reduce((s, d) => s + valorP(d), 0)
    const comissaoServicos = services.filter(d => d.tipo === 'servico' || !d.tipo).reduce((s, d) => s + n(d.comissao_barbeiro), 0)
    const comissaoProdutos = services.filter(d => d.tipo === 'produto').reduce((s, d) => { const com = n(d.comissao_barbeiro); return s + (com > 0 ? com : 5) }, 0)
    const comissaoTotal = comissaoServicos + comissaoProdutos
    const taxaCartao = revenueItems.reduce((s, d) => {
        const pm = d.forma_pagamento?.toLowerCase() || ''
        const val = n(d.valor_bruto)
        return s + (ehCredito(pm) ? val * 0.05 : ehDebito(pm) ? val * 0.02 : 0)
    }, 0)
    const totalSaidas = despesasManuais + comissaoTotal + taxaCartao
    return { dinheiro, pix, debito, credito, celcoinPago, totalEntradas, despesasManuais, comissaoTotal, taxaCartao, totalSaidas }
}

const pctTxt = (p) => `${Math.round(p * 100)}%`

// mes: AAAA-MM; lancamentos: do mês; financeiro: lançamentos manuais da competência do mês;
// celcoin: cartão aprovado do mês (pagamentos_assinatura); lapis: líquido do extrato do mês (aba Assinaturas)
export function calcularFinanceiro({ mes = '', lancamentos = [], financeiro = [], celcoin = [], barbers = [], lapis = null, assinantes = [] }) {
    const online = receitaAssinaturaOnline({ mes, lapis, celcoin, financeiro })
    const pixManual = receitaPixManual(assinantes, mes)
    const assinaturaTotal = r2(online.valor + pixManual)
    const atend = rateioAtendimentos(lancamentos, barbers)
    const rateio = calcularRateio({ lancamentos, barbers, assinaturaOnline: assinaturaTotal, atend })
    const rotuloRateio = `Despesas gerais (rateio ${pctTxt(rateio.loja01)} / ${pctTxt(rateio.loja02)})`
    // A receita de Celcoin digitada no Financeiro já entrou em "online" (ou foi ignorada): sai dos itens
    const itensSemCelcoin = financeiro.filter(d => grupoDe(d) !== 'receita_celcoin')
    const escopo = (loja) => ({
        lancs: loja === 'consolidado' ? lancamentos : lancamentos.filter(d => lojaDoLancamento(d, barbers) === loja),
        itens: comPeso(itensSemCelcoin, loja, rateio[loja]),
        assinaturaOnline: loja === 'consolidado' ? assinaturaTotal : assinaturaTotal * atend[loja],
        loja,
        rotuloRateio,
    })
    const lojas = ['loja01', 'loja02', 'consolidado']
    return {
        rateio,
        assinatura: { fonte: online.fonte, online: online.valor, pixManual, total: assinaturaTotal, ignorados: online.ignorados, atendimentos: atend },
        dre: Object.fromEntries(lojas.map(l => [l, dreDe(escopo(l))])),
        caixa: Object.fromEntries(lojas.map(l => [l, caixaDe(escopo(l))])),
    }
}

// Painel "Contas a pagar": pendentes com vencimento (qualquer mês), por grupo e com total
const somaDias = (iso, dias) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10) }
export function contasAPagar(financeiro, hoje) {
    const pend = financeiro.filter(d => d.status === 'pendente' && d.due_date && !ehReceitaManual(d))
        .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    const ate7 = somaDias(hoje, 7)
    const grupo = (itens) => ({ itens, total: r2(itens.reduce((s, d) => s + n(d.amount), 0)) })
    return {
        atrasadas: grupo(pend.filter(d => d.due_date < hoje)),
        hoje: grupo(pend.filter(d => d.due_date === hoje)),
        proximos7: grupo(pend.filter(d => d.due_date > hoje && d.due_date <= ate7)),
    }
}

// Conta variável: sugere o valor pago no mês anterior da mesma recorrência
export const mesAnterior = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7) }
export function valorSugerido(conta, financeiro) {
    if (!conta.recorrencia_id || conta.valor_tipo !== 'estimado') return n(conta.amount)
    const ant = financeiro.find(d => d.recorrencia_id === conta.recorrencia_id && d.competence_month === mesAnterior(conta.competence_month) && d.status === 'pago')
    return ant ? n(ant.amount) : n(conta.amount)
}
