import { useEffect, useState } from 'react'
import { db, collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from '../firebase'
import { getDoc } from 'firebase/firestore'

export function storeToUnidade(store) {
    return store === 'loja-01' ? '01' : store === 'loja-02' ? '02' : null
}

// Reservas de uma data (AAAA-MM-DD), em tempo real, ordenadas por hora.
// Filtro de unidade é feito no cliente para não exigir índice composto.
export function useAgendamentosDoDia(dataStr) {
    const [agendamentos, setAgendamentos] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!dataStr) return
        setLoading(true)
        const q = query(collection(db, 'agendamentos'), where('data', '==', dataStr))
        return onSnapshot(q, snap => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            items.sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')))
            setAgendamentos(items)
            setError(null)
            setLoading(false)
        }, err => {
            console.error('agendamentos:', err)
            setError(err)
            setLoading(false)
        })
    }, [dataStr])

    return { agendamentos, loading, error }
}

export async function buscarClientePorTelefone(tel55) {
    const snap = await getDoc(doc(db, 'clientes', tel55))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

// Cadastro balcão: só cria se não existir, para não sobrescrever dados do Make.
export async function cadastrarClienteBalcao({ nome, telefone, unidade, barbeiro }) {
    const existente = await buscarClientePorTelefone(telefone)
    if (existente) return existente
    const novo = {
        nome: nome.trim(),
        telefone,
        unidade: unidade || null,
        ultimo_barbeiro: barbeiro || null,
        ultimo_agendamento: null,
        origem: 'balcao',
        criado_em: serverTimestamp(),
        atualizado_em: serverTimestamp()
    }
    await setDoc(doc(db, 'clientes', telefone), novo)
    return { id: telefone, ...novo }
}
