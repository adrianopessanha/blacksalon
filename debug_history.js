import { db, collection, query, where, getDocs } from './src/firebase.js'
import { Timestamp } from 'firebase/firestore'

async function checkHistory() {
    console.log("Checking history for Jan 6, 7, 8...")

    // Helper to check a specific date range
    async function checkDate(dateStr) {
        const start = new Date(dateStr + 'T00:00:00')
        const end = new Date(dateStr + 'T23:59:59')

        console.log(`Querying: ${dateStr}...`)

        try {
            const q = query(
                collection(db, 'lancamentos'),
                where('data', '>=', Timestamp.fromDate(start)),
                where('data', '<=', Timestamp.fromDate(end))
            )

            const snapshot = await getDocs(q)
            console.log(`Found ${snapshot.size} records for ${dateStr}`)

            if (snapshot.size > 0) {
                snapshot.docs.slice(0, 3).forEach(d => {
                    const data = d.data()
                    console.log(` - Sample: ${data.servico_descricao} | ${data.barbeiro_nome}`)
                })
            }
        } catch (e) {
            console.error(`Error querying ${dateStr}:`, e.message)
        }
    }

    await checkDate('2026-01-06')
    await checkDate('2026-01-07')
    await checkDate('2026-01-08')
    await checkDate('2026-01-09') // Also check today to see if it's bloated

    process.exit()
}

checkHistory()
