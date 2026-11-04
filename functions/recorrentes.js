// Contas recorrentes do Financeiro (contas_recorrentes): gera a conta de cada mês em financeiro como "a pagar".
// ID da conta gerada: rec_{id da recorrência}_{AAAA-MM} (gerar de novo nunca duplica).

const addMeses = (mes, k) => {
    const [y, m] = mes.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7);
};

function ativaNoMes(rec, mes) {
    if (rec.ativa === false && (!rec.encerrada_em || mes > rec.encerrada_em)) return false;
    if (!rec.inicio || mes < rec.inicio) return false;
    if (rec.meses && mes > addMeses(rec.inicio, Number(rec.meses) - 1)) return false;
    if (rec.encerrada_em && mes > rec.encerrada_em) return false;
    return !(rec.pulados || []).includes(mes);
}

// Dia de vencimento que não existe no mês (31 em fevereiro) cai no último dia
function vencimentoNoMes(mes, dia) {
    const [y, m] = mes.split("-").map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${mes}-${String(Math.min(Math.max(1, Number(dia) || 1), ultimo)).padStart(2, "0")}`;
}

// valorAnterior: quanto foi pago no mês anterior (conta variável usa como previsão)
function contaDoMes(rec, mes, valorAnterior = null) {
    if (!ativaNoMes(rec, mes)) return null;
    const previsto = rec.valor_tipo === "estimado" && valorAnterior > 0 ? valorAnterior : Number(rec.valor) || 0;
    const venc = vencimentoNoMes(mes, rec.dia_vencimento);
    return {
        id: `rec_${rec.id}_${mes}`,
        dados: {
            description: rec.nome,
            amount: previsto,
            valor_previsto: previsto,
            categoria: rec.categoria,
            finance_category: rec.finance_category,
            store_id: rec.loja,
            forma_pagamento: rec.forma_pagamento || null,
            status: "pendente",
            date: venc,
            due_date: venc,
            payment_date: null,
            competence_month: mes,
            recorrencia_id: rec.id,
            valor_tipo: rec.valor_tipo || "fixo",
            source: "recorrente",
        },
    };
}

// Mês atual sempre; o seguinte na última semana do mês (para aparecer em "próximos 7 dias")
function mesesParaGerar(hojeISO) {
    const mes = hojeISO.slice(0, 7);
    const [y, m, d] = hojeISO.split("-").map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return d > ultimo - 7 ? [mes, addMeses(mes, 1)] : [mes];
}

module.exports = { contaDoMes, ativaNoMes, vencimentoNoMes, mesesParaGerar, addMeses };
