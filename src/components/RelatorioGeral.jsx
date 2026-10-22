import { useEffect, useMemo, useState } from 'react'
import { db, collection, query, where, getDocs, doc, setDoc } from '../firebase'
import { Timestamp, getDoc } from 'firebase/firestore'
import { Wallet, Users, PiggyBank, Scissors, ShoppingBag, CreditCard, Star, Pencil, Check, X, CalendarClock, TrendingUp, TrendingDown } from 'lucide-react'
import { BARBERS } from '../data/barbers'
import { TAXAS_ONLINE } from '../config/taxas'
import {
    LOJAS, FORMAS_CAIXA, entrou, comissoes, sobrou, atendimentos, porBarbeiro, vendasNaoServico,
    formasPagamento, aPagarSemana, monitorAssinaturas, periodoAnterior, inicioDaSemana, CELCOIN_AUTO_DESDE,
} from '../utils/relatorio'

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const NOME_LOJA = { 'loja-01': 'Loja 01', 'loja-02': 'Loja 02', total: 'Total' }
const lojaDe = (d) => BARBERS.find(b => b.id === d.barbeiro_id)?.store || d.loja_id || null
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

async function lancamentosEntre(inicio, fimExclusivo) {
    const s = await getDocs(query(collection(db, 'lancamentos'),
        where('data', '>=', Timestamp.fromDate(inicio)), where('data', '<', Timestamp.fromDate(fimExclusivo))))
    return s.docs.map(d => ({ id: d.id, ...d.data() }))
}
async function pagamentosEntre(diaIni, diaFim) {
    const s = await getDocs(query(collection(db, 'pagamentos_assinatura'), where('data', '>=', diaIni), where('data', '<=', diaFim)))
    return s.docs.map(d => ({ id: d.id, ...d.data() }))
}
const diaInicio = (iso) => new Date(iso + 'T00:00:00')
const diaSeguinte = (iso) => { const d = diaInicio(iso); d.setDate(d.getDate() + 1); return d }

// Leituras que não dependem do filtro de barbeiro/loja: online do período, período anterior e semana
function useExtras(filters) {
    const [extras, setExtras] = useState(null)
    useEffect(() => {
        let cancel = false
        const ant = periodoAnterior(filters.startDate, filters.endDate)
        const domingo = inicioDaSemana()
        Promise.all([
            pagamentosEntre(filters.startDate, filters.endDate),
            lancamentosEntre(diaInicio(ant.inicio), diaSeguinte(ant.fim)),
            pagamentosEntre(ant.inicio, ant.fim),
            lancamentosEntre(domingo, new Date(Date.now() + 864e5)),
        ]).then(([pag, lancAnt, pagAnt, semana]) => {
            if (!cancel) setExtras({ pag, lancAnt, pagAnt, semana, ant, domingo })
        }).catch(e => console.error('relatorio extras:', e))
        return () => { cancel = true }
    }, [filters.startDate, filters.endDate])
    return extras
}

export function RelatorioGeral({ data, filters }) {
    const extras = useExtras(filters)

    const calc = useMemo(() => {
        if (!extras) return null
        const ent = entrou(data, extras.pag, lojaDe)
        const com = comissoes(data, lojaDe)
        const entAnt = entrou(extras.lancAnt, extras.pagAnt, lojaDe)
        const comAnt = comissoes(extras.lancAnt, lojaDe)
        const ativos = new Set(BARBERS.filter(b => !b.inactive).map(b => b.id))
        return {
            ent, com, sob: sobrou(ent, com), sobAnt: sobrou(entAnt, comAnt),
            atend: atendimentos(data),
            barbeiros: porBarbeiro(data),
            vendas: vendasNaoServico(data),
            formas: formasPagamento(data),
            aPagar: aPagarSemana(extras.semana).filter(b => ativos.has(b.id)),
        }
    }, [data, extras])

    if (!calc) return <div className="text-gray-500 text-sm">Calculando...</div>
    const ant = extras.ant
    const rotuloAnt = ant.mesmoDiaSemana
        ? `mesmo dia da semana anterior (${ant.inicio.split('-').reverse().join('/')})`
        : `período anterior (${ant.inicio.split('-').reverse().join('/')} a ${ant.fim.split('-').reverse().join('/')})`

    return (
        <div className="space-y-6">
            {/* 1. ENTROU */}
            <Secao icone={Wallet} cor="text-emerald-400" titulo="Entrou no período">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[...LOJAS, 'total'].map(k => <CartaoEntrou key={k} nome={NOME_LOJA[k]} e={calc.ent[k]} destaque={k === 'total'} />)}
                </div>
            </Secao>

            {/* 2. COMISSÕES */}
            <Secao icone={Users} cor="text-orange-400" titulo="Comissões geradas no período">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-[11px] text-gray-500 uppercase">
                            <tr><th className="text-left py-2 font-medium">Tipo</th>{[...LOJAS, 'total'].map(k => <th key={k} className="text-right py-2 px-2 font-medium">{NOME_LOJA[k]}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 text-gray-300">
                            {[['pago', 'Serviço pago'], ['assinante', 'Atendimento de assinante'], ['vale', 'Uso de vale presente'], ['produto', 'Venda de produto']]
                                .filter(([t]) => t !== 'produto' || calc.com.total.produto.qtd > 0)
                                .map(([t, rotulo]) => (
                                    <tr key={t}>
                                        <td className="py-2">{rotulo}</td>
                                        {[...LOJAS, 'total'].map(k => (
                                            <td key={k} className="py-2 px-2 text-right">{fmt(calc.com[k][t].valor)}<span className="block text-[10px] text-gray-500">{calc.com[k][t].qtd}</span></td>
                                        ))}
                                    </tr>
                                ))}
                            <tr className="font-bold text-gray-100">
                                <td className="py-2">Total</td>
                                {[...LOJAS, 'total'].map(k => <td key={k} className="py-2 px-2 text-right">{fmt(calc.com[k].total)}</td>)}
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">Comissão nasce no atendimento. Venda de assinatura, de vale presente e renovação Celcoin não geram comissão.</p>
            </Secao>

            <Secao icone={CalendarClock} cor="text-yellow-400" titulo={`A pagar no sábado (semana desde ${extras.domingo.toLocaleDateString('pt-BR')})`}>
                {calc.aPagar.length === 0 ? <div className="text-sm text-gray-500">Nenhuma comissão na semana.</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-[11px] text-gray-500 uppercase">
                                <tr><th className="text-left py-2 font-medium">Barbeiro</th><th className="text-right py-2 px-2 font-medium">Comissão</th><th className="text-right py-2 px-2 font-medium">Adiantamentos</th><th className="text-right py-2 font-medium">A pagar</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 text-gray-300">
                                {calc.aPagar.map(b => (
                                    <tr key={b.id}>
                                        <td className="py-2">{b.nome}</td>
                                        <td className="py-2 px-2 text-right">{fmt(b.comissao)}</td>
                                        <td className="py-2 px-2 text-right text-red-300">{b.adiantamentos ? `− ${fmt(b.adiantamentos)}` : '—'}</td>
                                        <td className="py-2 text-right font-bold text-yellow-300">{fmt(b.aPagar)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="text-[11px] text-gray-500 mt-2">Acumulado de domingo até agora, independente do filtro de datas.</p>
            </Secao>

            {/* 3. SOBROU */}
            <Secao icone={PiggyBank} cor="text-cyan-400" titulo="Sobrou (entrou − comissões geradas)">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[...LOJAS, 'total'].map(k => {
                        const dif = calc.sob[k] - calc.sobAnt[k]
                        return (
                            <div key={k} className={`rounded-xl border p-4 ${k === 'total' ? 'border-cyan-700/60 bg-cyan-950/20' : 'border-gray-800 bg-gray-950'}`}>
                                <div className="text-xs text-gray-400">{NOME_LOJA[k]}</div>
                                <div className={`text-2xl font-bold ${calc.sob[k] >= 0 ? 'text-gray-100' : 'text-red-400'}`}>{fmt(calc.sob[k])}</div>
                                <div className={`text-[11px] mt-1 flex items-center gap-1 ${dif >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {dif >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                    {dif >= 0 ? '+' : '−'}{fmt(Math.abs(dif))} vs {fmt(calc.sobAnt[k])}
                                </div>
                            </div>
                        )
                    })}
                </div>
                <p className="text-[11px] text-gray-500 mt-2">Comparação com o {rotuloAnt}. Adiantamento não é descontado aqui: já faz parte da comissão.</p>
            </Secao>

            {/* 4. ATENDIMENTOS */}
            <Secao icone={Scissors} cor="text-blue-400" titulo="Atendimentos">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                    <Numero valor={calc.atend.pago} rotulo="pagos" cor="text-emerald-400" />
                    <Numero valor={calc.atend.assinante} rotulo="assinante" cor="text-purple-400" />
                    <Numero valor={calc.atend.vale} rotulo="vale presente" cor="text-pink-400" />
                    <Numero valor={calc.atend.total} rotulo="total" cor="text-gray-100" />
                    <Numero valor={calc.atend.ticket == null ? '—' : fmt(calc.atend.ticket)} rotulo="ticket médio (só pagos)" cor="text-yellow-400" />
                </div>
                <p className="text-[11px] text-gray-500 mt-3">
                    <b>Atendimento</b> = serviço feito no cliente. <b>Venda</b> = assinatura, vale presente ou produto (quadro abaixo).
                    <b> Lançamento</b> = qualquer registro, inclusive adiantamento.
                </p>
            </Secao>

            {/* 5. POR BARBEIRO */}
            <Secao icone={Users} cor="text-cyan-400" titulo="Por barbeiro">
                {calc.barbeiros.length === 0 ? <div className="text-sm text-gray-500">Sem atendimentos.</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-[11px] text-gray-500 uppercase">
                                <tr>
                                    <th className="text-left py-2 font-medium">Barbeiro</th>
                                    <th className="text-center py-2 px-1 font-medium" title="pagos / assinante / vale presente">Atend.<span className="block normal-case text-[10px]">pago/assin/vale</span></th>
                                    <th className="text-right py-2 px-1 font-medium">Com. pago</th>
                                    <th className="text-right py-2 px-1 font-medium">Com. assinante</th>
                                    <th className="text-right py-2 px-1 font-medium">Com. vale presente</th>
                                    <th className="text-right py-2 px-1 font-medium">Total</th>
                                    <th className="text-right py-2 font-medium">Ticket</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 text-gray-300">
                                {calc.barbeiros.map(b => (
                                    <tr key={b.id}>
                                        <td className="py-2">{b.nome}</td>
                                        <td className="py-2 px-1 text-center text-xs">{b.atend.pago} / {b.atend.assinante} / {b.atend.vale}</td>
                                        <td className="py-2 px-1 text-right">{fmt(b.com.pago)}</td>
                                        <td className="py-2 px-1 text-right">{fmt(b.com.assinante)}</td>
                                        <td className="py-2 px-1 text-right">{fmt(b.com.vale)}</td>
                                        <td className="py-2 px-1 text-right font-bold text-gray-100">{fmt(b.total)}</td>
                                        <td className="py-2 text-right text-yellow-400">{b.ticket == null ? '—' : fmt(b.ticket)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Secao>

            {/* 6. VENDAS QUE NÃO SÃO SERVIÇO */}
            <Secao icone={ShoppingBag} cor="text-amber-400" titulo="Vendas que não são serviço">
                <div className="grid grid-cols-3 gap-3 text-center">
                    {[['assinatura', 'Assinatura no balcão'], ['vale', 'Vale presente'], ['produto', 'Produto']].map(([k, rotulo]) => (
                        <div key={k} className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                            <div className="text-lg font-bold text-gray-100">{fmt(calc.vendas[k].valor)}</div>
                            <div className="text-[11px] text-gray-500">{rotulo} · {calc.vendas[k].qtd}</div>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-2">Assinatura no balcão inclui a renovação de assinante Celcoin. Vale presente: cliente paga 3 serviços e recebe 4 créditos.</p>
            </Secao>

            {/* 7. FORMAS DE PAGAMENTO */}
            <Secao icone={CreditCard} cor="text-gray-300" titulo="Formas de pagamento (dinheiro do caixa)">
                <div className="space-y-2">
                    {calc.formas.formas.map(f => (
                        <div key={f.forma}>
                            <div className="flex justify-between text-sm text-gray-300"><span>{f.forma} <span className="text-gray-500 text-xs">({f.qtd})</span></span><span>{fmt(f.valor)} · {f.pct.toFixed(1)}%</span></div>
                            <div className="h-1.5 bg-gray-800 rounded-full mt-1"><div className="h-1.5 bg-cyan-600 rounded-full" style={{ width: `${f.pct}%` }} /></div>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-2">Assinante e vale presente não são dinheiro entrando: aparecem em Atendimentos.</p>
            </Secao>

            {/* 8. ASSINATURAS (MÊS) */}
            <MonitorAssinaturas filters={filters} />
        </div>
    )
}

function CartaoEntrou({ nome, e, destaque }) {
    return (
        <div className={`rounded-xl border p-4 ${destaque ? 'border-emerald-700/60 bg-emerald-950/20' : 'border-gray-800 bg-gray-950'}`}>
            <div className="text-xs text-gray-400">{nome}</div>
            <div className="text-2xl font-bold text-gray-100">{fmt(e.total)}</div>
            <div className="mt-2 space-y-0.5 text-sm">
                {FORMAS_CAIXA.map(f => <Linha key={f} rotulo={f} valor={e[f]} />)}
                <Linha rotulo="Caixa" valor={e.caixa} forte />
                <Linha rotulo="Cobrado online (cai na conta depois)" valor={e.online} cor="text-sky-300" />
                <div className="pt-1 mt-1 border-t border-gray-800">
                    <Linha rotulo="Saiu do caixa: adiantamentos" valor={e.adiantamentos ? -e.adiantamentos : 0} cor="text-red-300" />
                </div>
            </div>
        </div>
    )
}

function MonitorAssinaturas({ filters }) {
    const mes = filters.startDate.slice(0, 7)
    const umDia = filters.startDate === filters.endDate
    const [aberto, setAberto] = useState(!umDia)
    const [dados, setDados] = useState(null)
    const [editando, setEditando] = useState(false)
    const [valorEdit, setValorEdit] = useState('')
    const [salvando, setSalvando] = useState(false)

    useEffect(() => { setAberto(!umDia) }, [umDia])

    const carregar = async () => {
        const [y, m] = mes.split('-').map(Number)
        const ini = new Date(y, m - 1, 1), fim = new Date(y, m, 1)
        const ultimoDia = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
        const [pag, lanc, conf, fin] = await Promise.all([
            pagamentosEntre(`${mes}-01`, ultimoDia),
            lancamentosEntre(ini, fim),
            getDoc(doc(db, 'configuracoes', 'assinaturas_liquido_real')),
            mes < CELCOIN_AUTO_DESDE ? getDocs(query(collection(db, 'financeiro'), where('finance_category', '==', 'receita_celcoin'))) : null,
        ])
        const antigo = fin ? fin.docs.map(d => d.data())
            .filter(d => d.status !== 'provisionado' && (d.competence_month === mes || String(d.date || '').startsWith(mes)))
            .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0) : 0
        setDados({ pag, lanc, liquidoReal: conf.exists() ? conf.data()[mes] ?? null : null, liquidoAntigo: fin && antigo > 0 ? antigo : null })
    }

    useEffect(() => { if (aberto) { setDados(null); carregar().catch(e => console.error('assinaturas mês:', e)) } }, [aberto, mes]) // eslint-disable-line react-hooks/exhaustive-deps

    const m = dados && monitorAssinaturas(dados.pag, dados.lanc, dados.liquidoReal, mes, dados.liquidoAntigo)
    const [y, mm] = mes.split('-')
    const nomeMes = `${MESES[Number(mm) - 1]}/${y}`

    const salvar = async () => {
        setSalvando(true)
        try {
            const v = valorEdit.trim() === '' ? null : parseFloat(valorEdit.replace(/\./g, '').replace(',', '.'))
            await setDoc(doc(db, 'configuracoes', 'assinaturas_liquido_real'), { [mes]: Number.isFinite(v) ? v : null }, { merge: true })
            setDados(d => ({ ...d, liquidoReal: Number.isFinite(v) ? v : null }))
            setEditando(false)
        } catch (e) { alert('Erro ao salvar: ' + e.message) } finally { setSalvando(false) }
    }

    return (
        <Secao icone={Star} cor="text-purple-400" titulo={`Assinaturas — mês da cobrança (${nomeMes})`}>
            {!aberto ? (
                <button type="button" onClick={() => setAberto(true)} className="text-sm text-purple-300 underline">
                    Assinatura é cobrada por mês: veja o mês de {nomeMes}
                </button>
            ) : !m ? <div className="text-sm text-gray-500">Calculando...</div> : (
                <div className="space-y-1.5 text-sm max-w-md">
                    <Linha rotulo={`Cobrado online (bruto) · ${m.cobrancas} cobrança(s)`} valor={m.bruto} />
                    <Linha rotulo="Taxas estimadas" valor={-m.taxas} cor="text-red-300" />
                    <Linha rotulo="Líquido estimado" valor={m.liquidoEstimado} cor={m.usandoReal ? 'text-gray-500 line-through' : ''} />
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-300">Líquido real (extrato){m.origemLiquido === 'financeiro' ? ' · digitado no Financeiro' : ''}</span>
                        {editando ? (
                            <span className="flex items-center gap-1">
                                <input autoFocus inputMode="decimal" value={valorEdit} onChange={e => setValorEdit(e.target.value)}
                                    className="w-28 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-right text-gray-100" placeholder="vazio = estimado" />
                                <button type="button" onClick={salvar} disabled={salvando} className="text-emerald-400 p-1" aria-label="Salvar"><Check size={16} /></button>
                                <button type="button" onClick={() => setEditando(false)} className="text-gray-500 p-1" aria-label="Cancelar"><X size={16} /></button>
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <span className="text-gray-100">{m.usandoReal ? fmt(m.liquido) : '—'}</span>
                                <button type="button" onClick={() => { setValorEdit(dados.liquidoReal ?? ''); setEditando(true) }} className="text-gray-400 hover:text-purple-300" aria-label="Editar líquido real"><Pencil size={14} /></button>
                            </span>
                        )}
                    </div>
                    <Linha rotulo={`Comissões de atendimento de assinante · ${m.atendimentosAssinante}`} valor={-m.comissoesAssinante} cor="text-red-300" />
                    <div className="pt-1 border-t border-gray-800"><Linha rotulo="Lucro" valor={m.lucro} forte cor={m.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'} /></div>
                    <p className="text-[11px] text-gray-500 pt-1">
                        Taxa estimada por cobrança: {(TAXAS_ONLINE.percentual * 100).toFixed(2).replace('.', ',')}% + {fmt(TAXAS_ONLINE.fixo)} + {(TAXAS_ONLINE.antecipacao * 100).toFixed(0)}% (antecipação), arredondada para cima.
                        Assinatura no balcão no mês: {fmt(m.balcao)} ({m.balcaoQtd}) — já está no caixa das lojas.
                    </p>
                </div>
            )}
        </Secao>
    )
}

function Secao({ icone: Icone, cor, titulo, children }) {
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5">
            <h3 className="font-semibold text-gray-200 mb-3 flex items-center gap-2"><Icone size={18} className={cor} /> {titulo}</h3>
            {children}
        </section>
    )
}

function Linha({ rotulo, valor, forte, cor = '' }) {
    return (
        <div className={`flex justify-between gap-2 ${forte ? 'font-bold text-gray-100' : 'text-gray-300'}`}>
            <span className="text-gray-400">{rotulo}</span><span className={cor}>{valor < 0 ? `− ${fmt(-valor)}` : fmt(valor)}</span>
        </div>
    )
}

function Numero({ valor, rotulo, cor }) {
    return (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-3">
            <div className={`text-xl font-bold ${cor}`}>{valor}</div>
            <div className="text-[11px] text-gray-500">{rotulo}</div>
        </div>
    )
}
