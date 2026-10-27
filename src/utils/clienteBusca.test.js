import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarBase, buscarNaBase, reservasPendentes } from './clienteBusca.js'

const hoje = new Date('2026-10-29T15:00:00-03:00')
const base = montarBase({
    clientes: [{ id: 'c_1', nome: 'João Silva' }, { id: 'c_2', nome: 'Pedro' }],
    assinantes: [
        { cliente_id: 'c_2', nome: 'Pedro Henrique', plano: 'Corte de Cria', forma: 'celcoin', status_assinatura: 'ativa', ciclo_desde: '2026-10-05' },
        { cliente_id: 'c_3', nome: 'Márcia', plano: 'Barba', forma: 'balcao', status_assinatura: 'ativa', vencimento: '2026-10-20' },
    ],
    vales: [{ cliente_id: 'c_4', nome: 'Vale Ana' }, { cliente_id: null, nome: 'Sem código' }],
}, hoje)

test('base junta clientes, assinantes e vale, sem duplicar', () => {
    assert.equal(base.length, 4)
    const pedro = base.find(x => x.cliente_id === 'c_2')
    assert.equal(pedro.nome, 'Pedro Henrique')
    assert.equal(pedro.assinante.ativo, true)
    assert.equal(base.find(x => x.cliente_id === 'c_3').assinante.codigo, 'vencido')
})

test('busca por nome sem acento e por telefone completo (código do servidor)', () => {
    assert.deepEqual(buscarNaBase(base, 'marcia').map(x => x.cliente_id), ['c_3'])
    assert.equal(buscarNaBase(base, 'joao')[0].nome, 'João Silva')
    assert.deepEqual(buscarNaBase(base, '(21) 98620-7196', 'c_1').map(x => x.cliente_id), ['c_1'])
    assert.deepEqual(buscarNaBase(base, '21986207196', null), [])
    assert.deepEqual(buscarNaBase(base, 'x'), [])
})

test('reserva some quando o cliente já foi lançado hoje (qualquer pagamento) ou a reserva foi usada', () => {
    const ag = [
        { id: 'A', cliente_id: 'c_1', hora: '10:00', unidade: '01', barbeiro: 'Veloso' },
        { id: 'B', cliente_id: 'c_2', hora: '09:00', unidade: '01', barbeiro: 'Jonatas' },
        { id: 'C', cliente_id: 'c_5', hora: '11:00', unidade: '01', barbeiro: 'Veloso' },
        { id: 'D', cliente_id: 'c_6', hora: '08:00', unidade: '02', barbeiro: 'Veloso' },
    ]
    const r = reservasPendentes(ag, { unidade: '01', atendidosAg: new Set(['C']), atendidosCliente: new Set(['c_1']), meuNome: 'Veloso Martins' })
    assert.deepEqual(r.map(a => a.id), ['B'])
    const todos = reservasPendentes(ag, { meuNome: 'Veloso Martins' })
    assert.deepEqual(todos.map(a => a.id), ['D', 'A', 'C', 'B']) // meus primeiro, por horário
})
