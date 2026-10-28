import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db, collection, query, where, getDocs, doc, setDoc, updateDoc } from '../firebase'
import { getDoc } from 'firebase/firestore'
import { getApp } from 'firebase/app'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { RefreshCw, Pencil, Check, X, TrendingUp, Users, Tag, Search, ArrowUp, ArrowDown, Minus, AlertTriangle, MessageCircle, Link2, ChevronDown } from 'lucide-react'
import { TAXAS_ONLINE } from '../config/taxas'
import { formatTelefone, semAcento } from '../utils/phone'
import { lancamentoComTelefone } from '../utils/privado'
import { carregarTelefones } from '../hooks/useClientes'
import {
    resultadoMes, situacaoAssinantes, porPlano, pontoTendencia, tendencia, naoLigados,
    ehRenovacaoBalcao, tipoLigacao, CELCOIN_AUTO_DESDE, TAXA_MAQUININHA,
} from '../utils/assinaturas'
import { precisaDeAcao, mensagemWhatsApp, linkWhatsApp, contatoValido, ddmm, diaSP } from '../utils/acaoAssinantes'

const fmt = (v) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const pct = (v) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`)
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const nomeMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`
const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
const mesesAte = (fim, qtd) => Array.from({ length: qtd }, (_, i) => {
    const [y, m] = fim.split('-').map(Number)
    const d = new Date(y, m - 1 - (qtd - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})
const docs = (s) => s.docs.map(d => ({ id: d.id, ...d.data() }))

// Lê tudo uma vez (getDocs). Usado pela aba e, em parte, pelo Relatório.
export async function carregarDadosAssinaturas() {
    const [assin, atend, balcao, pags, conf, fin, resumos, { telDe, cidDe }] = await Promise.all([
        getDocs(collection(db, 'assinantes')),
        getDocs(query(collection(db, 'lancamentos'), where('forma_pagamento', '==', 'Assinante'))),
        getDocs(query(collection(db, 'lancamentos'), where('tipo', 'in', ['venda_assinatura', 'renovacao_celcoin']))),
        getDocs(collection(db, 'pagamentos_assinatura')),
        getDoc(doc(db, 'configuracoes', 'assinaturas_liquido_real')),
        getDocs(query(collection(db, 'financeiro'), where('finance_category', '==', 'receita_celcoin'))),
        getDocs(collection(db, 'resumos_assinatura')),
        carregarTelefones(),
    ])
    const financeiroPorMes = {}
    for (const f of docs(fin)) {
        if (f.status === 'provisionado') continue
        const m = f.competence_month || String(f.date || '').slice(0, 7)
        if (m) financeiroPorMes[m] = (financeiroPorMes[m] || 0) + (parseFloat(f.amount) || 0)
    }
    return {
        assinantes: assin.docs.map(d => ({ telefone: d.id, ...d.data() })),
        // Lançamentos guardam o código do cliente; o telefone vem de clientes_privado (só admin)
        lancamentos: [...docs(atend), ...docs(balcao)].map(l => lancamentoComTelefone(l, telDe)),
        cidDe,
        pagamentos: docs(pags),
        lapis: conf.exists() ? conf.data() : {},
        financeiroPorMes,
        resumos: Object.fromEntries(resumos.docs.map(d => [d.id, d.data()])),
    }
}

export function resultadoDoMes(dados, mes) {
    return resultadoMes({
        mes, pagamentos: dados.pagamentos, lancamentos: dados.lancamentos, assinantes: dados.assinantes,
        liquidoReal: dados.lapis[mes] ?? null, liquidoFinanceiro: dados.financeiroPorMes[mes] ?? null,
    })
}

const GRUPOS = [
    { id: 'todos', label: 'Todos' },
    { id: 'pagou_nao_veio', label: 'Pagou e não veio' },
    { id: 'recusado', label: 'Cartão recusado' },
    { id: 'cancelado_atendendo', label: 'Cancelado ainda atendendo' },
    { id: 'vencido', label: 'Vencido (balcão)' },
    { id: 'alertas', label: 'Com alerta' },
]

export function SubscriptionMonitor() {
    const [dados, setDados] = useState(null)
    const [erro, setErro] = useState(null)
    const [loading, setLoading] = useState(true)
    const [params] = useSearchParams()
    const [mes, setMes] = useState(/^\d{4}-\d{2}$/.test(params.get('mes') || '') ? params.get('mes') : mesAtual())
    const [grupo, setGrupo] = useState(GRUPOS.some(g => g.id === params.get('grupo')) ? params.get('grupo') : 'todos')
    const [busca, setBusca] = useState('')
    // Lista completa fica recolhida no fim (abre direto quando o link já pede um grupo)
    const [listaAberta, setListaAberta] = useState(!!params.get('grupo'))

    const carregar = () => {
        setLoading(true)
        carregarDadosAssinaturas().then(setDados).catch(e => { console.error(e); setErro(e) }).finally(() => setLoading(false))
    }
    useEffect(carregar, [])

    const calc = useMemo(() => {
        if (!dados) return null
        const res = resultadoDoMes(dados, mes)
        const meses = mesesAte(mesAtual(), 12)
        const novosParcial = (m) => dados.assinantes.filter(a => String(a.inicio_contrato || '').startsWith(m)).length
        const ativosHoje = dados.assinantes.filter(a => a.status_assinatura === 'ativa').length
        const serie = meses.map(m => pontoTendencia(resultadoDoMes(dados, m), dados.resumos[m], novosParcial(m), m === mesAtual() ? ativosHoje : null))
        const situacao = situacaoAssinantes({ assinantes: dados.assinantes, lancamentos: dados.lancamentos, pagamentos: dados.pagamentos, mes })
        return { res, serie, situacao, planos: porPlano(situacao), acao: precisaDeAcao(situacao) }
    }, [dados, mes])

    const salvarLapis = async (valor) => {
        await setDoc(doc(db, 'configuracoes', 'assinaturas_liquido_real'), { [mes]: valor }, { merge: true })
        setDados(d => ({ ...d, lapis: { ...d.lapis, [mes]: valor } }))
    }

    const lista = useMemo(() => {
        if (!calc) return []
        const termo = busca.trim().toLowerCase()
        return calc.situacao
            .filter(s => grupo === 'todos' || s.grupos.includes(grupo))
            .filter(s => !termo || String(s.nome || '').toLowerCase().includes(termo) || String(s.telefone).includes(termo.replace(/\D/g, '') || '§'))
            .sort((a, b) => (a.resultado ?? 0) - (b.resultado ?? 0))
    }, [calc, grupo, busca])

    return (
        <div className="space-y-5 max-w-5xl mx-auto pb-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-100">Assinaturas</h1>
                <div className="flex items-center gap-2">
                    <input type="month" value={mes} max={mesAtual()} onChange={e => e.target.value && setMes(e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-200 scheme-dark" />
                    <button onClick={carregar} disabled={loading} className="p-2 text-gray-400 hover:text-cyan-400" aria-label="Atualizar">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>
            {erro && <div className="text-red-400 text-sm">Erro: {erro.message}</div>}
            {!calc && !erro && <div className="text-gray-500 text-sm">Carregando...</div>}
            {calc && (
                <>
                    <PrecisaDeAcao grupos={calc.acao} dados={dados} onMudou={carregar} />
                    <ResultadoMes res={calc.res} mes={mes} lapis={dados.lapis[mes]} onSalvarLapis={salvarLapis} />
                    <Tendencia serie={calc.serie} />
                    <Recalcular mes={mes} onFeito={carregar} />
                    <PorPlano planos={calc.planos} />
                    <section className="bg-gray-900 border border-gray-800 rounded-2xl">
                        <button type="button" onClick={() => setListaAberta(v => !v)} aria-expanded={listaAberta}
                            className="w-full flex items-center justify-between gap-2 p-4 text-left">
                            <span className="font-semibold text-gray-200 flex items-center gap-2"><Users size={18} className="text-cyan-400" /> Todos os assinantes ({calc.situacao.length})</span>
                            <ChevronDown size={20} className={`text-gray-400 transition-transform ${listaAberta ? 'rotate-180' : ''}`} />
                        </button>
                        {listaAberta && <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                        <div className="relative mb-3">
                            <Search size={16} className="absolute left-3 top-3 text-gray-500" />
                            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome"
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 pl-9 pr-3 text-base text-gray-200 outline-none focus:border-cyan-600" />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {GRUPOS.filter(g => g.id !== 'alertas' || calc.situacao.some(s => s.grupos.includes('alertas'))).map(g => {
                                const qtd = g.id === 'todos' ? calc.situacao.length : calc.situacao.filter(s => s.grupos.includes(g.id)).length
                                return (
                                    <button key={g.id} type="button" onClick={() => setGrupo(g.id)}
                                        className={`text-xs px-3 py-1.5 rounded-full border ${grupo === g.id ? 'bg-cyan-900/40 border-cyan-600 text-cyan-200' : 'border-gray-700 text-gray-400'}`}>
                                        {g.label} ({qtd})
                                    </button>
                                )
                            })}
                        </div>
                        <div className="divide-y divide-gray-800 max-h-[36rem] overflow-y-auto">
                            {lista.map(s => <LinhaAssinante key={s.telefone} s={s} assinantes={dados.assinantes} lancamentos={dados.lancamentos} cidDe={dados.cidDe} onMudou={carregar} />)}
                            {lista.length === 0 && <div className="py-4 text-sm text-gray-500">Ninguém encontrado.</div>}
                        </div>
                        </div>}
                    </section>
                </>
            )}
        </div>
    )
}

export function ResultadoMes({ res, mes, lapis, onSalvarLapis, compacto = false }) {
    const [edit, setEdit] = useState(false)
    const [valor, setValor] = useState('')
    const fonte = { extrato: 'líquido do extrato (lápis)', financeiro: 'digitado no Financeiro', automatico: 'automático (cobranças aprovadas)', sem_dado: 'sem dado' }[res.fonteOnline]
    const salvar = async () => {
        const v = valor.trim() === '' ? null : parseFloat(valor.replace(/\./g, '').replace(',', '.'))
        try { await onSalvarLapis(Number.isFinite(v) ? v : null); setEdit(false) } catch (e) { alert('Erro ao salvar: ' + e.message) }
    }
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4">
            <h2 className="font-semibold text-gray-200 flex items-center gap-2"><TrendingUp size={18} className="text-emerald-400" /> Resultado de {nomeMes(mes)}{res.previsao ? ' (até hoje)' : ''}</h2>
            <div className={`rounded-2xl p-5 border ${res.semDado ? 'border-gray-700 bg-gray-950' : res.lucro ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-red-700/60 bg-red-950/30'}`}>
                <div className="text-xs text-gray-400">Sobrou</div>
                {res.semDado ? (
                    <div className="text-2xl font-bold text-gray-400">Sem dado de receita</div>
                ) : (
                    <div className={`text-4xl font-black ${res.lucro ? 'text-emerald-400' : 'text-red-400'}`}>{res.lucro ? '✅' : '❌'} {fmt(res.sobrou)}</div>
                )}
                <div className="text-sm text-gray-400 mt-1">
                    {res.semDado ? `Digite o líquido do extrato Celcoin de ${nomeMes(mes)} no lápis abaixo.` : `${res.lucro ? 'Lucro' : 'Prejuízo'} · margem ${pct(res.margem)}`}
                    {res.previsao && <span className="block text-xs">Previsão até o fim do mês (ritmo atual): <b className={res.previsao.sobrou >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmt(res.previsao.sobrou)}</b></span>}
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Cartao rotulo={res.fonteOnline === 'automatico' ? `Cobrado aprovado (${res.cobrancas})` : 'Online líquido'} valor={res.fonteOnline === 'automatico' ? res.cobradoOnline : res.liquidoOnline} sub={fonte} />
                <Cartao rotulo={`Renovação no balcão (${res.balcaoQtd})`} valor={res.balcaoBruto} sub={res.pixManualQtd ? `+ Pix manual ${fmt(res.pixManual)} (${res.pixManualQtd})` : null} />
                <Cartao rotulo="Taxas" valor={res.taxas == null ? null : -res.taxas} sub={res.fonteOnline === 'automatico' ? 'online + maquininha' : 'maquininha do balcão'} />
                <Cartao rotulo={`Comissões (${res.atendimentos} atend.)`} valor={-res.comissoes} />
            </div>
            {(
                <div className="flex items-center justify-between gap-2 text-sm bg-gray-950 border border-gray-800 rounded-xl px-3 py-2">
                    <span className="text-gray-400">Líquido real (extrato) de {nomeMes(mes)}</span>
                    {edit ? (
                        <span className="flex items-center gap-1">
                            <input autoFocus inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="vazio = remover"
                                className="w-32 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-right text-gray-100" />
                            <button type="button" onClick={salvar} className="text-emerald-400 p-1" aria-label="Salvar"><Check size={16} /></button>
                            <button type="button" onClick={() => setEdit(false)} className="text-gray-500 p-1" aria-label="Cancelar"><X size={16} /></button>
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <span className="text-gray-100">{lapis != null ? fmt(lapis) : '—'}</span>
                            <button type="button" onClick={() => { setValor(lapis ?? ''); setEdit(true) }} className="text-gray-400 hover:text-cyan-300" aria-label="Editar líquido real"><Pencil size={14} /></button>
                        </span>
                    )}
                </div>
            )}
            {!compacto && <GraficoMes serie={res.serie} parcial={res.serieParcial} />}
            <p className="text-[11px] text-gray-500">
                Receita = cobrança aprovada (a partir de {nomeMes(CELCOIN_AUTO_DESDE)}) ou líquido do extrato (meses anteriores) + renovação paga no balcão.
                Taxa online: {(TAXAS_ONLINE.percentual * 100).toFixed(2).replace('.', ',')}% + {fmt(TAXAS_ONLINE.fixo)} + {(TAXAS_ONLINE.antecipacao * 100).toFixed(0)}%.
                Maquininha: crédito {TAXA_MAQUININHA['Crédito'] * 100}%, débito {TAXA_MAQUININHA['Débito'] * 100}%. Recusada e cancelada não são receita.
            </p>
        </section>
    )
}

function Cartao({ rotulo, valor, sub }) {
    return (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
            <div className="text-[11px] text-gray-500">{rotulo}</div>
            <div className={`text-lg font-bold ${valor == null ? 'text-gray-500' : valor < 0 ? 'text-red-300' : 'text-gray-100'}`}>{valor == null ? 'sem dado' : valor < 0 ? `− ${fmt(-valor)}` : fmt(valor)}</div>
            {sub && <div className="text-[10px] text-gray-600">{sub}</div>}
        </div>
    )
}

function GraficoMes({ serie, parcial }) {
    if (!serie.length) return null
    const W = 600, H = 160, P = 24
    const max = Math.max(1, ...serie.flatMap(p => [p.receita, p.comissoes]))
    const x = (i) => P + (i / Math.max(1, serie.length - 1)) * (W - 2 * P)
    const y = (v) => H - P - (v / max) * (H - 2 * P)
    const linha = (campo) => serie.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[campo]).toFixed(1)}`).join(' ')
    return (
        <div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" role="img" aria-label="Receita e comissões acumuladas no mês">
                <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#374151" />
                <path d={linha('receita')} fill="none" stroke="#34d399" strokeWidth="2.5" />
                <path d={linha('comissoes')} fill="none" stroke="#f87171" strokeWidth="2.5" />
                <text x={P} y={14} fill="#9ca3af" fontSize="11">{fmt(max)}</text>
                <text x={W - P} y={H - 6} fill="#6b7280" fontSize="10" textAnchor="end">dia {serie.length}</text>
            </svg>
            <div className="flex gap-4 text-[11px] text-gray-400">
                <span><span className="inline-block w-3 h-0.5 bg-emerald-400 align-middle mr-1" />Receita acumulada</span>
                <span><span className="inline-block w-3 h-0.5 bg-red-400 align-middle mr-1" />Comissões acumuladas</span>
            </div>
            {parcial && <p className="text-[11px] text-yellow-500/80 mt-1">O extrato é mensal: a linha de receita mostra só a renovação no balcão dia a dia.</p>}
        </div>
    )
}

function Seta({ s }) {
    if (s == null) return <span className="text-gray-700">·</span>
    if (s > 0) return <ArrowUp size={12} className="inline text-emerald-400" />
    if (s < 0) return <ArrowDown size={12} className="inline text-red-400" />
    return <Minus size={12} className="inline text-gray-500" />
}

function Tendencia({ serie }) {
    const W = 600, H = 150, P = 24
    const vals = serie.map(p => p.sobrou).filter(v => v != null)
    const max = Math.max(1, ...vals.map(Math.abs), ...serie.map(p => p.comissoes || 0))
    const bw = (W - 2 * P) / serie.length
    const y0 = H / 2
    const col = (campo, fmtf, opts = {}) => serie.map((p, i) => {
        const t = tendencia(serie, campo, i)
        const v = p[campo]
        return (
            <td key={p.mes} className="px-2 py-1.5 text-right whitespace-nowrap">
                {v == null ? <span className="text-gray-600">{opts.parcial && p.novosParcial != null ? `${p.novosParcial}*` : 'sem dado'}</span> : fmtf(v, p)}
                {v != null && !opts.semSeta && <span className="ml-1" title="vs mês anterior / vs média 3 meses"><Seta s={t.vsAnterior} /><Seta s={t.vsMedia3} /></span>}
            </td>
        )
    })
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h2 className="font-semibold text-gray-200 mb-3 flex items-center gap-2"><TrendingUp size={18} className="text-purple-400" /> Tendência dos últimos 12 meses</h2>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36" role="img" aria-label="Sobrou por mês">
                <line x1={P} y1={y0} x2={W - P} y2={y0} stroke="#374151" />
                {serie.map((p, i) => {
                    const cx = P + i * bw + bw * 0.15, w = bw * 0.7
                    const h = p.sobrou == null ? 0 : (Math.abs(p.sobrou) / max) * (H / 2 - 14)
                    return (
                        <g key={p.mes}>
                            {p.sobrou == null
                                ? <rect x={cx} y={y0 - 2} width={w} height={4} fill="#374151" />
                                : <rect x={cx} y={p.sobrou >= 0 ? y0 - h : y0} width={w} height={h} fill={p.sobrou >= 0 ? '#34d399' : '#f87171'} rx="2" />}
                            <text x={cx + w / 2} y={H - 2} fill="#6b7280" fontSize="9" textAnchor="middle">{nomeMes(p.mes)}</text>
                        </g>
                    )
                })}
            </svg>
            <p className="text-[11px] text-gray-500 mb-2">Barra = sobrou no mês. Cinza = sem dado de receita.</p>
            <div className="overflow-x-auto">
                <table className="text-xs text-gray-300">
                    <thead className="text-gray-500"><tr><th className="text-left px-2 py-1.5 font-medium sticky left-0 bg-gray-900">Mês</th>{serie.map(p => <th key={p.mes} className="px-2 py-1.5 font-medium text-right">{nomeMes(p.mes)}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-800">
                        <tr><td className="px-2 py-1.5 sticky left-0 bg-gray-900">Ativos (fim do mês)</td>{col('ativos', (v, p) => p.ativosHoje ? <span>{v} <span className="text-[10px] text-cyan-400">hoje</span></span> : v)}</tr>
                        <tr><td className="px-2 py-1.5 sticky left-0 bg-gray-900">Novos</td>{col('novos', v => v, { parcial: true })}</tr>
                        <tr><td className="px-2 py-1.5 sticky left-0 bg-gray-900">Cancelados</td>{col('cancelados', v => v)}</tr>
                        <tr><td className="px-2 py-1.5 sticky left-0 bg-gray-900">Recusados</td>{col('recusados', v => v)}</tr>
                        <tr><td className="px-2 py-1.5 sticky left-0 bg-gray-900">Receita líquida</td>{col('receita', fmt)}</tr>
                        <tr><td className="px-2 py-1.5 sticky left-0 bg-gray-900">Comissões</td>{col('comissoes', fmt)}</tr>
                        <tr><td className="px-2 py-1.5 sticky left-0 bg-gray-900 font-bold">Sobrou</td>{col('sobrou', v => <b className={v >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(v)}</b>)}</tr>
                        <tr><td className="px-2 py-1.5 sticky left-0 bg-gray-900">Margem</td>{col('margem', pct)}</tr>
                        <tr><td className="px-2 py-1.5 sticky left-0 bg-gray-900">Visitas por assinante</td>{col('visitasPorAssinante', v => v.toFixed(1).replace('.', ','))}</tr>
                    </tbody>
                </table>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
                Setas: vs mês anterior e vs média dos 3 meses anteriores. * Novos parcial: só quem ainda está na base, pela data de início do contrato.
                Ativos, cancelados e recusados passam a ter dado com o resumo mensal (gravado todo dia 1º).
            </p>
        </section>
    )
}

// Refaz o resumo gravado de um mês (depois de corrigir lançamentos). Só admin (a função confere).
function Recalcular({ mes, onFeito }) {
    const [estado, setEstado] = useState('')
    const rodar = async () => {
        if (!confirm(`Recalcular o resumo de ${nomeMes(mes)} com os lançamentos de hoje?`)) return
        setEstado('Recalculando...')
        try {
            await httpsCallable(getFunctions(getApp(), 'southamerica-east1'), 'recalcularResumoAssinaturas')({ mes })
            setEstado('Resumo recalculado.')
            onFeito()
        } catch (e) { setEstado('Erro: ' + e.message) }
    }
    return (
        <div className="flex items-center gap-3 text-xs text-gray-500 -mt-2">
            <button type="button" onClick={rodar} className="underline hover:text-gray-300">Recalcular resumo gravado de {nomeMes(mes)}</button>
            {estado && <span>{estado}</span>}
        </div>
    )
}

function PorPlano({ planos }) {
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h2 className="font-semibold text-gray-200 mb-3 flex items-center gap-2"><Tag size={18} className="text-amber-400" /> Por plano (ciclo atual)</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-300">
                    <thead className="text-[11px] text-gray-500 uppercase">
                        <tr>
                            <th className="text-left py-2 font-medium">Plano</th>
                            <th className="text-right py-2 px-1 font-medium">Assin.</th>
                            <th className="text-right py-2 px-1 font-medium">Visitas méd.</th>
                            <th className="text-right py-2 px-1 font-medium">Receita</th>
                            <th className="text-right py-2 px-1 font-medium">Comissões</th>
                            <th className="text-right py-2 px-1 font-medium">Resultado</th>
                            <th className="text-right py-2 font-medium" title="líquido do plano − 5 visitas × comissão">Pior caso (5 visitas)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {planos.map(p => (
                            <tr key={p.plano.label}>
                                <td className="py-2">{p.plano.label}</td>
                                <td className="py-2 px-1 text-right">{p.assinantes}</td>
                                <td className="py-2 px-1 text-right">{p.visitasMedias.toFixed(1).replace('.', ',')}</td>
                                <td className="py-2 px-1 text-right">{p.comPagamento ? fmt(p.receita) : 'sem dado'}<span className="block text-[10px] text-gray-500">{p.comPagamento} pagos</span></td>
                                <td className="py-2 px-1 text-right">{fmt(p.comissoes)}</td>
                                <td className={`py-2 px-1 text-right font-bold ${p.comPagamento ? (p.resultado >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-500'}`}>{p.comPagamento ? fmt(p.resultado) : '—'}</td>
                                <td className={`py-2 text-right font-bold ${p.piorCaso == null ? 'text-gray-500' : p.piorCaso >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.piorCaso == null ? '—' : fmt(p.piorCaso)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">Pior caso = preço − taxa online − 5 visitas × comissão por visita (regra: 1 visita por semana, até 5 por ciclo; 2 × Corte de Cria = 10 visitas). Receita só conta quem tem pagamento registrado no ciclo.</p>
        </section>
    )
}

const ROTULO_GRUPO = { pagou_nao_veio: 'pagou e não veio', recusado: 'cartão recusado', cancelado_atendendo: 'cancelado atendendo', alertas: 'alerta', vencido: 'vencido' }

const ROTULO_LIGACAO = { manual: 'vinculado à mão', telefone: 'telefone', codigo: 'código', nome: 'a conferir (só nome)' }

function LinhaAssinante({ s, assinantes, lancamentos, cidDe, onMudou }) {
    const [aberto, setAberto] = useState(false)
    const [salvando, setSalvando] = useState(false)
    const destaque = s.grupos.includes('alertas') ? 'border-l-2 border-l-orange-500 bg-orange-950/10' : s.grupos.includes('recusado') ? 'border-l-2 border-l-yellow-500 bg-yellow-950/10' : ''
    const dm = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    const soltos = aberto ? naoLigados(lancamentos, assinantes, s.ciclo.inicio, s.ciclo.fim) : []
    // Status do contrato vem antes do pagamento: cancelado/recusado não pode aparecer como "pagamento sem dado"
    const [corStatus, textoStatus] =
        s.statusAtual === 'cancelada' ? ['text-gray-400', `cancelado${s.data_cancelamento ? ` em ${ddmm(s.data_cancelamento)}` : ''}`]
            : s.status_assinatura === 'pagamento_recusado' && s.pagou !== true ? ['text-yellow-400', `cartão recusado${s.data_recusa ? ` em ${ddmm(s.data_recusa)}` : ''}`]
                : s.statusAtual === 'vencido' && s.pagou !== true ? ['text-red-400', `vencido em ${ddmm(s.vencimento)}`]
                    : s.pagou === true ? ['text-emerald-400', s.pagamentoLigadoPor === 'nome' ? 'pagou (a conferir)' : 'pagou']
                        : s.pagou === false ? ['text-red-400', 'não pagou'] : ['text-gray-500', 'pagamento sem dado']

    const salvar = async (fn) => {
        setSalvando(true)
        try { await fn(); onMudou() } catch (e) { alert('Erro: ' + e.message) } finally { setSalvando(false) }
    }
    const vincular = (lancId) => salvar(async () => {
        const cid = cidDe.get(s.telefone)
        if (!cid) throw new Error('assinante sem código de cliente')
        await updateDoc(doc(db, 'lancamentos', lancId), { assinante_id: cid })
    })
    const definirPagador = (tel) => salvar(() => updateDoc(doc(db, 'assinantes', s.telefone), { pagador: tel || null }))

    return (
        <div className={`py-2.5 px-2 ${destaque}`}>
            <button type="button" onClick={() => setAberto(v => !v)} className="w-full flex items-center gap-3 text-left">
                <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-100 truncate">{s.nome}{s.dependenteDe && <span className="text-[11px] text-cyan-400"> · dependente de {s.dependenteDe}</span>}</div>
                    <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-2">
                        <span>{formatTelefone(s.telefone)}</span><span>{s.plano.label}</span>
                        {s.forma === 'pix_manual' && <span className="text-sky-400">Pix manual</span>}
                        <span>ciclo {dm(s.ciclo.inicio)}–{dm(s.ciclo.fim)}</span>
                        <span>{s.visitas} visita{s.visitas === 1 ? '' : 's'}{s.visitasDependentes ? ` + ${s.visitasDependentes} de dependente` : ''} · comissão {fmt(s.comissaoTotal ?? s.comissao)}</span>
                        <span className={corStatus}>{textoStatus}</span>
                        {s.aConferir > 0 && <span className="text-orange-400">{s.aConferir} a conferir</span>}
                        {s.grupos.map(g => <span key={g} className="text-yellow-400">{ROTULO_GRUPO[g]}</span>)}
                    </div>
                    {s.alertas?.map((al, k) => (
                        <div key={k} className="text-[11px] text-orange-300 mt-0.5">
                            {al.texto}: {al.visitas.map(v => `${v.dia.slice(8, 10)}/${v.dia.slice(5, 7)} ${(v.barbeiro || '').split(' ')[0]}`).join(', ')}
                        </div>
                    ))}
                </div>
                <div className={`text-sm font-bold whitespace-nowrap ${s.resultado == null ? 'text-gray-500' : s.resultado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.resultado == null ? '—' : fmt(s.resultado)}</div>
            </button>

            {aberto && (
                <div className="mt-2 ml-1 space-y-3 text-xs">
                    <div>
                        <div className="text-gray-500 mb-1">Visitas no ciclo</div>
                        {s.visitasDet.length === 0 ? <div className="text-gray-600">Nenhuma.</div> : s.visitasDet.map(({ l, tipo }) => (
                            <div key={l.id} className="flex items-center gap-2 text-gray-300">
                                <span>{l.data?.toDate?.().toLocaleDateString('pt-BR')}</span>
                                <span className="truncate flex-1">{l.servico_descricao} · {l.barbeiro_nome} · {fmt(l.comissao_barbeiro)}</span>
                                <span className={tipo === 'nome' ? 'text-orange-400' : 'text-gray-500'}>{ROTULO_LIGACAO[tipo]}</span>
                                {tipo === 'nome' && <button type="button" disabled={salvando} onClick={() => vincular(l.id)} className="text-emerald-400 underline">confirmar</button>}
                            </div>
                        ))}
                    </div>
                    {soltos.length > 0 && (
                        <div>
                            <div className="text-gray-500 mb-1">Atendimentos e pagamentos de assinatura sem dono neste ciclo (vincular a {s.nome})</div>
                            {soltos.slice(0, 15).map(l => (
                                <div key={l.id} className="flex items-center gap-2 text-gray-400">
                                    <span>{l.data?.toDate?.().toLocaleDateString('pt-BR')}</span>
                                    <span className="truncate flex-1">{l.forma_pagamento === 'Assinante' ? '' : `pagamento R$ ${l.valor_bruto} ${l.forma_pagamento} · `}{l.cliente_nome || 'sem nome'} · {l.barbeiro_nome}</span>
                                    <button type="button" disabled={salvando} onClick={() => vincular(l.id)} className="text-cyan-400 underline">vincular</button>
                                </div>
                            ))}
                        </div>
                    )}
                    <PagadorBusca s={s} assinantes={assinantes} salvando={salvando} onDefinir={definirPagador} />
                </div>
            )}
        </div>
    )
}

// Pagador (casal/família) por busca, no lugar da lista com todos os nomes
function PagadorBusca({ s, assinantes, salvando, onDefinir }) {
    const [busca, setBusca] = useState('')
    const atual = s.pagador ? assinantes.find(a => a.telefone === s.pagador) : null
    const termo = semAcento(busca.trim())
    const opcoes = termo.length >= 2
        ? assinantes.filter(a => a.telefone !== s.telefone && !a.pagador && semAcento(a.nome).includes(termo)).slice(0, 6)
        : []
    return (
        <div className="space-y-1.5">
            <div className="text-gray-500">Pagador (casal/família)</div>
            {atual ? (
                <div className="flex items-center gap-2 text-gray-300">
                    <span>Quem paga: <b className="text-gray-100">{atual.nome}</b></span>
                    <button type="button" disabled={salvando} onClick={() => onDefinir(null)} className="text-red-400 underline">remover</button>
                </div>
            ) : <div className="text-gray-600">Paga a própria assinatura.</div>}
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={atual ? 'Trocar pagador: buscar pelo nome' : 'Buscar pagador pelo nome'}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-base text-gray-200 outline-none focus:border-cyan-600" />
            {opcoes.map(a => (
                <button key={a.telefone} type="button" disabled={salvando} onClick={() => { onDefinir(a.telefone); setBusca('') }}
                    className="w-full text-left bg-gray-950 border border-gray-800 hover:border-cyan-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                    {a.nome} <span className="text-gray-500">· {a.plano || 'sem plano'}</span>
                </button>
            ))}
            {termo.length >= 2 && !opcoes.length && <div className="text-gray-600">Ninguém com esse nome.</div>}
        </div>
    )
}

// ==========================================
// Precisa de ação (topo da aba)
// ==========================================
const COR_GRUPO = {
    recusado: 'border-yellow-700/60 text-yellow-300',
    vencido: 'border-red-800/60 text-red-300',
    conferir: 'border-sky-800/60 text-sky-300',
    pagou_nao_veio: 'border-purple-800/60 text-purple-300',
    fora_regra: 'border-orange-800/60 text-orange-300',
}
const MOSTRAR_POR_GRUPO = 6

function PrecisaDeAcao({ grupos, dados, onMudou }) {
    // Contatos gravados nesta visita (sem recarregar a aba inteira): "telefone|grupo" -> AAAA-MM-DD
    const [contatos, setContatos] = useState({})
    if (!grupos.length) {
        return (
            <section className="bg-gray-900 border border-emerald-800/50 rounded-2xl p-4 text-sm text-emerald-300 flex items-center gap-2">
                <Check size={18} /> Nada precisa de ação agora.
            </section>
        )
    }
    const pessoas = new Set(grupos.flatMap(g => g.itens.map(i => i.s.telefone))).size

    const contatar = (grupo, s) => {
        const texto = mensagemWhatsApp(grupo, s)
        if (!texto) return
        window.open(linkWhatsApp(s.telefone, texto), '_blank', 'noopener')
        const hoje = diaSP(new Date())
        setContatos(c => ({ ...c, [`${s.telefone}|${grupo}`]: hoje }))
        updateDoc(doc(db, 'assinantes', s.telefone), { [`contato.${grupo}`]: hoje })
            .catch(e => alert('O WhatsApp abriu, mas não gravou o "contatado": ' + e.message))
    }
    const contatoDe = (grupo, item) => contatoValido(contatos[`${item.s.telefone}|${grupo}`] || item.s.contato?.[grupo], item.desde)

    return (
        <section className="bg-gray-900 border border-orange-800/40 rounded-2xl p-3 sm:p-4 space-y-5">
            <h2 className="font-semibold text-gray-100 flex items-center gap-2">
                <AlertTriangle size={18} className="text-orange-400" /> Precisa de ação
                <span className="text-sm font-normal text-gray-400">({pessoas} {pessoas === 1 ? 'pessoa' : 'pessoas'})</span>
            </h2>
            {grupos.map(g => <GrupoAcao key={g.id} g={g} dados={dados} onMudou={onMudou} contatar={contatar} contatoDe={contatoDe} />)}
        </section>
    )
}

function GrupoAcao({ g, dados, onMudou, contatar, contatoDe }) {
    const [todos, setTodos] = useState(false)
    const itens = todos ? g.itens : g.itens.slice(0, MOSTRAR_POR_GRUPO)
    return (
        <div>
            <h3 className={`text-sm font-bold mb-2 pb-1 border-b ${COR_GRUPO[g.id]}`}>{g.titulo} ({g.itens.length})</h3>
            <div className="space-y-2">
                {itens.map(item => g.id === 'fora_regra'
                    ? <ItemForaRegra key={item.s.telefone} s={item.s} />
                    : <ItemAcao key={item.s.telefone} grupo={g.id} item={item} dados={dados} onMudou={onMudou} contatar={contatar} contatado={contatoDe(g.id, item)} />)}
            </div>
            {g.itens.length > MOSTRAR_POR_GRUPO && (
                <button type="button" onClick={() => setTodos(v => !v)} className="mt-2 text-sm text-gray-400 underline py-1">
                    {todos ? 'Mostrar menos' : `Ver todos (${g.itens.length})`}
                </button>
            )}
        </div>
    )
}

function ItemAcao({ grupo, item, dados, onMudou, contatar, contatado }) {
    const { s } = item
    const [vincular, setVincular] = useState(false)
    const valor = s.valor ?? s.plano?.preco
    const detalhe = {
        recusado: `${item.dias == null ? 'recusado' : item.dias === 0 ? 'recusou hoje' : `recusou há ${item.dias} dia${item.dias === 1 ? '' : 's'}`}${valor ? ` · ${fmt(Number(valor))}` : ''}`,
        vencido: `venceu em ${ddmm(s.vencimento)}`,
        conferir: `ciclo desde ${ddmm(diaSP(s.ciclo.inicio))} · nenhum pagamento ligado`,
        pagou_nao_veio: `ciclo ${ddmm(diaSP(s.ciclo.inicio))}–${ddmm(diaSP(s.ciclo.fim))} · nenhuma visita`,
    }[grupo]

    return (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-base font-semibold text-gray-100 truncate">{s.nome}</div>
                    <div className="text-xs text-gray-400">{s.plano?.label} · {detalhe}</div>
                </div>
                {contatado && <span className="shrink-0 text-[11px] font-bold text-emerald-300 bg-emerald-950/50 border border-emerald-800/60 rounded-full px-2 py-0.5">contatado em {ddmm(contatado)}</span>}
            </div>
            <div className="flex gap-2 mt-2.5">
                <button type="button" onClick={() => contatar(grupo, s)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold py-2.5 rounded-lg active:scale-[0.98]">
                    <MessageCircle size={16} /> WhatsApp
                </button>
                {grupo === 'conferir' && (
                    <button type="button" onClick={() => setVincular(v => !v)}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-lg ${vincular ? 'bg-sky-800 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-200'}`}>
                        <Link2 size={15} /> Vincular pagamento
                    </button>
                )}
            </div>
            {vincular && <VincularPagamento s={s} dados={dados} onMudou={onMudou} />}
        </div>
    )
}

function ItemForaRegra({ s }) {
    return (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
            <div className="text-base font-semibold text-gray-100 truncate">{s.nome} <span className="text-xs font-normal text-gray-500">· {s.plano?.label}</span></div>
            {s.alertas.map((al, k) => (
                <div key={k} className="text-xs text-orange-200 mt-1">
                    <b>{al.texto}</b>{al.visitas?.length ? `: ${al.visitas.map(v => `${ddmm(v.dia)} ${(v.barbeiro || '?').split(' ')[0]}`).join(', ')}` : ''}
                </div>
            ))}
        </div>
    )
}

// Renovações pagas no balcão que não se ligaram a nenhum assinante (nome diferente, sem código).
// Sem busca: as do período do ciclo (15 dias antes do início em diante). Com busca: últimos 60 dias.
const DIA_MS = 24 * 60 * 60 * 1000
function VincularPagamento({ s, dados, onMudou }) {
    const [busca, setBusca] = useState('')
    const [salvando, setSalvando] = useState(false)
    const soltos = useMemo(() => dados.lancamentos
        .filter(l => ehRenovacaoBalcao(l) && l.data?.toDate && !dados.assinantes.some(a => tipoLigacao(a, l)))
        .sort((a, b) => b.data.toDate() - a.data.toDate()), [dados])
    const termo = semAcento(busca.trim())
    const desde = new Date(s.ciclo.inicio.getTime() - 15 * DIA_MS)
    const ha60 = new Date(Date.now() - 60 * DIA_MS)
    const lista = soltos.filter(l => termo.length >= 2
        ? l.data.toDate() >= ha60 && semAcento(l.cliente_nome).includes(termo)
        : l.data.toDate() >= desde).slice(0, 10)

    const vincular = async (l) => {
        const cid = dados.cidDe.get(s.telefone)
        if (!cid) return alert('Este assinante ainda não tem código de cliente.')
        if (!confirm(`Ligar o pagamento de ${fmt(Number(l.valor_bruto))} (${l.cliente_nome || 'sem nome'}, ${l.data.toDate().toLocaleDateString('pt-BR')}) a ${s.nome}?`)) return
        setSalvando(true)
        try { await updateDoc(doc(db, 'lancamentos', l.id), { assinante_id: cid }); onMudou() } catch (e) { alert('Erro: ' + e.message) } finally { setSalvando(false) }
    }

    return (
        <div className="mt-3 space-y-2 border-t border-gray-800 pt-3">
            <div className="text-xs text-gray-400">Pagamentos no balcão sem dono {termo.length >= 2 ? '(últimos 60 dias)' : `desde ${desde.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}</div>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pelo nome lançado"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-base text-gray-200 outline-none focus:border-sky-600" />
            {lista.map(l => (
                <div key={l.id} className="flex items-center gap-2 text-sm text-gray-300 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                        <div className="truncate">{l.cliente_nome || 'sem nome'}</div>
                        <div className="text-[11px] text-gray-500">{l.data.toDate().toLocaleDateString('pt-BR')} · {fmt(Number(l.valor_bruto))} {l.forma_pagamento} · {(l.barbeiro_nome || '').split(' ')[0]}</div>
                    </div>
                    <button type="button" disabled={salvando} onClick={() => vincular(l)} className="shrink-0 bg-sky-700 hover:bg-sky-600 text-white text-sm font-bold px-3 py-2 rounded-lg disabled:opacity-50">vincular</button>
                </div>
            ))}
            {!lista.length && <div className="text-xs text-gray-500">Nenhum pagamento sem dono {termo.length >= 2 ? 'com esse nome' : 'nesse período'}. Se pagou na Celcoin, confira se o evento chegou.</div>}
        </div>
    )
}