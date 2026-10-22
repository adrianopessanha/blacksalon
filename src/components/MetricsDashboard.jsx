import { useMemo, useState } from 'react'
import { Users, UserPlus, Repeat, DollarSign, ShieldCheck, RefreshCw, MessageCircle, AlertTriangle, UserX, Info, Search, Trophy, Scissors, X } from 'lucide-react'
import { useMetricas } from '../hooks/useMetricas'
import { formatTelefone, semAcento } from '../utils/phone'
import {
    DADOS_DESDE, DIAS_MIN_SUMIDOS, diaSP, diasEntre, somaDias,
    montarClientes, painel, sumidos, canceladosRecentes, whatsappLink,
    totalGasto, faltas, porBarbeiro, voltaPrevista,
} from '../utils/metricas'

const fmtBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDia = (dia) => dia ? dia.split('-').reverse().join('/') : '—'
const INSUF = 'dados insuficientes'
const primeiroNome = (n) => String(n || '').split(' ')[0]

export function MetricsDashboard() {
    const { dados, loading, error, recarregar } = useMetricas()
    const [fichaTel, setFichaTel] = useState(null)
    const [busca, setBusca] = useState('')

    const calc = useMemo(() => {
        if (!dados) return null
        const hoje = diaSP(new Date())
        const mes = hoje.slice(0, 7)
        const clientes = montarClientes(dados.lancamentosComTelefone)
        const clientesPorTel = new Map(clientes.map(c => [c.telefone, c]))
        const assinantesPorTel = new Map(dados.assinantes.map(a => [a.telefone, a]))
        const cancelamentos = dados.cancelamentos.map(c => ({ telefone: c.telefone, nome: c.nome, data: c.data }))
        const total = totalGasto(dados.lancamentosComTelefone, dados.pagamentosReceita)
        const idsAtendidos = new Set(dados.lancamentosComTelefone.map(l => l.agendamento_id).filter(Boolean))
        const faltasPorTel = faltas(dados.agendamentos, idsAtendidos, hoje)

        // Nome mais confiável: lançamento > assinante > pagamento > agendamento
        const nomes = new Map()
        const poeNome = (tel, nome) => { if (tel && nome && !nomes.has(tel)) nomes.set(tel, nome) }
        clientes.forEach(c => poeNome(c.telefone, c.nome))
        dados.assinantes.forEach(a => poeNome(a.telefone, a.nome))
        dados.pagamentosReceita.forEach(p => poeNome(p.telefone, p.nome))
        dados.agendamentos.forEach(a => poeNome(a.telefone, a.nome))

        const pessoas = [...new Set([...clientesPorTel.keys(), ...total.keys(), ...assinantesPorTel.keys(), ...faltasPorTel.keys()])]
            .map(tel => ({ telefone: tel, nome: nomes.get(tel) || null }))

        return {
            hoje, clientesPorTel, assinantesPorTel, total, faltasPorTel, nomes, pessoas,
            p: painel({ clientes, lancamentosMes: dados.lancamentosMes, assinantes: dados.assinantes, cancelamentos, hoje, mes }),
            sumidos: sumidos(clientes, assinantesPorTel, hoje),
            sumidosDisponivelEm: diasEntre(DADOS_DESDE, hoje) < DIAS_MIN_SUMIDOS ? somaDias(DADOS_DESDE, DIAS_MIN_SUMIDOS) : null,
            emRisco: dados.assinantes.filter(a => a.status_assinatura === 'pagamento_recusado'),
            cancelados: canceladosRecentes(cancelamentos, assinantesPorTel, hoje).map(e => ({ ...e, nome: nomes.get(e.telefone) || e.nome })),
            topValor: [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([telefone, valor]) => ({ telefone, valor, nome: nomes.get(telefone) })),
            topVisitas: [...clientes].sort((a, b) => b.visitas - a.visitas).slice(0, 20),
            barbeiros: porBarbeiro(dados.lancamentos30d, clientes, somaDias(hoje, -30)),
        }
    }, [dados])

    const resultadosBusca = useMemo(() => {
        if (!calc || busca.trim().length < 2) return []
        const termo = semAcento(busca)
        const digitos = busca.replace(/\D/g, '')
        return calc.pessoas.filter(p =>
            (p.nome && semAcento(p.nome).includes(termo)) || (digitos.length >= 4 && p.telefone.includes(digitos))
        ).slice(0, 20)
    }, [calc, busca])

    const abrir = (tel) => setFichaTel(tel)

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-gray-100">Métricas de clientes</h1>
                <button onClick={recarregar} disabled={loading}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-cyan-400 border border-gray-800 rounded-lg px-3 py-1.5 disabled:opacity-50">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
                </button>
            </div>

            <div className="flex items-center gap-2 text-sm text-cyan-200 bg-cyan-950/40 border border-cyan-800/50 rounded-lg px-3 py-2">
                <Info size={16} className="shrink-0" /> Dados registrados a partir de {fmtDia(DADOS_DESDE)}
            </div>

            {error && <div className="text-red-400 text-sm">Erro ao carregar: {error.message}</div>}
            {loading && !calc && <div className="text-gray-500 text-sm">Calculando...</div>}

            {calc && (
                <>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-3 text-gray-500" />
                        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente por nome ou telefone"
                            className="w-full bg-gray-900 border border-gray-800 rounded-xl py-2.5 pl-9 pr-3 text-gray-200 outline-none focus:border-cyan-500 text-sm" />
                        {busca.trim().length >= 2 && (
                            <div className="absolute z-20 w-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto">
                                {resultadosBusca.length === 0
                                    ? <div className="px-4 py-3 text-sm text-gray-500">Nenhum cliente encontrado.</div>
                                    : resultadosBusca.map(p => (
                                        <button key={p.telefone} onClick={() => { abrir(p.telefone); setBusca('') }}
                                            className="w-full text-left px-4 py-2.5 border-b border-gray-800/60 hover:bg-cyan-950/30">
                                            <div className="text-sm text-gray-100">{p.nome || 'Sem nome'}</div>
                                            <div className="text-[11px] text-gray-500">{formatTelefone(p.telefone)}</div>
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Card icon={Users} cor="text-cyan-400" titulo="Clientes ativos" valor={calc.p.ativos} sub="visita nos últimos 60 dias" />
                        <Card icon={UserPlus} cor="text-emerald-400" titulo="Novos no mês" valor={calc.p.novosMes}
                            sub={calc.p.novosMes ? `${calc.p.novosQueVoltaram} já voltaram` : 'primeira visita no mês'} />
                        <Card icon={Repeat} cor="text-purple-400" titulo="Frequência da casa"
                            valor={calc.p.frequenciaCasa == null ? null : `${Math.round(calc.p.frequenciaCasa)} dias`}
                            sub={calc.p.frequenciaCasa == null ? 'precisa de clientes com 2+ visitas' : `mediana de ${calc.p.clientesComRetorno} clientes com retorno`} />
                        <Card icon={DollarSign} cor="text-yellow-400" titulo="Ticket médio do mês"
                            valor={calc.p.ticketMedio == null ? null : fmtBRL(calc.p.ticketMedio)}
                            sub={calc.p.ticketMedio == null ? 'nenhum atendimento pago no mês' : `${calc.p.ticketBase} atendimentos pagos na hora`} />
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-300"><ShieldCheck size={16} className="text-purple-400" /> Assinantes (Celcoin, balcão e abacatepay)</div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <Num valor={calc.p.assinantesAtivos} rotulo="ativos" cor="text-emerald-400" />
                            <Num valor={calc.p.assinantesRecusados} rotulo="pagamento recusado" cor="text-yellow-400" />
                            <Num valor={calc.p.canceladosMes} rotulo="cancelados no mês" cor="text-red-400" />
                        </div>
                    </div>

                    <Lista titulo="Sumidos" icon={UserX} cor="text-orange-400"
                        vazio={calc.sumidosDisponivelEm
                            ? `${INSUF}: a lista começa a mostrar clientes a partir de ${fmtDia(calc.sumidosDisponivelEm)}`
                            : 'Nenhum cliente atrasado.'}
                        itens={calc.sumidos}
                        render={c => (
                            <Linha key={c.telefone} nome={c.nome} telefone={c.telefone} onAbrir={abrir}>
                                <span>última visita {fmtDia(c.ultimaVisita)}</span>
                                {c.barbeiro && <span>com {primeiroNome(c.barbeiro)}</span>}
                                <span className="text-orange-400 font-bold">{c.atraso} dias de atraso{c.estimado ? ' (estimado)' : ''}</span>
                                {c.assinante && <span className="text-purple-400">assinante</span>}
                            </Linha>
                        )} />

                    <Lista titulo="Assinatura em risco (pagamento recusado)" icon={AlertTriangle} cor="text-yellow-400"
                        vazio="Nenhum assinante com pagamento recusado." itens={calc.emRisco}
                        render={a => (
                            <Linha key={a.telefone} nome={a.nome} telefone={a.telefone} onAbrir={abrir}>
                                {a.plano && <span>{a.plano}</span>}
                                {a.origem && <span>{a.origem === 'balcao' ? 'balcão' : a.origem}</span>}
                                {a.ultima_atualizacao?.toDate && <span>atualizado em {a.ultima_atualizacao.toDate().toLocaleDateString('pt-BR')}</span>}
                            </Linha>
                        )} />

                    <Lista titulo="Cancelados nos últimos 30 dias" icon={UserX} cor="text-red-400"
                        vazio="Nenhum cancelamento recente." itens={calc.cancelados}
                        render={e => (
                            <Linha key={e.telefone} nome={e.nome} telefone={e.telefone} onAbrir={abrir}>
                                <span>cancelado em {fmtDia(e.data)}</span>
                            </Linha>
                        )} />

                    <div className="grid md:grid-cols-2 gap-4">
                        <Lista titulo="Top 20 por valor total" icon={Trophy} cor="text-yellow-400"
                            vazio={INSUF} itens={calc.topValor}
                            render={(c, i) => (
                                <Linha key={c.telefone} nome={`${i + 1}. ${c.nome || 'Sem nome'}`} telefone={c.telefone} onAbrir={abrir} semWhats>
                                    <span className="text-yellow-400 font-bold">{fmtBRL(c.valor)}</span>
                                </Linha>
                            )} />
                        <Lista titulo="Top 20 por nº de visitas" icon={Trophy} cor="text-cyan-400"
                            vazio={INSUF} itens={calc.topVisitas}
                            render={(c, i) => (
                                <Linha key={c.telefone} nome={`${i + 1}. ${calc.nomes.get(c.telefone) || 'Sem nome'}`} telefone={c.telefone} onAbrir={abrir} semWhats>
                                    <span className="text-cyan-400 font-bold">{c.visitas} visita{c.visitas > 1 ? 's' : ''}</span>
                                </Linha>
                            )} />
                    </div>

                    <section className="bg-gray-900 border border-gray-800 rounded-2xl">
                        <h2 className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 text-sm font-semibold text-gray-200">
                            <Scissors size={16} className="text-cyan-400" /> Por barbeiro (últimos 30 dias)
                        </h2>
                        {calc.barbeiros.length === 0 ? <div className="px-4 py-4 text-sm text-gray-500">{INSUF}</div> : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-[11px] text-gray-500 uppercase">
                                        <tr>
                                            <th className="text-left px-4 py-2 font-medium">Barbeiro</th>
                                            <th className="text-right px-2 py-2 font-medium">Clientes atendidos</th>
                                            <th className="text-right px-2 py-2 font-medium">Voltaram com ele</th>
                                            <th className="text-right px-4 py-2 font-medium">Sem telefone</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {calc.barbeiros.map(b => (
                                            <tr key={b.barbeiro}>
                                                <td className="px-4 py-2 text-gray-200">{b.barbeiro}</td>
                                                <td className="px-2 py-2 text-right text-gray-200">{b.clientesAtendidos}</td>
                                                <td className="px-2 py-2 text-right text-gray-200">{b.clientesAtendidos ? `${b.voltaramComEle} (${Math.round(b.voltaramComEle / b.clientesAtendidos * 100)}%)` : '—'}</td>
                                                <td className={`px-4 py-2 text-right font-bold ${b.pctSemTelefone > 50 ? 'text-red-400' : b.pctSemTelefone > 20 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                                    {b.pctSemTelefone == null ? '—' : `${Math.round(b.pctSemTelefone)}%`}
                                                    <span className="text-[10px] text-gray-500 font-normal"> de {b.servicos}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <div className="text-[10px] text-gray-600 text-right">calculado em {dados.carregadoEm.toLocaleString('pt-BR')}</div>

                    {fichaTel && <FichaCliente tel={fichaTel} calc={calc} onFechar={() => setFichaTel(null)} />}
                </>
            )}
        </div>
    )
}

function FichaCliente({ tel, calc, onFechar }) {
    const c = calc.clientesPorTel.get(tel)
    const assinante = calc.assinantesPorTel.get(tel)
    const faltasCli = calc.faltasPorTel.get(tel) || []
    const volta = voltaPrevista(c)
    const wa = whatsappLink(tel)

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onFechar}>
            <div className="bg-gray-900 border border-gray-800 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-800">
                    <div>
                        <div className="text-lg font-bold text-gray-100">{calc.nomes.get(tel) || 'Sem nome'}</div>
                        <div className="text-xs text-gray-500">{formatTelefone(tel)}
                            {assinante && <span className="ml-2 text-purple-400">assinante {assinante.origem === 'balcao' ? 'balcão' : assinante.origem} · {assinante.status_assinatura}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-emerald-300 bg-emerald-900/30 border border-emerald-700/50 rounded-lg px-2.5 py-1.5"><MessageCircle size={14} /> WhatsApp</a>}
                        <button onClick={onFechar} aria-label="Fechar" className="text-gray-500 hover:text-white"><X size={20} /></button>
                    </div>
                </div>

                <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                    <Dado rotulo="Visitas" valor={c ? c.visitas : 0} />
                    <Dado rotulo="Frequência" valor={c?.frequencia != null ? `a cada ${Math.round(c.frequencia)} dias` : null} />
                    <Dado rotulo="Última visita" valor={c ? fmtDia(c.ultimaVisita) : null} />
                    <Dado rotulo="Volta prevista" valor={volta ? `${fmtDia(volta.dia)}${volta.estimado ? ' (estimado)' : ''}` : null} />
                    <Dado rotulo="Total gasto" valor={fmtBRL(calc.total.get(tel) || 0)} />
                    <Dado rotulo="Barbeiro preferido" valor={c?.barbeiroPreferido || null} />
                    <Dado rotulo="Faltas" valor={faltasCli.length} destaque={faltasCli.length > 0} />
                </div>

                <div className="px-4 pb-4 space-y-3 text-sm">
                    <div>
                        <div className="text-xs text-gray-500 mb-1">Serviços mais feitos</div>
                        {c?.servicosMaisFeitos?.length
                            ? <div className="flex flex-wrap gap-1.5">{c.servicosMaisFeitos.map(([s, n]) => <span key={s} className="text-xs bg-gray-800 text-gray-300 rounded px-2 py-1">{s} · {n}</span>)}</div>
                            : <div className="text-gray-500 text-xs">{INSUF}</div>}
                    </div>
                    {faltasCli.length > 0 && (
                        <div>
                            <div className="text-xs text-gray-500 mb-1">Reservas sem lançamento</div>
                            <div className="text-xs text-red-300 space-y-0.5">
                                {faltasCli.map(f => <div key={f.id}>{fmtDia(f.data)} {f.hora}{f.barbeiro ? ` com ${f.barbeiro}` : ''}</div>)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function Dado({ rotulo, valor, destaque }) {
    return (
        <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-gray-500">{rotulo}</div>
            <div className={`font-bold ${valor == null ? 'text-gray-500 text-xs font-normal' : destaque ? 'text-red-400' : 'text-gray-100'}`}>{valor ?? INSUF}</div>
        </div>
    )
}

function Card({ icon: Icon, cor, titulo, valor, sub }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-2"><Icon size={14} className={cor} /> {titulo}</div>
            <div className={`text-2xl font-bold ${valor == null ? 'text-gray-500 text-base' : 'text-gray-100'}`}>{valor ?? INSUF}</div>
            {sub && <div className="text-[11px] text-gray-500 mt-1">{sub}</div>}
        </div>
    )
}

function Num({ valor, rotulo, cor }) {
    return (
        <div>
            <div className={`text-2xl font-bold ${cor}`}>{valor}</div>
            <div className="text-[11px] text-gray-500">{rotulo}</div>
        </div>
    )
}

function Lista({ titulo, icon: Icon, cor, itens, render, vazio }) {
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl">
            <h2 className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 text-sm font-semibold text-gray-200">
                <Icon size={16} className={cor} /> {titulo} <span className="text-gray-500 font-normal">({itens.length})</span>
            </h2>
            {itens.length === 0
                ? <div className="px-4 py-4 text-sm text-gray-500">{vazio}</div>
                : <div className="divide-y divide-gray-800 max-h-[28rem] overflow-y-auto">{itens.map(render)}</div>}
        </section>
    )
}

function Linha({ nome, telefone, children, onAbrir, semWhats }) {
    const wa = !semWhats && whatsappLink(telefone)
    return (
        <div className="px-4 py-3 flex items-center gap-3">
            <button type="button" onClick={() => onAbrir(telefone)} className="flex-1 min-w-0 text-left">
                <div className="text-sm text-gray-100 font-medium truncate hover:text-cyan-300 underline-offset-2 hover:underline">{nome || 'Sem nome'}</div>
                <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>{formatTelefone(telefone)}</span>
                    {children}
                </div>
            </button>
            {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1 text-xs font-bold text-emerald-300 bg-emerald-900/30 border border-emerald-700/50 rounded-lg px-2.5 py-1.5 hover:bg-emerald-900/60">
                    <MessageCircle size={14} /> WhatsApp
                </a>
            )}
        </div>
    )
}
