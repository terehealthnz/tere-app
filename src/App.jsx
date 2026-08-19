import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

function isChunkError(error) {
  const msg = error?.message || ''
  // Vite lazy-load failures after a redeploy come in several flavours
  // depending on browser + timing. All map to "the JS chunk hash the
  // bundle wants no longer exists on the server, so index.html was
  // returned instead" — a hard reload picks up the fresh hashes.
  return msg.includes('dynamically imported module') ||
         msg.includes('Loading chunk') ||
         msg.includes('Failed to fetch dynamically imported') ||
         msg.includes('Importing a module script failed') ||
         msg.includes('MIME type of "text/html"') ||
         msg.includes('module script but the server responded') ||
         error?.name === 'ChunkLoadError'
}

class ChunkErrorBoundary extends React.Component {
  state = { hasError: false, chunkError: false }

  static getDerivedStateFromError(error) {
    return { hasError: true, chunkError: isChunkError(error) }
  }

  componentDidCatch(error) {
    if (isChunkError(error)) {
      const key = 'tere_chunk_reload'
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        // Hard navigation to current path — fetches fresh HTML with correct chunk hashes
        window.location.href = window.location.href
      } else {
        sessionStorage.removeItem(key)
        // Second failure: don't loop — fall through to show manual reload button
        this.setState({ chunkError: false })
      }
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.state.chunkError) {
      return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100dvh', background:'#F7F5F0' }}>
          <div style={{ textAlign:'center', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
            <div className="spinner" style={{ margin:'0 auto 1rem' }} />
            <div style={{ color:'#6B7280', fontSize:'.9rem' }}>Updating app…</div>
          </div>
        </div>
      )
    }
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100dvh', flexDirection:'column', gap:'1rem', fontFamily:'Plus Jakarta Sans, sans-serif', padding:'2rem', textAlign:'center', background:'#F7F5F0' }}>
        <div style={{ fontSize:'1.25rem', fontWeight:700, color:'#0D2B45' }}>Something went wrong.</div>
        <div style={{ fontSize:'.9rem', color:'#6B7280' }}>Please reload to try again.</div>
        <button onClick={() => window.location.reload()} style={{ background:'#0B6E76', color:'white', border:'none', borderRadius:99, padding:'.75rem 1.5rem', fontWeight:700, cursor:'pointer', fontSize:'1rem', fontFamily:'Plus Jakarta Sans, sans-serif' }}>Reload</button>
      </div>
    )
  }
}

// Eager: root screens shown immediately on first load
import Landing from './pages/Landing'
import { REGIONS, detectRegion } from './lib/region'
import TereIntro from './components/patient/TereIntro'

// Lazy: everything else split into separate chunks
const IntakeForm          = lazy(() => import('./components/patient/IntakeForm'))
const AITriage            = lazy(() => import('./components/patient/AITriage'))
const AvailabilityCheck   = lazy(() => import('./components/patient/AvailabilityCheck'))
const VitalsCapture       = lazy(() => import('./components/patient/VitalsCapture'))
const WaitingRoom         = lazy(() => import('./components/patient/WaitingRoom'))
const PatientCall         = lazy(() => import('./components/patient/PatientCall'))
const PostConsult         = lazy(() => import('./components/patient/PostConsult'))
const Payment             = lazy(() => import('./components/patient/Payment'))
const ConsultationType    = lazy(() => import('./pages/patient/ConsultationType'))
const MessageSent         = lazy(() => import('./pages/patient/MessageSent'))
const Waitlisted          = lazy(() => import('./pages/patient/Waitlisted'))
const ResumePayment       = lazy(() => import('./pages/patient/ResumePayment'))
const TriageReview        = lazy(() => import('./pages/patient/TriageReview'))
const BookAppointment     = lazy(() => import('./pages/patient/BookAppointment'))
const BookingChange       = lazy(() => import('./pages/patient/BookingChange'))
const BookingCancel       = lazy(() => import('./pages/patient/BookingCancel'))
const BookingJoin         = lazy(() => import('./pages/patient/BookingJoin'))
const ConsultationSummary = lazy(() => import('./pages/patient/ConsultationSummary'))
const RepeatPrescription  = lazy(() => import('./pages/patient/RepeatPrescription'))
const ClinicianLogin      = lazy(() => import('./components/clinician/Login'))
const Dashboard           = lazy(() => import('./components/clinician/Dashboard'))
const ConsultView         = lazy(() => import('./components/clinician/ConsultView'))
const Admin               = lazy(() => import('./components/clinician/Admin'))
const AdminFlags          = lazy(() => import('./pages/clinician/AdminFlags'))
const NotesCompletion     = lazy(() => import('./pages/clinician/NotesCompletion'))
const ChangePassword      = lazy(() => import('./pages/clinician/ChangePassword'))
const ForgotPassword      = lazy(() => import('./pages/clinician/ForgotPassword'))
const ResetPassword       = lazy(() => import('./pages/clinician/ResetPassword'))
const RadiologyReports    = lazy(() => import('./pages/clinician/RadiologyReports'))
const ProviderApp         = lazy(() => import('./pages/clinician/ProviderApp'))
const ClinicianPatient    = lazy(() => import('./pages/clinician/ClinicianPatient'))
const ProviderConsult     = lazy(() => import('./pages/clinician/ProviderConsult'))
const ProviderNotes       = lazy(() => import('./pages/clinician/ProviderNotes'))
const ProviderEarnings    = lazy(() => import('./pages/clinician/ProviderEarnings'))
const AdminApp            = lazy(() => import('./pages/clinician/AdminApp'))
const AdminPayroll        = lazy(() => import('./pages/clinician/AdminPayroll'))
const ProviderStateLicenses = lazy(() => import('./pages/clinician/ProviderStateLicenses'))
const MyProfile           = lazy(() => import('./pages/clinician/MyProfile'))
const AdminStateLicenses  = lazy(() => import('./pages/clinician/AdminStateLicenses'))
const ProviderInbox       = lazy(() => import('./pages/clinician/ProviderInbox'))
const Employers           = lazy(() => import('./pages/Employers'))
const PrivacyPolicy       = lazy(() => import('./pages/PrivacyPolicy'))
const Terms               = lazy(() => import('./pages/Terms'))
const Careers             = lazy(() => import('./pages/Careers'))
const CareersApply         = lazy(() => import('./pages/CareersApply'))
const Rate                = lazy(() => import('./pages/Rate'))
const Complaints          = lazy(() => import('./pages/Complaints'))
const Watch               = lazy(() => import('./pages/Watch'))
const Waitlist            = lazy(() => import('./pages/Waitlist'))
import BetaBanner from './components/BetaBanner'
const Contact             = lazy(() => import('./pages/patient/Contact'))
const Accessibility       = lazy(() => import('./pages/Accessibility'))
const DemoLanding         = lazy(() => import('./pages/demo/DemoLanding'))
const DemoPatient         = lazy(() => import('./pages/demo/DemoPatient'))
const DemoProvider        = lazy(() => import('./pages/demo/DemoProvider'))
const DemoAdmin           = lazy(() => import('./pages/demo/DemoAdmin'))
const AsyncMessage        = lazy(() => import('./pages/patient/AsyncMessage'))
const VitalsValidate      = lazy(() => import('./pages/patient/VitalsValidate'))
const VitalsValidateDash  = lazy(() => import('./pages/patient/VitalsValidateDashboard'))
const VitalsValidatePIS   = lazy(() => import('./pages/patient/VitalsValidateParticipantInfo'))
const ConsentPage         = lazy(() => import('./pages/patient/ConsentPage'))
const USLanding           = lazy(() => import('./pages/us/USLanding'))
const USStart             = lazy(() => import('./pages/us/USStart'))
const HipaaNotice         = lazy(() => import('./pages/us/HipaaNotice'))

const Spinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#F7F5F0' }}>
    <div className="spinner" />
  </div>
)

function PwaRoot() {
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  if (isPWA) {
    const portal = localStorage.getItem('tere_portal')
    if (portal === 'provider') return <Navigate to="/provider" replace />
    if (portal === 'admin') return <Navigate to="/admin" replace />
    return <Navigate to="/start" replace />
  }
  const region = detectRegion()
  if (region === REGIONS.US) return <USLanding />
  if (region === REGIONS.NZ) return <Landing />
  return <TereIntro />
}

// /start dispatches by region. US visitors get the US intake flow
// (state licence gate + intent capture). Everyone else keeps the
// existing NZ TereIntro flow.
function StartRouter() {
  const region = detectRegion()
  if (region === REGIONS.US) return <USStart />
  return <TereIntro />
}

// /waitlist dispatches by region. NZ visitors get the Tere Health
// pre-launch waitlist page. US visitors get sent to the Tere Care
// landing (/) — they can then choose to start an intake (state
// picker widget), read pricing, or just leave. Forcing them
// straight into the intake flow was too aggressive.
function WaitlistRouter() {
  const region = detectRegion()
  if (region === REGIONS.US) return <Navigate to="/" replace />
  return <Waitlist />
}

export default function App() {
  return (
    <ChunkErrorBoundary>
    <BetaBanner />
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/"                       element={<PwaRoot />} />
        <Route path="/start"                  element={<StartRouter />} />
        <Route path="/notice-of-privacy-practices" element={<HipaaNotice />} />
        <Route path="/consent"                element={<ConsentPage />} />
        <Route path="/triage"                 element={<AITriage />} />
        <Route path="/vitals"                 element={<VitalsCapture />} />
        <Route path="/vitals/:id"             element={<VitalsCapture />} />
        <Route path="/consultation-type"      element={<ConsultationType />} />
        <Route path="/payment"                element={<Payment />} />
        <Route path="/message-sent"           element={<MessageSent />} />
        <Route path="/waiting"                element={<WaitingRoom />} />
        <Route path="/waiting/:id"            element={<WaitingRoom />} />
        <Route path="/call"                   element={<PatientCall />} />
        <Route path="/waitlisted/:id"         element={<Waitlisted />} />
        <Route path="/resume/:id"             element={<ResumePayment />} />
        <Route path="/triage-review"          element={<TriageReview />} />
        <Route path="/done"                   element={<PostConsult />} />
        {/* BOOKING — currently disabled (VITE_BOOKING_ENABLED=false); routes kept for when re-enabled */}
        <Route path="/book"                   element={<BookAppointment />} />
        <Route path="/booking/change/:id"     element={<BookingChange />} />
        <Route path="/booking/cancel/:id"     element={<BookingCancel />} />
        <Route path="/booking/join/:id"       element={<BookingJoin />} />
        <Route path="/my-consultation/:token" element={<ConsultationSummary />} />
        <Route path="/repeat-rx"              element={<RepeatPrescription />} />
        <Route path="/complaints"             element={<Complaints />} />
        <Route path="/watch"                  element={<Watch />} />
        <Route path="/waitlist"               element={<WaitlistRouter />} />
        <Route path="/contact"                element={<Contact />} />
        <Route path="/accessibility"          element={<Accessibility />} />
        <Route path="/provider"               element={<ProviderApp />} />
        <Route path="/provider/consult/:id"   element={<ProviderConsult />} />
        <Route path="/clinician/patient/:id"  element={<ClinicianPatient />} />
        <Route path="/provider/notes/:id"     element={<ProviderNotes />} />
        <Route path="/admin"                  element={<AdminApp />} />
        <Route path="/admin/payroll"          element={<AdminPayroll />} />
        <Route path="/provider/earnings"      element={<ProviderEarnings embedded={false} />} />
        <Route path="/clinician"              element={<ClinicianLogin />} />
        <Route path="/clinician/dashboard"    element={<Dashboard />} />
        <Route path="/clinician/profile"      element={<MyProfile />} />
        <Route path="/clinician/change-password" element={<ChangePassword />} />
        <Route path="/clinician/forgot-password" element={<ForgotPassword />} />
        <Route path="/clinician/reset-password"  element={<ResetPassword />} />
        <Route path="/clinician/reports"         element={<RadiologyReports />} />
        <Route path="/clinician/admin"        element={<Admin />} />
        <Route path="/clinician/admin/flags"  element={<AdminFlags />} />
        <Route path="/clinician/state-licenses"       element={<ProviderStateLicenses />} />
        <Route path="/clinician/admin/state-licenses" element={<AdminStateLicenses />} />
        <Route path="/clinician/inbox"                element={<ProviderInbox />} />
        <Route path="/clinician/consult/:id"  element={<ConsultView />} />
        <Route path="/clinician/notes/:id"    element={<NotesCompletion />} />
        <Route path="/careers"                element={<Careers />} />
        <Route path="/careers/apply"          element={<CareersApply />} />
        <Route path="/careers/apply/:slug"    element={<CareersApply />} />
        <Route path="/employers"              element={<Employers />} />
        <Route path="/rate/:id"               element={<Rate />} />
        <Route path="/privacy"                element={<PrivacyPolicy />} />
        <Route path="/landing"                element={<Landing />} />
        <Route path="/terms"                  element={<Terms />} />
        <Route path="/demo"                       element={<DemoLanding />} />
        <Route path="/demo/patient"               element={<DemoPatient />} />
        <Route path="/demo/provider"              element={<DemoProvider />} />
        <Route path="/demo/admin"                 element={<DemoAdmin />} />
        <Route path="/async-message/:id"          element={<AsyncMessage />} />
        <Route path="/vitals-validate"                     element={<VitalsValidate />} />
        <Route path="/vitals-validate/dashboard"           element={<VitalsValidateDash />} />
        <Route path="/vitals-validate/participant-info"    element={<VitalsValidatePIS />} />
        <Route path="*"                           element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </ChunkErrorBoundary>
  )
}
