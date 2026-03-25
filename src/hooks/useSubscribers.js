import { useState, useEffect } from 'react'

const SHEET_ID = '1EEYaNhk_ziJKq1OAdCw8-t95gt93o8TB4aJVC5m3rfQ'
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`

// Status que indica assinante ativo (Google Sheet webhook + Celcoin CSV)
const ACTIVE_STATUSES = [
    'capturada na operadora',
    'paga fora do sistema',
    'ativa'
]

function parseCSV(text) {
    const lines = []
    let current = ''
    let inQuotes = false

    // Simple CSV parser that handles quoted fields
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') {
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if (ch === '\n' && !inQuotes) {
            lines.push(current)
            current = ''
        } else if (ch !== '\r') {
            current += ch
        }
    }
    if (current.trim()) lines.push(current)

    // Parse each line into fields
    return lines.map(line => {
        const fields = []
        let field = ''
        let inQ = false
        for (let i = 0; i < line.length; i++) {
            const ch = line[i]
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') {
                    field += '"'
                    i++
                } else {
                    inQ = !inQ
                }
            } else if (ch === ',' && !inQ) {
                fields.push(field.trim())
                field = ''
            } else {
                field += ch
            }
        }
        fields.push(field.trim())
        return fields
    })
}

export function useSubscribers() {
    const [subscribers, setSubscribers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        let cancelled = false

        const fetchSubscribers = async () => {
            try {
                const res = await fetch(CSV_URL)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const text = await res.text()
                const rows = parseCSV(text)

                if (rows.length < 2) {
                    setSubscribers([])
                    return
                }

                // Header: Código, Nome do cliente, Plano, Valor, Status, Telefone, Email, CPF, Inicio do contrato, Ultima atualizção
                const header = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_'))
                const nameIdx = header.findIndex(h => h.includes('nome'))
                const statusIdx = header.findIndex(h => h.includes('status'))
                const planoIdx = header.findIndex(h => h.includes('plano'))
                const phoneIdx = header.findIndex(h => h.includes('telefone'))
                const contractIdx = header.findIndex(h => h.includes('inicio') || h.includes('contrato'))
                const valorIdx = header.findIndex(h => h.includes('valor'))

                if (nameIdx === -1 || statusIdx === -1) {
                    throw new Error('Colunas "Nome" ou "Status" não encontradas')
                }

                // Build unique active subscribers (last entry wins for duplicates)
                const subscriberMap = new Map()

                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i]
                    const name = (row[nameIdx] || '').trim()
                    const status = (row[statusIdx] || '').trim().toLowerCase()

                    if (!name) continue

                    // Clean malformed data
                    const cleanName = name.replace(/[}"]/g, '').trim()
                    if (!cleanName) continue

                    const isActive = ACTIVE_STATUSES.some(s => status.includes(s))

                    // Parse billing cycle day from contract start date
                    const contractRaw = contractIdx >= 0 ? (row[contractIdx] || '').replace(/[}"]/g, '').trim() : ''
                    let billingDay = null
                    if (contractRaw) {
                        // Formats: "30/07/2025" or "2025-05-30 18:03:09"
                        if (contractRaw.includes('/')) {
                            const parts = contractRaw.split('/')
                            billingDay = parseInt(parts[0]) || null
                        } else if (contractRaw.includes('-')) {
                            const parts = contractRaw.split(/[-T\s]/)
                            billingDay = parseInt(parts[2]) || null
                        }
                    }

                    // Parse plan value
                    const valorRaw = valorIdx >= 0 ? (row[valorIdx] || '').replace(/[}"]/g, '').trim() : ''
                    const planValue = parseInt(valorRaw) || null

                    // Always update - last row is most recent
                    const existing = subscriberMap.get(cleanName.toLowerCase())
                    subscriberMap.set(cleanName.toLowerCase(), {
                        name: cleanName,
                        plano: (row[planoIdx] || '').replace(/[}"]/g, '').trim(),
                        phone: (row[phoneIdx] || '').replace(/[}"]/g, '').trim(),
                        status: isActive ? 'ativo' : 'inativo',
                        rawStatus: (row[statusIdx] || '').trim(),
                        billingDay: billingDay || (existing?.billingDay) || null,
                        planValue: planValue || (existing?.planValue) || null,
                        contractDate: contractRaw
                    })
                }

                // Only return active ones, sorted by name
                const active = Array.from(subscriberMap.values())
                    .filter(s => s.status === 'ativo')
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

                if (!cancelled) {
                    setSubscribers(active)
                    setError(null)
                }
            } catch (e) {
                console.error('Erro ao buscar assinantes:', e)
                if (!cancelled) setError(e.message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchSubscribers()
        return () => { cancelled = true }
    }, [])

    return { subscribers, loading, error }
}
