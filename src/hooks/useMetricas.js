import { useCallback, useEffect, useState } from 'react'
import { db, collection, query, where, getDocs } from '../firebase'
import { Timestamp } from 'firebase/firestore'

// Lê tudo uma vez (getDocs, sem tempo real) para economizar leituras.
export function useMetricas() {
    const [dados, setDados] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const carregar = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const agora = new Date()
            const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
            const [comTel, doMes, assin, cancel] = await Promise.all([
                getDocs(query(collection(db, 'lancamentos'), where('cliente_telefone', '!=', null))),
                getDocs(query(collection(db, 'lancamentos'), where('data', '>=', Timestamp.fromDate(inicioMes)))),
                getDocs(collection(db, 'assinantes')),
                getDocs(query(collection(db, 'pagamentos_assinatura'), where('tipo', '==', 'cancelada'))),
            ])
            setDados({
                lancamentosComTelefone: comTel.docs.map(d => ({ id: d.id, ...d.data() })),
                lancamentosMes: doMes.docs.map(d => ({ id: d.id, ...d.data() })),
                assinantes: assin.docs.map(d => ({ telefone: d.id, ...d.data() })),
                cancelamentos: cancel.docs.map(d => ({ id: d.id, ...d.data() })),
                carregadoEm: agora,
            })
        } catch (e) {
            console.error('metricas:', e)
            setError(e)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { carregar() }, [carregar])

    return { dados, loading, error, recarregar: carregar }
}
