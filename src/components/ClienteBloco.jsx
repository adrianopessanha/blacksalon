import { useEffect, useMemo, useState } from 'react'
import { Search, X, User, Clock, UserPlus, Loader2, UserX } from 'lucide-react'
import { useAgendamentosDoDia, useAgendamentosAtendidos, useClientesEVales, codigoDoTelefone, cadastrarClienteBalcao } from '../hooks/useClientes'
import { useSubscribers } from '../hooks/useSubscribers'
import { montarBase, buscarNaBase, reservasPendentes } from '../utils/clienteBusca'
import { normalizeTelefone55, maskTelefone } from '../utils/phone'

const UNIDADE_LABEL = { '01': 'Unid. 1', '02': 'Unid. 2' }

// Enter nos campos do bloco nunca envia o lançamento
const semEnter = (fn) => (e) => { if (e.key === 'Enter') { e.preventDefault(); fn?.() } }

export function SeloAssinante({ assinante }) {
    if (!assinante) return null
    const cor = assinante.ativo ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700/60'
        : assinante.codigo === 'recusado' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/60'
            : 'bg-red-900/40 text-red-300 border-red-800/60'
    return (
        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border ${cor}`}>
            {assinante.plano || 'Assinante'} · {assinante.statusTexto}
        </span>
    )
}

// valor: null | { cliente_id, nome, assinante, agendamento_id?, hora? } | { semCadastro: true }
// rascunho: { nome, telefone } digitado e ainda não cadastrado (o Lançar cadastra sozinho)
export function ClienteBloco({ valor, onEscolher, onLimpar, rascunho, onRascunho, unidade, barbeiroNome, hoje, verTodasUnidades }) {
    const { agendamentos, loading } = useAgendamentosDoDia(hoje)
    const atendidos = useAgendamentosAtendidos(hoje)
    const { clientes, vales } = useClientesEVales()
    const { subscribers } = useSubscribers()
    const base = useMemo(() => montarBase({ clientes, assinantes: subscribers, vales }), [clientes, subscribers, vales])
    const porCodigo = useMemo(() => new Map(base.map(x => [x.cliente_id, x])), [base])

    const [busca, setBusca] = useState('')
    const [cidBusca, setCidBusca] = useState(null)
    const [buscandoTel, setBuscandoTel] = useState(false)
    const [verCedo, setVerCedo] = useState(false)
    const [salvando, setSalvando] = useState(false)
    const [erro, setErro] = useState('')

    // Telefone completo na busca: o servidor devolve só o código
    const telBusca = String(busca).replace(/\D/g, '').length >= 8 ? normalizeTelefone55(busca) : ''
    useEffect(() => {
        setCidBusca(null)
        if (!telBusca) return
        let cancelado = false
        setBuscandoTel(true)
        codigoDoTelefone(telBusca)
            .then(cid => { if (!cancelado) setCidBusca(cid) })
            .catch(err => console.error('resolverCliente:', err))
            .finally(() => { if (!cancelado) setBuscandoTel(false) })
        return () => { cancelado = true }
    }, [telBusca])

    const resultados = useMemo(() => buscarNaBase(base, busca, cidBusca), [base, busca, cidBusca])

    const reservas = useMemo(() => reservasPendentes(agendamentos, {
        unidade: verTodasUnidades ? null : unidade,
        atendidosAg: atendidos.ags, atendidosCliente: atendidos.clientes, meuNome: barbeiroNome,
    }), [agendamentos, atendidos, unidade, verTodasUnidades, barbeiroNome])
    // Reservas de mais de 2h atrás ficam escondidas (quase sempre já foram ou faltaram)
    const corte = (() => { const d = new Date(Date.now() - 2 * 60 * 60 * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') })()
    const cedo = reservas.filter(a => String(a.hora) < corte)
    const visiveis = verCedo ? reservas : reservas.filter(a => String(a.hora) >= corte)

    // O que é digitado na busca já vai para o cadastro (nunca se perde)
    const digitarBusca = (v) => {
        setBusca(v)
        setErro('')
        const digitos = v.replace(/\D/g, '')
        if (digitos.length >= 8) onRascunho({ ...rascunho, telefone: maskTelefone(v) })
        else if (v.trim() && !digitos) onRascunho({ ...rascunho, nome: v })
    }

    const escolher = (c) => { setBusca(''); setErro(''); onEscolher(c) }

    const escolherReserva = (a) => {
        const x = a.cliente_id ? porCodigo.get(a.cliente_id) : null
        escolher({ cliente_id: a.cliente_id || null, nome: x?.nome || a.nome, assinante: x?.assinante || null, agendamento_id: a.id, barbeiro_agendado: a.barbeiro || null, hora: a.hora })
    }

    const cadastrar = async () => {
        setErro('')
        const nome = String(rascunho.nome || '').trim()
        const tel55 = normalizeTelefone55(rascunho.telefone)
        if (!nome) return setErro('Informe o nome.')
        if (!tel55) return setErro('Telefone inválido. Use DDD + número, ex: (21) 98620-7196.')
        setSalvando(true)
        try {
            const c = await cadastrarClienteBalcao({ nome, telefone: tel55, unidade, barbeiro: barbeiroNome })
            const x = porCodigo.get(c.cliente_id)
            escolher({ cliente_id: c.cliente_id, nome: x?.nome || c.nome || nome, assinante: x?.assinante || null })
        } catch (err) {
            console.error(err)
            setErro('Não salvou: ' + err.message + '. Os dados continuam aqui; tente de novo.')
        } finally {
            setSalvando(false)
        }
    }

    // ---------- Cliente já escolhido ----------
    if (valor) {
        return (
            <div className="bg-cyan-950/30 border border-cyan-700/60 rounded-xl p-3 flex items-center gap-3">
                {valor.semCadastro ? <UserX size={22} className="text-gray-400 shrink-0" /> : <User size={22} className="text-cyan-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-gray-500 uppercase tracking-wider">Cliente</div>
                    <div className="text-base text-cyan-100 font-bold truncate">{valor.semCadastro ? 'Não quis informar' : valor.nome}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <SeloAssinante assinante={valor.assinante} />
                        {valor.hora && <span className="text-[11px] text-gray-400">reserva {valor.hora}</span>}
                    </div>
                </div>
                <button type="button" onClick={onLimpar}
                    className="shrink-0 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-bold px-4 py-3 rounded-lg">trocar</button>
            </div>
        )
    }

    // ---------- Escolher cliente ----------
    return (
        <div className="space-y-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">1. Cliente</div>

            {/* Reservas de hoje */}
            <div>
                <div className="text-[11px] text-gray-500 mb-1.5">Reservas de hoje {verTodasUnidades ? '(todas as unidades)' : ''}</div>
                {loading ? <div className="text-sm text-gray-600">Carregando reservas...</div>
                    : visiveis.length === 0 && !cedo.length ? <div className="text-sm text-gray-600">Nenhuma reserva pendente.</div>
                        : (
                            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                                {visiveis.map(a => {
                                    const x = a.cliente_id ? porCodigo.get(a.cliente_id) : null
                                    return (
                                        <button type="button" key={a.id} onClick={() => escolherReserva(a)}
                                            className={`text-left rounded-lg px-3 py-2.5 border active:scale-95 transition-all ${a.meu ? 'bg-cyan-950/40 border-cyan-700/60' : 'bg-gray-950 border-gray-800'}`}>
                                            <div className="flex items-center gap-1 text-cyan-400 font-mono text-xs"><Clock size={11} />{a.hora}{verTodasUnidades && a.unidade ? ` · ${UNIDADE_LABEL[a.unidade] || a.unidade}` : ''}</div>
                                            <div className="text-sm text-gray-100 font-medium truncate">{x?.nome || a.nome}</div>
                                            <div className="text-[10px] text-gray-500 truncate">{a.barbeiro ? `com ${a.barbeiro}` : ''}</div>
                                            {x?.assinante && <div className="mt-0.5"><SeloAssinante assinante={x.assinante} /></div>}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                {cedo.length > 0 && (
                    <button type="button" onClick={() => setVerCedo(v => !v)} className="text-xs text-gray-500 hover:text-gray-300 py-2">
                        {verCedo ? 'Esconder reservas mais cedo' : `Ver reservas mais cedo (${cedo.length})`}
                    </button>
                )}
            </div>

            {/* Busca única: clientes, assinantes e vale */}
            <div className="relative">
                <Search size={18} className="absolute left-3 top-3.5 text-gray-500" />
                <input value={busca} onChange={e => digitarBusca(e.target.value)} onKeyDown={semEnter()}
                    placeholder="Buscar por nome ou telefone"
                    className="w-full bg-gray-950 border border-gray-700 rounded-xl py-3 pl-10 pr-10 text-base text-gray-100 outline-none focus:border-cyan-500" />
                {busca && <button type="button" onClick={() => digitarBusca('')} aria-label="Limpar" className="absolute right-2 top-2 p-2 text-gray-500"><X size={18} /></button>}
            </div>

            {busca.trim().length >= 2 && (
                <div className="space-y-2">
                    {buscandoTel && <div className="text-sm text-gray-500">Buscando pelo telefone...</div>}
                    {resultados.map(x => (
                        <button type="button" key={x.cliente_id} onClick={() => escolher(x)}
                            className="w-full text-left bg-gray-950 border border-gray-800 hover:border-cyan-600 rounded-lg px-3 py-3 active:scale-[0.98] transition-all">
                            <div className="text-base text-gray-100 font-medium">{x.nome}</div>
                            {x.assinante && <div className="mt-0.5"><SeloAssinante assinante={x.assinante} /></div>}
                        </button>
                    ))}
                    {!buscandoTel && resultados.length === 0 && <div className="text-sm text-gray-500">Ninguém encontrado com "{busca.trim()}".</div>}
                </div>
            )}

            {/* Não achou: cadastra aqui mesmo */}
            {(busca.trim().length >= 2 || rascunho.nome || rascunho.telefone) && (
                <div className="bg-gray-950 border border-dashed border-cyan-800/60 rounded-xl p-3 space-y-2">
                    <div className="text-xs text-cyan-300 font-bold flex items-center gap-1"><UserPlus size={14} /> Não achou? Cadastre aqui</div>
                    <input value={rascunho.nome} onChange={e => onRascunho({ ...rascunho, nome: e.target.value })} onKeyDown={semEnter()}
                        placeholder="Nome do cliente"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 px-3 text-base text-gray-100 outline-none focus:border-cyan-500" />
                    <input value={rascunho.telefone} inputMode="tel" onChange={e => onRascunho({ ...rascunho, telefone: maskTelefone(e.target.value) })} onKeyDown={semEnter(cadastrar)}
                        placeholder="Telefone com DDD"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 px-3 text-base text-gray-100 outline-none focus:border-cyan-500" />
                    <button type="button" onClick={cadastrar} disabled={salvando}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg text-base disabled:opacity-50 flex items-center justify-center gap-2">
                        {salvando ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> : 'Cadastrar e usar'}
                    </button>
                    {erro && <div className="text-sm text-red-400">{erro}</div>}
                </div>
            )}

            <button type="button" onClick={() => escolher({ semCadastro: true })}
                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium py-3 rounded-lg flex items-center justify-center gap-2">
                <UserX size={16} /> Cliente não quis informar
            </button>
        </div>
    )
}
