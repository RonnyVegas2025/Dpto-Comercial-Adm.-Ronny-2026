import Link from 'next/link';

export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
      gap: 32,
      padding: 24,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#f0b429', fontWeight: 800, fontSize: '1rem', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' }}>
          ♠ Vegas Card
        </div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: 8 }}>
          Gestão Comercial
        </h1>
        <p style={{ color: '#6b7280', fontSize: '1rem' }}>
          Sistema interno de acompanhamento de vendas e comissões
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
        <Link href="/importar" style={{
          display: 'block',
          background: '#f0b429',
          color: '#000',
          borderRadius: 12,
          padding: '14px 24px',
          textAlign: 'center',
          fontWeight: 700,
          textDecoration: 'none',
          fontSize: '0.95rem',
        }}>
          📂 Importar Empresas do Excel
        </Link>

        <div style={{
          background: '#161a26',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
          padding: '14px 24px',
          textAlign: 'center',
          color: '#4b5563',
          fontSize: '0.9rem',
        }}>
          📊 Dashboard — em breve
        </div>

        <div style={{
          background: '#161a26',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
          padding: '14px 24px',
          textAlign: 'center',
          color: '#4b5563',
          fontSize: '0.9rem',
        }}>
          💰 Comissões — em breve
        </div>
      </div>
    </div>
  );
}

