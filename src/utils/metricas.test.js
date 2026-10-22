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
    const s = sumidos(clientes, new Map([['A', { assinante: true }]]), '2026-11-01')
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
