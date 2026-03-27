import { db, collection, query, orderBy, limit, getDocs } from './src/firebase.js'
import { Timestamp } from 'firebase/firestore'

async function audit() {
    console.log("Starting Audit...")

    // Fetch a large batch of recent documents (last 500)
    // We order by created_at to see the history of insertion
    const q = query(collection(db, 'lancamentos'), orderBy('created_at', 'desc'), limit(500))
    const snapshot = await getDocs(q)

    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

    console.log(`Analyzed ${docs.length} documents.`)

    const counts = {
        data_jan6: 0,
        data_jan7: 0,
        data_jan8: 0,
        data_jan9: 0,
        created_jan6: 0,
        created_jan7: 0,
        created_jan8: 0,
        created_jan9: 0,
        mismatch_c6_d9: 0, // Created Jan 6, Data Jan 9
        mismatch_c7_d9: 0, // Created Jan 7, Data Jan 9
        mismatch_c8_d9: 0  // Created Jan 8, Data Jan 9
    }

    docs.forEach(d => {
        let dateObj = null
        let createdObj = null

        try {
            if (d.data?.toDate) dateObj = d.data.toDate()
            else if (d.data?.seconds) dateObj = new Date(d.data.seconds * 1000)

            if (d.created_at?.toDate) createdObj = d.created_at.toDate()
            else if (d.created_at?.seconds) createdObj = new Date(d.created_at.seconds * 1000)
        } catch (e) { }

        if (!dateObj || !createdObj) return

        const dateStr = dateObj.toLocaleDateString('pt-BR')
        const createdStr = createdObj.toLocaleDateString('pt-BR')

        // Count 'Data' fields
        if (dateStr.includes('06/01/2026')) counts.data_jan6++
        if (dateStr.includes('07/01/2026')) counts.data_jan7++
        if (dateStr.includes('08/01/2026')) counts.data_jan8++
        if (dateStr.includes('09/01/2026')) counts.data_jan9++

        // Count 'Created' fields
        if (createdStr.includes('06/01/2026')) counts.created_jan6++
        if (createdStr.includes('07/01/2026')) counts.created_jan7++
        if (createdStr.includes('08/01/2026')) counts.created_jan8++
        if (createdStr.includes('09/01/2026')) counts.created_jan9++

        // Check for corruption (Created Jan X, but Data is Jan 9)
        if (createdStr.includes('06/01/2026') && dateStr.includes('09/01/2026')) counts.mismatch_c6_d9++
        if (createdStr.includes('07/01/2026') && dateStr.includes('09/01/2026')) counts.mismatch_c7_d9++
        if (createdStr.includes('08/01/2026') && dateStr.includes('09/01/2026')) counts.mismatch_c8_d9++

        if (createdStr.includes('06/01/2026') && dateStr.includes('09/01/2026')) {
            console.log(`[MISMATCH FOUND] ID: ${d.id} | Desc: ${d.servico_descricao} | Created: ${createdStr} | Data: ${dateStr}`)
        }
    })

    console.log("\n--- REPORT ---")
    console.log("Records with DATA date:")
    console.log("Jan 6:", counts.data_jan6)
    console.log("Jan 7:", counts.data_jan7)
    console.log("Jan 8:", counts.data_jan8)
    console.log("Jan 9 (Today):", counts.data_jan9)

    console.log("\nRecords with CREATED date:")
    console.log("Jan 6:", counts.created_jan6)
    console.log("Jan 7:", counts.created_jan7)
    console.log("Jan 8:", counts.created_jan8)

    console.log("\nPotential Corrupted (Created old, Data is today):")
    console.log("Created 6 -> Data 9:", counts.mismatch_c6_d9)
    console.log("Created 7 -> Data 9:", counts.mismatch_c7_d9)
    console.log("Created 8 -> Data 9:", counts.mismatch_c8_d9)

    process.exit()
}

audit()
