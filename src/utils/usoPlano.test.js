import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoUsoPlano, servicosDoPlano } from './usoPlano.js'
import { alertasDoCiclo } from './assinaturas.js'

const CID = 'c_aaaaaaaaaaaaaaaaaaaa'
const visita = (iso, desc = 'Corte maq plano', barbeiro = 'Veloso Martins') =>
    ({ data: new Date(iso + 'T15:00:00-03:00'), cliente_id: CID, forma_pagamento: 'Assinante', tipo: 'servico', servico_descricao: desc, barbeiro_nome: barbeiro })
const cria = { cliente_id: CID, nome: 'Ana', plano: 'Corte de Cria', forma: 'celcoin', status_assinatura: 'ativa', ciclo_desde: '2026-10-05' }
const quinta = new Date('2026-10-29T15:00:00-03:00') // semana de domingo 25/10 a sábado 31/10

test('já usou nesta semana: avisa com dia, data e barbeiro', () => {
    const r = avisoUsoPlano({ assinante: cria, lancamentos: [visita('2026-10-27')], hoje: quinta })
    assert.equal(r.tipo, 'mesma_semana')
    assert.match(r.texto, /Ana já usou o plano nesta semana \(terça-feira, 27\/10, com Veloso\)/)
    assert.equal(avisoUsoPlano({ assinante: cria, lancamentos: [visita('2026-10-20')], hoje: quinta }), null)
})

test('mesmo dia (atendimento lançado em 2 partes) não é outra visita', () => {
    assert.equal(avisoUsoPlano({ assinante: cria, lancamentos: [visita('2026-10-29')], hoje: quinta }), null)
})

test('Cabelo e Barba: barba num dia e cabelo noutro na mesma semana não avisa', () => {
    const cb = { ...cria, plano: 'Cabelo e Barba' }
    const lanc = [visita('2026-10-27', 'Barba plano')]
    assert.equal(avisoUsoPlano({ assinante: cb, lancamentos: lanc, hoje: quinta }), null) // ainda não sabe o serviço
    assert.equal(avisoUsoPlano({ assinante: cb, lancamentos: lanc, hoje: quinta, servico: 'Corte maq plano' }), null)
    assert.equal(avisoUsoPlano({ assinante: cb, lancamentos: lanc, hoje: quinta, servico: 'Barba plano' }).tipo, 'mesma_semana')
})

test('6ª visita no ciclo: avisa', () => {
    const a = { ...cria, ciclo_desde: '2026-10-03' } // ciclo 03/10 a 02/11
    const lanc = ['2026-10-03', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'].map(d => visita(d))
    const r = avisoUsoPlano({ assinante: a, lancamentos: lanc, hoje: new Date('2026-11-01T15:00:00-03:00') })
    assert.equal(r.tipo, 'mais_de_5')
    assert.match(r.texto, /já fez 5 visitas neste ciclo \(03\/10 a 02\/11\)/)
})

test('liga pelo código, assinante_id ou nome; ignora outro cliente e pagamento avulso', () => {
    const outro = { ...visita('2026-10-27'), cliente_id: 'c_bbbbbbbbbbbbbbbbbbbb' }
    const avulso = { ...visita('2026-10-27'), forma_pagamento: 'Pix' }
    assert.equal(avisoUsoPlano({ assinante: cria, lancamentos: [outro, avulso], hoje: quinta }), null)
    const soNome = { ...visita('2026-10-27'), cliente_id: null, cliente_nome: 'ana' }
    assert.equal(avisoUsoPlano({ assinante: cria, lancamentos: [soNome], hoje: quinta }).tipo, 'mesma_semana')
})

test('serviços do plano', () => {
    assert.deepEqual(servicosDoPlano({ plano: 'Corte de Cria' }), ['M plano', 'B plano'])
    assert.deepEqual(servicosDoPlano({ plano: 'Barba Ilimitada' }), ['B plano'])
    assert.ok(servicosDoPlano({ plano: 'Cabelo e Barba' }).includes('C+B plano'))
})

test('exceção lançada aparece nos alertas da aba Assinaturas com o barbeiro', () => {
    const l = { ...visita('2026-10-29'), excecao_plano: { tipo: 'mesma_semana' } }
    const al = alertasDoCiclo({ status_assinatura: 'ativa' }, [], [{ l }], quinta)
    assert.equal(al[0].tipo, 'excecao_lancada')
    assert.match(al[0].texto, /por Veloso Martins/)
})
