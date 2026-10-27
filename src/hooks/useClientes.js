import { useEffect, useState } from 'react'
import { db, auth, collection, query, where, onSnapshot, doc, getDocs, chamarFuncao } from '../firebase'
import { mapasTelefone } from '../utils/privado'
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

// O que já virou lançamento no dia (AAAA-MM-DD, horário local): reservas usadas e clientes lançados
export function useAgendamentosAtendidos(dataStr) {
    const [atendidos, setAtendidos] = useState(() => ({ ags: new Set(), clientes: new Set() }))

    useEffect(() => {
        if (!dataStr) return
        const [y, m, d] = dataStr.split('-').map(Number)
        const q = query(collection(db, 'lancamentos'), where('data', '>=', Timestamp.fromDate(new Date(y, m - 1, d))))
        return onSnapshot(q, snap => {
            const ags = new Set(), clientes = new Set()
            snap.forEach(doc => {
                const l = doc.data()
                if (l.agendamento_id) ags.add(l.agendamento_id)
                if (l.cliente_id) clientes.add(l.cliente_id)
            })
            setAtendidos({ ags, clientes })
        }, err => console.error('lancamentos do dia:', err))
    }, [dataStr])

    return atendidos
}

// Clientes e clientes de vale (sem telefone), em tempo real, para a busca do Lançamento
export function useClientesEVales() {
    const [clientes, setClientes] = useState([])
    const [vales, setVales] = useState([])
    useEffect(() => {
        const u1 = onSnapshot(collection(db, 'clientes'), s => setClientes(s.docs.filter(d => d.id.startsWith('c_')).map(d => ({ id: d.id, ...d.data() }))), e => console.error('clientes:', e))
        const u2 = onSnapshot(collection(db, 'clientes_vale'), s => setVales(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.error('clientes_vale:', e))
        return () => { u1(); u2() }
    }, [])
    return { clientes, vales }
}

// Lançamentos de um cliente para o aviso de uso do plano: pelo código, vínculo manual, código Celcoin e nome
export async function lancamentosDoCliente({ cliente_id, nome, codigo }) {
    const consultas = [where('cliente_id', '==', cliente_id), where('assinante_id', '==', cliente_id)]
    if (nome) consultas.push(where('cliente_nome', '==', nome))
    if (codigo) consultas.push(where('subscriber_code', '==', String(codigo)))
    const snaps = await Promise.all(consultas.map(c => getDocs(query(collection(db, 'lancamentos'), c))))
    const porId = new Map()
    for (const s of snaps) s.forEach(d => porId.set(d.id, { id: d.id, ...d.data() }))
    return [...porId.values()]
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

// Telefone digitado -> { cliente_id, nome } (null se não cadastrado).
// O servidor guarda o telefone; o app só recebe o código do cliente.
export async function buscarClientePorTelefone(tel55) {
    const r = await chamarFuncao('resolverCliente', { telefone: tel55 })
    return r.existe ? { cliente_id: r.cid, nome: r.nome } : null
}

// Só o código, mesmo sem cadastro em clientes (Consulta Club pelo telefone completo)
export async function codigoDoTelefone(tel55) {
    return (await chamarFuncao('resolverCliente', { telefone: tel55 })).cid
}

// Só admin: { telDe: código -> telefone, cidDe: telefone -> código }
export async function carregarTelefones() {
    const snap = await getDocs(collection(db, 'clientes_privado'))
    return mapasTelefone(snap.docs.map(d => ({ id: d.id, ...d.data() })))
}

// Cadastro balcão: só cria se não existir, para não sobrescrever dados do Booksy/Celcoin.
export async function cadastrarClienteBalcao({ nome, telefone, unidade, barbeiro }) {
    const r = await chamarFuncao('resolverCliente', { telefone, nome: nome.trim(), unidade, barbeiro, criar: true })
    return { cliente_id: r.cid, nome: r.nome }
}
