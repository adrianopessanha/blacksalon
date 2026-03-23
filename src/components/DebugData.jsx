import { useState, useEffect } from 'react'
import { db, collection, query, where, getDocs, orderBy, limit, updateDoc, doc } from '../firebase'
import { Timestamp } from 'firebase/firestore'

export function DebugData() {
    const [report, setReport] = useState({})
    const [auditResults, setAuditResults] = useState(null)
    const [loading, setLoading] = useState(true)
    const [restoring, setRestoring] = useState(false)

    useEffect(() => {
        runDiagnostics()
    }, [])

    const runDiagnostics = async () => {
        setLoading(true)
        const results = {}
        const days = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']

        // 1. Check counts per day
        for (const day of days) {
            const start = new Date(day + 'T00:00:00')
            const end = new Date(day + 'T23:59:59')

            try {
                const q = query(
                    collection(db, 'lancamentos'),
                    where('data', '>=', Timestamp.fromDate(start)),
                    where('data', '<=', Timestamp.fromDate(end))
                )

                const snapshot = await getDocs(q)
                results[day] = {
                    count: snapshot.size,
                    samples: snapshot.docs.slice(0, 3).map(d => wrapData(d))
                }
            } catch (e) {
                results[day] = "Error: " + e.message
            }
        }
        setReport(results)

        // 2. Audit for Corruption (Created in past, Data is Today)
        await runAudit()
        setLoading(false)
    }

    const wrapData = (d) => {
        const data = d.data()
        return {
            id: d.id,
            desc: data.servico_descricao,
            val: data.valor_bruto,
            bar: data.barbeiro_nome,
            dateField: data.data?.toDate?.().toLocaleString(),
            createdAt: data.created_at?.toDate?.().toLocaleString()
        }
    }

    const runAudit = async () => {
        // Scan last 1000 records to be safe
        const q = query(collection(db, 'lancamentos'), orderBy('created_at', 'desc'), limit(1000))
        const snapshot = await getDocs(q)

        const todayStr = new Date().toLocaleDateString('pt-BR') // e.g. 09/01/2026
        const mismatches = []

        snapshot.docs.forEach(d => {
            const data = d.data()
            if (!data.data || !data.created_at) return

            let dateVal, createdVal
            try {
                dateVal = data.data.toDate ? data.data.toDate() : new Date(data.data.seconds * 1000)
                createdVal = data.created_at.toDate ? data.created_at.toDate() : new Date(data.created_at.seconds * 1000)
            } catch (e) { return }

            const dateStr = dateVal.toLocaleDateString('pt-BR')
            const createdStr = createdVal.toLocaleDateString('pt-BR')

            // Logic: 
            // The user says "Services done today appear in all past dates" OR "Past services appear on today"
            // Actually the user said: "services done today, repeat in past dates" AND "entries from 6,7,8 disappeared and replaced by today"
            // The most likely destructive bug is: OLD records got their 'data' field updated to TODAY.
            // So we look for: Created = OLD (not today), Data = TODAY.

            const isDataToday = dateStr === todayStr
            const isCreatedToday = createdStr === todayStr

            if (isDataToday && !isCreatedToday) {
                mismatches.push({
                    id: d.id,
                    doc: d,
                    createdStr,
                    dateStr,
                    desc: data.servico_descricao,
                    barber: data.barbeiro_nome,
                    originalTimestamp: data.created_at
                })
            }
        })

        setAuditResults(mismatches)
    }

    const handleRestore = async () => {
        if (!auditResults || auditResults.length === 0) return
        if (!confirm(`Tem certeza que deseja restaurar as datas de ${auditResults.length} registros para suas datas originais de criação (ex: 06, 07, 08)?`)) return

        setRestoring(true)
        try {
            let count = 0
            for (const item of auditResults) {
                await updateDoc(doc(db, 'lancamentos', item.id), {
                    data: item.originalTimestamp // Restore 'data' to match 'created_at'
                })
                count++
            }
            alert(`Sucesso! ${count} registros restaurados. Verifique os relatórios dos dias anteriores.`)
            runDiagnostics() // Refresh
        } catch (e) {
            alert("Erro ao restaurar: " + e.message)
        } finally {
            setRestoring(false)
        }
    }

    return (
        <div className="p-8 bg-gray-900 min-h-screen text-white">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-red-500">DIAGNÓSTICO E REPARO (v2)</h1>
                <button onClick={runDiagnostics} className="bg-gray-800 px-4 py-2 rounded hover:bg-gray-700">Atualizar</button>
            </div>

            {loading && <div className="mb-4 text-cyan-500 animate-pulse">Analisando banco de dados... (pode demorar um pouco)</div>}

            {/* AUDIT SECTION */}
            <div className="mb-8 border border-yellow-800 bg-yellow-900/10 p-6 rounded-xl">
                <h2 className="text-xl font-bold text-yellow-500 mb-4">Auditoria de Datas Alteradas</h2>

                {auditResults === null ? (
                    <span className="text-gray-500">Aguardando análise...</span>
                ) : auditResults.length === 0 ? (
                    <div className="text-green-500 font-bold">Nenhum registro corrompido encontrado (Criado antigo / Data hoje).</div>
                ) : (
                    <div>
                        <div className="text-red-400 font-bold text-lg mb-4">
                            ⚠️ Encontrados {auditResults.length} registros suspeitos!
                            <p className="text-sm text-gray-400 font-normal mt-1">
                                Estes itens foram criados em dias passados, mas agora estão marcados como HOJE.
                                Clicar no botão abaixo vai devolver eles para a data original.
                            </p>
                        </div>

                        <div className="max-h-60 overflow-y-auto bg-black/30 p-4 rounded mb-4 space-y-2 border border-gray-800">
                            {auditResults.map(m => (
                                <div key={m.id} className="text-xs text-mono flex flex-col sm:flex-row gap-2 sm:gap-4 text-gray-300 border-b border-gray-800 pb-1">
                                    <span className="text-green-400 font-bold">Original: {m.createdStr}</span>
                                    <span className="text-red-400">Atual: {m.dateStr}</span>
                                    <span className="text-white">{m.desc} - {m.barber}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleRestore}
                            disabled={restoring}
                            className="w-full sm:w-auto bg-red-600 hover:bg-red-500 text-white font-bold py-4 px-8 rounded-lg shadow-lg shadow-red-900/20 disabled:opacity-50 transition-all active:scale-95"
                        >
                            {restoring ? 'RESTAURANDO...' : `🔄 RESTAURAR ${auditResults.length} REGISTROS`}
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.entries(report).map(([date, data]) => (
                    <div key={date} className="border border-gray-700 p-4 rounded-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10 font-bold text-6xl">{data.count}</div>
                        <h2 className="text-xl font-bold text-cyan-400 mb-2">{date}</h2>
                        {typeof data === 'string' ? (
                            <div className="text-red-400">{data}</div>
                        ) : (
                            <div>
                                <div className="text-lg font-bold mb-2">Total Atual: {data.count}</div>
                                <div className="space-y-2">
                                    {data.samples.map(s => (
                                        <div key={s.id} className="bg-gray-800 p-2 rounded text-sm text-gray-300">
                                            <div className="font-bold text-white truncate">{s.desc}</div>
                                            <div className="flex justify-between text-xs mt-1">
                                                <span>R$ {s.val}</span>
                                                <span className="text-gray-500">{s.bar}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {data.count > 3 && <div className="text-gray-500 text-xs italic mt-2 text-center">+ {data.count - 3} outros...</div>}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
