import { useState, useEffect } from 'react'
import { db, collection, onSnapshot, query, orderBy } from '../firebase'

export function useVoucherClients() {
    const [clients, setClients] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const q = query(collection(db, 'clientes_vale'), orderBy('nome'))
        
        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            setClients(list)
            setLoading(false)
        }, (err) => {
            console.error("Error fetching voucher clients:", err)
            setError(err.message)
            setLoading(false)
        })

        return () => unsub()
    }, [])

    return { clients, loading, error }
}
