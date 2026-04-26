import Link from 'next/link';

const menus = [
  {
    group: 'Importação',
    icon: '📥',
    items: [
      { href: '/importar',            icon: '🏢', label: 'Empresas',    sub: 'Importar cadastro do Excel',         cor: '#f0b429' },
      { href: '/importar-liberacoes',  icon: '💳', label: 'Liberações',    sub: 'Créditos liberados por mês',        cor: '#22c55e' },
      { href: '/importar-movimentacao',icon: '📊', label: 'Movimentação',  sub: 'Convênio, Mobilidade e outros',     cor: '#3b82f6' },
      { href: '/importar-spreads',     icon: '💹', label: 'Spreads',       sub: 'Taxa ADM e rentabilidade',           cor: '#7c3aed' },
      { href: '/importar-fechamento',  icon: '📈', label: 'Fechamento',    sub: 'Vendas e taxas mensais',            cor: '#a78bfa' },
    ],
  },
  {
    group: 'Análise',
    icon: '📈',
    items: [
      { href: '/previsao',       icon: '🔮', label: 'Previsão',       sub: 'Potencial vs meta por consultor',      cor: '#f0b429' },
      { href: '/evolucao',       icon: '📈', label: 'Evolução',       sub: 'Movimentação de todas as categorias',  cor: '#22c55e' },
      { href: '/rentabilidade',  icon: '💹', label: 'Rentabilidade',  sub: 'Spread e taxa ADM por empresa',        cor: '#7c3aed' },
      { href: '#',          icon: '📉', label: 'Dashboard',  sub: 'Resultados reais (em breve)',        cor: '#9ca3af', breve: true },
      { href: '#',          icon: '💰', label: 'Comissões',  sub: 'Cálculo por consultor (em breve)',   cor: '#9ca3af', breve: true },
    ],
  },
];

export default function Home() {
  return (
    <div style={s.page}>
      <div style={s.inner}>

        {/* Header */}
        <div style={s.header}>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Painel de Controle</h1>
          <p style={s.sub}>
            Acompanhe importações, previsões e evolução de créditos das empresas cadastradas
          </p>
        </div>

        {/* Grupos */}
        {menus.map((group) => (
          <div key={group.group} style={s.group}>
            <div style={s.groupLabel}>
              <span>{group.icon}</span>
              {group.group.toUpperCase()}
            </div>
            <div style={s.grid}>
              {group.items.map((item) =>
                item.breve ? (
                  <div key={item.label} style={{ ...s.card, ...s.cardDisabled }}>
                    <div style={s.cardIcon}>{item.icon}</div>
                    <div style={s.cardLabel}>{item.label}</div>
                    <div style={s.cardSub}>{item.sub}</div>
                    <div style={s.brevisBadge}>Em breve</div>
                  </div>
                ) : (
                  <Link key={item.href} href={item.href} style={{ ...s.card, textDecoration: 'none' }}>
                    <div style={{ ...s.cardTopLine, background: item.cor }} />
                    <div style={s.cardIcon}>{item.icon}</div>
                    <div style={s.cardLabel}>{item.label}</div>
                    <div style={s.cardSub}>{item.sub}</div>
                    <div style={{ ...s.cardArrow, color: item.cor }}>→</div>
                  </Link>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        a[href]:hover > div:first-child { opacity: 1; }
        a[href]:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10) !important; transform: translateY(-1px); }
        a[href] { transition: box-shadow 0.15s, transform 0.15s; }
      `}</style>
    </div>
  );
}

const s = {
  page: {
    background: '#f3f4f6',
    minHeight: '100vh',
    fontFamily: "'DM Sans', sans-serif",
    color: '#111827',
  },
  inner: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '32px 24px',
  },

  header: {
    marginBottom: 36,
  },
  tag: {
    color: '#f0b429',
    fontWeight: 800,
    fontSize: '0.85rem',
    letterSpacing: 2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: '1.9rem',
    fontWeight: 700,
    margin: '0 0 8px',
    color: '#111827',
  },
  sub: {
    color: '#6b7280',
    fontSize: '0.9rem',
    margin: 0,
  },

  group: {
    marginBottom: 36,
  },
  groupLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#9ca3af',
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 14,
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 14,
  },
  card: {
    position: 'relative',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    padding: '22px 20px 18px',
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardDisabled: {
    opacity: 0.45,
    cursor: 'default',
    pointerEvents: 'none',
  },
  cardTopLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: '14px 14px 0 0',
  },
  cardIcon: {
    fontSize: '1.5rem',
    marginBottom: 6,
  },
  cardLabel: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#111827',
  },
  cardSub: {
    fontSize: '0.8rem',
    color: '#6b7280',
    lineHeight: 1.4,
  },
  cardArrow: {
    fontSize: '1rem',
    fontWeight: 700,
    marginTop: 10,
  },
  brevisBadge: {
    display: 'inline-block',
    marginTop: 8,
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    padding: '3px 10px',
    fontSize: '0.7rem',
    color: '#9ca3af',
    alignSelf: 'flex-start',
  },
};
