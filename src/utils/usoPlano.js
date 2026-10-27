// Aviso de uso do plano no Lançamento. Usa a mesma regra da aba Assinaturas
// (tipoLigacao, agruparVisitas, alertasDoCiclo), com o código do cliente no lugar do telefone.
import { planoDe, cicloDe, diaDoInicio, tipoLigacao, agruparVisitas, alertasDoCiclo, ehAtendAssinante } from './assinaturas.js'

const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)
const diaSP = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const diaSemana = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })

// Serviços de plano que aparecem para cada plano (tirado do que os barbeiros já lançam)
const SERVICOS_PLANO = {
    cabelo_barba: ['C+B plano', 'M plano', 'M+T plano', 'B plano'],
    corte: ['M+T plano', 'M plano'],
    cria: ['M plano', 'B plano'],
    r80: ['M plano', 'B plano'],
    cria_x2: ['M plano'],
    barba: ['B plano'],
}
export function servicosDoPlano(assinante) {
    return SERVICOS_PLANO[planoDe(assinante).id] || ['C+B plano', 'M plano', 'M+T plano', 'B plano']
}

// O lançamento guarda códigos; a regra compara "telefone": usa o código nos dois lados
const comoTelefone = (l) => ({ ...l, assinante_telefone: l.assinante_id || null, cliente_telefone: l.cliente_id || null })

// assinante: documento de assinantes_publico (com cliente_id). lancamentos: os do cliente (qualquer forma).
// servico: descrição de hoje; sem ela (na escolha do cliente) só avisa se nenhum serviço evitaria o alerta.
// Retorna { tipo: 'mesma_semana' | 'mais_de_5', texto } ou null.
export function avisoUsoPlano({ assinante, lancamentos, hoje = new Date(), servico = null, barbeiro = null }) {
    const a = { ...assinante, telefone: assinante.cliente_id, forma_cobranca: assinante.forma }
    const plano = planoDe(a)
    const hojeStr = diaSP(hoje)
    const { inicio, fim } = cicloDe(diaDoInicio(a), hojeStr.slice(0, 7), hoje)
    const dentro = (d) => d && d >= inicio && d <= fim
    const anteriores = lancamentos.map(comoTelefone)
        .filter(l => ehAtendAssinante(l) && dentro(toDate(l.data)) && tipoLigacao(a, l))
        .map(l => ({ l }))

    const checar = (desc) => {
        const visitasDet = [...anteriores, { l: { data: hoje, servico_descricao: desc, barbeiro_nome: barbeiro, forma_pagamento: 'Assinante', tipo: 'servico' } }]
        const grupos = agruparVisitas(visitasDet, plano)
        const alertas = alertasDoCiclo(a, grupos, visitasDet, hoje)
        const semana = alertas.find(x => x.tipo === 'mesma_semana' && x.visitas.some(v => v.dia === hojeStr))
        if (semana) {
            const v = semana.visitas.find(x => x.dia !== hojeStr) || semana.visitas[0]
            const com = v.barbeiro ? `, com ${v.barbeiro.split(' ')[0]}` : ''
            return { tipo: 'mesma_semana', texto: `${a.nome} já usou o plano nesta semana (${diaSemana(v.dia)}, ${dm(v.dia)}${com}). Esta visita deve ser cobrada à parte.` }
        }
        if (alertas.some(x => x.tipo === 'mais_de_5')) {
            return { tipo: 'mais_de_5', texto: `${a.nome} já fez ${grupos.length - 1} visitas neste ciclo (${dm(diaSP(inicio))} a ${dm(diaSP(fim))}); o plano dá direito a 5. Esta visita deve ser cobrada à parte.` }
        }
        return null
    }

    if (servico) return checar(servico)
    // Cabelo e Barba: barba num dia e cabelo noutro na mesma semana é 1 visita; só avisa se nenhum serviço escapa
    const opcoes = plano.id === 'cabelo_barba' ? ['Corte maq plano', 'Barba plano', 'Corte+barba plano'] : ['Corte+barba plano']
    const resultados = opcoes.map(checar)
    return resultados.every(Boolean) ? resultados[0] : null
}
