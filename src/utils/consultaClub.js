// Consulta Club: status e busca a partir de assinantes_publico (visão sem valores)
import { statusEfetivo } from './assinaturas.js'
import { semAcento } from './phone.js'

const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : null)
const diaSP = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

// Próxima cobrança: balcão usa o vencimento gravado; Celcoin e Pix manual, o dia do ciclo
function proximoVencimento(base, hoje) {
    if (base.forma === 'balcao') return base.vencimento || null
    const ref = base.ciclo_desde || base.inicio_contrato
    const dia = parseInt(String(ref || '').slice(8, 10), 10)
    if (!Number.isFinite(dia)) return base.vencimento || null
    const h = diaSP(hoje)
    const [y, m] = h.split('-').map(Number)
    for (const k of [0, 1]) {
        const ultimo = new Date(y, m - 1 + k + 1, 0).getDate()
        const d = new Date(y, m - 1 + k, Math.min(dia, ultimo))
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        if (iso >= h) return iso
    }
    return null
}

// Dependente segue o status do pagador
export function statusConsulta(p, hoje = new Date()) {
    const base = p.dependente_de ? p.dependente_de : p
    const st = statusEfetivo({ ...base, forma_cobranca: base.forma }, hoje)
    const venc = proximoVencimento(base, hoje)
    const mapa = {
        ativa: { codigo: 'ativo', texto: 'Ativo' },
        vencido: { codigo: 'vencido', texto: `Vencido em ${dataBR(base.vencimento)}` },
        pagamento_recusado: { codigo: 'recusado', texto: 'Cartão recusado' },
        cancelada: { codigo: 'cancelado', texto: 'Cancelado' },
        aguardando_pagamento: { codigo: 'aguardando', texto: 'Aguardando pagamento' },
    }
    const r = mapa[st] || { codigo: 'inativo', texto: 'Inativo' }
    return { ...r, ativo: r.codigo === 'ativo', proximoVencimento: r.codigo === 'ativo' ? venc : null }
}

// Busca por telefone (com ou sem 55/DDD, parte do número) ou por parte do nome, sem acento/maiúscula
export function buscarAssinantes(lista, termo) {
    const t = String(termo || '').trim()
    if (t.length < 2) return []
    const digitos = t.replace(/\D/g, '')
    const nome = semAcento(t)
    return lista.filter(p => {
        if (digitos.length >= 4) {
            const tel = String(p.telefone || '')
            const local = tel.startsWith('55') ? tel.slice(2) : tel
            const d = digitos.length >= 12 && digitos.startsWith('55') ? digitos.slice(2) : digitos
            return local.includes(d) || local.slice(2).includes(d)
        }
        return semAcento(p.nome).includes(nome)
    })
}
