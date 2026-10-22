import { useCallback, useEffect, useState } from 'react'
import { db, collection, query, where, getDocs } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { DADOS_DESDE } from '../utils/metricas'

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
            const trintaDias = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 30)
            const inicioJanela = inicioMes < trintaDias ? inicioMes : trintaDias
            const [comTel, janela, assin, cancel, receitas, agend] = await Promise.all([
                getDocs(query(collection(db, 'lancamentos'), where('cliente_telefone', '!=', null))),
                getDocs(query(collection(db, 'lancamentos'), where('data', '>=', Timestamp.fromDate(inicioJanela)))),
                getDocs(collection(db, 'assinantes')),
                getDocs(query(collection(db, 'pagamentos_assinatura'), where('tipo', '==', 'cancelada'))),
                getDocs(query(collection(db, 'pagamentos_assinatura'), where('receita', '==', true))),
                getDocs(query(collection(db, 'agendamentos'), where('data', '>=', DADOS_DESDE))),
            ])
            const lancJanela = janela.docs.map(d => ({ id: d.id, ...d.data() }))
            setDados({
                lancamentosComTelefone: comTel.docs.map(d => ({ id: d.id, ...d.data() })),
                lancamentosMes: lancJanela.filter(l => l.data?.toDate && l.data.toDate() >= inicioMes),
                lancamentos30d: lancJanela,
                assinantes: assin.docs.map(d => ({ telefone: d.id, ...d.data() })),
                cancelamentos: cancel.docs.map(d => ({ id: d.id, ...d.data() })),
                pagamentosReceita: receitas.docs.map(d => ({ id: d.id, ...d.data() })),
                agendamentos: agend.docs.map(d => ({ id: d.id, ...d.data() })),
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
