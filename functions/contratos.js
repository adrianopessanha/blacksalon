// Contratos do assinante: assinantes/{telefone}.contratos = [{ id, forma, origem, inicio, ciclo_desde, plano, valor,
// status_assinatura, fim, ... }]. O status do assinante é o do contrato MAIS RECENTE; os campos de cima do documento
// (status_assinatura, plano, valor, forma_cobranca, origem, ciclo_desde, vencimento...) são uma cópia dele, para as
// telas e a visão do barbeiro seguirem lendo o mesmo de antes.
// Contrato encerrado nunca é apagado nem reaproveitado: fica no histórico (contagem de cancelados por mês).
//
// status_assinatura do contrato: ativa | pagamento_recusado | vencido | aguardando_pagamento | inativa |
//   cancelada (cancelamento) | encerrado (substituído por uma renovação no balcão; não conta como cancelamento)

const { vencimentoDe } = require("./balcao");

const ENCERRADOS = ["cancelada", "encerrado"];
const formaDe = (a) => a.forma_cobranca || (a.origem === "balcao" ? "balcao" : a.origem || "celcoin");

// Mais recente = maior início; empate: o criado por último
function indiceAtual(contratos) {
    let k = -1;
    (contratos || []).forEach((c, i) => {
        if (k < 0) { k = i; return; }
        const a = contratos[k];
        if (String(c.inicio || "") > String(a.inicio || "") || (String(c.inicio || "") === String(a.inicio || "") && String(c.criado_em || "") >= String(a.criado_em || ""))) k = i;
    });
    return k;
}
const contratoAtual = (contratos) => { const k = indiceAtual(contratos); return k >= 0 ? contratos[k] : null; };
const proximoId = (contratos) => `c${(contratos || []).reduce((m, c) => Math.max(m, Number(String(c.id).slice(1)) || 0), 0) + 1}`;

// Cópia do contrato atual no topo do documento
function espelho(contratos) {
    const c = contratoAtual(contratos);
    if (!c) return {};
    return {
        contrato_atual: c.id,
        status_assinatura: c.status_assinatura ?? null,
        status_original: c.status_original ?? null,
        forma_cobranca: c.forma,
        origem: c.origem || c.forma,
        ciclo_desde: c.ciclo_desde || c.inicio || null,
        vencimento: c.vencimento ?? null,
        data_cancelamento: c.status_assinatura === "cancelada" ? c.fim || null : null,
        data_recusa: c.data_recusa ?? null,
        ...(c.plano ? { plano: c.plano } : {}),
        ...(c.valor != null ? { valor: c.valor } : {}),
        // "Assinante desde": o início do primeiro contrato
        inicio_contrato: contratos.map((x) => x.inicio).filter(Boolean).sort()[0] || null,
    };
}

// Migração: o cadastro de hoje vira um contrato só
function contratosIniciais(a, agoraISO) {
    if (a.contratos) return a.contratos;
    const forma = formaDe(a);
    return [{
        id: "c1",
        forma,
        origem: a.origem || forma,
        celcoin_assinatura: null,
        inicio: a.inicio_contrato || a.ciclo_desde || null,
        ciclo_desde: a.ciclo_desde || null,
        vencimento: a.vencimento ?? null,
        plano: a.plano || null,
        valor: a.valor ?? null,
        status_assinatura: a.status_assinatura ?? null,
        status_original: a.status_original ?? null,
        data_recusa: a.data_recusa ?? null,
        fim: a.status_assinatura === "cancelada" ? a.data_cancelamento || null : null,
        status_evento_em: a.status_evento_em ?? null,
        ultimo_aprovado_em: a.ultimo_aprovado_em ?? null,
        ultimo_aprovado_tx: a.ultimo_aprovado_tx ?? null,
        criado_em: agoraISO,
        migrado: true,
    }];
}

// Venda de assinatura no balcão: SEMPRE um contrato novo (data e ciclo novos). O contrato de balcão anterior que
// ainda valia fica "encerrado" (renovado); contrato cancelado nunca é reaproveitado.
// Abacatepay: só admin renova e o contrato novo mantém a origem.
function vendaBalcao({ contratos, admin, plano, valor, hoje, agoraISO }) {
    const lista = (contratos || []).map((c) => ({ ...c }));
    const atual = contratoAtual(lista);
    if (atual && atual.origem === "abacatepay" && !admin) return { resultado: "bloqueado", origem: "abacatepay", contratos: null };
    let aviso = null;
    if (atual && !ENCERRADOS.includes(atual.status_assinatura)) {
        if (atual.forma === "balcao") Object.assign(atual, { status_assinatura: "encerrado", fim: hoje, motivo_fim: "renovado" });
        else if (atual.forma === "celcoin" && atual.status_assinatura === "ativa") aviso = "celcoin_ativo";
    }
    const origem = atual && atual.origem === "abacatepay" ? "abacatepay" : "balcao";
    lista.push({
        id: proximoId(lista),
        forma: "balcao",
        origem,
        celcoin_assinatura: null,
        inicio: hoje,
        ciclo_desde: hoje,
        vencimento: vencimentoDe(hoje),
        plano,
        valor,
        status_assinatura: "ativa",
        status_original: "Paga fora do sistema",
        fim: null,
        criado_em: agoraISO,
    });
    return { resultado: atual ? "novo_contrato" : "criado", origem, aviso, contratos: lista };
}

// Evento da Celcoin: em qual contrato ele cai. Com o número da assinatura, o contrato daquele número (número
// novo = contrato novo). Sem número: o contrato Celcoin mais recente iniciado até a data do evento; se ele já
// terminou e o evento é de início/pagamento depois do fim, é uma assinatura nova. Nunca cai em contrato de balcão.
const INICIO = ["nova", "contrato_ativo", "cartao_aprovado", "baixa_manual"];
// Cancelamento, estorno ou evento desconhecido nunca abrem contrato
const PODE_CRIAR = [...INICIO, "recusado"];
function contratoDoEventoCelcoin(contratos, { assinaturaId, classe, dataStr }) {
    const lista = contratos || [];
    const celcoin = lista.map((c, i) => ({ c, i })).filter((x) => x.c.forma === "celcoin");
    const criar = PODE_CRIAR.includes(classe) ? { indice: -1, criar: true } : { indice: -1, criar: false };
    if (assinaturaId) {
        const achado = celcoin.find((x) => x.c.celcoin_assinatura === assinaturaId);
        if (achado) return { indice: achado.i, criar: false };
        // Contrato migrado sem número e ainda valendo: é ele (ganha o número)
        const semNumero = celcoin.filter((x) => !x.c.celcoin_assinatura && !ENCERRADOS.includes(x.c.status_assinatura));
        if (semNumero.length === 1) return { indice: semNumero[0].i, criar: false, gravarNumero: true };
        return criar;
    }
    const antes = celcoin.filter((x) => !x.c.inicio || !dataStr || x.c.inicio <= dataStr)
        .sort((a, b) => String(a.c.inicio || "").localeCompare(String(b.c.inicio || "")));
    const ultimo = antes[antes.length - 1] || celcoin[celcoin.length - 1];
    if (!ultimo) return criar;
    const terminou = ENCERRADOS.includes(ultimo.c.status_assinatura) && (!ultimo.c.fim || !dataStr || dataStr > ultimo.c.fim);
    if (terminou && INICIO.includes(classe)) return { indice: -1, criar: true };
    return { indice: ultimo.i, criar: false };
}

function novoContratoCelcoin({ contratos, assinaturaId, dataStr, agoraISO }) {
    return {
        id: proximoId(contratos),
        forma: "celcoin",
        origem: "celcoin",
        celcoin_assinatura: assinaturaId || null,
        inicio: dataStr,
        ciclo_desde: dataStr,
        vencimento: null,
        plano: null,
        valor: null,
        status_assinatura: null,
        fim: null,
        criado_em: agoraISO,
    };
}

// Campos do update do assinante (atualizacaoAssinante) que pertencem ao contrato
function aplicarNoContrato(contrato, upd) {
    const c = { ...contrato };
    for (const k of ["status_assinatura", "status_original", "data_recusa", "data_adesao", "data_cobranca_cancelada", "valor"]) {
        if (upd[k] !== undefined) c[k] = upd[k];
    }
    if (upd.plano && !c.plano) c.plano = upd.plano;
    if (upd.data_cancelamento !== undefined) c.fim = upd.data_cancelamento;
    if (upd.status_assinatura && upd.status_assinatura !== "cancelada" && ENCERRADOS.includes(contrato.status_assinatura)) c.fim = null;
    return c;
}

// Cancelados no mês: contratos cancelados (não os "encerrados" por renovação) com fim no mês
const canceladosNoMes = (assinantes, mes) => assinantes.filter((a) => (a.contratos || []).some((c) => c.status_assinatura === "cancelada" && String(c.fim || "").startsWith(mes))).length;

module.exports = {
    ENCERRADOS, contratoAtual, indiceAtual, proximoId, espelho, contratosIniciais, vendaBalcao,
    contratoDoEventoCelcoin, novoContratoCelcoin, aplicarNoContrato, canceladosNoMes, formaDe,
};
