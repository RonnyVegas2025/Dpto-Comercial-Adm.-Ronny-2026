import Link from 'next/link';

const cards = [
  {
    href:  '/previsao',
    icon:  '◉',
    label: 'Dashboard de Previsão',
    desc:  'Potencial de movimentação por consultor, categoria e produto',
    cls:   'card-gold',
  },
  {
    href:  '/fechamento',
    icon:  '◎',
    label: 'Fechamento Mensal',
    desc:  'Importe a planilha de fechamento com vendas e taxas',
    cls:   'card-green',
  },
  {
    href:  '/importar',
    icon:  '⊕',
    label: 'Importar Empresas',
    desc:  'Carregue o Excel para atualizar o cadastro de empresas',
    cls:   'card-blue',
  },
];

export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      padding: '48px 40px',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        .nav-card {
          display: block;
          background: #111420;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 28px 24px;
          text-decoration: none;
          transition: border-color 0.2s, transform 0.15s;
        }
        .card-gold:hover { border-color: rgba(240,180,41,0.4); transform: translateY(-2px); }
        .card-green:hover { border-color: rgba(52,211,153,0.4); transform: translateY(-2px); }
        .card-blue:hover { border-color: rgba(96,165,250,0.4); transform: translateY(-2px); }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <div style={{
          color: '#f0b429',
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: '0.75rem',
          letterSpacing: 3,
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          Bem-vindo ao sistema
        </div>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: '2rem',
          fontWeight: 700,
          margin: '0 0 8px',
          color: '#e8eaf0',
        }}>
          Gestão Comercial
        </h1>
        <p style={{ color: '#4b5563', fontSize: '0.9rem', margin: 0 }}>
          Selecione uma seção para começar
        </p>
      </div>

      {/* Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16,
        maxWidth: 900,
      }}>
        {cards.map(({ href, icon, label, desc, cls }) => (
          <Link key={href} href={href} className={`nav-card ${cls}`}>
            <div style={{
              fontSize: '1.6rem',
              marginBottom: 16,
              color: cls === 'card-gold' ? '#f0b429' : cls === 'card-green' ? '#34d399' : '#60a5fa',
            }}>
              {icon}
            </div>
            <div style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 700,
              fontSize: '1rem',
              color: '#e8eaf0',
              marginBottom: 8,
            }}>
              {label}
            </div>
            <div style={{
              color: '#4b5563',
              fontSize: '0.83rem',
              lineHeight: 1.5,
            }}>
              {desc}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
