import { useMemo, useState } from 'react'
import { Search, X, User, Phone, Clock, UserPlus, Loader2 } from 'lucide-react'
import { useAgendamentosDoDia, buscarClientePorTelefone, cadastrarClienteBalcao } from '../hooks/useClientes'
import { normalizeTelefone55, formatTelefone, semAcento } from '../utils/phone'

const UNIDADE_LABEL = { '01': 'Unidade 1', '02': 'Unidade 2' }

// value: { nome, telefone, agendamento_id, barbeiro_agendado } | null
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
                        {value.telefone && <div className="text-[10px] text-gray-500">{formatTelefone(value.telefone)}</div>}
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
            {open && (
                <PickerModal
                    unidade={unidade}
                    barbeiroNome={barbeiroNome}
                    hoje={hoje}
                    onClose={() => setOpen(false)}
                    onSelect={c => { onChange(c); setOpen(false) }}
                />
            )}
        </div>
    )
}

function PickerModal({ unidade, barbeiroNome, hoje, onClose, onSelect }) {
    const { agendamentos, loading, error } = useAgendamentosDoDia(hoje)
    const [busca, setBusca] = useState('')
    const [todasUnidades, setTodasUnidades] = useState(!unidade)
    const [modo, setModo] = useState('lista') // lista | telefone

    const lista = useMemo(() => {
        const termo = semAcento(busca)
        return agendamentos.filter(a =>
            (todasUnidades || a.unidade === unidade) &&
            (!termo || semAcento(a.nome).includes(termo))
        )
    }, [agendamentos, busca, todasUnidades, unidade])

    const buscaTemDigitos = busca.replace(/\D/g, '').length >= 8

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-gray-900 border border-gray-800 w-full sm:max-w-md max-h-[90vh] rounded-t-2xl sm:rounded-2xl flex flex-col"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <h2 className="font-bold text-gray-100">{modo === 'lista' ? 'Reservas de hoje' : 'Buscar por telefone'}</h2>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="text-gray-500 hover:text-white"><X size={20} /></button>
                </div>

                {modo === 'lista' ? (
                    <>
                        <div className="p-3 space-y-2 border-b border-gray-800">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-3 text-gray-500" />
                                <input autoFocus value={busca} onChange={e => setBusca(e.target.value)}
                                    placeholder="Buscar pelo nome"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 pl-8 pr-3 text-gray-200 outline-none focus:border-cyan-500 text-sm" />
                            </div>
                            {unidade && (
                                <button type="button" onClick={() => setTodasUnidades(v => !v)}
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
                                    onClick={() => onSelect({ nome: a.nome, telefone: a.telefone, agendamento_id: a.id, barbeiro_agendado: a.barbeiro || null })}
                                    className="w-full text-left px-4 py-3 border-b border-gray-800/60 hover:bg-cyan-950/30 flex items-center gap-3">
                                    <span className="text-cyan-400 font-mono text-sm w-12 shrink-0 flex items-center gap-1"><Clock size={12} />{a.hora}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm text-gray-100 truncate">{a.nome} — {a.hora}</span>
                                        <span className="block text-[10px] text-gray-500 truncate">
                                            {a.barbeiro ? `com ${a.barbeiro}` : ''}{todasUnidades && a.unidade ? ` · ${UNIDADE_LABEL[a.unidade] || a.unidade}` : ''}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="p-3 border-t border-gray-800 space-y-2">
                            <button type="button" onClick={() => setModo('telefone')}
                                className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm py-2.5 rounded-lg">
                                <Phone size={14} /> Não está na lista? Buscar por telefone
                            </button>
                            {busca.trim() && !buscaTemDigitos && (
                                <button type="button" onClick={() => onSelect({ nome: busca.trim(), telefone: '' })}
                                    className="w-full text-xs text-gray-500 hover:text-gray-300 py-1">
                                    Usar só o nome "{busca.trim()}" sem cadastro
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <BuscaTelefone
                        inicial={buscaTemDigitos ? busca : ''}
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

function BuscaTelefone({ inicial, unidade, barbeiroNome, onVoltar, onSelect }) {
    const [tel, setTel] = useState(inicial)
    const [estado, setEstado] = useState('idle') // idle | buscando | achou | nao_achou | salvando
    const [cliente, setCliente] = useState(null)
    const [nome, setNome] = useState('')
    const [erro, setErro] = useState('')

    const tel55 = normalizeTelefone55(tel)

    const buscar = async (e) => {
        e?.preventDefault()
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

    const cadastrar = async (e) => {
        e.preventDefault()
        if (!nome.trim()) return setErro('Informe o nome.')
        setErro('')
        setEstado('salvando')
        try {
            const c = await cadastrarClienteBalcao({ nome, telefone: tel55, unidade, barbeiro: barbeiroNome })
            onSelect({ nome: c.nome, telefone: c.telefone })
        } catch (err) {
            console.error(err)
            setErro('Erro ao cadastrar: ' + err.message)
            setEstado('nao_achou')
        }
    }

    return (
        <div className="p-4 space-y-4 overflow-y-auto">
            <form onSubmit={buscar} className="space-y-2">
                <label className="block text-xs text-gray-500">Telefone do cliente</label>
                <div className="flex gap-2">
                    <input autoFocus inputMode="tel" value={tel}
                        onChange={e => { setTel(e.target.value); setEstado('idle'); setCliente(null) }}
                        placeholder="(21) 98620-7196"
                        className="flex-1 bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-3 text-gray-200 outline-none focus:border-cyan-500" />
                    <button type="submit" disabled={estado === 'buscando'}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 rounded-lg text-sm font-bold disabled:opacity-50">
                        {estado === 'buscando' ? <Loader2 size={16} className="animate-spin" /> : 'Buscar'}
                    </button>
                </div>
                {tel55 && <div className="text-[10px] text-gray-600">Será buscado como {tel55}</div>}
            </form>

            {estado === 'achou' && cliente && (
                <button type="button" onClick={() => onSelect({ nome: cliente.nome, telefone: cliente.telefone })}
                    className="w-full text-left bg-cyan-950/30 border border-cyan-700/50 rounded-lg p-3 hover:bg-cyan-900/30">
                    <div className="text-sm text-cyan-200 font-bold">{cliente.nome}</div>
                    <div className="text-xs text-gray-500">{formatTelefone(cliente.telefone)} · toque para selecionar</div>
                </button>
            )}

            {(estado === 'nao_achou' || estado === 'salvando') && (
                <form onSubmit={cadastrar} className="space-y-2 bg-gray-950 border border-gray-800 rounded-lg p-3">
                    <div className="text-xs text-yellow-400 flex items-center gap-1"><UserPlus size={12} /> Cliente não encontrado — cadastro balcão</div>
                    <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do cliente"
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg py-2.5 px-3 text-gray-200 outline-none focus:border-cyan-500" />
                    <div className="text-xs text-gray-500">Telefone: {formatTelefone(tel55)}</div>
                    <button type="submit" disabled={estado === 'salvando'}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50">
                        {estado === 'salvando' ? 'Salvando...' : 'Cadastrar e selecionar'}
                    </button>
                </form>
            )}

            {erro && <div className="text-xs text-red-400">{erro}</div>}

            <button type="button" onClick={onVoltar} className="text-xs text-gray-500 hover:text-gray-300">← Voltar para reservas de hoje</button>
        </div>
    )
}
