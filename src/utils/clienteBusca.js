// Bloco "Cliente" do Lançamento: uma base só com clientes, assinantes e clientes de vale (sem telefone).
import { statusConsulta } from './consultaClub.js'
import { semAcento } from './phone.js'

// clientes: clientes/{código}; assinantes: assinantes_publico (com cliente_id); vales: clientes_vale (com cliente_id)
export function montarBase({ clientes = [], assinantes = [], vales = [] }, hoje = new Date()) {
    const base = new Map()
    const poe = (cid, nome) => {
        if (!cid) return null
        const x = base.get(cid) || { cliente_id: cid, nome: null, assinante: null }
        if (!x.nome && nome) x.nome = nome
        base.set(cid, x)
        return x
    }
    for (const c of clientes) poe(c.id, c.nome)
    for (const v of vales) poe(v.cliente_id, v.nome)
    for (const a of assinantes) {
        const x = poe(a.cliente_id, a.nome)
        if (!x) continue
        const st = statusConsulta(a, hoje)
        x.nome = a.nome || x.nome // nome do cadastro de assinante vale mais
        x.assinante = { ...a, codigo: st.codigo, statusTexto: st.texto, ativo: st.ativo }
    }
    return [...base.values()].filter(x => x.nome)
}

const ehTelefone = (termo) => String(termo || '').replace(/\D/g, '').length >= 8

// Por nome (parte, sem acento) ou telefone completo (o servidor devolve o código: cidDoTelefone)
export function buscarNaBase(base, termo, cidDoTelefone = null, limite = 8) {
    const t = String(termo || '').trim()
    if (t.length < 2) return []
    if (ehTelefone(t)) return cidDoTelefone ? base.filter(x => x.cliente_id === cidDoTelefone) : []
    const q = semAcento(t)
    return base
        .filter(x => semAcento(x.nome).includes(q))
        .sort((a, b) => Number(semAcento(b.nome).startsWith(q)) - Number(semAcento(a.nome).startsWith(q)) || a.nome.localeCompare(b.nome, 'pt-BR'))
        .slice(0, limite)
}

// Reservas que ainda não viraram lançamento hoje: some quando um lançamento do dia usou a
// reserva ou o mesmo cliente (qualquer pagamento). Os do barbeiro primeiro, cada grupo por horário.
export function reservasPendentes(agendamentos, { unidade = null, atendidosAg = new Set(), atendidosCliente = new Set(), meuNome = '' } = {}) {
    const meu = semAcento(String(meuNome).split(' ')[0])
    const ehMeu = (a) => !!meu && semAcento(a.barbeiro) === meu
    const pend = agendamentos.filter(a =>
        (!unidade || a.unidade === unidade) &&
        !atendidosAg.has(a.id) &&
        !(a.cliente_id && atendidosCliente.has(a.cliente_id)))
    const porHora = (x, y) => String(x.hora || '').localeCompare(String(y.hora || ''))
    return [...pend.filter(ehMeu).sort(porHora), ...pend.filter(a => !ehMeu(a)).sort(porHora)].map(a => ({ ...a, meu: ehMeu(a) }))
}
