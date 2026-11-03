import { useState } from 'react'
import { UserPlus, Phone, History } from 'lucide-react'
import { chamarFuncao } from '../firebase'
import { PLANOS } from '../utils/assinaturas'
import { formatTelefone, semAcento } from '../utils/phone'

// Edição do assinante (só admin, aba Assinaturas). Tudo passa pelas funções, que gravam o histórico.
const FORMAS = [['celcoin', 'Celcoin'], ['balcao', 'Balcão'], ['pix_manual', 'Pix manual']]
const STATUS = [['ativa', 'Ativa'], ['pagamento_recusado', 'Cartão recusado'], ['vencido', 'Vencida'], ['cancelada', 'Cancelada'], ['aguardando_pagamento', 'Aguardando pagamento'], ['inativa', 'Inativa']]
const ROTULO_CAMPO = {
    nome: 'Nome', telefone: 'Telefone', plano: 'Plano', inicio_contrato: 'Início do contrato', ciclo_desde: 'Início do ciclo',
    valor: 'Valor', forma_cobranca: 'Forma de pagamento', status_assinatura: 'Status', pagador: 'Pagador', observacao: 'Observação',
    vencimento: 'Vencimento', criado: 'Cadastro',
}
const INPUT = 'w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-base text-gray-200 outline-none focus:border-cyan-600'

const ehDependenteSemTelefone = (id) => /-dep\d+$/.test(String(id || ''))
const formaDe = (a) => a.forma_cobranca || (a.origem === 'balcao' ? 'balcao' : a.origem || 'celcoin')
const inicial = (c) => ({
    nome: c.nome || '', plano: c.plano || '', inicio_contrato: c.inicio_contrato || '', ciclo_desde: c.ciclo_desde || '',
    valor: c.valor ?? '', forma_cobranca: formaDe(c), status_assinatura: c.status_assinatura || '', pagador: c.pagador || '', observacao: c.observacao || '',
})
const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

function Campo({ rotulo, children }) {
    return <label className="block space-y-1"><span className="text-gray-500">{rotulo}</span>{children}</label>
}

export function EditarAssinante({ id, cadastro, assinantes, onMudou, onFechar }) {
    const dep = ehDependenteSemTelefone(id)
    const base = inicial(cadastro)
    const [form, setForm] = useState(base)
    const [salvando, setSalvando] = useState(false)
    const [erro, setErro] = useState(null)
    const [telNovo, setTelNovo] = useState('')
    const [resumoTroca, setResumoTroca] = useState(null)
    const mudou = Object.keys(form).filter(k => String(form[k] ?? '') !== String(base[k] ?? ''))
    const muda = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
    const nomeDe = (tel) => assinantes.find(a => a.telefone === tel)?.nome || formatTelefone(tel)

    const rodar = async (fn) => {
        setSalvando(true); setErro(null)
        try { await fn() } catch (e) { setErro(e.message) } finally { setSalvando(false) }
    }
    const salvar = () => rodar(async () => {
        await chamarFuncao('editarAssinante', { id, campos: Object.fromEntries(mudou.map(k => [k, form[k]])) })
        onMudou()
        onFechar()
    })
    const verTroca = () => rodar(async () => setResumoTroca((await chamarFuncao('trocarTelefoneAssinante', { de: id, para: telNovo })).resumo))
    const confirmarTroca = () => rodar(async () => {
        await chamarFuncao('trocarTelefoneAssinante', { de: id, para: telNovo, confirmar: true })
        onMudou()
        onFechar()
    })
    const historico = [...(cadastro.historico_edicoes || [])].reverse().slice(0, 12)

    return (
        <div className="mt-2 bg-gray-950/60 border border-cyan-900/60 rounded-xl p-3 space-y-3 text-xs">
            <div className="text-sm font-bold text-cyan-300">Editar {cadastro.nome}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo rotulo="Nome"><input value={form.nome} onChange={muda('nome')} className={INPUT} /></Campo>
                <Campo rotulo="Plano">
                    <input value={form.plano} onChange={muda('plano')} list="planos-assinatura" className={INPUT} />
                    <datalist id="planos-assinatura">{PLANOS.filter(p => p.id !== 'r80').map(p => <option key={p.id} value={p.label} />)}</datalist>
                </Campo>
                <Campo rotulo="Início do contrato"><input type="date" value={form.inicio_contrato} onChange={muda('inicio_contrato')} className={INPUT} /></Campo>
                {!dep && <>
                    <Campo rotulo="Início do ciclo (dia da cobrança)"><input type="date" value={form.ciclo_desde} onChange={muda('ciclo_desde')} className={INPUT} /></Campo>
                    <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={form.valor} onChange={muda('valor')} className={INPUT} /></Campo>
                    <Campo rotulo="Forma de pagamento">
                        <select value={form.forma_cobranca} onChange={muda('forma_cobranca')} className={INPUT}>
                            {FORMAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                        </select>
                    </Campo>
                    <Campo rotulo="Status">
                        <select value={form.status_assinatura} onChange={muda('status_assinatura')} className={INPUT}>
                            {!form.status_assinatura && <option value="">—</option>}
                            {STATUS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                        </select>
                    </Campo>
                </>}
            </div>
            {dep
                ? <div className="text-gray-400">Dependente sem telefone: status, ciclo e cobrança seguem <b className="text-gray-200">{nomeDe(cadastro.pagador)}</b>.</div>
                : <PagadorBusca id={id} pagador={form.pagador} assinantes={assinantes} salvando={salvando} onDefinir={tel => setForm(f => ({ ...f, pagador: tel || '' }))} />}
            <Campo rotulo="Observação"><textarea value={form.observacao} onChange={muda('observacao')} rows={2} className={INPUT} /></Campo>

            {erro && <div className="text-red-400 text-sm">{erro}</div>}
            <div className="flex gap-2">
                <button type="button" disabled={salvando || !mudou.length} onClick={salvar}
                    className="flex-1 bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-bold py-2.5 rounded-lg disabled:opacity-40">
                    {salvando ? 'Salvando...' : mudou.length ? `Salvar (${mudou.length} ${mudou.length === 1 ? 'campo' : 'campos'})` : 'Nada mudou'}
                </button>
                <button type="button" onClick={onFechar} className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg">Fechar</button>
            </div>

            {!dep && (
                <div className="border-t border-gray-800 pt-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-gray-400"><Phone size={13} /> Trocar telefone (atual: {formatTelefone(id)})</div>
                    <div className="flex gap-2">
                        <input value={telNovo} onChange={e => { setTelNovo(e.target.value); setResumoTroca(null) }} inputMode="tel" placeholder="DDD + número novo" className={INPUT} />
                        <button type="button" disabled={salvando || telNovo.replace(/\D/g, '').length < 10} onClick={verTroca}
                            className="shrink-0 px-3 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg disabled:opacity-40">Ver o que muda</button>
                    </div>
                    {resumoTroca && (
                        <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-2.5 space-y-1.5 text-amber-100">
                            <div>{resumoTroca.nome}: {formatTelefone(resumoTroca.de)} → <b>{formatTelefone(resumoTroca.para)}</b>. Vai mover:</div>
                            <ul className="list-disc ml-4 text-amber-200/90">
                                <li>{resumoTroca.lancamentos} lançamento(s)</li>
                                <li>{resumoTroca.pagamentos} pagamento(s) da Celcoin</li>
                                <li>{resumoTroca.agendamentos} reserva(s) do Booksy</li>
                                {resumoTroca.vales > 0 && <li>{resumoTroca.vales} cliente(s) de vale</li>}
                                <li>Cadastro de cliente (pesquisa e histórico): {resumoTroca.cadastro_cliente ? (resumoTroca.cliente_novo_existe ? 'junta com o que já existe no número novo' : 'sim') : 'não tem'}</li>
                                {resumoTroca.dependentes.length > 0 && <li>Dependentes: {resumoTroca.dependentes.join(', ')}</li>}
                            </ul>
                            <div className="text-amber-200/70">O número antigo continua encontrando o assinante (busca, Booksy e Celcoin).</div>
                            <button type="button" disabled={salvando} onClick={confirmarTroca}
                                className="w-full bg-amber-700 hover:bg-amber-600 text-white text-sm font-bold py-2.5 rounded-lg disabled:opacity-40">
                                {salvando ? 'Movendo...' : 'Confirmar troca de telefone'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {historico.length > 0 && (
                <div className="border-t border-gray-800 pt-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-gray-400"><History size={13} /> Histórico de edições</div>
                    {historico.map((h, i) => (
                        <div key={i} className="text-gray-500">
                            <span className="text-gray-400">{quando(h.em)}</span> · {String(h.por || '').split('@')[0]} · {ROTULO_CAMPO[h.campo] || h.campo}: {h.antes == null || h.antes === '' ? '—' : String(h.antes)} → <span className="text-gray-300">{h.depois == null || h.depois === '' ? '—' : String(h.depois)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// Pagador (casal/família) por busca, no lugar da lista com todos os nomes
export function PagadorBusca({ id, pagador, assinantes, salvando, onDefinir }) {
    const [busca, setBusca] = useState('')
    const atual = pagador ? assinantes.find(a => a.telefone === pagador) : null
    const termo = semAcento(busca.trim())
    const opcoes = termo.length >= 2
        ? assinantes.filter(a => a.telefone !== id && !a.pagador && semAcento(a.nome).includes(termo)).slice(0, 6)
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
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={atual ? 'Trocar pagador: buscar pelo nome' : 'Buscar pagador pelo nome'} className={INPUT} />
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

// Filho (ou outra pessoa) sem telefone próprio: entra como dependente do pagador
export function AdicionarDependente({ pagador, onMudou }) {
    const [aberto, setAberto] = useState(false)
    const [nome, setNome] = useState('')
    const [plano, setPlano] = useState('Corte de Cria')
    const [salvando, setSalvando] = useState(false)
    const [erro, setErro] = useState(null)
    const criar = async () => {
        setSalvando(true); setErro(null)
        try {
            await chamarFuncao('adicionarDependente', { pagador, nome, plano })
            setNome(''); setAberto(false); onMudou()
        } catch (e) { setErro(e.message) } finally { setSalvando(false) }
    }
    if (!aberto) {
        return (
            <button type="button" onClick={() => setAberto(true)} className="flex items-center gap-1.5 text-cyan-400 underline">
                <UserPlus size={13} /> Adicionar dependente (sem telefone próprio)
            </button>
        )
    }
    return (
        <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3 space-y-2">
            <div className="text-gray-400">Dependente: usa o plano junto com o pagador e segue o status dele. Não precisa de telefone.</div>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do dependente" className={INPUT} />
            <select value={plano} onChange={e => setPlano(e.target.value)} className={INPUT}>
                {PLANOS.filter(p => !['r80', 'cria_x2'].includes(p.id)).map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
            </select>
            {erro && <div className="text-red-400 text-sm">{erro}</div>}
            <div className="flex gap-2">
                <button type="button" disabled={salvando || !nome.trim()} onClick={criar}
                    className="flex-1 bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-bold py-2.5 rounded-lg disabled:opacity-40">{salvando ? 'Criando...' : 'Criar dependente'}</button>
                <button type="button" onClick={() => setAberto(false)} className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg">Cancelar</button>
            </div>
        </div>
    )
}
