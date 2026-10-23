// Visão reduzida do assinante para os barbeiros (assinantes_publico/{código do cliente}).
// Sem telefone, valor, código de transação, status original, CPF ou e-mail.
// a e pagador trazem cliente_id (o código), calculado pela função.

const formaDe = (a) => a.forma_cobranca || (a.origem === "balcao" ? "balcao" : a.origem || "celcoin");

function visaoPublica(a, pagador = null) {
    return {
        nome: a.nome || null,
        cliente_id: a.cliente_id,
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
            cliente_id: pagador.cliente_id,
            status_assinatura: pagador.status_assinatura || null,
            forma: formaDe(pagador),
            vencimento: pagador.vencimento || null,
            inicio_contrato: pagador.inicio_contrato || null,
            ciclo_desde: pagador.ciclo_desde || null,
        } : null,
    };
}

module.exports = { visaoPublica };
