import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarClientes, painel, sumidos, canceladosRecentes, mediana, ehVisita } from './metricas.js'

const L = (tel, iso, extra = {}) => ({ cliente_telefone: tel, data: new Date(iso), tipo: 'servico', forma_pagamento: 'Pix', valor_bruto: 40, cliente_nome: 'X', barbeiro_nome: 'Veloso Martins', ...extra })

test('visita: só serviço com telefone; pacote, produto e venda de assinatura não contam', () => {
    assert.equal(ehVisita(L('55', '2026-10-21T15:00:00Z')), true)
    assert.equal(ehVisita(L('', '2026-10-21T15:00:00Z')), false)
    for (const tipo of ['venda_assinatura', 'renovacao_celcoin', 'venda_vale', 'produto']) assert.equal(ehVisita(L('55', '2026-10-21T15:00:00Z', { tipo })), false)
})

test('dois lançamentos no mesmo dia = 1 visita; frequência = mediana dos intervalos', () => {
    const [c] = montarClientes([
        L('A', '2026-10-01T15:00:00Z'), L('A', '2026-10-01T15:05:00Z', { forma_pagamento: 'Assinante' }),
        L('A', '2026-10-15T15:00:00Z'), L('A', '2026-10-25T15:00:00Z'), L('A', '2026-11-20T15:00:00Z'),
    ])
    assert.equal(c.visitas, 4)
    assert.equal(c.frequencia, 14) // intervalos 14, 10, 26 -> mediana 14
    assert.equal(c.ultimaVisita, '2026-11-20')
})

test('painel: ativos, novos, frequência da casa e ticket só pago na hora', () => {
    const lanc = [
        L('A', '2026-11-02T15:00:00Z'), L('A', '2026-11-12T15:00:00Z'),
        L('B', '2026-11-05T15:00:00Z'),
        L('C', '2026-08-01T15:00:00Z'),
    ]
    const clientes = montarClientes(lanc)
    const mesLanc = [...lanc.slice(0, 3), L('', '2026-11-06T15:00:00Z', { valor_bruto: 100 }), L('D', '2026-11-07T15:00:00Z', { forma_pagamento: 'Assinante', valor_bruto: 0 })]
    const p = painel({ clientes, lancamentosMes: mesLanc, assinantes: [], cancelamentos: [], hoje: '2026-11-20', mes: '2026-11' })
    assert.equal(p.ativos, 2)
    assert.equal(p.novosMes, 2)
    assert.equal(p.novosQueVoltaram, 1)
    assert.equal(p.frequenciaCasa, 10)
    assert.equal(p.ticketMedio, (40 * 3 + 100) / 4)
})

test('sem cliente com 2+ visitas: frequência da casa = null (dados insuficientes)', () => {
    const p = painel({ clientes: montarClientes([L('A', '2026-11-02T15:00:00Z')]), lancamentosMes: [], assinantes: [], cancelamentos: [], hoje: '2026-11-20', mes: '2026-11' })
    assert.equal(p.frequenciaCasa, null)
    assert.equal(p.ticketMedio, null)
})

test('sumidos: frequência própria + 7 de tolerância; 1 visita usa 30 e marca estimado', () => {
    const clientes = montarClientes([
        L('A', '2026-10-01T15:00:00Z'), L('A', '2026-10-11T15:00:00Z'), // freq 10 -> prevista 21/10, limite 28/10
        L('B', '2026-10-01T15:00:00Z'), // prevista 31/10, limite 07/11
    ])
    const s = sumidos(clientes, new Map([['A', { status_assinatura: 'ativa' }]]), '2026-11-01')
    assert.equal(s.length, 1)
    assert.equal(s[0].telefone, 'A')
    assert.equal(s[0].atraso, 4)
    assert.equal(s[0].assinante, true)
    const s2 = sumidos(clientes, new Map(), '2026-11-10')
    const b = s2.find(x => x.telefone === 'B')
    assert.equal(b.estimado, true)
    assert.equal(b.atraso, 3)
})

test('cancelados recentes: últimos 30 dias e status ainda cancelada', () => {
    const assin = new Map([['A', { status_assinatura: 'cancelada' }], ['B', { status_assinatura: 'ativa' }]])
    const ev = [{ telefone: 'A', data: '2026-11-10' }, { telefone: 'B', data: '2026-11-11' }, { telefone: 'A', data: '2026-09-01' }]
    const r = canceladosRecentes(ev, assin, '2026-11-20')
    assert.deepEqual(r.map(e => e.telefone), ['A'])
})

test('mediana', () => {
    assert.equal(mediana([3, 1, 2]), 2)
    assert.equal(mediana([1, 2, 3, 4]), 2.5)
    assert.equal(mediana([]), null)
})

import { totalGasto, faltas, porBarbeiro, voltaPrevista } from './metricas.js'

test('ficha: barbeiro preferido e serviços mais feitos', () => {
    const [c] = montarClientes([
        L('A', '2026-10-01T15:00:00Z', { barbeiro_nome: 'Jonatas', servico_descricao: 'Corte maq + Barba' }),
        L('A', '2026-10-10T15:00:00Z', { barbeiro_nome: 'Jonatas', servico_descricao: 'Corte maq' }),
        L('A', '2026-10-20T15:00:00Z', { barbeiro_nome: 'Veloso', servico_descricao: 'Barba' }),
    ])
    assert.equal(c.barbeiroPreferido, 'Jonatas')
    assert.deepEqual(c.servicosMaisFeitos.slice(0, 2).map(s => s[1]), [2, 2])
    assert.deepEqual(voltaPrevista(c), { dia: '2026-10-30', estimado: false })
})

test('total gasto: serviço pago + venda de assinatura + cartão Celcoin; assinante e produto fora', () => {
    const t = totalGasto([
        L('A', '2026-10-21T15:00:00Z', { valor_bruto: 40 }),
        L('A', '2026-10-21T15:00:00Z', { forma_pagamento: 'Assinante', valor_bruto: 0 }),
        L('A', '2026-10-21T15:00:00Z', { tipo: 'produto', valor_bruto: 50 }),
        L('A', '2026-10-21T15:00:00Z', { tipo: 'renovacao_celcoin', forma_pagamento: 'Pix', valor_bruto: 140 }),
    ], [{ telefone: 'A', valor: 100 }, { telefone: 'B', valor: 80 }])
    assert.equal(t.get('A'), 280)
    assert.equal(t.get('B'), 80)
})

test('faltas: só dias passados desde 21/10/2026 e sem lançamento ligado', () => {
    const ag = [
        { id: 'a1', telefone: 'A', data: '2026-10-22' },
        { id: 'a2', telefone: 'A', data: '2026-10-23' },
        { id: 'a3', telefone: 'A', data: '2026-10-20' },
        { id: 'a4', telefone: 'A', data: '2026-10-30' },
    ]
    const f = faltas(ag, new Set(['a2']), '2026-10-25')
    assert.deepEqual(f.get('A').map(a => a.id), ['a1'])
})

test('por barbeiro: atendidos, voltaram com ele e % sem telefone', () => {
    const lanc = [
        L('A', '2026-10-01T15:00:00Z', { barbeiro_nome: 'Jonatas' }),
        L('A', '2026-10-15T15:00:00Z', { barbeiro_nome: 'Jonatas' }),
        L('B', '2026-10-15T15:00:00Z', { barbeiro_nome: 'Jonatas' }),
        L('', '2026-10-16T15:00:00Z', { barbeiro_nome: 'Jonatas', cliente_telefone: null }),
    ]
    const [j] = porBarbeiro(lanc, montarClientes(lanc), '2026-10-01')
    assert.equal(j.clientesAtendidos, 2)
    assert.equal(j.voltaramComEle, 1)
    assert.equal(j.pctSemTelefone, 25)
})

import { diasComVisita } from './metricas.js'

test('faltas: lançamento de serviço do mesmo telefone no mesmo dia conta como comparecida', () => {
    const ag = [{ id: 'x1', telefone: 'A', data: '2026-10-22' }, { id: 'x2', telefone: 'A', data: '2026-10-23' }]
    const visitas = diasComVisita([L('A', '2026-10-22T18:00:00Z'), L('A', '2026-10-23T18:00:00Z', { tipo: 'produto' })])
    const f = faltas(ag, new Set(), '2026-10-25', visitas)
    assert.deepEqual(f.get('A').map(a => a.id), ['x2'])
})
