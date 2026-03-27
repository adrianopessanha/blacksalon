import { db, collection, query, orderBy, limit, getDocs } from './src/firebase.js'

async function inspect() {
    console.log("Fetching last 100 transactions...")
    try {
        const q = query(collection(db, 'lancamentos'), orderBy('created_at', 'desc'), limit(100))
        const snapshot = await getDocs(q)

        const docs = snapshot.docs.map(change => {
            const d = change.data()
            const dateVal = d.data?.toDate ? d.data.toDate() : (d.data?.seconds ? new Date(d.data.seconds * 1000) : 'Invalid')
            return {
                id: change.id,
                description: d.servico_descricao,
                value: d.valor_bruto,
                date: dateVal.toLocaleString('pt-BR'),
                barber: d.barber_nome || d.barbeiro_nome
            }
        })

        console.log("Last 100 items:")
        // Group by description + value to spot extensive duplication
        docs.forEach(d => {
            console.log(`[${d.date}] ${d.description} - R$ ${d.value} (${d.barber}) - ID: ${d.id}`)
        })

    } catch (e) {
        console.error("Error:", e)
    }
    process.exit()
}

inspect()
