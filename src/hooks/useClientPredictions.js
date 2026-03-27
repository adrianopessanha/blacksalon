import { useState, useEffect, useCallback } from 'react'

// ── WhatsApp sheet (confirmações via N8N) ──
const SHEET_ID = '1gK9wAKim4WwdZ1APnfa3BebTEMlesT2h6TK0rA5EJwI'
const QUERY = `SELECT A, B, C, D WHERE D != ''`
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&tq=${encodeURIComponent(QUERY)}`

// ── Booksy sheet (agendamentos diretos) ──
const BOOKSY_SHEET_ID = '1N8JpnSRFFYed7A6RMsJ79aoTeJ26PbI6yQBe5geYCNM'
const BOOKSY_QUERY = `SELECT C, G, H, Q WHERE Q = 'Concluída'`
const BOOKSY_CSV_URL = `https://docs.google.com/spreadsheets/d/${BOOKSY_SHEET_ID}/gviz/tq?tqx=out:csv&tq=${encodeURIComponent(BOOKSY_QUERY)}`

// ── Subscribers sheet (Club) ──
const SUBS_SHEET_ID = '1EEYaNhk_ziJKq1OAdCw8-t95gt93o8TB4aJVC5m3rfQ'
const SUBS_CSV_URL = `https://docs.google.com/spreadsheets/d/${SUBS_SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`

const ACTIVE_STATUSES = [
    'capturada na operadora',
    'paga fora do sistema',
    'ativa'
]

const MONTHS_PT = {
    'janeiro': 0, 'fevereiro': 1, 'março': 2, 'marco': 2, 'abril': 3,
    'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8,
    'outubro': 9, 'novembro': 10, 'dezembro': 11
}

function parseCSV(text) {
    const rows = []
    let fields = []
    let field = ''
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"'
                    i++ // skip escaped quote
                } else {
                    inQuotes = false // closing quote
                }
            } else {
                field += ch
            }
        } else {
            if (ch === '"') {
                inQuotes = true
            } else if (ch === ',') {
                fields.push(field)
                field = ''
            } else if (ch === '\n') {
                fields.push(field)
                rows.push(fields)
                fields = []
                field = ''
            } else if (ch !== '\r') {
                field += ch
            }
        }
    }
    // Don't forget the last field/row
    if (field || fields.length > 0) {
        fields.push(field)
        rows.push(fields)
    }

    return rows
}

// ── Normalize name for matching between sources ──
function normalizeName(name) {
    if (!name) return ''
    return name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/\s+/g, ' ')
        .replace(/ass\s*aut$/i, '') // remove "Ass aut" / "Ass Aut" suffix from Booksy
        .trim()
}

// Extract visit date from confirmation text
// Patterns: "23 de dezembro", "25/11 às 18h", "5 de dezembro de 2025"
function extractVisitDate(text, interactionDate) {
    if (!text) return null

    // Pattern 1: "DD de MONTH de YYYY" or "DD de MONTH"
    const monthPattern = /(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/i
    const m1 = text.match(monthPattern)
    if (m1) {
        const day = parseInt(m1[1])
        const monthName = m1[2].toLowerCase()
        const month = MONTHS_PT[monthName]
        if (month !== undefined && day >= 1 && day <= 31) {
            let year = m1[3] ? parseInt(m1[3]) : null
            if (!year) {
                year = interactionDate ? interactionDate.getFullYear() : new Date().getFullYear()
                const guessDate = new Date(year, month, day)
                const now = new Date()
                // Se ficou muito no futuro, provavelmente é do ano anterior
                if (guessDate > new Date(now.getTime() + 60 * 86400000)) {
                    year--
                }
                // Se ficou muito no passado E temos interactionDate, tentar próximo ano
                else if (interactionDate && guessDate < new Date(interactionDate.getTime() - 60 * 86400000)) {
                    year++
                }
            }
            return new Date(year, month, day)
        }
    }

    // Pattern 2: "DD/MM" or "DD/MM/YYYY"
    const slashPattern = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/
    const m2 = text.match(slashPattern)
    if (m2) {
        const day = parseInt(m2[1])
        const month = parseInt(m2[2]) - 1
        let year = m2[3] ? parseInt(m2[3]) : null
        if (!year) {
            year = interactionDate ? interactionDate.getFullYear() : new Date().getFullYear()
            const guessDate = new Date(year, month, day)
            const now = new Date()
            if (guessDate > new Date(now.getTime() + 60 * 86400000)) {
                year--
            } else if (interactionDate && guessDate < new Date(interactionDate.getTime() - 60 * 86400000)) {
                year++
            }
        }
        if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
            return new Date(year, month, day)
        }
    }

    return null
}

// Extract client name from "Fala, Bruno Santos!"
function extractClientName(text) {
    if (!text) return null
    const match = text.match(/Fala,\s*([^!]+?)!/i)
    return match ? match[1].trim() : null
}

// Extract barber name from "com o Adriano" or "com o Wellington"
function extractBarber(text) {
    if (!text) return null
    const match = text.match(/com o[s]?\s+(\w+)/i)
    return match ? match[1] : null
}

// Extract store from "Unidade 01" or "Loja 2"
function extractStore(text) {
    if (!text) return null
    const match = text.match(/(Unidade\s+\d+|Loja\s+\d+)/i)
    return match ? match[1] : null
}

// Parse interaction date from column C: "Friday, 12/12/2025 10:09"
function parseInteractionDate(raw) {
    if (!raw) return null
    const str = raw.replace(/[}"]/g, '').trim()
    const commaIdx = str.indexOf(',')
    if (commaIdx >= 0) {
        const dateTimePart = str.substring(commaIdx + 1).trim()
        const [datePart] = dateTimePart.split(' ')
        const [day, month, year] = (datePart || '').split('/').map(Number)
        if (day && month && year) return new Date(year, month - 1, day)
    }
    return null
}

// Parse Booksy date: "31/01/2026 16:00"
function parseBooksyDate(raw) {
    if (!raw) return null
    const str = raw.trim()
    const [datePart] = str.split(' ')
    const parts = (datePart || '').split('/')
    if (parts.length >= 3) {
        const [day, month, year] = parts.map(Number)
        if (day && month && year) return new Date(year, month - 1, day)
    }
    return null
}

// ── Names to skip from Booksy (generic slots, not real clients) ──
const BOOKSY_SKIP_NAMES = new Set([
    'ordem de chegada', 'encaixe', 'bloqueio', 'teste',
    'bloqueado', 'reservado', 'intervalo', 'almoço', 'almoco'
])

function buildPredictions(whatsappRows, booksyRows, subscribersRows) {
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    threeMonthsAgo.setHours(0, 0, 0, 0)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // ── 0) Process Subscribers first ──
    const subscriberPhones = new Set()
    if (subscribersRows && subscribersRows.length >= 2) {
        const header = subscribersRows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_'))
        const statusIdx = header.findIndex(h => h.includes('status'))
        const phoneIdx = header.findIndex(h => h.includes('telefone'))

        if (statusIdx !== -1 && phoneIdx !== -1) {
            for (let i = 1; i < subscribersRows.length; i++) {
                const row = subscribersRows[i]
                const status = (row[statusIdx] || '').trim().toLowerCase()
                const phone = (row[phoneIdx] || '').replace(/[}"]/g, '').replace(/\D/g, '').trim()
                const isActive = ACTIVE_STATUSES.some(s => status.includes(s))

                if (isActive && phone) {
                    subscriberPhones.add(phone)
                }
            }
        }
    }

    // ── clientMap keyed by phone (WhatsApp source) OR normalized name (Booksy) ──
    // We keep a nameToPhone index so Booksy clients can be merged if they match a WhatsApp client
    const clientMap = new Map()       // key → client object
    const nameToKey = new Map()       // normalized name → key (for merging)
    let totalConfirmations = 0
    let booksyCount = 0

    // ═══════════════════════════════════════════
    // 1) Process WhatsApp confirmations
    // ═══════════════════════════════════════════
    if (whatsappRows && whatsappRows.length >= 2) {
        const header = whatsappRows[0].map(h => (h || '').toLowerCase().replace(/[^a-z0-9]/g, '_'))
        const nameIdx = Math.max(header.findIndex(h => h.includes('nome')), 0)
        const phoneIdx = Math.max(header.findIndex(h => h.includes('telefone')), 1)
        const dateIdx = Math.max(header.findIndex(h => h.includes('data')), 2)
        const agendIdx = Math.max(header.findIndex(h => h.includes('agendamento') || h.includes('ultimos')), 3)

        for (let i = 1; i < whatsappRows.length; i++) {
            const row = whatsappRows[i]
            const colA = (row[nameIdx] || '').replace(/[}"]/g, '').trim()
            const phone = (row[phoneIdx] || '').replace(/[}"]/g, '').trim()
            const colC = (row[dateIdx] || '').replace(/[}"]/g, '').trim()
            const agendamento = (row[agendIdx] || '').replace(/[}"]/g, '').trim()

            if (!agendamento || !phone) continue
            if (phone.startsWith('~~')) continue
            if (!agendamento.toLowerCase().includes('confirmado')) continue

            const cleanPhone = phone.replace(/\D/g, '')
            if (cleanPhone.length < 10) continue

            const interactionDate = parseInteractionDate(colC)
            const visitDate = extractVisitDate(agendamento, interactionDate)
            if (!visitDate || isNaN(visitDate.getTime())) continue
            if (visitDate < threeMonthsAgo) continue
            if (visitDate > new Date(today.getTime() + 30 * 86400000)) continue

            totalConfirmations++

            const clientName = extractClientName(agendamento) || colA || 'Sem nome'
            const barber = extractBarber(agendamento)
            const store = extractStore(agendamento)
            const key = cleanPhone // WhatsApp clients keyed by phone

            if (!clientMap.has(key)) {
                clientMap.set(key, {
                    name: clientName,
                    phone: cleanPhone,
                    visitDays: new Map(),
                    barbers: new Set(),
                    stores: new Set(),
                    source: 'whatsapp',
                    isSubscriber: subscriberPhones.has(cleanPhone)
                })
            }

            const client = clientMap.get(key)
            if (clientName.length > client.name.length && clientName !== 'Sem nome') {
                client.name = clientName
            }

            const dayKey = visitDate.toDateString()
            if (!client.visitDays.has(dayKey)) {
                client.visitDays.set(dayKey, { date: visitDate, barber, store })
            }
            if (barber) client.barbers.add(barber)
            if (store) client.stores.add(store)

            // Index by name for Booksy merging
            const normName = normalizeName(clientName)
            if (normName && !nameToKey.has(normName)) {
                nameToKey.set(normName, key)
            }
        }
    }

    // ═══════════════════════════════════════════
    // 2) Process Booksy appointments
    // ═══════════════════════════════════════════
    if (booksyRows && booksyRows.length >= 2) {
        for (let i = 1; i < booksyRows.length; i++) {
            const row = booksyRows[i]
            // Columns: C=Data e hora, G=Cliente, H=Funcionário, Q=Status
            const dateRaw = (row[0] || '').trim()
            const clientName = (row[1] || '').trim()
            const barber = (row[2] || '').trim()
            // Status already filtered by query (Concluída only)

            if (!clientName || !dateRaw) continue

            const normName = normalizeName(clientName)
            if (BOOKSY_SKIP_NAMES.has(normName)) continue
            if (!normName || normName.length < 2) continue

            const visitDate = parseBooksyDate(dateRaw)
            if (!visitDate || isNaN(visitDate.getTime())) continue
            if (visitDate < threeMonthsAgo) continue
            if (visitDate > new Date(today.getTime() + 30 * 86400000)) continue

            booksyCount++

            // Try to merge with existing WhatsApp client by name
            let key = nameToKey.get(normName)
            if (!key) {
                // New Booksy-only client, keyed by name
                key = `booksy_${normName}`
                if (!clientMap.has(key)) {
                    clientMap.set(key, {
                        name: clientName,
                        phone: '',
                        visitDays: new Map(),
                        barbers: new Set(),
                        stores: new Set(),
                        source: 'booksy',
                        isSubscriber: false // Booksy-only clients usually lack phone in this export
                    })
                    nameToKey.set(normName, key)
                }
            }

            const client = clientMap.get(key)
            // Keep best (longest) name
            if (clientName.length > client.name.length && !normName.startsWith('booksy_')) {
                client.name = clientName
            }
            // If this was a Booksy-only and now has a better name
            if (clientName.length > client.name.length) {
                client.name = clientName
            }

            const dayKey = visitDate.toDateString()
            if (!client.visitDays.has(dayKey)) {
                client.visitDays.set(dayKey, { date: visitDate, barber, store: 'Unidade 01' })
            }
            if (barber) client.barbers.add(barber)
            client.stores.add('Unidade 01')
        }
    }

    // ═══════════════════════════════════════════
    // 3) Analyze each client → predictions
    // ═══════════════════════════════════════════
    const predictions = []
    const inactive = []

    clientMap.forEach((client) => {
        const visits = Array.from(client.visitDays.values())
            .map(v => v.date)
            .sort((a, b) => a - b)

        const lastVisit = visits[visits.length - 1]
        const daysSinceLastVisit = Math.floor((today - lastVisit) / 86400000)

        // Get last barber
        const sortedVisits = Array.from(client.visitDays.entries()).sort((a, b) => new Date(a[0]) - new Date(b[0]))
        const lastBarber = sortedVisits[sortedVisits.length - 1]?.[1]?.barber || null

        if (visits.length < 2) {
            inactive.push({
                name: client.name,
                phone: client.phone,
                lastVisit,
                daysSinceLastVisit,
                barbers: Array.from(client.barbers),
                lastBarber,
                source: client.source,
                isSubscriber: client.isSubscriber
            })
            return
        }

        // Calculate intervals between visits (min 3 days to filter noise)
        const intervals = []
        for (let i = 1; i < visits.length; i++) {
            const diff = Math.floor((visits[i] - visits[i - 1]) / 86400000)
            if (diff >= 3 && diff < 120) intervals.push(diff)
        }

        if (intervals.length === 0) {
            inactive.push({
                name: client.name,
                phone: client.phone,
                lastVisit,
                daysSinceLastVisit,
                barbers: Array.from(client.barbers),
                lastBarber,
                source: client.source,
                isSubscriber: client.isSubscriber
            })
            return
        }

        const avgInterval = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length)
        const predictedNext = new Date(lastVisit.getTime() + avgInterval * 86400000)
        const daysUntilNext = Math.floor((predictedNext - today) / 86400000)

        const visitCount = visits.length
        let confidenceLabel, confidenceScore
        if (visitCount >= 6) { confidenceLabel = 'Alta'; confidenceScore = 3 }
        else if (visitCount >= 3) { confidenceLabel = 'Média'; confidenceScore = 2 }
        else { confidenceLabel = 'Baixa'; confidenceScore = 1 }

        predictions.push({
            name: client.name,
            phone: client.phone,
            lastVisit,
            daysSinceLastVisit,
            avgInterval,
            predictedNext,
            daysUntilNext,
            visitCount,
            confidenceLabel,
            confidenceScore,
            barbers: Array.from(client.barbers),
            lastBarber,
            source: client.source,
            isSubscriber: client.isSubscriber
        })
    })

    // Sort: closest predictions first, then by confidence
    predictions.sort((a, b) => {
        const aDist = Math.abs(a.daysUntilNext)
        const bDist = Math.abs(b.daysUntilNext)
        if (aDist !== bDist) return aDist - bDist
        return b.confidenceScore - a.confidenceScore
    })

    const totalActive = predictions.length
    const avgFreq = totalActive > 0
        ? Math.round(predictions.reduce((s, p) => s + p.avgInterval, 0) / totalActive)
        : 0
    const todayPredictions = predictions.filter(p => Math.abs(p.daysUntilNext) <= 2)
    const overdue = predictions.filter(p => p.daysUntilNext < -2)

    return {
        predictions,
        inactive: inactive.sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit),
        stats: {
            totalClients: clientMap.size,
            totalActive,
            totalInactive: inactive.length,
            todayCount: todayPredictions.length,
            overdueCount: overdue.length,
            avgFrequency: avgFreq,
            totalConfirmations,
            booksyCount,
            subscriberCount: Array.from(clientMap.values()).filter(c => c.isSubscriber).length
        }
    }
}

export function useClientPredictions() {
    const [predictions, setPredictions] = useState([])
    const [inactive, setInactive] = useState([])
    const [stats, setStats] = useState({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)

            // Fetch both sources in parallel
            const [whatsappRes, booksyRes] = await Promise.all([
                fetch(CSV_URL),
                fetch(BOOKSY_CSV_URL).catch(e => {
                    console.warn('[Métricas] Booksy fetch falhou:', e.message)
                    return null
                })
            ])

            if (!whatsappRes.ok) throw new Error(`WhatsApp HTTP ${whatsappRes.status}`)

            const whatsappText = await whatsappRes.text()
            const whatsappRows = parseCSV(whatsappText)

            // Fetch subscribers
            const subsRes = await fetch(SUBS_CSV_URL)
            let subscribersRows = []
            if (subsRes.ok) {
                const subsText = await subsRes.text()
                subscribersRows = parseCSV(subsText)
            }

            let booksyRows = []
            if (booksyRes && booksyRes.ok) {
                const booksyText = await booksyRes.text()
                booksyRows = parseCSV(booksyText)
                console.log(`[Métricas] Booksy: ${booksyRows.length - 1} visitas concluídas carregadas`)
            }

            console.log(`[Métricas] WA: ${whatsappRows.length} linhas | Booksy: ${booksyRows.length - 1} | Subs: ${subscribersRows.length - 1}`)

            const result = buildPredictions(whatsappRows, booksyRows, subscribersRows)
            setPredictions(result.predictions)
            setInactive(result.inactive)
            setStats(result.stats)
            setError(null)

            console.log(`[Métricas] ${result.stats.totalConfirmations} confirmações WA + ${result.stats.booksyCount} Booksy | ${result.stats.totalActive} ativos | ${result.stats.subscriberCount} assinantes`)
        } catch (e) {
            console.error('Erro ao buscar previsões:', e)
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 30 * 60 * 1000)
        return () => clearInterval(interval)
    }, [fetchData])

    return { predictions, inactive, stats, loading, error, refetch: fetchData }
}
