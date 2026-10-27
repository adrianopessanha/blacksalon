// Contas de assinatura. Uma função só (resultadoMes) para a aba Assinaturas e o Relatório.
// Não muda regra de comissão: lê comissao_barbeiro dos lançamentos.
import { taxaOnline } from '../config/taxas.js'

// A partir deste mês a cobrança online é automática (pagamentos_assinatura)
export const CELCOIN_AUTO_DESDE = '2026-11'
// Primeiro dia com eventos da Celcoin gravados (antes disso não sabemos quem pagou online)
export const CELCOIN_EVENTOS_DESDE = '2026-10-22'

// Taxa de maquininha do Financeiro (renovação paga no balcão)
export const TAXA_MAQUININHA = { 'Crédito': 0.05, 'Débito': 0.02 }
export const FORMAS_REAIS = ['Dinheiro', 'Pix', 'Débito', 'Crédito']

// Comissão por visita de cada plano (mesmos valores que a aba já usava)
export const PLANOS = [
    { id: 'cabelo_barba', label: 'Cabelo e Barba', preco: 140, comissaoVisita: 17.5 },
    { id: 'corte', label: 'Corte Ilimitado', preco: 100, comissaoVisita: 12.5 },
    { id: 'cria', label: 'Corte de Cria', preco: 80, comissaoVisita: 10 },
    { id: 'barba', label: 'Barba Ilimitada', preco: 80, comissaoVisita: 10 },
    { id: 'r80', label: 'R$ 80 (Cria ou Barba)', preco: 80, comissaoVisita: 10 },
    { id: 'cria_x2', label: '2 × Corte de Cria', preco: 160, comissaoVisita: 10, pessoas: 2 },
]

// Como o assinante paga. pix_manual: Pix programado fora da Celcoin, sem taxa, recebido todo mês enquanto ativo
export const formaCobranca = (a) => a?.forma_cobranca || (a?.origem === 'balcao' ? 'balcao' : a?.origem || 'celcoin')
const ativoNoMes = (a, mes) => a.status_assinatura === 'ativa' && (!a.inicio_contrato || a.inicio_contrato.slice(0, 7) <= mes)

const n = (v) => parseFloat(v) || 0
const r2 = (v) => Math.round(v * 100) / 100
const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)
const diaSP = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function planoDe(a) {
    const p = semAcento(a?.plano)
    if (p) {
        if (/2\s*[x×]/.test(p)) return PLANOS.find(x => x.id === 'cria_x2')
        if (p.includes('r$ 80')) return PLANOS.find(x => x.id === 'r80')
        if (p.includes('cabelo') && p.includes('barba')) return PLANOS.find(x => x.id === 'cabelo_barba')
        if (p.includes('cria')) return PLANOS.find(x => x.id === 'cria')
        if (p.includes('barba')) return PLANOS.find(x => x.id === 'barba')
        if (p.includes('corte')) return PLANOS.find(x => x.id === 'corte')
    }
    const v = n(a?.valor)
    if (v === 140) return PLANOS.find(x => x.id === 'cabelo_barba')
    if (v === 100) return PLANOS.find(x => x.id === 'corte')
    if (v === 80) return PLANOS.find(x => x.id === 'r80')
    return { id: `outro_${v}`, label: v ? `Outro (R$ ${v})` : 'Sem plano', preco: v || null, comissaoVisita: null }
}

export const taxaBalcao = (forma, valor) => r2(n(valor) * (TAXA_MAQUININHA[forma] || 0))
export const ehAtendAssinante = (l) => l.forma_pagamento === 'Assinante' && (l.tipo === 'servico' || !l.tipo)
export const ehRenovacaoBalcao = (l) => ['venda_assinatura', 'renovacao_celcoin'].includes(l.tipo) && !l.webhook_origem && FORMAS_REAIS.includes(l.forma_pagamento)

const diasNoMes = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(y, m, 0).getDate() }

// Resultado de um mês do calendário.
// liquidoReal: lápis (extrato); liquidoFinanceiro: receita Celcoin digitada no Financeiro (meses antigos)
export function resultadoMes({ mes, pagamentos = [], lancamentos = [], assinantes = [], liquidoReal = null, liquidoFinanceiro = null, hoje = new Date() }) {
    const doMes = (d) => d && diaSP(d).startsWith(mes)
    const online = pagamentos.filter(p => p.receita && String(p.data || '').startsWith(mes))
    const cobradoOnline = r2(online.reduce((s, p) => s + n(p.valor), 0))
    const taxasOnline = r2(online.reduce((s, p) => s + taxaOnline(p.valor), 0))

    const digitado = liquidoReal != null && liquidoReal !== ''
    let fonteOnline, liquidoOnline = null
    if (digitado) { fonteOnline = 'extrato'; liquidoOnline = r2(n(liquidoReal)) }
    else if (mes < CELCOIN_AUTO_DESDE && liquidoFinanceiro != null) { fonteOnline = 'financeiro'; liquidoOnline = r2(n(liquidoFinanceiro)) }
    else if (mes >= CELCOIN_AUTO_DESDE) { fonteOnline = 'automatico'; liquidoOnline = r2(cobradoOnline - taxasOnline) }
    else fonteOnline = 'sem_dado'

    const balcaoItens = lancamentos.filter(l => ehRenovacaoBalcao(l) && doMes(toDate(l.data)))
    const balcaoBruto = r2(balcaoItens.reduce((s, l) => s + n(l.valor_bruto), 0))
    const balcaoTaxas = r2(balcaoItens.reduce((s, l) => s + taxaBalcao(l.forma_pagamento, l.valor_bruto), 0))
    const atend = lancamentos.filter(l => ehAtendAssinante(l) && doMes(toDate(l.data)))
    const comissoes = r2(atend.reduce((s, l) => s + n(l.comissao_barbeiro), 0))

    // Pix manual (fora da Celcoin): recebido no mês enquanto ativo, sem taxa
    const pixItens = assinantes.filter(a => formaCobranca(a) === 'pix_manual' && ativoNoMes(a, mes))
    const pixManual = r2(pixItens.reduce((s, a) => s + n(a.valor), 0))

    const semDado = fonteOnline === 'sem_dado'
    const receita = semDado ? null : r2(liquidoOnline + balcaoBruto - balcaoTaxas + pixManual)
    const taxas = r2((fonteOnline === 'automatico' ? taxasOnline : 0) + balcaoTaxas)
    const sobrou = semDado ? null : r2(receita - comissoes)
    const margem = semDado || !receita ? null : (sobrou / receita) * 100

    // Previsão no ritmo atual (só no mês corrente)
    const mesAtual = diaSP(hoje).slice(0, 7) === mes
    const dia = mesAtual ? Number(diaSP(hoje).slice(8, 10)) : diasNoMes(mes)
    const fator = diasNoMes(mes) / dia
    const previsao = mesAtual && !semDado ? { receita: r2(receita * fator), comissoes: r2(comissoes * fator), sobrou: r2((receita - comissoes) * fator) } : null

    // Série acumulada dia a dia (receita líquida diária só existe para cobrança automática e balcão)
    const porDia = Array.from({ length: diasNoMes(mes) }, () => ({ receita: 0, comissoes: 0 }))
    const idx = (d) => Number(diaSP(d).slice(8, 10)) - 1
    if (fonteOnline === 'automatico') for (const p of online) porDia[Number(String(p.data).slice(8, 10)) - 1].receita += n(p.valor) - taxaOnline(p.valor)
    for (const l of balcaoItens) porDia[idx(toDate(l.data))].receita += n(l.valor_bruto) - taxaBalcao(l.forma_pagamento, l.valor_bruto)
    for (const l of atend) porDia[idx(toDate(l.data))].comissoes += n(l.comissao_barbeiro)
    let ar = 0, ac = 0
    const serie = porDia.slice(0, dia).map((x, i) => ({ dia: i + 1, receita: r2(ar += x.receita), comissoes: r2(ac += x.comissoes) }))

    return {
        mes, fonteOnline, semDado,
        cobradoOnline, taxasOnline, liquidoOnline, cobrancas: online.length,
        balcaoBruto, balcaoTaxas, balcaoQtd: balcaoItens.length,
        pixManual, pixManualQtd: pixItens.length,
        atendimentos: atend.length, comissoes,
        receita, taxas, sobrou, margem, lucro: sobrou != null && sobrou >= 0,
        previsao, serie, serieParcial: fonteOnline === 'extrato' || fonteOnline === 'financeiro',
    }
}

// ---------- Ciclo de cobrança e situação de cada assinante ----------

export function cicloDe(diaCobranca, mes, hoje = new Date()) {
    const [y, m] = mes.split('-').map(Number)
    const dia = diaCobranca || 1
    const data = (yy, mm0, d) => new Date(yy, mm0, Math.min(d, new Date(yy, mm0 + 1, 0).getDate()))
    const mesAtual = hoje.getFullYear() === y && hoje.getMonth() + 1 === m
    const ref = mesAtual ? hoje.getDate() : new Date(y, m, 0).getDate()
    const inicio = dia > ref ? data(y, m - 2, dia) : data(y, m - 1, dia)
    const prox = dia > ref ? data(y, m - 1, dia) : data(y, m, dia)
    const fim = new Date(prox.getTime() - 1)
    return { inicio, fim }
}

export const diaDoInicio = (a) => { const d = parseInt(String(a.ciclo_desde || a.inicio_contrato || a.vencimento || '').slice(8, 10), 10); return Number.isFinite(d) ? d : 1 }

// Como um lançamento de assinante se liga a um assinante. Ordem: vínculo manual > telefone > código > nome.
// Ligação só por nome fica "a conferir".
export function tipoLigacao(a, l) {
    if (l.assinante_telefone) return l.assinante_telefone === a.telefone ? 'manual' : null
    if (l.cliente_telefone) return l.cliente_telefone === a.telefone ? 'telefone' : null
    // Código pode estar gravado como número (12) ou texto ("12"). Código diferente não bloqueia:
    // são 2 contas Celcoin e o código muda de uma para outra; aí cai para o nome ("a conferir").
    if (a.codigo_cliente && l.subscriber_code && String(l.subscriber_code).trim() === String(a.codigo_cliente).trim()) return 'codigo'
    const nome = semAcento(a.nome)
    return nome && semAcento(l.cliente_nome) === nome ? 'nome' : null
}

export function situacaoAssinantes({ assinantes, lancamentos, pagamentos, mes, hoje = new Date() }) {
    const base = assinantes.map(a => {
        const plano = planoDe(a)
        const { inicio, fim } = cicloDe(diaDoInicio(a), mes, hoje)
        // Ainda não era assinante nesse ciclo
        if (a.inicio_contrato && a.inicio_contrato > diaSP(fim)) return null
        const dentro = (d) => d && d >= inicio && d <= fim
        const visitasDet = lancamentos
            .filter(l => ehAtendAssinante(l) && dentro(toDate(l.data)))
            .map(l => ({ l, tipo: tipoLigacao(a, l) }))
            .filter(x => x.tipo)
        const comissao = r2(visitasDet.reduce((s, x) => s + n(x.l.comissao_barbeiro), 0))

        // Pagamento do ciclo
        const forma = formaCobranca(a)
        const pagOnline = pagamentos.find(p => p.telefone === a.telefone && (p.receita || p.tipo === 'baixa_manual') && dentro(new Date(String(p.data) + 'T12:00:00')))
        const pagBalcao = lancamentos.find(l => ehRenovacaoBalcao(l) && dentro(toDate(l.data)) && tipoLigacao(a, l))
        const pagamentoLigadoPor = pagBalcao ? tipoLigacao(a, pagBalcao) : null
        let pagou = null, liquido = null
        if (forma === 'pix_manual') { pagou = a.status_assinatura === 'ativa'; liquido = pagou ? r2(n(a.valor)) : null }
        else if (pagBalcao) { pagou = true; liquido = r2(n(pagBalcao.valor_bruto) - taxaBalcao(pagBalcao.forma_pagamento, pagBalcao.valor_bruto)) }
        else if (pagOnline?.receita) { pagou = true; liquido = r2(n(pagOnline.valor) - taxaOnline(pagOnline.valor)) }
        else if (pagOnline) { pagou = true; liquido = null } // baixa manual: o dinheiro está no lançamento de renovação
        // A cobrança online cai no início do ciclo: ciclo começado antes da integração = não sabemos
        else if (forma !== 'balcao' && diaSP(inicio) < CELCOIN_EVENTOS_DESDE) pagou = null
        // Balcão vencido sem nova venda: não é "não pagou" (o dono tira da planilha e o cliente volta quando quiser)
        else if (statusEfetivo(a, hoje) === 'vencido') pagou = null
        else pagou = false

        const visitasAgrupadas = agruparVisitas(visitasDet, plano)
        return {
            ...a, plano, forma, ciclo: { inicio, fim },
            visitasDet, visitasAgrupadas, visitas: visitasAgrupadas.length, comissao,
            aConferir: visitasDet.filter(x => x.tipo === 'nome').length,
            alertas: alertasDoCiclo(a, visitasAgrupadas, visitasDet, hoje),
            statusAtual: statusEfetivo(a, hoje),
            pagou, liquido, pagamentoLigadoPor,
        }
    }).filter(Boolean)

    // Pagador e dependentes (casal/família): as visitas dos dependentes contam contra o pagamento do pagador
    const porTel = new Map(base.map(s => [s.telefone, s]))
    for (const s of base) {
        const pag = s.pagador && porTel.get(s.pagador)
        if (!pag) continue
        s.dependenteDe = pag.nome
        pag.dependentes = [...(pag.dependentes || []), s.nome]
        pag.visitasDependentes = (pag.visitasDependentes || 0) + s.visitas
        pag.comissaoDependentes = r2((pag.comissaoDependentes || 0) + s.comissao)
    }
    return base.map(s => {
        if (s.dependenteDe) {
            const pag = porTel.get(s.pagador)
            const grupos = []
            if (s.status_assinatura === 'cancelada' && s.visitas > 0) grupos.push('cancelado_atendendo')
            if (s.alertas.length) grupos.push('alertas')
            if (s.statusAtual === 'vencido') grupos.push('vencido')
            return { ...s, pagou: pag.pagou, liquido: null, resultado: null, grupos }
        }
        const visitasTotais = s.visitas + (s.visitasDependentes || 0)
        const comissaoTotal = r2(s.comissao + (s.comissaoDependentes || 0))
        const resultado = s.pagou === true && s.liquido != null ? r2(s.liquido - comissaoTotal) : s.pagou === false ? r2(-comissaoTotal) : null
        const grupos = []
        if (s.pagou === true && visitasTotais === 0) grupos.push('pagou_nao_veio')
        if (s.status_assinatura === 'pagamento_recusado') grupos.push('recusado')
        if (s.status_assinatura === 'cancelada' && s.visitas > 0) grupos.push('cancelado_atendendo')
        if (s.alertas.length) grupos.push('alertas')
        if (s.statusAtual === 'vencido') grupos.push('vencido')
        return { ...s, visitasTotais, comissaoTotal, resultado, grupos }
    })
}

// Atendimentos de assinante do período que não se ligaram a nenhum assinante (para vincular à mão)
export function naoLigados(lancamentos, assinantes, inicio, fim) {
    return lancamentos.filter(l => {
        const d = toDate(l.data)
        return (ehAtendAssinante(l) || ehRenovacaoBalcao(l)) && d && d >= inicio && d <= fim && !assinantes.some(a => tipoLigacao(a, l))
    })
}
// Regra do plano: no mínimo 7 dias entre visitas e no máximo 5 visitas por ciclo (por pessoa)
export const REGRA_PLANO = { diasEntreVisitas: 7, maxVisitasCiclo: 5 }

// Uma "visita" = um dia de atendimento. Exceção do plano Cabelo e Barba: barba num dia e cabelo
// noutro, na mesma semana (domingo a sábado), contam como 1 visita (as comissões somam).
const tipoServico = (desc) => {
    const d = semAcento(desc)
    const barba = d.includes('barba'), cabelo = /corte|cabelo|maq|tes/.test(d)
    return barba && cabelo ? 'completo' : barba ? 'barba' : 'cabelo'
}
const semanaDe = (dia) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10) }

export function agruparVisitas(visitasDet, plano) {
    const porDia = new Map()
    for (const { l } of visitasDet) {
        const d = toDate(l.data)
        if (!d) continue
        const dia = diaSP(d)
        const x = porDia.get(dia) || { dia, barbeiros: new Set(), tipos: new Set(), comissao: 0 }
        if (l.barbeiro_nome) x.barbeiros.add(l.barbeiro_nome)
        x.tipos.add(tipoServico(l.servico_descricao))
        x.comissao += n(l.comissao_barbeiro)
        porDia.set(dia, x)
    }
    const dias = [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia))
    const podeDividir = plano?.id === 'cabelo_barba'
    const grupos = []
    for (const d of dias) {
        const tipoDia = d.tipos.has('completo') || d.tipos.size > 1 ? 'completo' : [...d.tipos][0]
        const g = grupos[grupos.length - 1]
        // Um dia só de barba + outro dia na mesma semana (cabelo ou completo) = 1 visita do plano
        const complementa = podeDividir && g && g.dias.length === 1 && semanaDe(g.dias[0].dia) === semanaDe(d.dia)
            && (g.tipo === 'barba') !== (tipoDia === 'barba')
        const item = { dia: d.dia, barbeiros: [...d.barbeiros], tipo: tipoDia }
        if (complementa) { g.dias.push(item); g.tipo = 'completo'; g.comissao = r2(g.comissao + d.comissao); g.dividida = true }
        else grupos.push({ dias: [item], tipo: tipoDia, comissao: r2(d.comissao), dividida: false })
    }
    return grupos
}

// Alertas: duas visitas com menos de 7 dias (fora a exceção acima) e atendimento com pagamento recusado
// Status efetivo: assinante de balcão ativo com vencimento já passado (sem nova venda) = vencido
export function statusEfetivo(a, hoje = new Date()) {
    const forma = formaCobranca(a)
    if (forma === 'balcao' && a.status_assinatura === 'ativa' && a.vencimento && a.vencimento < diaSP(hoje)) return 'vencido'
    return a.status_assinatura
}

// Alertas: 2 visitas na mesma semana do calendário (domingo a sábado; a visita dividida do
// Cabelo e Barba já conta como 1), mais de 5 visitas no ciclo, atendimento com pagamento
// recusado e atendimento com assinatura vencida
export function alertasDoCiclo(a, grupos, visitasDet, hoje = new Date()) {
    const alertas = []
    const fmtDia = (g) => g.dias.map(d => ({ dia: d.dia, barbeiro: d.barbeiros[0] || null }))
    const porSemana = new Map()
    for (const g of grupos) {
        const s = semanaDe(g.dias[0].dia)
        porSemana.set(s, [...(porSemana.get(s) || []), g])
    }
    for (const [semana, gs] of porSemana) {
        if (gs.length < 2) continue
        const fim = new Date(semana + 'T12:00:00Z'); fim.setUTCDate(fim.getUTCDate() + 6)
        const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
        alertas.push({ tipo: 'mesma_semana', texto: `${gs.length} visitas na mesma semana (${dm(semana)} a ${dm(fim.toISOString().slice(0, 10))})`, visitas: gs.flatMap(fmtDia) })
    }
    if (grupos.length > REGRA_PLANO.maxVisitasCiclo) {
        alertas.push({ tipo: 'mais_de_5', texto: `${grupos.length} visitas no ciclo (máximo ${REGRA_PLANO.maxVisitasCiclo})`, visitas: grupos.flatMap(fmtDia) })
    }
    const atendidoDesde = (desde, tipo, texto) => {
        const depois = visitasDet.filter(({ l }) => { const d = toDate(l.data); return d && (!desde || diaSP(d) >= desde) })
        if (depois.length) alertas.push({ tipo, texto, visitas: depois.map(({ l }) => ({ dia: diaSP(toDate(l.data)), barbeiro: l.barbeiro_nome || null })) })
    }
    // Barbeiro viu o aviso de uso do plano e lançou mesmo assim
    for (const { l } of visitasDet) {
        const d = toDate(l.data)
        if (l.excecao_plano && d) {
            const motivo = l.excecao_plano.tipo === 'mais_de_5' ? 'passou de 5 visitas no ciclo' : 'já tinha usado o plano na semana'
            alertas.push({ tipo: 'excecao_lancada', texto: `Lançado como exceção (${motivo}) por ${l.barbeiro_nome || '?'}`, visitas: [{ dia: diaSP(d), barbeiro: l.barbeiro_nome || null }] })
        }
    }
    if (a.status_assinatura === 'pagamento_recusado') atendidoDesde(a.data_recusa || null, 'recusado_atendido', 'Atendido com pagamento recusado')
    if (statusEfetivo(a, hoje) === 'vencido') {
        // Vence no dia do vencimento: atendimento a partir do dia seguinte é com assinatura vencida
        const d = new Date(a.vencimento + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)
        atendidoDesde(d.toISOString().slice(0, 10), 'vencido_atendido', 'Atendido com assinatura vencida')
    }
    return alertas
}
// Pior caso: líquido do plano (preço − taxa online) − visitas máximas × comissão por visita
export function piorCaso(plano) {
    if (!plano?.preco || !plano?.comissaoVisita) return null
    return r2(plano.preco - taxaOnline(plano.preco) - REGRA_PLANO.maxVisitasCiclo * (plano.pessoas || 1) * plano.comissaoVisita)
}

// Ponto de equilíbrio: quantas visitas o plano aguenta antes do prejuízo (cobrança online)
export function pontoEquilibrio(plano) {
    if (!plano?.preco || !plano?.comissaoVisita) return null
    return Math.floor((plano.preco - taxaOnline(plano.preco)) / plano.comissaoVisita)
}

export function porPlano(situacao) {
    const g = {}
    for (const s of situacao) {
        if (s.dependenteDe || (['cancelada', 'vencido'].includes(s.statusAtual) && s.visitas === 0)) continue
        const k = s.plano.label
        const x = (g[k] ||= { plano: s.plano, assinantes: 0, visitas: 0, receita: 0, comissoes: 0, comPagamento: 0, resultado: 0 })
        x.assinantes++
        x.visitas += s.visitasTotais ?? s.visitas
        x.comissoes += s.comissaoTotal ?? s.comissao
        if (s.liquido != null) { x.receita += s.liquido; x.comPagamento++ }
        // Resultado só de quem tem pagamento conhecido (pagou ou não pagou), para não inventar prejuízo
        if (s.resultado != null) x.resultado += s.resultado
    }
    return Object.values(g).map(x => ({
        ...x,
        visitasMedias: x.assinantes ? x.visitas / x.assinantes : 0,
        receita: r2(x.receita), comissoes: r2(x.comissoes),
        resultado: r2(x.resultado),
        equilibrio: pontoEquilibrio(x.plano),
        piorCaso: piorCaso(x.plano),
    })).sort((a, b) => b.assinantes - a.assinantes)
}

// Tendência: um ponto por mês; resumo = documento de resumos_assinatura (se existir)
// ativosHoje: só para o mês atual sem resumo gravado (contagem de agora, marcada "hoje")
export function pontoTendencia(res, resumo, novosParcial, ativosHoje = null) {
    // Mês sem nenhum lançamento de assinante: não é "R$ 0", é "sem dado"
    const semLancamentos = res.atendimentos === 0 && res.balcaoQtd === 0
    const ativos = resumo?.ativos ?? ativosHoje
    return {
        mes: res.mes,
        ativos,
        ativosHoje: resumo?.ativos == null && ativosHoje != null,
        novos: resumo?.novos ?? null,
        novosParcial: resumo ? null : novosParcial,
        cancelados: resumo?.cancelados ?? null,
        recusados: resumo?.recusados ?? null,
        receita: res.receita,
        comissoes: semLancamentos ? null : res.comissoes,
        sobrou: res.sobrou, margem: res.margem,
        atendimentos: semLancamentos ? null : res.atendimentos,
        visitasPorAssinante: ativos && !semLancamentos ? r2(res.atendimentos / ativos) : null,
    }
}

// Seta: compara com o mês anterior e com a média dos 3 anteriores (só quando há dado nos dois lados)
export function tendencia(serie, campo, i) {
    const atual = serie[i]?.[campo]
    if (atual == null) return { vsAnterior: null, vsMedia3: null }
    const ant = serie[i - 1]?.[campo]
    const tres = [1, 2, 3].map(k => serie[i - k]?.[campo]).filter(v => v != null)
    return {
        vsAnterior: ant == null ? null : Math.sign(r2(atual - ant)),
        vsMedia3: tres.length === 3 ? Math.sign(r2(atual - tres.reduce((s, v) => s + v, 0) / 3)) : null,
    }
}
