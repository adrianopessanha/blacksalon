import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapasTelefone, lancamentoComTelefone, comTelefone } from './privado.js'

test('admin: junta o telefone pelo código, nos dois sentidos', () => {
    const { telDe, cidDe } = mapasTelefone([{ id: 'c_a', telefone: '5521986207196' }, { id: 'c_b' }])
    assert.equal(telDe.get('c_a'), '5521986207196')
    assert.equal(cidDe.get('5521986207196'), 'c_a')
    assert.equal(telDe.has('c_b'), false)

    const l = lancamentoComTelefone({ id: 'L1', cliente_id: 'c_a', assinante_id: null }, telDe)
    assert.equal(l.cliente_telefone, '5521986207196')
    assert.equal(l.assinante_telefone, null)
    assert.equal(lancamentoComTelefone({ cliente_id: null }, telDe).cliente_telefone, null)
    assert.equal(comTelefone({ nome: 'Ana', cliente_id: 'c_a' }, telDe).telefone, '5521986207196')
})
