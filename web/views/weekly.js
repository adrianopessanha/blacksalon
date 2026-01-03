import { getCommissionRules } from '../services/rules.js'
import { calcCommission } from '../services/commission.js'
import { recordService } from '../services/storage.js'
import { todayISO } from '../services/dates.js'

export function mountWeeklyView(root){
  const wrap = document.createElement('div')
  wrap.className = 'grid gap-4'
  wrap.innerHTML = `
    <div class="bg-gray-800 p-4 rounded">
      <h2 class="text-xl font-semibold mb-3">Registar Serviço</h2>
      <div class="grid md:grid-cols-3 gap-2">
        <input id="client" placeholder="Cliente (opcional)" class="px-3 py-2 rounded bg-gray-900 border border-gray-700"/>
        <input id="desc" placeholder="Descrição" class="px-3 py-2 rounded bg-gray-900 border border-gray-700"/>
        <input id="value" type="number" placeholder="Valor (R$)" class="px-3 py-2 rounded bg-gray-900 border border-gray-700"/>
        <select id="pm" class="px-3 py-2 rounded bg-gray-900 border border-gray-700">
          <option>Dinheiro</option><option>Pix</option><option>Débito</option><option>Crédito</option><option>Assinatura</option><option>Cartão Presente</option>
        </select>
        <input id="barber" placeholder="Barber ID (ex: barber-02)" class="px-3 py-2 rounded bg-gray-900 border border-gray-700"/>
        <button id="save" class="px-3 py-2 rounded bg-cyan-600">Salvar</button>
      </div>
      <div id="out" class="text-sm text-gray-400 mt-2"></div>
    </div>
  `

  root.appendChild(wrap)

  const client = wrap.querySelector('#client')
  const desc = wrap.querySelector('#desc')
  const value = wrap.querySelector('#value')
  const pm = wrap.querySelector('#pm')
  const barber = wrap.querySelector('#barber')
  const out = wrap.querySelector('#out')

  wrap.querySelector('#save').onclick = async ()=>{
    const v = parseFloat(value.value||'0')
    if (!desc.value || !(v>0) || !pm.value || !barber.value) { alert('Preencha descrição, valor, método e barberId'); return }
    const rules = await getCommissionRules()
    const commission = calcCommission({type:'service', paymentMethod: pm.value, value:v}, rules)

    await recordService({ barberId: barber.value, payload: { type: 'service', isoDate: todayISO(), clientName: client.value||'', serviceDescription: desc.value, value: v, paymentMethod: pm.value, commission } })

    out.textContent = `Comissão calculada: R$ ${commission.toFixed(2)}`
    client.value = ''; desc.value = ''; value.value = ''
  }
}
