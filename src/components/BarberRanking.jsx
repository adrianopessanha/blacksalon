import { useState, useEffect } from 'react'
import { db, collection, query, where, onSnapshot, orderBy } from '../firebase'
import { Trophy, Medal, Award, TrendingUp, Crown } from 'lucide-react'
import { BARBERS } from '../data/barbers'

export function BarberRanking({ currentBarberId }) {
    const [ranking, setRanking] = useState([])
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState('month') // 'month' or 'today'

    useEffect(() => {
        // Get start of current month
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        startOfMonth.setHours(0, 0, 0, 0)

        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)

        // Create a map to accumulate revenue per barber
        const barberRevenueMap = {}
        
        // Initialize all barbers with 0
        BARBERS.forEach(barber => {
            barberRevenueMap[barber.id] = {
                id: barber.id,
                name: barber.name,
                monthRevenue: 0,
                todayRevenue: 0
            }
        })

        // Query all lancamentos from the start of month
        const q = query(
            collection(db, 'lancamentos'),
            orderBy('data', 'desc')
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
            // Reset revenues
            Object.keys(barberRevenueMap).forEach(key => {
                barberRevenueMap[key].monthRevenue = 0
                barberRevenueMap[key].todayRevenue = 0
            })

            snapshot.forEach(doc => {
                const data = doc.data()
                
                try {
                    if (!data?.data?.toDate) return
                    if (!data.barbeiro_id) return
                    
                    const date = data.data.toDate()
                    
                    // Skip non-revenue entries
                    if (['adiantamento', 'fechamento_comissao'].includes(data.tipo)) return
                    
                    const revenue = data.valor_bruto || 0
                    
                    // Month revenue (if within current month)
                    if (date >= startOfMonth) {
                        if (barberRevenueMap[data.barbeiro_id]) {
                            barberRevenueMap[data.barbeiro_id].monthRevenue += revenue
                        }
                    }
                    
                    // Today revenue
                    if (date >= startOfToday) {
                        if (barberRevenueMap[data.barbeiro_id]) {
                            barberRevenueMap[data.barbeiro_id].todayRevenue += revenue
                        }
                    }
                } catch (err) {
                    console.warn("Skipping invalid document in ranking", err)
                }
            })

            // Convert to array and sort by revenue (descending)
            const sortedRanking = Object.values(barberRevenueMap)
                .sort((a, b) => {
                    const revenueA = period === 'month' ? a.monthRevenue : a.todayRevenue
                    const revenueB = period === 'month' ? b.monthRevenue : b.todayRevenue
                    return revenueB - revenueA
                })
                .map((barber, index) => ({
                    ...barber,
                    position: index + 1
                }))

            setRanking(sortedRanking)
            setLoading(false)
        }, (error) => {
            console.error("Error fetching ranking data:", error)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [period])

    const getPositionIcon = (position) => {
        switch (position) {
            case 1:
                return <Crown size={20} className="text-yellow-400" />
            case 2:
                return <Medal size={20} className="text-gray-300" />
            case 3:
                return <Award size={20} className="text-amber-600" />
            default:
                return <span className="text-gray-500 font-bold text-sm w-5 text-center">{position}º</span>
        }
    }

    const getPositionStyle = (position, isCurrentUser) => {
        let baseStyle = "flex items-center gap-3 p-3 rounded-xl transition-all "
        
        if (isCurrentUser) {
            baseStyle += "ring-2 ring-cyan-500/50 "
        }
        
        switch (position) {
            case 1:
                return baseStyle + "bg-gradient-to-r from-yellow-900/30 to-yellow-800/10 border border-yellow-500/30"
            case 2:
                return baseStyle + "bg-gradient-to-r from-gray-800/50 to-gray-700/20 border border-gray-500/30"
            case 3:
                return baseStyle + "bg-gradient-to-r from-amber-900/30 to-amber-800/10 border border-amber-600/30"
            default:
                return baseStyle + "bg-gray-900/50 border border-gray-800"
        }
    }

    const getPositionLabel = (position) => {
        switch (position) {
            case 1:
                return "🏆 Líder"
            case 2:
                return "🥈 Vice"
            case 3:
                return "🥉 Bronze"
            default:
                return null
        }
    }

    if (loading) {
        return (
            <div className="bg-gray-950 rounded-2xl border border-gray-800 p-6">
                <div className="animate-pulse flex items-center gap-3">
                    <div className="w-6 h-6 bg-gray-800 rounded-full"></div>
                    <div className="h-4 bg-gray-800 rounded w-32"></div>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-gray-950 rounded-2xl border border-gray-800 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-800 bg-gradient-to-r from-gray-900 to-gray-950">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Trophy size={18} className="text-cyan-500" />
                        <h3 className="text-sm font-bold text-gray-200">Ranking de Faturamento</h3>
                    </div>
                    
                    {/* Period Toggle */}
                    <div className="flex bg-gray-900 rounded-lg p-0.5 border border-gray-800">
                        <button
                            onClick={() => setPeriod('today')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                period === 'today' 
                                    ? 'bg-cyan-600 text-white shadow-lg' 
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Hoje
                        </button>
                        <button
                            onClick={() => setPeriod('month')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                period === 'month' 
                                    ? 'bg-cyan-600 text-white shadow-lg' 
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Mês
                        </button>
                    </div>
                </div>
            </div>

            {/* Ranking List */}
            <div className="p-3 space-y-2">
                {ranking.map((barber) => {
                    const isCurrentUser = barber.id === currentBarberId
                    const revenue = period === 'month' ? barber.monthRevenue : barber.todayRevenue
                    
                    return (
                        <div 
                            key={barber.id} 
                            className={getPositionStyle(barber.position, isCurrentUser)}
                        >
                            {/* Position Icon */}
                            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                                {getPositionIcon(barber.position)}
                            </div>
                            
                            {/* Barber Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium truncate ${
                                        isCurrentUser ? 'text-cyan-400' : 'text-gray-200'
                                    }`}>
                                        {barber.name.split(' ')[0]}
                                        {isCurrentUser && <span className="text-xs text-cyan-500 ml-1">(você)</span>}
                                    </span>
                                </div>
                                {getPositionLabel(barber.position) && (
                                    <span className="text-xs text-gray-500">
                                        {getPositionLabel(barber.position)}
                                    </span>
                                )}
                            </div>
                            
                            {/* Progress Indicator (visual only, no values) */}
                            <div className="flex-shrink-0">
                                {barber.position === 1 && revenue > 0 && (
                                    <div className="flex items-center gap-1">
                                        <TrendingUp size={14} className="text-green-400" />
                                        <span className="text-xs text-green-400 font-medium">Top</span>
                                    </div>
                                )}
                                {barber.position > 1 && barber.position <= 3 && (
                                    <div className="text-xs text-gray-500">
                                        Subindo 🔥
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Footer Motivation */}
            <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/50">
                <p className="text-xs text-gray-500 text-center">
                    🚀 Continue assim! O ranking atualiza em tempo real.
                </p>
            </div>
        </div>
    )
}
