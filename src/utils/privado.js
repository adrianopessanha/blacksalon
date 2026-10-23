// Telefones ficam em clientes_privado/{código do cliente}, que só o admin lê.
// As telas do admin juntam o telefone em memória e seguem com a mesma lógica (chave = telefone).

export function mapasTelefone(privados) {
    const telDe = new Map() // código -> telefone
    const cidDe = new Map() // telefone -> código
    for (const p of privados) {
        if (!p.telefone) continue
        telDe.set(p.id, p.telefone)
        cidDe.set(p.telefone, p.id)
    }
    return { telDe, cidDe }
}

export const lancamentoComTelefone = (l, telDe) => ({
    ...l,
    cliente_telefone: telDe.get(l.cliente_id) || null,
    assinante_telefone: telDe.get(l.assinante_id) || null,
})

// Agendamento, cliente de vale: telefone a partir de cliente_id
export const comTelefone = (x, telDe) => ({ ...x, telefone: telDe.get(x.cliente_id) || null })
