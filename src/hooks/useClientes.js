import { useEffect, useState } from 'react'
import { db, auth, collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from '../firebase'
import { getDoc, Timestamp } from 'firebase/firestore'

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

// IDs de agendamento que já viraram lançamento no dia (AAAA-MM-DD, horário local)
export function useAgendamentosAtendidos(dataStr) {
    const [ids, setIds] = useState(() => new Set())

    useEffect(() => {
        if (!dataStr) return
        const [y, m, d] = dataStr.split('-').map(Number)
        const q = query(collection(db, 'lancamentos'), where('data', '>=', Timestamp.fromDate(new Date(y, m - 1, d))))
        return onSnapshot(q, snap => {
            const s = new Set()
            snap.forEach(doc => { const id = doc.data().agendamento_id; if (id) s.add(id) })
            setIds(s)
        }, err => console.error('lancamentos do dia:', err))
    }, [dataStr])

    return ids
}

// Admin vem de usuarios/{uid}.admin; enquanto carrega, trata como não-admin
export function useIsAdmin() {
    const [isAdmin, setIsAdmin] = useState(false)

    useEffect(() => {
        const uid = auth.currentUser?.uid
        if (!uid) return
        getDoc(doc(db, 'usuarios', uid))
            .then(snap => setIsAdmin(snap.exists() && snap.data().admin === true))
            .catch(err => console.error('usuarios:', err))
    }, [])

    return isAdmin
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
