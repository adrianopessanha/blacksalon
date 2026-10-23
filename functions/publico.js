// Visão reduzida do assinante para os barbeiros (assinantes_publico/{telefone}).
// Sem valor, código de transação, status original, CPF ou e-mail.

const formaDe = (a) => a.forma_cobranca || (a.origem === "balcao" ? "balcao" : a.origem || "celcoin");

function visaoPublica(a, pagador = null) {
    return {
        nome: a.nome || null,
        telefone: a.telefone,
        plano: a.plano || null,
        origem: a.origem || null,
        forma: formaDe(a),
        status_assinatura: a.status_assinatura || null,
        vencimento: a.vencimento || null,
        inicio_contrato: a.inicio_contrato || null,
        ciclo_desde: a.ciclo_desde || null,
        codigo_cliente: a.codigo_cliente || null,
        // Dependente segue o status do pagador
        dependente_de: pagador ? {
            nome: pagador.nome || null,
            telefone: pagador.telefone,
            status_assinatura: pagador.status_assinatura || null,
            forma: formaDe(pagador),
            vencimento: pagador.vencimento || null,
            inicio_contrato: pagador.inicio_contrato || null,
            ciclo_desde: pagador.ciclo_desde || null,
        } : null,
    };
}

module.exports = { visaoPublica };
