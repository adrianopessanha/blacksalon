import { useMemo } from 'react'
import { Users, UserPlus, Repeat, DollarSign, ShieldCheck, RefreshCw, MessageCircle, AlertTriangle, UserX, Info } from 'lucide-react'
import { useMetricas } from '../hooks/useMetricas'
import { formatTelefone } from '../utils/phone'
import {
    DADOS_DESDE, DIAS_MIN_SUMIDOS, diaSP, diasEntre, somaDias,
    montarClientes, painel, sumidos, canceladosRecentes, whatsappLink,
} from '../utils/metricas'

const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDia = (dia) => dia ? dia.split('-').reverse().join('/') : '—'
const INSUF = 'dados insuficientes'

export function MetricsDashboard() {
    const { dados, loading, error, recarregar } = useMetricas()

    const calc = useMemo(() => {
        if (!dados) return null
        const hoje = diaSP(new Date())
        const mes = hoje.slice(0, 7)
        const clientes = montarClientes(dados.lancamentosComTelefone)
        const assinantesPorTel = new Map(dados.assinantes.map(a => [a.telefone, a]))
        const cancelamentos = dados.cancelamentos.map(c => ({ telefone: c.telefone, nome: c.nome, data: c.data }))
        const historicoDias = diasEntre(DADOS_DESDE, hoje)
        return {
            hoje,
            p: painel({ clientes, lancamentosMes: dados.lancamentosMes, assinantes: dados.assinantes, cancelamentos, hoje, mes }),
            sumidos: sumidos(clientes, assinantesPorTel, hoje),
            sumidosDisponivelEm: historicoDias < DIAS_MIN_SUMIDOS ? somaDias(DADOS_DESDE, DIAS_MIN_SUMIDOS) : null,
            emRisco: dados.assinantes.filter(a => a.status_assinatura === 'pagamento_recusado'),
            cancelados: canceladosRecentes(cancelamentos, assinantesPorTel, hoje).map(e => ({ ...e, nome: assinantesPorTel.get(e.telefone)?.nome || e.nome })),
        }
    }, [dados])

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
                        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-300"><ShieldCheck size={16} className="text-purple-400" /> Assinantes (Celcoin e balcão)</div>
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
                            <Linha key={c.telefone} nome={c.nome} telefone={c.telefone}>
                                <span>última visita {fmtDia(c.ultimaVisita)}</span>
                                {c.barbeiro && <span>com {c.barbeiro.split(' ')[0]}</span>}
                                <span className="text-orange-400 font-bold">{c.atraso} dias de atraso{c.estimado ? ' (estimado)' : ''}</span>
                                {c.assinante && <span className="text-purple-400">assinante</span>}
                            </Linha>
                        )} />

                    <Lista titulo="Assinatura em risco (pagamento recusado)" icon={AlertTriangle} cor="text-yellow-400"
                        vazio="Nenhum assinante com pagamento recusado." itens={calc.emRisco}
                        render={a => (
                            <Linha key={a.telefone} nome={a.nome} telefone={a.telefone}>
                                {a.plano && <span>{a.plano}</span>}
                                {a.origem && <span>{a.origem === 'balcao' ? 'balcão' : 'Celcoin'}</span>}
                                {a.ultima_atualizacao?.toDate && <span>atualizado em {a.ultima_atualizacao.toDate().toLocaleDateString('pt-BR')}</span>}
                            </Linha>
                        )} />

                    <Lista titulo="Cancelados nos últimos 30 dias" icon={UserX} cor="text-red-400"
                        vazio="Nenhum cancelamento recente." itens={calc.cancelados}
                        render={e => (
                            <Linha key={e.telefone} nome={e.nome} telefone={e.telefone}>
                                <span>cancelado em {fmtDia(e.data)}</span>
                            </Linha>
                        )} />

                    <div className="text-[10px] text-gray-600 text-right">calculado em {dados.carregadoEm.toLocaleString('pt-BR')}</div>
                </>
            )}
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

function Linha({ nome, telefone, children }) {
    const wa = whatsappLink(telefone)
    return (
        <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-100 font-medium truncate">{nome || 'Sem nome'}</div>
                <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>{formatTelefone(telefone)}</span>
                    {children}
                </div>
            </div>
            {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1 text-xs font-bold text-emerald-300 bg-emerald-900/30 border border-emerald-700/50 rounded-lg px-2.5 py-1.5 hover:bg-emerald-900/60">
                    <MessageCircle size={14} /> WhatsApp
                </a>
            )}
        </div>
    )
}
