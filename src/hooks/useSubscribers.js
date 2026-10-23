import { useState, useEffect } from 'react'
import { db, collection, onSnapshot } from '../firebase'
import { statusConsulta } from '../utils/consultaClub'

// Assinantes para Lançamento e Consulta Club, a partir da visão reduzida
// assinantes_publico/{telefone} (sem valores). Dependente segue o status do pagador.
export function useSubscribers() {
    const [subscribers, setSubscribers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        return onSnapshot(collection(db, 'assinantes_publico'), snap => {
            const lista = snap.docs.map(d => {
                const p = { telefone: d.id, ...d.data() }
                const st = statusConsulta(p)
                return {
                    ...p,
                    name: p.nome || '',
                    code: p.codigo_cliente || null,
                    plano: p.plano || '',
                    phone: p.telefone,
                    status: st.ativo ? 'ativo' : 'inativo',
                    statusTexto: st.texto,
                    rawStatus: st.texto,
                    proximoVencimento: st.proximoVencimento,
                    dependenteDe: p.dependente_de?.nome || null,
                }
            }).filter(s => s.name)
            setSubscribers(lista.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')))
            setError(null)
            setLoading(false)
        }, err => {
            console.error('assinantes_publico:', err)
            setError(err.message)
            setLoading(false)
        })
    }, [])

    return { subscribers, loading, error }
}
