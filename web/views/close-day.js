import { closeDay } from '../services/storage.js'

export function mountCloseDayView(root){
  const wrap = document.createElement('div')
  wrap.className = 'grid gap-4'
  wrap.innerHTML = `
    <div class="bg-gray-800 p-4 rounded">
      <h2 class="text-xl font-semibold mb-3">Fechar Caixa (Dia)</h2>
      <div class="grid md:grid-cols-5 gap-2">
        <input id="store" placeholder="Loja (ex: loja01)" class="px-3 py-2 rounded bg-gray-900 border border-gray-700"/>
        <input id="cash" type="number" placeholder="Dinheiro contado" class="px-3 py-2 rounded bg-gray-900 border border-gray-700"/>
        <input id="pix" type="number" placeholder="Pix contado" class="px-3 py-2 rounded bg-gray-900 border border-gray-700"/>
        <input id="debit" type="number" placeholder="Débito (relatório)" class="px-3 py-2 rounded bg-gray-900 border border-gray-700"/>
        <input id="credit" type="number" placeholder="Crédito (relatório)" class="px-3 py-2 rounded bg-gray-900 border border-gray-700"/>
      </div>
      <textarea id="notes" placeholder="Observações (opcional)" class="mt-2 w-full px-3 py-2 rounded bg-gray-900 border border-gray-700"></textarea>
      <button id="confirm" class="mt-3 px-3 py-2 rounded bg-green-600">Concluir Fechamento</button>
      <div id="out" class="text-sm text-gray-400 mt-2"></div>
    </div>
  `
  root.appendChild(wrap)

  const store = wrap.querySelector('#store')
  const cash = wrap.querySelector('#cash')
  const pix = wrap.querySelector('#pix')
  const debit = wrap.querySelector('#debit')
  const credit = wrap.querySelector('#credit')
  const notes = wrap.querySelector('#notes')
  const out = wrap.querySelector('#out')

  wrap.querySelector('#confirm').onclick = async ()=>{
    if (!store.value) { alert('Informe a loja'); return }
    const ref = await closeDay({ storeId: store.value, counted: { cash:parseFloat(cash.value||'0'), pix:parseFloat(pix.value||'0'), debit:parseFloat(debit.value||'0'), credit:parseFloat(credit.value||'0') }, notes: notes.value||'' })
    out.textContent = `Fechamento gravado: ${ref.id}`
    cash.value = pix.value = debit.value = credit.value = notes.value = ''
  }
}
