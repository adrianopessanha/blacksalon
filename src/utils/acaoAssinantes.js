// Bloco "Precisa de ação" da aba Assinaturas: separa quem precisa de contato a partir da situação
// do ciclo (situacaoAssinantes). Não muda nenhum cálculo.
import { MENSAGENS_WHATSAPP } from '../config/mensagensAssinatura.js'

const DIA_MS = 24 * 60 * 60 * 1000
export const diaSP = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
export const ddmm = (iso) => (iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}` : '')
const diasDesde = (iso, hoje) => (iso ? Math.max(0, Math.round((new Date(diaSP(hoje) + 'T12:00:00Z') - new Date(iso + 'T12:00:00Z')) / DIA_MS)) : null)

export const primeiroNome = (nome) => {
    const p = String(nome || '').trim().split(/\s+/)[0] || ''
    return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''
}

export const GRUPOS_ACAO = [
    { id: 'recusado', titulo: 'Cartão recusado' },
    { id: 'vencido', titulo: 'Vencido no balcão' },
    { id: 'conferir', titulo: 'Conferir pagamento' },
    { id: 'pagou_nao_veio', titulo: 'Pagou e não veio' },
    { id: 'fora_regra', titulo: 'Fora da regra' },
]

// desde: data (AAAA-MM-DD) a partir da qual um "contatado" ainda vale para aquele grupo
export function precisaDeAcao(situacao, hoje = new Date()) {
    const g = Object.fromEntries(GRUPOS_ACAO.map(x => [x.id, []]))
    for (const s of situacao) {
        const inicioCiclo = diaSP(s.ciclo.inicio)
        if (s.grupos.includes('recusado')) g.recusado.push({ s, desde: s.data_recusa || inicioCiclo, dias: diasDesde(s.data_recusa, hoje) })
        if (s.statusAtual === 'vencido') g.vencido.push({ s, desde: s.vencimento })
        // "Não pagou" sem recusa, cancelamento nem vencimento: quase sempre pagamento que não se ligou
        if (!s.dependenteDe && s.pagou === false && s.statusAtual !== 'vencido' &&
            !['pagamento_recusado', 'cancelada', 'inativa'].includes(s.status_assinatura)) g.conferir.push({ s, desde: inicioCiclo })
        if (s.grupos.includes('pagou_nao_veio')) g.pagou_nao_veio.push({ s, desde: inicioCiclo })
        if (s.alertas?.length) g.fora_regra.push({ s })
    }
    const recente = (a, b) => String(b.desde || '').localeCompare(String(a.desde || '')) || String(a.s.nome).localeCompare(String(b.s.nome), 'pt-BR')
    return GRUPOS_ACAO.map(x => ({ ...x, itens: g[x.id].sort(recente) })).filter(x => x.itens.length)
}

// Contato gravado em assinantes/{telefone}.contato.{grupo} (AAAA-MM-DD); só vale se for depois do motivo atual
export const contatoValido = (data, desde) => (data && (!desde || data >= desde) ? data : null)

const nomePlano = (s) => (s.plano?.id?.startsWith('outro') ? '' : s.plano?.label || '')

export function mensagemWhatsApp(grupo, s) {
    const link = s.link_pagamento || null
    const modelo = grupo === 'recusado' ? MENSAGENS_WHATSAPP[link ? 'recusado' : 'recusado_sem_link'] : MENSAGENS_WHATSAPP[grupo]
    if (!modelo) return null
    const plano = nomePlano(s)
    return modelo
        .replace(/\[nome\]/g, primeiroNome(s.nome))
        .replace(/ ?\[plano\]/g, plano ? ' ' + plano : '')
        .replace(/\[data\]/g, ddmm(s.vencimento))
        .replace(/\[link\]/g, link || '')
}

// telefone já vem como 55 + DDD + número
export const linkWhatsApp = (telefone, texto) => `https://wa.me/${String(telefone).replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`
