import React from 'react'

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
                    <div className="bg-gray-950 p-6 rounded-xl border border-red-500/50 max-w-lg">
                        <h1 className="text-2xl font-bold text-red-500 mb-4">Algo deu errado</h1>
                        <p className="mb-4 text-gray-300">Ocorreu um erro inesperado na aplicação.</p>
                        <pre className="bg-black p-4 rounded text-xs overflow-auto text-red-400 mb-4 whitespace-pre-wrap">
                            {this.state.error?.toString()}
                            <br />
                            {this.state.errorInfo?.componentStack}
                        </pre>
                        <button
                            onClick={() => window.location.href = '/'}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded transition-colors"
                        >
                            Voltar ao Início
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
