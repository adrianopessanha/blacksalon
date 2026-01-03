export function calcCommission(entry, rules){
  // Se for venda de produto, calcula por item
  if (entry.type === 'product') {
    const perItem = rules?.product?.perItem || 5
    return (entry.products||0) * perItem
  }

  // Se for qualquer tipo de serviço (incluindo Assinatura e Cartão Presente),
  // calcula a comissão por porcentagem.
  if (entry.type === 'service'){
    const fee = rules.fees?.[entry.paymentMethod] ?? 0
    const base = (entry.value||0) * (1 - fee)
    return base * (rules.service?.percent ?? 0.5)
  }
  
  // Venda de plano não gera comissão para o barbeiro
  if (entry.type === 'plan-sale') {
    return 0
  }

  // Retorno padrão para outros casos
  return 0
}
