import { useState, useEffect } from 'react'
import { db, collection, query, orderBy, limit, getDocs } from '../firebase'

export function DebugData() {
    const [logs, setLogs] = useState([])

    useEffect(() => {
        const fetch = async () => {
            const q = query(collection(db, 'lancamentos'), orderBy('created_at', 'desc'), limit(5))
            const snap = await getDocs(q)
            setLogs(snap.docs.map(d => ({ id: d.id, ...d.data(), dateStr: d.data().data?.toDate?.().toString() })))
        }
        fetch()
    }, [])

    return (
        <div className="p-10 bg-white text-black">
            <h1>Debug Last 5 Transactions</h1>
            <pre>{JSON.stringify(logs, null, 2)}</pre>
        </div>
    )
}
