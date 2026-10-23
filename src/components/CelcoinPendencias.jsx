import { useEffect, useMemo, useState } from 'react'
import { db, collection, query, where, onSnapshot, doc } from '../firebase'
import { writeBatch } from 'firebase/firestore'
import { AlertTriangle, CheckCircle, Link2 } from 'lucide-react'
import { formatTelefone } from '../utils/phone'
import { carregarTelefones } from '../hooks/useClientes'

const fmt = (v) => (parseFloat(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (ts) => ts?.toDate ? ts.toDate().toLocaleDateString('pt-BR') : '—'

export function usePendenciasCelcoin(ativo = true) {
    const [pendentes, setPendentes] = useState([])
    const [baixasSoltas, setBaixasSoltas] = useState([])
    const [erro, setErro] = useState(null)

    useEffect(() => {
        if (!ativo) return
        const u1 = onSnapshot(
            query(collection(db, 'lancamentos'), where('tipo', '==', 'renovacao_celcoin'), where('status_celcoin', '==', 'pendente')),
            s => setPendentes(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.data?.seconds || 0) - (b.data?.seconds || 0))),
            e => { console.error('pendentes celcoin:', e); setErro(e) }
        )
        const u2 = onSnapshot(
            query(collection(db, 'pagamentos_assinatura'), where('situacao', '==', 'baixa_sem_lancamento')),
            s => setBaixasSoltas(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.data_pagamento?.seconds || 0) - (b.data_pagamento?.seconds || 0))),
            e => { console.error('baixas sem lancamento:', e); setErro(e) }
        )
        return () => { u1(); u2() }
    }, [ativo])

    return { pendentes, baixasSoltas, erro, total: pendentes.length + baixasSoltas.length }
}

export function CelcoinPendencias() {
    const { pendentes, baixasSoltas, erro } = usePendenciasCelcoin()
    // Lançamento guarda o código do cliente; o telefone vem de clientes_privado (só admin)
    const [telDe, setTelDe] = useState(() => new Map())
    useEffect(() => { carregarTelefones().then(m => setTelDe(m.telDe)).catch(e => console.error('clientes_privado:', e)) }, [])

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <h1 className="text-xl font-bold text-gray-100">Baixas pendentes na Celcoin</h1>
            {erro && <div className="text-red-400 text-sm">Erro ao carregar: {erro.message}</div>}

            {baixasSoltas.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-sm font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-2">
                        <AlertTriangle size={16} /> Alertas: baixa sem lançamento ({baixasSoltas.length})
                    </h2>
                    {baixasSoltas.map(b => <BaixaSolta key={b.id} baixa={b} pendentes={pendentes} />)}
                </section>
            )}

            <section className="space-y-3">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">A dar baixa na Celcoin ({pendentes.length})</h2>
                {pendentes.length === 0 ? (
                    <div className="text-gray-500 text-sm flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> Nada pendente.</div>
                ) : (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
                        {pendentes.map(l => (
                            <div key={l.id} className="p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                <div className="flex-1 min-w-[10rem]">
                                    <div className="text-gray-100 font-medium">{l.cliente_nome}</div>
                                    <div className="text-xs text-gray-500">{formatTelefone(telDe.get(l.cliente_id))} · {l.plano || '—'}</div>
                                </div>
                                <div className="text-gray-200 font-bold">{fmt(l.valor_bruto)}</div>
                                <div className="text-xs text-gray-400">{l.forma_pagamento}</div>
                                <div className="text-xs text-gray-400">{fmtData(l.data)}</div>
                                <div className="text-xs text-gray-400">{l.barbeiro_nome}</div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}

function BaixaSolta({ baixa, pendentes }) {
    const sugestoes = useMemo(() => {
        const mesmoCliente = (l) => !!l.cliente_id && l.cliente_id === baixa.cliente_id
        const mesmoTel = pendentes.filter(mesmoCliente)
        const mesmoValor = pendentes.filter(l => !mesmoCliente(l) && Math.abs((parseFloat(l.valor_bruto) || 0) - (baixa.valor || 0)) < 0.01)
        return [...mesmoTel, ...mesmoValor]
    }, [pendentes, baixa])
    const [escolhido, setEscolhido] = useState('')
    const [salvando, setSalvando] = useState(false)
    const alvo = escolhido || sugestoes[0]?.id || ''

    const vincular = async () => {
        const lanc = pendentes.find(l => l.id === alvo)
        if (!lanc) return
        if (!confirm(`Vincular a baixa de ${baixa.nome || formatTelefone(baixa.telefone)} (${fmt(baixa.valor)}) ao lançamento de ${lanc.cliente_nome} (${fmt(lanc.valor_bruto)})?`)) return
        setSalvando(true)
        try {
            const batch = writeBatch(db)
            batch.update(doc(db, 'lancamentos', lanc.id), {
                status_celcoin: 'baixado',
                transacao_id: baixa.transacao_id,
                pagamento_assinatura_id: baixa.id,
                codigo_cliente: baixa.codigo_cliente || null,
                email: baixa.email || null,
                documento: baixa.documento || null,
            })
            batch.update(doc(db, 'pagamentos_assinatura', baixa.id), { situacao: 'vinculado', lancamento_id: lanc.id })
            await batch.commit()
        } catch (e) {
            alert('Erro ao vincular: ' + e.message)
        } finally {
            setSalvando(false)
        }
    }

    return (
        <div className="bg-yellow-950/20 border border-yellow-800/50 rounded-xl p-3 space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                <div className="flex-1 min-w-[10rem]">
                    <div className="text-gray-100 font-medium">{baixa.nome || '—'}</div>
                    <div className="text-xs text-gray-500">{formatTelefone(baixa.telefone)} · {baixa.plano || '—'} · transação {baixa.transacao_id}</div>
                </div>
                <div className="text-gray-200 font-bold">{fmt(baixa.valor)}</div>
                <div className="text-xs text-gray-400">{fmtData(baixa.data_pagamento)}</div>
            </div>
            {sugestoes.length === 0 ? (
                <div className="text-xs text-gray-500">Nenhum lançamento pendente com o mesmo telefone ou valor. Quando o barbeiro lançar a renovação deste telefone, a ligação é feita sozinha.</div>
            ) : (
                <div className="flex flex-wrap gap-2 items-center">
                    <select value={alvo} onChange={e => setEscolhido(e.target.value)}
                        className="flex-1 min-w-[12rem] bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-200 text-xs">
                        {sugestoes.map(l => (
                            <option key={l.id} value={l.id}>
                                {l.cliente_id && l.cliente_id === baixa.cliente_id ? '★ ' : ''}{l.cliente_nome} · {fmt(l.valor_bruto)} · {fmtData(l.data)} · {l.barbeiro_nome}
                            </option>
                        ))}
                    </select>
                    <button type="button" onClick={vincular} disabled={salvando || !alvo}
                        className="flex items-center gap-1 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">
                        <Link2 size={14} /> {salvando ? 'Vinculando...' : 'Vincular'}
                    </button>
                </div>
            )}
        </div>
    )
}
