import { useState, useEffect } from 'react'
import { db, collection, onSnapshot } from '../firebase'

const diaDe = (isoDia) => {
    const d = parseInt(String(isoDia || '').slice(8, 10), 10)
    return Number.isFinite(d) ? d : null
}

// Assinantes (Celcoin e balcão) a partir de assinantes/{telefone}.
// Mantém o formato antigo usado por Lançamento, Consulta Club e Assinaturas.
export function useSubscribers() {
    const [subscribers, setSubscribers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        return onSnapshot(collection(db, 'assinantes'), snap => {
            const lista = snap.docs.map(d => {
                const a = d.data()
                return {
                    name: a.nome || '',
                    code: a.codigo_cliente || null,
                    plano: a.plano || '',
                    phone: a.telefone || d.id,
                    status: a.status_assinatura === 'ativa' ? 'ativo' : 'inativo',
                    statusAssinatura: a.status_assinatura || null,
                    rawStatus: a.status_original || a.status_assinatura || '',
                    origem: a.origem || null,
                    billingDay: diaDe(a.inicio_contrato) || diaDe(a.vencimento),
                    planValue: a.valor ?? null,
                    contractDate: a.inicio_contrato || '',
                    vencimento: a.vencimento || null,
                }
            }).filter(s => s.name)
            setSubscribers(lista.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')))
            setError(null)
            setLoading(false)
        }, err => {
            console.error('assinantes:', err)
            setError(err.message)
            setLoading(false)
        })
    }, [])

    return { subscribers, loading, error }
}
