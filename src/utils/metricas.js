// Cálculos da aba Métricas. Funções puras: recebem os documentos já lidos do Firestore.

export const DADOS_DESDE = '2026-10-21'
export const DIAS_ATIVO = 60
export const TOLERANCIA_DIAS = 7
export const FREQ_PADRAO_DIAS = 30

const DIA_MS = 24 * 60 * 60 * 1000

export const diaSP = (date) => date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const diaParaMs = (dia) => Date.parse(dia + 'T12:00:00-03:00')
export const diasEntre = (a, b) => Math.round((diaParaMs(b) - diaParaMs(a)) / DIA_MS)
export const somaDias = (dia, n) => diaSP(new Date(diaParaMs(dia) + n * DIA_MS))

const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)

export function mediana(nums) {
    if (!nums.length) return null
    const s = [...nums].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const NAO_VISITA = ['venda_assinatura', 'renovacao_celcoin', 'venda_vale', 'produto', 'adiantamento', 'fechamento_comissao']

export function ehVisita(l) {
    return !!l.cliente_telefone && (l.tipo === 'servico' || !l.tipo) && !NAO_VISITA.includes(l.tipo)
}

// Mesma regra do relatório: atendimento pago na hora (sem assinante/vale, sem pacote, sem produto)
export function ehTicket(l) {
    const tipoOk = l.tipo === 'servico' || !l.tipo
    return tipoOk && !['Assinante', 'Vale Presente'].includes(l.forma_pagamento)
}

// Agrupa visitas por cliente. Vários lançamentos do mesmo cliente no mesmo dia = 1 visita.
export function montarClientes(lancamentos) {
    const porTel = new Map()
    for (const l of lancamentos) {
        if (!ehVisita(l)) continue
        const d = toDate(l.data)
        if (!d) continue
        const dia = diaSP(d)
        const c = porTel.get(l.cliente_telefone) || { telefone: l.cliente_telefone, dias: new Map(), visitasBarbeiro: new Set(), servicos: {} }
        const atual = c.dias.get(dia)
        if (!atual || d > atual.data) c.dias.set(dia, { data: d, nome: l.cliente_nome, barbeiro: l.barbeiro_nome })
        if (l.barbeiro_nome) c.visitasBarbeiro.add(dia + '|' + l.barbeiro_nome)
        for (const s of String(l.servico_descricao || '').split(' + ').map(x => x.trim()).filter(Boolean)) c.servicos[s] = (c.servicos[s] || 0) + 1
        porTel.set(l.cliente_telefone, c)
    }
    const clientes = []
    for (const c of porTel.values()) {
        const dias = [...c.dias.keys()].sort()
        const ultimo = c.dias.get(dias[dias.length - 1])
        const intervalos = dias.slice(1).map((d, i) => diasEntre(dias[i], d))
        const porBarbeiro = {}
        for (const k of c.visitasBarbeiro) { const b = k.split('|')[1]; porBarbeiro[b] = (porBarbeiro[b] || 0) + 1 }
        clientes.push({
            visitasPorBarbeiro: porBarbeiro,
            barbeiroPreferido: Object.entries(porBarbeiro).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
            servicosMaisFeitos: Object.entries(c.servicos).sort((a, b) => b[1] - a[1]).slice(0, 5),
            telefone: c.telefone,
            nome: ultimo.nome && ultimo.nome !== 'Não Informado' ? ultimo.nome : null,
            barbeiro: ultimo.barbeiro || null,
            visitas: dias.length,
            primeiraVisita: dias[0],
            ultimaVisita: dias[dias.length - 1],
            frequencia: intervalos.length ? mediana(intervalos) : null,
        })
    }
    return clientes
}

export function painel({ clientes, lancamentosMes, assinantes, cancelamentos, hoje, mes }) {
    const ativos = clientes.filter(c => diasEntre(c.ultimaVisita, hoje) <= DIAS_ATIVO).length
    const novos = clientes.filter(c => c.primeiraVisita.startsWith(mes))
    const freqs = clientes.filter(c => c.visitas >= 2).map(c => c.frequencia)
    const pagos = lancamentosMes.filter(ehTicket)
    const totalPago = pagos.reduce((s, l) => s + (parseFloat(l.valor_bruto) || 0), 0)
    const canceladosMes = new Set(cancelamentos.filter(e => String(e.data || '').startsWith(mes)).map(e => e.telefone))
    return {
        ativos,
        novosMes: novos.length,
        novosQueVoltaram: novos.filter(c => c.visitas >= 2).length,
        frequenciaCasa: freqs.length ? mediana(freqs) : null,
        clientesComRetorno: freqs.length,
        ticketMedio: pagos.length ? totalPago / pagos.length : null,
        ticketBase: pagos.length,
        assinantesAtivos: assinantes.filter(a => a.status_assinatura === 'ativa').length,
        assinantesRecusados: assinantes.filter(a => a.status_assinatura === 'pagamento_recusado').length,
        canceladosMes: [...canceladosMes].filter(t => assinantes.some(a => a.telefone === t && a.status_assinatura === 'cancelada')).length,
    }
}

export function sumidos(clientes, assinantesPorTel, hoje) {
    const lista = []
    for (const c of clientes) {
        const estimado = c.visitas < 2
        const freq = estimado ? FREQ_PADRAO_DIAS : c.frequencia
        const prevista = somaDias(c.ultimaVisita, Math.round(freq))
        const atraso = diasEntre(somaDias(prevista, TOLERANCIA_DIAS), hoje)
        if (atraso <= 0) continue
        lista.push({ ...c, prevista, atraso, estimado, assinante: assinantesPorTel.get(c.telefone)?.status_assinatura === 'ativa' })
    }
    return lista.sort((a, b) => a.atraso - b.atraso)
}

// Dias de histórico necessários até a lista de sumidos poder ter alguém
export const DIAS_MIN_SUMIDOS = FREQ_PADRAO_DIAS + TOLERANCIA_DIAS + 1

export function canceladosRecentes(cancelamentos, assinantesPorTel, hoje) {
    const ultimoPorTel = new Map()
    for (const e of cancelamentos) {
        if (!e.data || diasEntre(e.data, hoje) > 30) continue
        const prev = ultimoPorTel.get(e.telefone)
        if (!prev || e.data > prev.data) ultimoPorTel.set(e.telefone, e)
    }
    return [...ultimoPorTel.values()]
        .filter(e => assinantesPorTel.get(e.telefone)?.status_assinatura === 'cancelada')
        .sort((a, b) => b.data.localeCompare(a.data))
}

export function whatsappLink(tel55) {
    const d = String(tel55 || '').replace(/\D/g, '')
    return d ? `https://wa.me/${d}` : null
}

const VENDA_ASSINATURA = ['venda_assinatura', 'renovacao_celcoin']
const PAGAMENTO_REAL = ['Dinheiro', 'Pix', 'Crédito', 'Débito']

// Total gasto por telefone: serviços pagos na hora + venda/renovação de assinatura no balcão
// + cartão aprovado da Celcoin (pagamentos_assinatura com receita)
export function totalGasto(lancamentosComTelefone, pagamentosReceita) {
    const total = new Map()
    const soma = (tel, v) => { if (tel && v) total.set(tel, (total.get(tel) || 0) + v) }
    for (const l of lancamentosComTelefone) {
        const v = parseFloat(l.valor_bruto) || 0
        if (ehTicket(l) && ehVisita(l)) soma(l.cliente_telefone, v)
        else if (VENDA_ASSINATURA.includes(l.tipo) && PAGAMENTO_REAL.includes(l.forma_pagamento)) soma(l.cliente_telefone, v)
    }
    for (const p of pagamentosReceita) soma(p.telefone, parseFloat(p.valor) || 0)
    return total
}

// "telefone|AAAA-MM-DD" de cada dia com lançamento de serviço do cliente
export function diasComVisita(lancamentos) {
    const s = new Set()
    for (const l of lancamentos) {
        const d = toDate(l.data)
        if (d && ehVisita(l)) s.add(l.cliente_telefone + '|' + diaSP(d))
    }
    return s
}

// Falta = reserva de dia já passado (a partir de DADOS_DESDE) sem lançamento ligado a ela
// e sem lançamento de serviço do mesmo telefone no mesmo dia
export function faltas(agendamentos, idsAtendidos, hoje, visitasDia = new Set()) {
    const porTel = new Map()
    for (const a of agendamentos) {
        if (!a.data || a.data < DADOS_DESDE || a.data >= hoje || idsAtendidos.has(a.id)) continue
        if (visitasDia.has(a.telefone + '|' + a.data)) continue
        const lista = porTel.get(a.telefone) || []
        lista.push(a)
        porTel.set(a.telefone, lista)
    }
    return porTel
}

// Por barbeiro na janela [desde, hoje]: clientes atendidos, quantos têm 2+ visitas com ele
// (em todo o histórico) e % de lançamentos de serviço sem telefone
export function porBarbeiro(lancamentosJanela, clientes, desde) {
    const res = {}
    const get = (nome) => (res[nome] ||= { barbeiro: nome, servicos: 0, semTelefone: 0, clientes: new Set() })
    for (const l of lancamentosJanela) {
        const d = toDate(l.data)
        if (!d || diaSP(d) < desde || !(l.tipo === 'servico' || !l.tipo) || !l.barbeiro_nome) continue
        const b = get(l.barbeiro_nome)
        b.servicos++
        if (!l.cliente_telefone) b.semTelefone++
        else b.clientes.add(l.cliente_telefone)
    }
    const porTel = new Map(clientes.map(c => [c.telefone, c]))
    return Object.values(res).map(b => ({
        barbeiro: b.barbeiro,
        clientesAtendidos: b.clientes.size,
        voltaramComEle: [...b.clientes].filter(t => (porTel.get(t)?.visitasPorBarbeiro?.[b.barbeiro] || 0) >= 2).length,
        pctSemTelefone: b.servicos ? (b.semTelefone / b.servicos) * 100 : null,
        semTelefone: b.semTelefone,
        servicos: b.servicos,
    })).sort((a, b) => b.clientesAtendidos - a.clientesAtendidos)
}

export function voltaPrevista(c) {
    if (!c) return null
    const estimado = c.visitas < 2
    return { dia: somaDias(c.ultimaVisita, Math.round(estimado ? FREQ_PADRAO_DIAS : c.frequencia)), estimado }
}
