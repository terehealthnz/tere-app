// /interview-ended — shown after the applicant leaves an interview room.

export default function InterviewEnded() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: '#F8FAFC',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      textAlign: 'center',
    }}>
      <div style={{ background: '#0D2B45', color: 'white', padding: '10px 24px', borderRadius: 999, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', marginBottom: 24 }}>Tere</div>
      <h1 style={{ fontSize: '1.5rem', color: '#0D2B45', marginBottom: 12 }}>Thanks for chatting with us</h1>
      <p style={{ color: '#374151', fontSize: '1rem', maxWidth: 420 }}>Your interview has ended. We'll be in touch with next steps by email.</p>
      <p style={{ color: '#9CA3AF', fontSize: '.85rem', marginTop: 32 }}>Ngā mihi — The Tere Health team</p>
    </div>
  )
}
