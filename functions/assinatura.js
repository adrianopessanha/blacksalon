const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

function parseValor(v) {
    if (typeof v === "number") return v;
    let s = String(v || "").replace(/[^\d.,-]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

function parseBool(v) {
    return v === true || /^(true|1|sim|yes)$/i.test(String(v || "").trim());
}

// Aceita ISO ("2026-10-21T14:30:00-03:00", "2026-10-21 14:30:00") ou "21/10/2026 14:30".
// Sem fuso explícito, assume São Paulo (-03:00).
function parseData(v) {
    const s = String(v || "").trim();
    if (!s) return null;
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
    if (m) {
        const [, d, mo, y, h = "12", mi = "00"] = m;
        return new Date(`${y}-${mo}-${d}T${h.padStart(2, "0")}:${mi}:00-03:00`);
    }
    m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?(.*)$/);
    if (m) {
        const fuso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(m[3]) ? m[3] : "-03:00";
        const dt = new Date(`${m[1]}T${m[2] || "12:00"}${fuso}`);
        return isNaN(dt) ? null : dt;
    }
    const dt = new Date(s);
    return isNaN(dt) ? null : dt;
}

function dataSP(date) {
    return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const normalizar = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Status da Celcoin (cobrança, em português) e do contrato (Subscription.status, em inglês).
// Classes: baixa_manual, cartao_aprovado, recusado, cancelada (CONTRATO), cobranca_cancelada
// (só a cobrança), nova (aguardando pagamento), contrato_ativo, outro (estornada/expirada),
// evento (desconhecido: só registra, não muda o assinante).
function classificar(status, pagoFora, semTransacao = false) {
    const s = normalizar(status).replace(/[_-]/g, " ");
    if (pagoFora || s.includes("paga fora")) return "baixa_manual";
    if (/capturad|aprovad|\bpaid\b|approved|captured/.test(s)) return "cartao_aprovado";
    // Contrato: "Cancelado ao cancelar contrato", "contrato cancelado", Subscription.status "canceled"
    if (/cancelad[oa] ao cancelar (o )?contrato|contrato cancelad|^cancell?ed$|subscription cancel/.test(s)) return "cancelada";
    // Só a cobrança: "Cancelada ao cancelar a cobrança"
    if (/cancelad[oa] ao cancelar (a )?cobranca|cobranca cancelad/.test(s)) return "cobranca_cancelada";
    if (/cancelad|cancel/.test(s)) return semTransacao ? "cancelada" : "cobranca_cancelada";
    if (/negad|recusad|\berro\b|falh|denied|refused|declined|failed|rejected/.test(s)) return "recusado";
    if (/estornad|expirad|refunded|expired|chargeback/.test(s)) return "outro";
    if (/waiting ?payment|waiting|pending|aguardando|pendente|criad|\bnova\b|created/.test(s)) return "nova";
    if (/^active$|^ativ[oa]$/.test(s)) return "contrato_ativo";
    return "evento";
}

// Evento de contrato sem cobrança: campo "evento" (se vier) ou o status
function classificarSemTransacao(evento, status) {
    const e = normalizar(evento);
    if (["nova", "criada", "assinatura_nova"].includes(e)) return "nova";
    if (["cancelada", "cancelamento"].includes(e)) return "cancelada";
    if (["recusada", "recusado"].includes(e)) return "recusado";
    return classificar(status, false, true);
}
// Só https (o link vai para a mensagem de WhatsApp do cliente)
function linkValido(v) {
    const s = String(v || "").trim();
    return /^https:\/\/\S+$/i.test(s) && s.length <= 500 ? s : null;
}

function parsePagamento(body) {
    const b = body || {};
    const telefone = String(b.telefone || "").replace(/\D/g, "");
    const transacaoId = String(b.transacao_id || "").trim();
    const erros = [];
    if (!/^55\d{10,11}$/.test(telefone)) erros.push("telefone ausente ou fora do formato 55+DDD+número");
    if (!transacaoId && !String(b.status || b.evento || "").trim()) erros.push("sem transacao_id é preciso mandar status ou evento");
    if (erros.length) return { ok: false, erros };

    const pagoFora = parseBool(b.pago_fora);
    const data = parseData(b.data);
    const dataStr = data ? dataSP(data) : null;
    const semTransacao = !transacaoId;
    const classe = semTransacao ? classificarSemTransacao(b.evento, b.status) : classificar(b.status, pagoFora, false);
    const diaId = (dataStr || dataSP(new Date())).replace(/-/g, "");
    return {
        ok: true,
        // ID final: {código do cliente}_{sufixo}. Sem transação: um evento por tipo por dia (reenvio não duplica)
        sufixo: semTransacao ? `${classe}_${diaId}` : transacaoId,
        telefone,
        transacaoId: transacaoId || null,
        semTransacao,
        nome: String(b.nome || "").trim() || null,
        // O Make já converte para reais; "valor" nunca é dividido aqui
        valor: parseValor(b.valor),
        plano: String(b.plano || "").trim() || null,
        planoId: String(b.planMyId || b.plano_id || b["Subscription.planMyId"] || "").trim() || null,
        status: String(b.status || b.evento || "").trim() || null,
        pagoFora,
        classe,
        codigoCliente: String(b.codigo_cliente || "").trim() || null,
        email: String(b.email || "").trim() || null,
        documento: String(b.documento || "").trim() || null,
        // Subscription.paymentLink: link da conta do assinante para regularizar o cartão
        linkPagamento: linkValido(b.link_pagamento || b.paymentLink || b["Subscription.paymentLink"]),
        dataPagamento: data,
        dataStr,
    };
}
// Campos de clientes/{código} conforme o tipo de evento (sem telefone)
function atualizacaoCliente(p) {
    const base = { celcoin: true };
    if (p.classe === "cartao_aprovado" || p.classe === "baixa_manual") {
        return {
            ...base,
            assinante: true,
            status_assinatura: "ativa",
            plano: p.plano,
            ultimo_pagamento_assinatura: p.dataPagamento || new Date(),
        };
    }
    if (p.classe === "recusado") return { ...base, status_assinatura: "pagamento_recusado" };
    if (p.classe === "cancelada") return { ...base, assinante: false, status_assinatura: "cancelada" };
    return base;
}

const STATUS_ASSINANTE = {
    cartao_aprovado: "ativa",
    baixa_manual: "ativa",
    recusado: "pagamento_recusado",
    cancelada: "cancelada",
    nova: "aguardando_pagamento", // assinatura criada, ainda sem cobrança aprovada
    outro: "inativa", // Estornada, Expirada
    // cobranca_cancelada, contrato_ativo, evento: não mudam o status
};
const DATA_DO_EVENTO = { cancelada: "data_cancelamento", recusado: "data_recusa", nova: "data_adesao" };

// Campos de assinantes/{telefone}; só inclui nome/plano/valor quando vierem.
// planoMapa: configuracoes/planos_celcoin ({ planMyId: "Nome do plano" })
// statusAtual: status gravado hoje (para não rebaixar quem já está ativo)
function atualizacaoAssinante(p, planoMapa = {}, statusAtual = null) {
    let status = STATUS_ASSINANTE[p.classe];
    // Contrato "active" ou "waitingPayment": só marca aguardando se ainda não paga (novo, cancelado ou inativo)
    if (p.classe === "contrato_ativo" || p.classe === "nova") {
        status = !statusAtual || ["cancelada", "inativa", "aguardando_pagamento"].includes(statusAtual) ? "aguardando_pagamento" : undefined;
    }
    const upd = {
        telefone: p.telefone,
        origem: "celcoin",
        status_original: p.status,
        data_ultimo_evento: p.dataStr || dataSP(new Date()),
    };
    if (status) upd.status_assinatura = status;
    // Sem data no evento: vale a data de hoje (São Paulo)
    const dataEvento = p.dataStr || dataSP(new Date());
    if (p.classe === "cobranca_cancelada") upd.data_cobranca_cancelada = dataEvento;
    if (p.codigoCliente) upd.codigo_cliente = p.codigoCliente;
    // Link de pagamento: o mais recente vale (só admin lê assinantes; não vai para a visão pública)
    if (p.linkPagamento) { upd.link_pagamento = p.linkPagamento; upd.link_pagamento_em = dataEvento; }
    if (DATA_DO_EVENTO[p.classe]) upd[DATA_DO_EVENTO[p.classe]] = dataEvento;
    if (p.nome) upd.nome = p.nome;
    const planoDoCodigo = p.planoId ? planoMapa[p.planoId] : null;
    if (planoDoCodigo || p.plano) upd.plano = planoDoCodigo || p.plano;
    if (p.planoId) upd.plano_id = p.planoId;
    if (p.valor != null) upd.valor = p.valor;
    return upd;
}
// candidatos: [{ id, valor, dataMs }]. Só os dos últimos 7 dias; prefere valor igual, depois o mais recente.
function escolherCandidato(candidatos, valor, agoraMs) {
    const recentes = candidatos.filter((c) => c.dataMs != null && agoraMs - c.dataMs <= SETE_DIAS_MS && c.dataMs - agoraMs <= SETE_DIAS_MS);
    if (!recentes.length) return null;
    const mesmoValor = valor != null ? recentes.filter((c) => Math.abs((c.valor || 0) - valor) < 0.01) : [];
    const pool = mesmoValor.length ? mesmoValor : recentes;
    return pool.sort((a, b) => b.dataMs - a.dataMs)[0];
}

module.exports = { parsePagamento, atualizacaoCliente, atualizacaoAssinante, escolherCandidato, classificar, parseValor, parseData };
