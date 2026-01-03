import { monthRange } from '../services/dates.js'
import { fetchSalesPeriod, fetchServicesPeriod } from '../services/storage.js'
import { getCommissionRules } from '../services/rules.js'

function brl(n){ return (n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) }

export function mountReportsView(root){
  const box = document.createElement('div')
  box.className = 'grid gap-6'
  box.innerHTML = `
    <div class="bg-gray-800 p-4 rounded">
      <h2 class="text-xl font-semibold mb-3">Relatórios</h2>
      <div class="flex flex-wrap gap-2 items-end">
        <div>
          <label class="text-sm text-gray-400">Ano</label>
          <select id="year" class="px-3 py-2 rounded bg-gray-900 border border-gray-700"></select>
        </div>
        <div>
          <label class="text-sm text-gray-400">Mês</label>
          <select id="month" class="px-3 py-2 rounded bg-gray-900 border border-gray-700">
            <option value="1">Jan</option><option value="2">Fev</option><option value="3">Mar</option><option value="4">Abr</option><option value="5">Mai</option><option value="6">Jun</option><option value="7">Jul</option><option value="8">Ago</option><option value="9">Set</option><option value="10">Out</option><option value="11">Nov</option><option value="12">Dez</option>
          </select>
        </div>
        <button id="go" class="px-3 py-2 rounded bg-cyan-600">Atualizar</button>
      </div>
    </div>

    <div id="dre" class="bg-gray-800 p-4 rounded"></div>
    <div id="ranking" class="bg-gray-800 p-4 rounded"></div>
    <div id="stores" class="bg-gray-800 p-4 rounded"></div>
  `
  root.appendChild(box)

  const y = box.querySelector('#year'); const m = box.querySelector('#month'); const go = box.querySelector('#go')
  const now = new Date(); const cy = now.getFullYear();
  for (let i=0;i<4;i++){ const opt=document.createElement('option'); opt.value = String(cy-i); opt.textContent=String(cy-i); y.appendChild(opt) }
  m.value = String(now.getMonth()+1)

  go.onclick = async ()=>{
    const year = parseInt(y.value); const month = parseInt(m.value)
    const { startISO, endISO } = monthRange(year, month)
    const [rules, sales, services] = await Promise.all([ getCommissionRules(), fetchSalesPeriod({startISO,endISO}), fetchServicesPeriod({startISO,endISO}) ])

    renderDRE(box.querySelector('#dre'), rules, sales, services, {year,month})
    renderRanking(box.querySelector('#ranking'), rules, services)
    renderStores(box.querySelector('#stores'), rules, sales)
  }

  go.click()
}

function renderDRE(el, rules, sales, services, {year,month}){
  // Receita bruta por natureza
  let receitaServicosAgora=0, receitaProdutos=0, receitaPlanos=0
  let taxas=0
  sales.forEach(s=>{
    // serviços pagos agora
    if (s.kind==='service-now'){
      receitaServicosAgora += s.value||0
      const fee = rules.fees?.[s.paymentMethod] ?? 0
      taxas += (s.value||0) * fee
    }
    // produtos
    if (s.kind==='product'){
      receitaProdutos += s.productSaleValue||0
      const fee = rules.fees?.[s.productPaymentMethod] ?? 0
      taxas += (s.productSaleValue||0) * fee
    }
    // venda de plano
    if (s.kind==='plan-sale'){
      receitaPlanos += s.planSaleValue||0
      const fee = rules.fees?.[s.planSalePaymentMethod] ?? 0
      taxas += (s.planSaleValue||0) * fee
    }
  })
  // Comissão (já calculada nos services)
  const comissaoTotal = services.reduce((acc,x)=> acc + (x.commission||0), 0)
  // COGS (opcional: usar s.productCost se gravado nas vendas)
  const cogs = sales.reduce((acc,s)=> acc + (s.productCostTotal||0), 0)

  const receitaBruta = receitaServicosAgora + receitaProdutos + receitaPlanos
  const resultado = receitaBruta - taxas - comissaoTotal - cogs

  el.innerHTML = `
    <h3 class="text-lg font-semibold mb-2">DRE Simplificada — ${String(month).padStart(2,'0')}/${year}</h3>
    <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="bg-gray-900/50 p-3 rounded"><div class="text-gray-400 text-sm">Serviços (à vista)</div><div class="text-xl font-bold">${brl(receitaServicosAgora)}</div></div>
      <div class="bg-gray-900/50 p-3 rounded"><div class="text-gray-400 text-sm">Produtos</div><div class="text-xl font-bold">${brl(receitaProdutos)}</div></div>
      <div class="bg-gray-900/50 p-3 rounded"><div class="text-gray-400 text-sm">Vendas de Planos</div><div class="text-xl font-bold">${brl(receitaPlanos)}</div></div>
      <div class="bg-cyan-900/40 p-3 rounded"><div class="text-cyan-200 text-sm">Receita Bruta</div><div class="text-xl font-bold text-cyan-300">${brl(receitaBruta)}</div></div>
      <div class="bg-gray-900/50 p-3 rounded"><div class="text-gray-400 text-sm">Taxas</div><div class="text-xl font-bold">${brl(taxas)}</div></div>
      <div class="bg-gray-900/50 p-3 rounded"><div class="text-gray-400 text-sm">Comissões</div><div class="text-xl font-bold">${brl(comissaoTotal)}</div></div>
      <div class="bg-gray-900/50 p-3 rounded"><div class="text-gray-400 text-sm">COGS Produtos</div><div class="text-xl font-bold">${brl(cogs)}</div></div>
      <div class="bg-green-900/40 p-3 rounded"><div class="text-green-200 text-sm">Resultado</div><div class="text-xl font-bold text-green-300">${brl(resultado)}</div></div>
    </div>
  `
}

function renderRanking(el, rules, services){
  const byBarber = {}
  services.forEach(s=>{
    if (s.type!=='service') return
    const id = s.barberId || 'unknown'
    if (!byBarber[id]) byBarber[id] = { bruto:0, atend:0, comissao:0 }
    byBarber[id].bruto += s.value||0
    byBarber[id].atend += 1
    byBarber[id].comissao += s.commission||0
  })
  const arr = Object.entries(byBarber).map(([barberId, v])=>({ barberId, ...v, ticket: v.atend? (v.bruto/v.atend):0 }))
  arr.sort((a,b)=> b.bruto - a.bruto)

  let rows = arr.map((r,i)=> `
    <tr class="border-b border-gray-700">
      <td class="px-3 py-2 text-gray-300">${i+1}</td>
      <td class="px-3 py-2 font-medium">${r.barberId}</td>
      <td class="px-3 py-2 text-right">${brl(r.bruto)}</td>
      <td class="px-3 py-2 text-right">${r.atend}</td>
      <td class="px-3 py-2 text-right">${brl(r.ticket)}</td>
      <td class="px-3 py-2 text-right">${brl(r.comissao)}</td>
    </tr>`).join('')
  if (!rows) rows = `<tr><td colspan="6" class="px-3 py-4 text-center text-gray-500">Sem dados</td></tr>`

  el.innerHTML = `
    <h3 class="text-lg font-semibold mb-2">Ranking de Barbeiros</h3>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-900/60 text-gray-400">
          <tr><th class="px-3 py-2 text-left">#</th><th class="px-3 py-2 text-left">Barbeiro</th><th class="px-3 py-2 text-right">Bruto</th><th class="px-3 py-2 text-right">Atend.</th><th class="px-3 py-2 text-right">Ticket</th><th class="px-3 py-2 text-right">Comissão</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderStores(el, rules, sales){
  const stores = {}
  sales.forEach(s=>{
    const id = s.storeId || 'desconhecida'
    if (!stores[id]) stores[id] = { cash:0,pix:0,deb:0,cred:0,total:0 }
    const add = (val, pm)=>{ if(pm==='Dinheiro') stores[id].cash += val; if(pm==='Pix') stores[id].pix += val; if(pm==='Débito') stores[id].deb += val; if(pm==='Crédito') stores[id].cred += val; stores[id].total += val }
    if (s.kind==='service-now') add(s.value||0, s.paymentMethod)
    if (s.kind==='product') add(s.productSaleValue||0, s.productPaymentMethod)
    if (s.kind==='plan-sale') add(s.planSaleValue||0, s.planSalePaymentMethod)
  })
  const arr = Object.entries(stores).map(([storeId,v])=>({storeId, ...v}))
  arr.sort((a,b)=> b.total - a.total)

  let cards = arr.map(v=> `
    <div class="bg-gray-900/50 p-3 rounded">
      <div class="text-gray-400 text-sm">${v.storeId}</div>
      <div class="text-xl font-bold">${brl(v.total)}</div>
      <div class="text-xs text-gray-400 mt-1">${brl(v.cash)} • ${brl(v.pix)} • ${brl(v.deb)} • ${brl(v.cred)}</div>
    </div>`).join('')
  if (!cards) cards = `<div class="text-gray-500">Sem dados</div>`

  el.innerHTML = `
    <h3 class="text-lg font-semibold mb-2">Comparativo por Loja</h3>
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">${cards}</div>
  `
}
