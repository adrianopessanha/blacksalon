import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, User, Clock, UserPlus, Loader2 } from 'lucide-react'
import { useAgendamentosDoDia, useAgendamentosAtendidos, useIsAdmin, buscarClientePorTelefone, cadastrarClienteBalcao } from '../hooks/useClientes'
import { normalizeTelefone55, maskTelefone, semAcento } from '../utils/phone'

const UNIDADE_LABEL = { '01': 'Unidade 1', '02': 'Unidade 2' }

// Enter dentro do seletor nunca pode enviar o formulário do lançamento
const onEnter = (fn) => (e) => {
    if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        fn?.()
    }
}

// value: { nome, cliente_id, agendamento_id, barbeiro_agendado } | null (nunca o telefone)
export function ClientePicker({ value, onChange, unidade, barbeiroNome, hoje }) {
    const [open, setOpen] = useState(false)

    return (
        <div>
            <label className="block text-xs text-gray-500 mb-1">Cliente (opcional)</label>
            {value?.nome ? (
                <div className="flex items-center gap-2 bg-cyan-950/30 border border-cyan-800/50 rounded-lg py-2 px-3">
                    <User size={16} className="text-cyan-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm text-cyan-200 font-medium truncate">{value.nome}</div>
                    </div>
                    <button type="button" onClick={() => setOpen(true)}
                        className="text-gray-400 hover:text-cyan-300 text-xs px-2 py-0.5 rounded bg-gray-800">trocar</button>
                    <button type="button" onClick={() => onChange(null)} aria-label="Remover cliente"
                        className="text-gray-500 hover:text-red-400 p-1"><X size={14} /></button>
                </div>
            ) : (
                <button type="button" onClick={() => setOpen(true)}
                    className="w-full flex items-center gap-2 bg-gray-950 border border-gray-800 hover:border-cyan-700 rounded-lg py-2.5 px-3 text-sm text-gray-400 text-left">
                    <Search size={14} /> Selecionar cliente
                </button>
            )}
            {/* Portal: o modal fica fora do <form> do lançamento no DOM */}
            {open && createPortal(
                <PickerModal
                    unidade={unidade}
                    barbeiroNome={barbeiroNome}
                    hoje={hoje}
                    onClose={() => setOpen(false)}
                    onSelect={c => { onChange(c); setOpen(false) }}
                />,
                document.body
            )}
        </div>
    )
}

const TITULOS = { lista: 'Reservas de hoje', telefone: 'Buscar por telefone', novo: 'Novo cliente' }

function PickerModal({ unidade, barbeiroNome, hoje, onClose, onSelect }) {
    const { agendamentos, loading, error } = useAgendamentosDoDia(hoje)
    const atendidos = useAgendamentosAtendidos(hoje)
    const isAdmin = useIsAdmin()
    const [busca, setBusca] = useState('')
    const [adminVerTodas, setAdminVerTodas] = useState(true)
    const todasUnidades = !unidade || (isAdmin && adminVerTodas)
    const [mostrarAtendidos, setMostrarAtendidos] = useState(false)
    const [modo, setModo] = useState('lista') // lista | telefone | novo
    const itemRefs = useRef({})
    const rolouRef = useRef(false)

    const meuNome = semAcento(String(barbeiroNome || '').split(' ')[0])
    const ehMeu = (a) => !!meuNome && semAcento(a.barbeiro) === meuNome

    const { lista, qtdAtendidos } = useMemo(() => {
        const termo = semAcento(busca)
        const visiveis = agendamentos.filter(a =>
            (todasUnidades || a.unidade === unidade) &&
            (!termo || semAcento(a.nome).includes(termo))
        )
        const qtd = visiveis.filter(a => atendidos.has(a.id)).length
        const filtrada = mostrarAtendidos ? visiveis : visiveis.filter(a => !atendidos.has(a.id))
        // Meus primeiro, depois os outros; cada grupo por horário (já vem ordenado)
        const ordenada = [...filtrada.filter(ehMeu), ...filtrada.filter(a => !ehMeu(a))]
        return { lista: ordenada, qtdAtendidos: qtd }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agendamentos, atendidos, busca, todasUnidades, unidade, mostrarAtendidos, meuNome])

    useEffect(() => { rolouRef.current = false }, [isAdmin])

    useEffect(() => {
        if (rolouRef.current || loading || !lista.length) return
        rolouRef.current = true
        const d = new Date(Date.now() - 60 * 60 * 1000)
        const corte = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
        const alvo = lista.find(a => String(a.hora) >= corte)
        if (alvo) itemRefs.current[alvo.id]?.scrollIntoView({ block: 'start' })
    }, [loading, lista])

    const buscaDigitos = busca.replace(/\D/g, '')
    const buscaTemDigitos = buscaDigitos.length >= 8

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-gray-900 border border-gray-800 w-full sm:max-w-md max-h-[90vh] rounded-t-2xl sm:rounded-2xl flex flex-col"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <h2 className="font-bold text-gray-100">{TITULOS[modo]}</h2>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="text-gray-500 hover:text-white"><X size={20} /></button>
                </div>

                {modo === 'lista' && (
                    <>
                        <div className="p-3 space-y-2 border-b border-gray-800">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-3 text-gray-500" />
                                <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={onEnter()}
                                    placeholder="Buscar pelo nome"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 pl-8 pr-3 text-gray-200 outline-none focus:border-cyan-500 text-sm" />
                            </div>
                            {isAdmin && unidade && (
                                <button type="button" onClick={() => setAdminVerTodas(v => !v)}
                                    className={`text-xs px-3 py-1.5 rounded-full border ${todasUnidades ? 'bg-cyan-900/40 border-cyan-600 text-cyan-300' : 'border-gray-700 text-gray-400'}`}>
                                    {todasUnidades ? 'Mostrando todas as unidades' : `Só ${UNIDADE_LABEL[unidade]} · ver todas as unidades`}
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loading && <div className="p-6 text-center text-gray-500 text-sm">Carregando reservas...</div>}
                            {error && <div className="p-6 text-center text-red-400 text-sm">Erro ao carregar reservas.</div>}
                            {!loading && !error && lista.length === 0 && (
                                <div className="p-6 text-center text-gray-500 text-sm">
                                    {busca ? 'Ninguém com esse nome nas reservas de hoje.' : 'Nenhuma reserva para hoje.'}
                                </div>
                            )}
                            {lista.map(a => (
                                <button type="button" key={a.id}
                                    ref={el => { itemRefs.current[a.id] = el }}
                                    onClick={() => onSelect({ nome: a.nome, cliente_id: a.cliente_id || null, agendamento_id: a.id, barbeiro_agendado: a.barbeiro || null })}
                                    className={`w-full text-left px-4 py-3 border-b border-gray-800/60 hover:bg-cyan-950/30 flex items-center gap-3 scroll-mt-2 ${ehMeu(a) ? 'border-l-2 border-l-cyan-500 bg-cyan-950/10' : ''} ${atendidos.has(a.id) ? 'opacity-50' : ''}`}>
                                    <span className="text-cyan-400 font-mono text-sm w-12 shrink-0 flex items-center gap-1"><Clock size={12} />{a.hora}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm text-gray-100 truncate">{a.nome}</span>
                                        <span className="block text-[10px] text-gray-500 truncate">
                                            {a.barbeiro ? `com ${a.barbeiro}` : ''}{todasUnidades && a.unidade ? ` · ${UNIDADE_LABEL[a.unidade] || a.unidade}` : ''}{atendidos.has(a.id) ? ' · já atendido' : ''}
                                        </span>
                                    </span>
                                </button>
                            ))}
                            {qtdAtendidos > 0 && (
                                <button type="button" onClick={() => setMostrarAtendidos(v => !v)}
                                    className="w-full text-xs text-gray-500 hover:text-gray-300 py-3">
                                    {mostrarAtendidos ? 'Ocultar já atendidos' : `Mostrar já atendidos (${qtdAtendidos})`}
                                </button>
                            )}
                        </div>

                        <div className="p-3 border-t border-gray-800 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setModo('telefone')}
                                    className="flex items-center justify-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm py-2.5 rounded-lg">
                                    🔍 Buscar por telefone
                                </button>
                                <button type="button" onClick={() => setModo('novo')}
                                    className="flex items-center justify-center gap-1.5 bg-cyan-800/60 hover:bg-cyan-700/70 text-cyan-100 text-sm py-2.5 rounded-lg">
                                    ➕ Novo cliente
                                </button>
                            </div>
                            {busca.trim() && !buscaTemDigitos && (
                                <button type="button" onClick={() => onSelect({ nome: busca.trim(), cliente_id: null })}
                                    className="w-full text-[11px] text-gray-600 hover:text-gray-400 pt-1">
                                    usar só o nome "{busca.trim()}" sem cadastro
                                </button>
                            )}
                        </div>
                    </>
                )}

                {modo === 'telefone' && (
                    <BuscaTelefone
                        inicial={buscaTemDigitos ? busca : ''}
                        unidade={unidade}
                        barbeiroNome={barbeiroNome}
                        onVoltar={() => setModo('lista')}
                        onSelect={onSelect}
                    />
                )}

                {modo === 'novo' && (
                    <NovoCliente
                        nomeInicial={buscaTemDigitos ? '' : busca.trim()}
                        telInicial={buscaTemDigitos ? busca : ''}
                        unidade={unidade}
                        barbeiroNome={barbeiroNome}
                        onVoltar={() => setModo('lista')}
                        onSelect={onSelect}
                    />
                )}
            </div>
        </div>
    )
}

function CampoTelefone({ valor, onChange, onEnterPress, autoFocus }) {
    return (
        <input autoFocus={autoFocus} inputMode="tel" value={valor}
            onChange={e => onChange(maskTelefone(e.target.value))}
            onKeyDown={onEnter(onEnterPress)}
            placeholder="(21) 98620-7196"
            className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-3 text-gray-200 outline-none focus:border-cyan-500" />
    )
}

function BuscaTelefone({ inicial, unidade, barbeiroNome, onVoltar, onSelect }) {
    const [tel, setTel] = useState(maskTelefone(inicial))
    const [estado, setEstado] = useState('idle') // idle | buscando | achou | nao_achou
    const [cliente, setCliente] = useState(null)
    const [erro, setErro] = useState('')

    const tel55 = normalizeTelefone55(tel)

    const buscar = async () => {
        setErro('')
        if (!tel55) return setErro('Telefone inválido. Use DDD + número, ex: (21) 98620-7196.')
        setEstado('buscando')
        try {
            const c = await buscarClientePorTelefone(tel55)
            setCliente(c)
            setEstado(c ? 'achou' : 'nao_achou')
        } catch (err) {
            console.error(err)
            setErro('Erro ao buscar: ' + err.message)
            setEstado('idle')
        }
    }

    if (estado === 'nao_achou') {
        return (
            <NovoCliente telInicial={tel} unidade={unidade} barbeiroNome={barbeiroNome}
                aviso="Telefone não encontrado. Cadastre o cliente:"
                onVoltar={() => setEstado('idle')} onSelect={onSelect} />
        )
    }

    return (
        <div className="p-4 space-y-4 overflow-y-auto">
            <div className="space-y-2">
                <label className="block text-xs text-gray-500">Telefone do cliente</label>
                <div className="flex gap-2">
                    <div className="flex-1">
                        <CampoTelefone autoFocus valor={tel} onEnterPress={buscar}
                            onChange={v => { setTel(v); setEstado('idle'); setCliente(null) }} />
                    </div>
                    <button type="button" onClick={buscar} disabled={estado === 'buscando'}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 rounded-lg text-sm font-bold disabled:opacity-50">
                        {estado === 'buscando' ? <Loader2 size={16} className="animate-spin" /> : 'Buscar'}
                    </button>
                </div>
            </div>

            {estado === 'achou' && cliente && (
                <button type="button" onClick={() => onSelect({ nome: cliente.nome, cliente_id: cliente.cliente_id })}
                    className="w-full text-left bg-cyan-950/30 border border-cyan-700/50 rounded-lg p-3 hover:bg-cyan-900/30">
                    <div className="text-sm text-cyan-200 font-bold">{cliente.nome}</div>
                    <div className="text-xs text-gray-500">toque para selecionar</div>
                </button>
            )}

            {erro && <div className="text-xs text-red-400">{erro}</div>}

            <button type="button" onClick={onVoltar} className="text-xs text-gray-500 hover:text-gray-300">← Voltar para reservas de hoje</button>
        </div>
    )
}

function NovoCliente({ nomeInicial = '', telInicial = '', aviso, unidade, barbeiroNome, onVoltar, onSelect }) {
    const [nome, setNome] = useState(nomeInicial)
    const [tel, setTel] = useState(maskTelefone(telInicial))
    const [existente, setExistente] = useState(null) // cliente já cadastrado com esse telefone
    const [checando, setChecando] = useState(false)
    const [salvando, setSalvando] = useState(false)
    const [erro, setErro] = useState('')

    const tel55 = normalizeTelefone55(tel)
    const telCompleto = tel.replace(/\D/g, '').length >= 10

    // Ao completar o telefone, confere se já existe em clientes
    useEffect(() => {
        setExistente(null)
        if (!tel55) return
        let cancelado = false
        setChecando(true)
        buscarClientePorTelefone(tel55)
            .then(c => { if (!cancelado) setExistente(c) })
            .catch(err => console.error(err))
            .finally(() => { if (!cancelado) setChecando(false) })
        return () => { cancelado = true }
    }, [tel55])

    const cadastrar = async () => {
        setErro('')
        if (!nome.trim()) return setErro('Informe o nome.')
        if (!tel55) return setErro('Telefone inválido. Use DDD + número, ex: (21) 98620-7196.')
        if (existente) return
        setSalvando(true)
        try {
            const c = await cadastrarClienteBalcao({ nome, telefone: tel55, unidade, barbeiro: barbeiroNome })
            onSelect({ nome: c.nome, cliente_id: c.cliente_id })
        } catch (err) {
            console.error(err)
            setErro('Erro ao cadastrar: ' + err.message)
            setSalvando(false)
        }
    }

    return (
        <div className="p-4 space-y-3 overflow-y-auto">
            {aviso && <div className="text-xs text-yellow-400 flex items-center gap-1"><UserPlus size={12} /> {aviso}</div>}

            <div className="space-y-1">
                <label className="block text-xs text-gray-500">Nome <span className="text-red-400">*</span></label>
                <input autoFocus={!nomeInicial} value={nome} onChange={e => setNome(e.target.value)} onKeyDown={onEnter()}
                    placeholder="Nome do cliente"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-3 text-gray-200 outline-none focus:border-cyan-500" />
            </div>

            <div className="space-y-1">
                <label className="block text-xs text-gray-500">Telefone <span className="text-red-400">*</span></label>
                <CampoTelefone autoFocus={!!nomeInicial} valor={tel} onChange={setTel} onEnterPress={cadastrar} />
                {telCompleto && !tel55 && <div className="text-[11px] text-red-400">Telefone inválido.</div>}
                {checando && <div className="text-[11px] text-gray-500">Conferindo telefone...</div>}
            </div>

            {existente && (
                <div className="bg-yellow-950/30 border border-yellow-700/50 rounded-lg p-3 space-y-2">
                    <div className="text-sm text-yellow-200">Esse telefone já é do cliente <b>{existente.nome}</b>: usar esse?</div>
                    <button type="button" onClick={() => onSelect({ nome: existente.nome, cliente_id: existente.cliente_id })}
                        className="w-full bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold py-2 rounded-lg">
                        Usar {existente.nome}
                    </button>
                </div>
            )}

            {!existente && (
                <button type="button" onClick={cadastrar} disabled={salvando || checando || !nome.trim() || !tel55}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-40">
                    {salvando ? 'Salvando...' : 'Cadastrar e selecionar'}
                </button>
            )}

            {erro && <div className="text-xs text-red-400">{erro}</div>}

            <button type="button" onClick={onVoltar} className="text-xs text-gray-500 hover:text-gray-300">← Voltar</button>
        </div>
    )
}
