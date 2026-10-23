import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusConsulta, buscarAssinantes } from './consultaClub.js'

const hoje = new Date('2026-10-23T15:00:00Z')

test('status: ativo, vencido (balcão), recusado, cancelado; Pix manual ativo = Ativo', () => {
    assert.equal(statusConsulta({ forma: 'celcoin', status_assinatura: 'ativa', inicio_contrato: '2026-01-05' }, hoje).texto, 'Ativo')
    assert.equal(statusConsulta({ forma: 'balcao', status_assinatura: 'ativa', vencimento: '2026-10-20' }, hoje).texto, 'Vencido em 20/10/2026')
    assert.equal(statusConsulta({ forma: 'celcoin', status_assinatura: 'pagamento_recusado' }, hoje).texto, 'Cartão recusado')
    assert.equal(statusConsulta({ forma: 'celcoin', status_assinatura: 'cancelada' }, hoje).texto, 'Cancelado')
    const pix = statusConsulta({ forma: 'pix_manual', status_assinatura: 'ativa', vencimento: '2026-01-01', inicio_contrato: '2023-04-24' }, hoje)
    assert.equal(pix.texto, 'Ativo')
    assert.equal(pix.proximoVencimento, '2026-10-24')
})

test('dependente segue o pagador', () => {
    const cleyson = { nome: 'Cleyson', forma: 'balcao', status_assinatura: 'ativa', vencimento: '2026-11-18', dependente_de: { nome: 'Wallace', forma: 'celcoin', status_assinatura: 'pagamento_recusado' } }
    assert.equal(statusConsulta(cleyson, hoje).texto, 'Cartão recusado')
    const ok = { ...cleyson, dependente_de: { nome: 'Wallace', forma: 'celcoin', status_assinatura: 'ativa', inicio_contrato: '2026-06-18' } }
    const s = statusConsulta(ok, hoje)
    assert.equal(s.texto, 'Ativo')
    assert.equal(s.proximoVencimento, '2026-11-18')
})

test('busca: telefone com ou sem 55/DDD, parte do número; nome sem acento e parcial', () => {
    const lista = [{ nome: 'Andréia de Jesus', telefone: '5521964598462' }, { nome: 'Cleyson Ribeiro', telefone: '5521984120099' }]
    assert.equal(buscarAssinantes(lista, '(21) 96459-8462')[0].nome, 'Andréia de Jesus')
    assert.equal(buscarAssinantes(lista, '5521964598462').length, 1)
    assert.equal(buscarAssinantes(lista, '964598462').length, 1)
    assert.equal(buscarAssinantes(lista, '0099')[0].nome, 'Cleyson Ribeiro')
    assert.equal(buscarAssinantes(lista, 'andreia').length, 1)
    assert.equal(buscarAssinantes(lista, 'RIBEI').length, 1)
    assert.equal(buscarAssinantes(lista, 'x').length, 0)
})
