import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import App from './App'
import './index.css'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    beforeSend(event) {
      // Strip any PHI that might leak into error reports
      if (event.request?.data) {
        const safe = { ...event.request.data }
        const phiKeys = ['patient_first_name','patient_last_name','patient_nhi','patient_dob','patient_email','patient_phone','chief_complaint','clinical_notes','transcript','vitals']
        phiKeys.forEach(k => { if (safe[k]) safe[k] = '[redacted]' })
        event.request.data = safe
      }
      if (event.extra) {
        event.extra = Object.fromEntries(
          Object.entries(event.extra).filter(([k]) => !['nhi','dob','email','phone','name'].some(s => k.toLowerCase().includes(s)))
        )
      }
      return event
    },
  })
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{padding:'2rem',fontFamily:'monospace',background:'#FEF2F2',minHeight:'100vh'}}>
        <h2 style={{color:'#991B1B'}}>App error — please send this to support</h2>
        <pre style={{whiteSpace:'pre-wrap',wordBreak:'break-all',fontSize:'.8rem',color:'#7F1D1D'}}>
          {this.state.error?.toString()}{'\n\n'}{this.state.error?.stack}
        </pre>
      </div>
    )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </BrowserRouter>
)
