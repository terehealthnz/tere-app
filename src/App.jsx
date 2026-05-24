import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import IntakeForm        from './components/patient/IntakeForm'
import AITriage          from './components/patient/AITriage'
import AvailabilityCheck from './components/patient/AvailabilityCheck'
import VitalsCapture     from './components/patient/VitalsCapture'
import WaitingRoom       from './components/patient/WaitingRoom'
import PatientCall       from './components/patient/PatientCall'
import PostConsult       from './components/patient/PostConsult'
import ClinicianLogin    from './components/clinician/Login'
import Dashboard         from './components/clinician/Dashboard'
import ConsultView       from './components/clinician/ConsultView'
import Admin             from './components/clinician/Admin'
import NotesCompletion   from './pages/clinician/NotesCompletion'
import ChangePassword    from './pages/clinician/ChangePassword'
import Employers         from './pages/Employers'
import Payment           from './components/patient/Payment'
import ConsultationType  from './pages/patient/ConsultationType'
import MessageSent       from './pages/patient/MessageSent'
import Waitlisted        from './pages/patient/Waitlisted'
import ResumePayment     from './pages/patient/ResumePayment'
import PrivacyPolicy     from './pages/PrivacyPolicy'
import Landing           from './pages/Landing'
import Terms             from './pages/Terms'
import Careers           from './pages/Careers'
import Rate              from './pages/Rate'
import DemoLanding       from './pages/demo/DemoLanding'
import DemoPatient       from './pages/demo/DemoPatient'
import DemoProvider      from './pages/demo/DemoProvider'
import DemoAdmin         from './pages/demo/DemoAdmin'
import ProviderApp       from './pages/clinician/ProviderApp'
import ProviderConsult   from './pages/clinician/ProviderConsult'
import ProviderNotes     from './pages/clinician/ProviderNotes'
import ProviderSchedule  from './pages/clinician/ProviderSchedule'
import AdminApp          from './pages/clinician/AdminApp'
import AdminSchedule     from './pages/clinician/AdminSchedule'
import AdminPayroll      from './pages/clinician/AdminPayroll'
import ProviderEarnings  from './pages/clinician/ProviderEarnings'
import BookAppointment   from './pages/patient/BookAppointment'
import StatusPage        from './pages/StatusPage'
import ConsultationSummary from './pages/patient/ConsultationSummary'
import RepeatPrescription from './pages/patient/RepeatPrescription'
import Complaints        from './pages/Complaints'
import Accessibility     from './pages/Accessibility'

export default function App() {
  return (
    <Routes>
      <Route path="/"                      element={<Landing />} />
      <Route path="/triage"                element={<AITriage />} />
      <Route path="/vitals"                element={<VitalsCapture />} />
      <Route path="/consultation-type"       element={<ConsultationType />} />
      <Route path="/payment"               element={<Payment />} />
      <Route path="/message-sent"          element={<MessageSent />} />
      <Route path="/waiting"               element={<WaitingRoom />} />
      <Route path="/call"                  element={<PatientCall />} />
      <Route path="/waitlisted/:id"          element={<Waitlisted />} />
      <Route path="/resume/:id"              element={<ResumePayment />} />
      <Route path="/done"                  element={<PostConsult />} />
      <Route path="/book"                  element={<BookAppointment />} />
      <Route path="/status"                element={<StatusPage />} />
      <Route path="/my-consultation/:token" element={<ConsultationSummary />} />
      <Route path="/repeat-rx"             element={<RepeatPrescription />} />
      <Route path="/complaints"            element={<Complaints />} />
      <Route path="/accessibility"         element={<Accessibility />} />
      <Route path="/provider"              element={<ProviderApp />} />
      <Route path="/provider/consult/:id"  element={<ProviderConsult />} />
      <Route path="/provider/notes/:id"    element={<ProviderNotes />} />
      <Route path="/provider/schedule"     element={<ProviderSchedule />} />
      <Route path="/admin"                 element={<AdminApp />} />
      <Route path="/admin/schedule"        element={<AdminSchedule />} />
      <Route path="/admin/payroll"         element={<AdminPayroll />} />
      <Route path="/provider/earnings"     element={<ProviderEarnings embedded={false} />} />
      <Route path="/clinician"             element={<ClinicianLogin />} />
      <Route path="/clinician/dashboard"       element={<Dashboard />} />
      <Route path="/clinician/change-password" element={<ChangePassword />} />
      <Route path="/clinician/admin"       element={<Admin />} />
      <Route path="/clinician/consult/:id" element={<ConsultView />} />
      <Route path="/clinician/notes/:id"  element={<NotesCompletion />} />
      <Route path="/careers"               element={<Careers />} />
      <Route path="/employers"             element={<Employers />} />
      <Route path="/rate/:id"              element={<Rate />} />
      <Route path="/privacy"               element={<PrivacyPolicy />} />
      <Route path="/landing"               element={<Navigate to="/" replace />} />
      <Route path="/terms"                 element={<Terms />} />
      <Route path="/demo"                  element={<DemoLanding />} />
      <Route path="/demo/patient"          element={<DemoPatient />} />
      <Route path="/demo/provider"         element={<DemoProvider />} />
      <Route path="/demo/admin"            element={<DemoAdmin />} />
      <Route path="*"                      element={<Navigate to="/" replace />} />
    </Routes>
  )
}
