import './globals.css';

export const metadata = {
  title: 'Vegas Card — Gestão Comercial',
  description: 'Sistema de gestão comercial Vegas Card',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, background: '#0a0c10', color: '#e8eaf0', display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, marginLeft: 220, minHeight: '100vh', background: '#0a0c10' }}>
          {children}
        </main>
      </body>
    </html>
  );
}

// ─── Sidebar (Server Component) ───────────────────────────────────────────────
function Sidebar() {
  const nav = [
    { href: '/',          icon: '◈',  label: 'Início'       },
    { href: '/previsao',  icon: '◉',  label: 'Previsão'     },
    { href: '/fechamento',icon: '◎',  label: 'Fechamento'   },
    { href: '/importar',  icon: '⊕',  label: 'Importar'     },
  ];

  return (
    <aside style={{
      position: 'fixed',
      top: 0, left: 0,
      width: 220,
      height: '100vh',
      background: '#0d0f18',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      padding: '28px 0',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 24px 32px' }}>
        <div style={{
          color: '#f0b429',
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: '1.1rem',
          letterSpacing: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{
            background: '#f0b429',
            color: '#000',
            borderRadius: 6,
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.9rem',
            fontWeight: 900,
          }}>♠</span>
          Vegas Card
        </div>
        <div style={{ color: '#374151', fontSize: '0.68rem', letterSpacing: 2, textTransform: 'uppercase', marginTop: 6, paddingLeft: 2 }}>
          Gestão Comercial
        </div>
      </div>

      {/* Divisor */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 16px 20px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>
        {nav.map(({ href, icon, label }) => (
          <a key={href} href={href} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            borderRadius: 10,
            textDecoration: 'none',
            color: '#6b7280',
            fontSize: '0.88rem',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(240,180,41,0.07)';
            e.currentTarget.style.color = '#f0b429';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#6b7280';
          }}>
            <span style={{ fontSize: '1rem', opacity: 0.7 }}>{icon}</span>
            {label}
          </a>
        ))}
      </nav>

      {/* Rodapé */}
      <div style={{ padding: '20px 24px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ color: '#1f2937', fontSize: '0.7rem', letterSpacing: 1 }}>
          v1.0 · 2026
        </div>
      </div>
    </aside>
  );
}
