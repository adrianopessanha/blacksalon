import { useState, useEffect } from 'react'
import { db, collection, query, where, onSnapshot, orderBy, limit, getDocs } from '../firebase'
import { Timestamp } from 'firebase/firestore'

export function useBarberStats(barberId, targetDateStr) {
    const [stats, setStats] = useState({
        todayCount: 0,
        todayValue: 0,
        todayCommission: 0,
        monthCommission: 0,
        monthProduction: 0,
        monthAdvances: 0,
        todayServices: [],
        monthSobrancelhaCount: 0,
        monthProductCount: 0,
        monthSubscriberCount: 0,
    })
    const [loading, setLoading] = useState(true)
    const [dynamicGoal, setDynamicGoal] = useState(2000)

    // Main realtime listener
    useEffect(() => {
        if (!barberId) return

        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        startOfMonth.setHours(0, 0, 0, 0)

        const [y, m, d] = targetDateStr.split('-').map(Number)
        const startOfTargetDay = new Date(y, m - 1, d)
        startOfTargetDay.setHours(0, 0, 0, 0)
        const endOfTargetDay = new Date(y, m - 1, d)
        endOfTargetDay.setHours(23, 59, 59, 999)

        const q = query(
            collection(db, 'lancamentos'),
            where('barbeiro_id', '==', barberId),
            orderBy('data', 'desc'),
            limit(200)
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let tCount = 0, tValue = 0, tComm = 0
            let mComm = 0, mProduction = 0, mAdvances = 0
            let mSobrancelha = 0, mProducts = 0, mSubscribers = 0
            let todayList = []

            const docs = []
            snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }))

            docs.sort((a, b) => {
                const dA = a.data?.toDate ? a.data.toDate() : new Date(0)
                const dB = b.data?.toDate ? b.data.toDate() : new Date(0)
                return dB - dA
            })

            let lastClosureDate = null
            for (const doc of docs) {
                if (doc.tipo === 'fechamento_comissao') {
                    lastClosureDate = doc.data.toDate()
                    break
                }
            }

            docs.forEach(data => {
                try {
                    if (!data?.data?.toDate) return
                    const date = data.data.toDate()
                    const cycleStartDate = lastClosureDate || startOfMonth

                    // Monthly production (for goal)
                    if (date >= startOfMonth) {
                        if (data.tipo !== 'adiantamento' && data.tipo !== 'fechamento_comissao') {
                            mProduction += (data.comissao_barbeiro || 0)

                            // Incentive counters
                            const desc = (data.servico_descricao || '').toLowerCase()
                            if (desc.includes('sobrancelha')) mSobrancelha++
                            if (data.tipo === 'produto') mProducts++
                            if (data.forma_pagamento === 'Assinante') mSubscribers++
                        }
                    }

                    // Cycle commission (balance to receive)
                    if (date > cycleStartDate) {
                        mComm += (data.comissao_barbeiro || 0)
                        if (data.tipo === 'adiantamento') {
                            mAdvances += Math.abs(data.comissao_barbeiro || 0)
                        }
                    }

                    // Selected day stats
                    if (date >= startOfTargetDay && date <= endOfTargetDay) {
                        const isNonRevenue = ['Assinante', 'Vale Presente', 'venda_assinatura', 'venda_vale'].includes(data.forma_pagamento) ||
                            ['venda_assinatura', 'venda_vale', 'adiantamento', 'fechamento_comissao'].includes(data.tipo)

                        if (data.tipo !== 'adiantamento' && data.tipo !== 'fechamento_comissao') {
                            tCount++
                            if (!isNonRevenue) tValue += (data.valor_bruto || 0)
                        }

                        if (data.tipo !== 'fechamento_comissao' && data.tipo !== 'adiantamento') {
                            tComm += (data.comissao_barbeiro || 0)
                        }

                        todayList.push({
                            ...data,
                            dateStr: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        })
                    }
                } catch (err) {
                    console.warn("Skipping invalid document", err)
                }
            })

            setStats({
                todayCount: tCount, todayValue: tValue, todayCommission: tComm,
                monthCommission: mComm, monthProduction: mProduction, monthAdvances: mAdvances,
                todayServices: todayList,
                monthSobrancelhaCount: mSobrancelha,
                monthProductCount: mProducts,
                monthSubscriberCount: mSubscribers,
            })
            setLoading(false)
        }, (error) => {
            console.error("Error fetching barber stats:", error)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [barberId, targetDateStr])

    // One-time query for previous 3 months (dynamic goal)
    useEffect(() => {
        if (!barberId) return

        const fetchPreviousMonths = async () => {
            try {
                const now = new Date()
                const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
                threeMonthsAgo.setHours(0, 0, 0, 0)
                const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
                startOfCurrentMonth.setHours(0, 0, 0, 0)

                const q = query(
                    collection(db, 'lancamentos'),
                    where('barbeiro_id', '==', barberId),
                    where('data', '>=', Timestamp.fromDate(threeMonthsAgo)),
                    where('data', '<', Timestamp.fromDate(startOfCurrentMonth))
                )

                const snapshot = await getDocs(q)
                const monthlyTotals = {}

                snapshot.forEach(doc => {
                    const d = doc.data()
                    if (d.tipo === 'adiantamento' || d.tipo === 'fechamento_comissao') return
                    if (!d.data?.toDate) return

                    const date = d.data.toDate()
                    const key = `${date.getFullYear()}-${date.getMonth()}`
                    if (!monthlyTotals[key]) monthlyTotals[key] = 0
                    monthlyTotals[key] += (d.comissao_barbeiro || 0)
                })

                const totals = Object.values(monthlyTotals)

                if (totals.length === 0) {
                    setDynamicGoal(2000)
                    return
                }

                const avg = totals.reduce((a, b) => a + b, 0) / totals.length
                const goal = avg * 1.10 // 10% above average
                const rounded = Math.ceil(goal / 100) * 100

                setDynamicGoal(Math.max(1500, Math.min(6000, rounded)))
            } catch (err) {
                console.error("Error fetching previous months:", err)
                setDynamicGoal(2000)
            }
        }

        fetchPreviousMonths()
    }, [barberId])

    return { stats, loading, dynamicGoal }
}
