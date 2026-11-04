import { useState } from 'react'
import { db, doc, updateDoc, addDoc, deleteDoc, collection, serverTimestamp, chamarFuncao } from '../firebase'
import { arrayUnion, getDoc } from 'firebase/firestore'
import { AlertTriangle, CalendarClock, CheckCircle, Repeat, Pencil, SkipForward, Ban, PlusCircle } from 'lucide-react'
import { CATEGORIAS_DESPESA, categoriaDe, LOJAS, rotuloLoja, FORMAS_PAGAMENTO, contasAPagar, valorSugerido } from '../utils/financeiro'

// Financeiro: painel "Contas a pagar", confirmação "Paguei" e cadastro de contas recorrentes
const fmt = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')
const mesBR = (mes) => (mes ? `${mes.slice(5, 7)}/${mes.slice(0, 4)}` : '—')
const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const proximoMes = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7) }
// "1.300,50" ou "1300.5"
const valorNum = (v) => { const s = String(v).trim(); return parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) }
const INPUT = 'w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-base sm:text-sm outline-none focus:border-cyan-500'

const COR = {
    red: 'border-red-800/60 bg-red-950/20 text-red-300',
    yellow: 'border-yellow-800/60 bg-yellow-950/20 text-yellow-300',
    cyan: 'border-cyan-800/60 bg-cyan-950/20 text-cyan-300',
}

export function ContasAPagar({ financeiro, onPagar }) {
    const c = contasAPagar(financeiro, hojeISO())
    const grupos = [['atrasadas', 'Atrasadas', 'red', <AlertTriangle size={13} />], ['hoje', 'Vencem hoje', 'yellow', <CalendarClock size={13} />], ['proximos7', 'Próximos 7 dias', 'cyan', <CalendarClock size={13} />]]
    const nada = grupos.every(([id]) => !c[id].itens.length)
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-gray-200 flex items-center gap-2"><CalendarClock size={18} className="text-yellow-500" /> Contas a pagar</h3>
            {nada ? <p className="text-sm text-gray-500">Nada vencido nem vencendo nos próximos 7 dias.</p> : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {grupos.map(([id, rotulo, cor, icone]) => (
                        <div key={id} className={`border rounded-xl p-3 ${COR[cor]}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold flex items-center gap-1">{icone} {rotulo} ({c[id].itens.length})</span>
                                <span className="text-lg font-bold">{fmt(c[id].total)}</span>
                            </div>
                            <div className="mt-2 space-y-1.5">
                                {c[id].itens.map(d => (
                                    <div key={d.id} className="flex items-center gap-2 text-sm text-gray-200">
                                        <div className="flex-1 min-w-0">
                                            <div className="truncate">{d.description}</div>
                                            <div className="text-[11px] text-gray-500">{dataBR(d.due_date)} · {rotuloLoja(d.store_id)}{d.valor_tipo === 'estimado' ? ' · estimado' : ''}</div>
                                        </div>
                                        <span className="text-xs font-semibold whitespace-nowrap">{fmt(d.amount)}</span>
                                        <button type="button" onClick={() => onPagar(d)} className="shrink-0 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg">Paguei</button>
                                    </div>
                                ))}
                                {!c[id].itens.length && <div className="text-xs text-gray-500">Nenhuma.</div>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}

// Confirma o pagamento com valor real, data e forma (pré-preenchidos)
export function PagueiModal({ conta, financeiro, onFechar }) {
    const [valor, setValor] = useState(String(valorSugerido(conta, financeiro)).replace('.', ','))
    const [data, setData] = useState(hojeISO())
    const [forma, setForma] = useState(conta.forma_pagamento || 'Pix')
    const [salvando, setSalvando] = useState(false)
    const sugeridoAnterior = conta.valor_tipo === 'estimado' && valorSugerido(conta, financeiro) !== Number(conta.amount)
    const salvar = async () => {
        const v = valorNum(valor)
        if (!(v > 0)) return alert('Valor inválido.')
        setSalvando(true)
        try {
            await updateDoc(doc(db, 'financeiro', conta.id), {
                status: 'pago', amount: v, payment_date: data, forma_pagamento: forma,
                valor_previsto: conta.valor_previsto ?? Number(conta.amount),
            })
            onFechar()
        } catch (e) { alert('Erro: ' + e.message) } finally { setSalvando(false) }
    }
    return (
        <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 w-full max-w-sm space-y-3">
                <h3 className="text-lg font-bold text-white">Paguei: {conta.description}</h3>
                <p className="text-xs text-gray-400">
                    Vencimento {dataBR(conta.due_date)} · previsto {fmt(conta.valor_previsto ?? conta.amount)}
                    {sugeridoAnterior && ' · valor sugerido = pago no mês anterior'}
                </p>
                <label className="block text-xs text-gray-500">Valor pago<input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" className={INPUT} /></label>
                <label className="block text-xs text-gray-500">Data do pagamento<input type="date" value={data} onChange={e => setData(e.target.value)} className={INPUT} /></label>
                <label className="block text-xs text-gray-500">Forma de pagamento
                    <select value={forma} onChange={e => setForma(e.target.value)} className={INPUT}>
                        {[...new Set([forma, ...FORMAS_PAGAMENTO])].map(f => <option key={f}>{f}</option>)}
                    </select>
                </label>
                <div className="flex gap-2 pt-1">
                    <button type="button" onClick={onFechar} className="flex-1 py-2.5 rounded-lg bg-gray-800 text-gray-300">Cancelar</button>
                    <button type="button" onClick={salvar} disabled={salvando} className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50">
                        <CheckCircle size={16} className="inline -mt-0.5 mr-1" />{salvando ? 'Salvando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    )
}

const VAZIA = { nome: '', categoria: 'aluguel_imovel', valor_tipo: 'fixo', valor: '', dia_vencimento: '10', loja: 'loja01', forma_pagamento: 'Boleto', inicio: hojeISO().slice(0, 7), meses: '' }

export function ContasRecorrentes({ recorrencias, financeiro, mes }) {
    const [form, setForm] = useState(null) // null | { ...campos, id? }
    const [pulando, setPulando] = useState(null) // { rec, mes }
    const ativas = recorrencias.filter(r => r.ativa !== false)
    const encerradas = recorrencias.filter(r => r.ativa === false)

    const contaDe = (rec, m) => financeiro.find(d => d.id === `rec_${rec.id}_${m}`)
    // Pular: o mês atual se a conta dele ainda não foi paga; senão o próximo
    const mesParaPular = (rec) => (contaDe(rec, mes)?.status === 'pago' ? proximoMes(mes) : mes)
    const pular = async () => {
        const { rec, mes: m } = pulando
        try {
            await updateDoc(doc(db, 'contas_recorrentes', rec.id), { pulados: arrayUnion(m) })
            const ref = doc(db, 'financeiro', `rec_${rec.id}_${m}`)
            const snap = await getDoc(ref)
            if (snap.exists() && snap.data().status !== 'pago') await deleteDoc(ref)
            setPulando(null)
        } catch (e) { alert('Erro: ' + e.message) }
    }
    const encerrar = async (rec) => {
        if (!window.confirm(`Encerrar "${rec.nome}"? Não gera mais contas depois de ${mesBR(mes)}.`)) return
        try { await updateDoc(doc(db, 'contas_recorrentes', rec.id), { ativa: false, encerrada_em: mes }) }
        catch (e) { alert('Erro: ' + e.message) }
    }

    return (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2">
                <h3 className="font-bold text-gray-200 flex items-center gap-2"><Repeat size={18} className="text-cyan-500" /> Contas recorrentes</h3>
                <button type="button" onClick={() => setForm({ ...VAZIA })} className="flex items-center gap-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
                    <PlusCircle size={15} /> Nova
                </button>
            </div>
            {form && <FormRecorrencia inicial={form} onFechar={() => setForm(null)} />}
            <div className="divide-y divide-gray-800/60">
                {!ativas.length && !form && <p className="px-4 py-4 text-sm text-gray-500">Nenhuma conta recorrente. Cadastre aluguel, luz, internet... e a conta de cada mês aparece sozinha como "a pagar".</p>}
                {ativas.map(rec => {
                    const desteMes = contaDe(rec, mes)
                    return (
                        <div key={rec.id} className="px-4 py-3 space-y-1.5">
                            <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-gray-100">{rec.nome}</div>
                                    <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-2">
                                        <span>{categoriaDe(rec.categoria)?.label}</span>
                                        <span>{rec.valor_tipo === 'estimado' ? `~${fmt(rec.valor)} (variável)` : fmt(rec.valor)}</span>
                                        <span>dia {rec.dia_vencimento}</span>
                                        <span>{rotuloLoja(rec.loja)}</span>
                                        <span>{rec.forma_pagamento}</span>
                                        <span>{rec.meses ? `${mesBR(rec.inicio)} por ${rec.meses} meses` : `desde ${mesBR(rec.inicio)}, sem fim`}</span>
                                        {rec.pulados?.length > 0 && <span>pula {rec.pulados.map(mesBR).join(', ')}</span>}
                                    </div>
                                    <div className="text-[11px] mt-0.5">
                                        {desteMes ? <span className={desteMes.status === 'pago' ? 'text-emerald-400' : 'text-yellow-400'}>{mesBR(mes)}: {desteMes.status === 'pago' ? `pago ${fmt(desteMes.amount)}` : `a pagar ${fmt(desteMes.amount)} até ${dataBR(desteMes.due_date)}`}</span>
                                            : <span className="text-gray-600">{mesBR(mes)}: sem conta gerada</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs">
                                <button type="button" onClick={() => setForm({ ...VAZIA, ...rec, valor: String(rec.valor ?? '').replace('.', ','), dia_vencimento: String(rec.dia_vencimento), meses: rec.meses ? String(rec.meses) : '' })} className="flex items-center gap-1 text-cyan-400"><Pencil size={13} /> Editar</button>
                                <button type="button" onClick={() => setPulando({ rec, mes: mesParaPular(rec) })} className="flex items-center gap-1 text-yellow-400"><SkipForward size={13} /> Pular um mês</button>
                                <button type="button" onClick={() => encerrar(rec)} className="flex items-center gap-1 text-red-400"><Ban size={13} /> Encerrar</button>
                            </div>
                            {pulando?.rec.id === rec.id && (
                                <div className="flex flex-wrap items-center gap-2 bg-gray-950/60 border border-yellow-900/60 rounded-lg p-2 text-xs text-gray-300">
                                    <span>Pular o mês</span>
                                    <input type="month" value={pulando.mes} onChange={e => setPulando({ ...pulando, mes: e.target.value })} className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-white" />
                                    <button type="button" onClick={pular} className="bg-yellow-700 hover:bg-yellow-600 text-white font-bold px-3 py-1 rounded">Pular</button>
                                    <button type="button" onClick={() => setPulando(null)} className="text-gray-400">cancelar</button>
                                </div>
                            )}
                        </div>
                    )
                })}
                {encerradas.length > 0 && <div className="px-4 py-2 text-[11px] text-gray-600">Encerradas: {encerradas.map(r => `${r.nome} (até ${mesBR(r.encerrada_em)})`).join(', ')}</div>}
            </div>
        </section>
    )
}

function FormRecorrencia({ inicial, onFechar }) {
    const [f, setF] = useState(inicial)
    const [salvando, setSalvando] = useState(false)
    const muda = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
    const salvar = async () => {
        const valor = valorNum(f.valor)
        const dia = parseInt(f.dia_vencimento, 10)
        const meses = f.meses ? parseInt(f.meses, 10) : null
        if (!f.nome.trim() || !(valor > 0) || !(dia >= 1 && dia <= 31) || !/^\d{4}-\d{2}$/.test(f.inicio) || (f.meses && !(meses > 0))) {
            return alert('Preencha nome, valor, dia (1 a 31), início e o nº de meses (ou deixe em branco para sem fim).')
        }
        const dados = {
            nome: f.nome.trim(), categoria: f.categoria, finance_category: categoriaDe(f.categoria).grupo,
            valor_tipo: f.valor_tipo, valor, dia_vencimento: dia, loja: f.loja, forma_pagamento: f.forma_pagamento,
            inicio: f.inicio, meses, atualizado_em: serverTimestamp(),
        }
        setSalvando(true)
        try {
            // Editar vale para as próximas contas geradas; a que já está "a pagar" não muda
            if (f.id) await updateDoc(doc(db, 'contas_recorrentes', f.id), dados)
            else await addDoc(collection(db, 'contas_recorrentes'), { ...dados, ativa: true, pulados: [], criado_em: serverTimestamp() })
            await chamarFuncao('gerarContasRecorrentesAgora', {})
            onFechar()
        } catch (e) { alert('Erro: ' + e.message) } finally { setSalvando(false) }
    }
    return (
        <div className="p-4 bg-gray-950/40 border-b border-gray-800 space-y-3">
            <div className="text-sm font-semibold text-cyan-300">{f.id ? `Editar ${inicial.nome}` : 'Nova conta recorrente'}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-500">
                <label className="sm:col-span-2">Nome<input value={f.nome} onChange={muda('nome')} placeholder="Ex.: Aluguel Loja 02" className={INPUT} /></label>
                <label>Categoria
                    <select value={f.categoria} onChange={muda('categoria')} className={INPUT}>
                        {CATEGORIAS_DESPESA.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                </label>
                <label>Loja
                    <select value={f.loja} onChange={muda('loja')} className={INPUT}>{LOJAS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
                </label>
                <label>Valor
                    <div className="flex gap-2">
                        <select value={f.valor_tipo} onChange={muda('valor_tipo')} className="shrink-0 bg-gray-950 border border-gray-800 rounded-lg px-2 py-2 text-white text-base sm:text-sm outline-none focus:border-cyan-500">
                            <option value="fixo">Fixo</option><option value="estimado">Estimado</option>
                        </select>
                        <input value={f.valor} onChange={muda('valor')} inputMode="decimal" placeholder="R$" className={INPUT} />
                    </div>
                </label>
                <label>Dia do vencimento<input value={f.dia_vencimento} onChange={muda('dia_vencimento')} inputMode="numeric" className={INPUT} /></label>
                <label>Forma de pagamento
                    <select value={f.forma_pagamento} onChange={muda('forma_pagamento')} className={INPUT}>{FORMAS_PAGAMENTO.map(x => <option key={x}>{x}</option>)}</select>
                </label>
                <label>Começa em<input type="month" value={f.inicio} onChange={muda('inicio')} className={INPUT} /></label>
                <label>Nº de meses<input value={f.meses} onChange={muda('meses')} inputMode="numeric" placeholder="em branco = sem fim" className={INPUT} /></label>
            </div>
            {f.valor_tipo === 'estimado' && <p className="text-[11px] text-gray-500">Conta variável (luz, água): a conta do mês sai com o valor pago no mês anterior; o "Paguei" confirma o valor real.</p>}
            <div className="flex gap-2">
                <button type="button" onClick={onFechar} className="px-4 py-2.5 rounded-lg bg-gray-800 text-gray-300 text-sm">Cancelar</button>
                <button type="button" onClick={salvar} disabled={salvando} className="flex-1 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm disabled:opacity-50">{salvando ? 'Salvando...' : 'Salvar'}</button>
            </div>
        </div>
    )
}
