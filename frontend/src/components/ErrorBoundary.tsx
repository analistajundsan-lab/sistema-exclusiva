import { Component, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ color: '#dc2626', marginBottom: 8 }}>Erro ao carregar o sistema</h2>
          <p style={{ color: '#374151', marginBottom: 16 }}>
            Tente recarregar a página (F5). Se o erro persistir, entre em contato com o suporte.
          </p>
          <pre style={{ background: '#f3f4f6', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto', color: '#374151' }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, background: '#00341b', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
          >
            Recarregar página
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
