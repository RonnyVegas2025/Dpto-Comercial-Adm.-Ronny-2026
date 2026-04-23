import Link from 'next/link';

const menus = [
  {
    group: 'Importação',
    icon: '📥',
    items: [
      { href: '/importar',             icon: '🏢', label: 'Empresas',         sub: 'Importar cadastro do Excel',        cor: '#f0b429' },
      { href: '/importar-liberacoes',  icon: '💳', label: 'Liberações',       sub: 'Créditos liberados por mês',        cor: '#34d399' },
      { href: '/importar-fechamento',  icon: '📊', label: 'Fechamento',       sub: 'Vendas e taxas mensais',            cor: '#60a5fa' },
    ],
  },
  {
    group: 'Análise',
    icon: '📈',
    items: [
      { href: '/previsao',   icon: '🔮', label: 'Previsão',    sub: 'Potencial vs meta por consultor', cor: '#f0b429' },
      { href: '/evolucao',   icon: '📈', label: 'Evolução',    sub: 'Histórico de créditos por empresa', cor: '#34d399' },
      { href: '/dashboard',  icon: '📉', label: 'Dashboard',   sub: 'Resultados reais (em breve)',     cor: '#9ca3af', breve: true },
      { href: '/comissoes',  icon: '💰', label: 'Comissões',   sub: 'Cálculo por consultor (em breve)', cor: '#9ca3af', breve: true },
    ],
  },
];

export default function Home() {
  return (
    <div style={s.page}>
      {/* Background grid decorativo */}
      <div style={s.grid} aria-hidden="true" />

      {/* Header */}
      <header style={s.header}>
        <div style={s.logo}>
          <span style={s.logoSpade}>♠</span>
          <div>
            <div style={s.logoName}>Vegas Card</div>
            <div style={s.logoSub}>Gestão Comercial</div>
          </div>
        </div>
        <div style={s.badge}>Sistema Interno · 2026</div>
      </header>

      {/* Hero */}
      <section style={s.hero}>
        <h1 style={s.heroTitle}>
          Painel de<br />
          <span style={s.heroAccent}>Controle</span>
        </h1>
        <p style={s.heroSub}>
          Acompanhe importações, previsões e evolução de créditos das empresas cadastradas
        </p>
      </section>

      {/* Menu groups */}
      <main style={s.main}>
        {menus.map((group) => (
          <div key={group.group} style={s.group}>
            <div style={s.groupLabel}>
              <span style={s.groupIcon}>{group.icon}</span>
              {group.group}
            </div>
            <div style={s.grid2}>
              {group.items.map((item) => (
                item.breve ? (
                  <div key={item.href} style={{ ...s.card, ...s.cardDisabled }}>
                    <div style={s.cardIconWrap}>
                      <span style={s.cardIcon}>{item.icon}</span>
                    </div>
                    <div style={s.cardLabel}>{item.label}</div>
                    <div style={s.cardSub}>{item.sub}</div>
                    <div style={s.brevisBadge}>Em breve</div>
                  </div>
                ) : (
                  <Link key={item.href} href={item.href} style={{ ...s.card, '--cor': item.cor, textDecoration: 'none' }}>
                    <div style={{ ...s.cardAccentLine, background: item.cor }} />
                    <div style={s.cardIconWrap}>
                      <span style={s.cardIcon}>{item.icon}</span>
                    </div>
                    <div style={s.cardLabel}>{item.label}</div>
                    <div style={s.cardSub}>{item.sub}</div>
                    <div style={{ ...s.cardArrow, color: item.cor }}>→</div>
                  </Link>
                )
              ))}
            </div>
          </div>
        ))}
      </main>

      <footer style={s.footer}>
        ♠ Vegas Card · Sistema de Gestão Comercial
      </footer>

      <style>{`
        a[style*="--cor"]:hover {
          background: rgba(255,255,255,0.06) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        a[style*="--cor"] {
          transition: all 0.18s ease;
        }
      `}</style>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    background: '#0a0c10',
    color: '#e8eaf0',
    fontFamily: "'DM Sans', sans-serif",
    position: 'relative',
    overflow: 'hidden',
  },
  grid: {
    position: 'fixed',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
    `,
    backgroundSize: '48px 48px',
    pointerEvents: 'none',
    zIndex: 0,
  },
  header: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '28px 40px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  logoSpade: {
    fontSize: '2rem',
    color: '#f0b429',
    lineHeight: 1,
  },
  logoName: {
    fontSize: '1.15rem',
    fontWeight: 800,
    letterSpacing: 1,
    color: '#e8eaf0',
    fontFamily: "'Syne', sans-serif",
  },
  logoSub: {
    fontSize: '0.72rem',
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  badge: {
    background: 'rgba(240,180,41,0.08)',
    border: '1px solid rgba(240,180,41,0.2)',
    color: '#f0b429',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: 0.5,
  },
  hero: {
    position: 'relative',
    zIndex: 1,
    padding: '56px 40px 40px',
  },
  heroTitle: {
    fontSize: 'clamp(2.4rem, 5vw, 3.6rem)',
    fontWeight: 800,
    lineHeight: 1.1,
    fontFamily: "'Syne', sans-serif",
    margin: '0 0 16px',
    letterSpacing: -1,
  },
  heroAccent: {
    color: '#f0b429',
  },
  heroSub: {
    color: '#6b7280',
    fontSize: '1rem',
    maxWidth: 480,
    lineHeight: 1.6,
  },
  main: {
    position: 'relative',
    zIndex: 1,
    padding: '0 40px 60px',
    display: 'flex',
    flexDirection: 'column',
    gap: 40,
  },
  group: {},
  groupLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#4b5563',
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
  },
  groupIcon: {
    fontSize: '0.9rem',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 14,
  },
  card: {
    position: 'relative',
    background: '#111520',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: '24px 22px 20px',
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  cardDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
  cardAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: '14px 14px 0 0',
  },
  cardIconWrap: {
    marginBottom: 6,
  },
  cardIcon: {
    fontSize: '1.6rem',
  },
  cardLabel: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: '#e8eaf0',
    fontFamily: "'Syne', sans-serif",
  },
  cardSub: {
    fontSize: '0.8rem',
    color: '#6b7280',
    lineHeight: 1.4,
  },
  cardArrow: {
    fontSize: '1.1rem',
    fontWeight: 700,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  brevisBadge: {
    display: 'inline-block',
    marginTop: 8,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: '3px 10px',
    fontSize: '0.7rem',
    color: '#4b5563',
    alignSelf: 'flex-start',
  },
  footer: {
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    padding: '24px',
    color: '#1f2937',
    fontSize: '0.78rem',
    borderTop: '1px solid rgba(255,255,255,0.04)',
  },
};
