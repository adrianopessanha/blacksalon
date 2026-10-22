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

// Textos reais da Celcoin: "Capturada na Operadora", "Paga fora do sistema",
// "Negada na Operadora", "Cancelada ao cancelar a cobrança", "Estornada", "Expirada".
function classificar(status, pagoFora) {
    const s = String(status || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (pagoFora || s.includes("paga fora")) return "baixa_manual";
    if (/capturad|aprovad/.test(s)) return "cartao_aprovado";
    if (s.includes("cancelad")) return "cancelada";
    if (/negad|recusad|erro|falh/.test(s)) return "recusado";
    return "outro";
}

function parsePagamento(body) {
    const b = body || {};
    const telefone = String(b.telefone || "").replace(/\D/g, "");
    const transacaoId = String(b.transacao_id || "").trim();
    const erros = [];
    if (!/^55\d{10,11}$/.test(telefone)) erros.push("telefone ausente ou fora do formato 55+DDD+número");
    if (!transacaoId) erros.push("transacao_id ausente");
    if (erros.length) return { ok: false, erros };

    const pagoFora = parseBool(b.pago_fora);
    const data = parseData(b.data);
    return {
        ok: true,
        id: `${telefone}_${transacaoId}`,
        telefone,
        transacaoId,
        nome: String(b.nome || "").trim() || null,
        // O Make já converte para reais; "valor" nunca é dividido aqui
        valor: parseValor(b.valor),
        plano: String(b.plano || "").trim() || null,
        status: String(b.status || "").trim() || null,
        pagoFora,
        classe: classificar(b.status, pagoFora),
        codigoCliente: String(b.codigo_cliente || "").trim() || null,
        email: String(b.email || "").trim() || null,
        documento: String(b.documento || "").trim() || null,
        dataPagamento: data,
        dataStr: data ? dataSP(data) : null,
    };
}

// Campos de clientes/{telefone} conforme o tipo de evento
function atualizacaoCliente(p) {
    const base = { telefone: p.telefone, celcoin: true };
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
    outro: "inativa", // Estornada, Expirada
};

// Campos de assinantes/{telefone}; só inclui nome/plano/valor quando vierem
function atualizacaoAssinante(p) {
    const upd = {
        telefone: p.telefone,
        origem: "celcoin",
        status_assinatura: STATUS_ASSINANTE[p.classe],
        status_original: p.status,
        codigo_cliente: p.codigoCliente,
    };
    if (p.nome) upd.nome = p.nome;
    if (p.plano) upd.plano = p.plano;
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
