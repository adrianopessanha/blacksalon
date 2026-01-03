import { useState } from 'react'

export default function DashboardClean() {
    console.log("DashboardClean rendering...")
    return (
        <div className="p-8 bg-gray-900 text-white">
            <h1 className="text-2xl">Dashboard Clean</h1>
            <p>If you see this, the routing works.</p>
        </div>
    )
}
