'use client';

import Link from 'next/link';

const cards = [
  {
    href:  '/vendedor',
    icon:  '👤',
    label: 'Dashboard Vendedor',
    desc:  'Acompanhe metas, movimentações e resultado por consultor',
    color: '#f0b429',
  },
  {
    href:  '/gestao',
    icon:  '⚙️',
    label: 'Gestão de Empresas',
    desc:  'Edite cadastros, histórico CRM e dados comerciais',
    color: '#a78bfa',
  },
  {
    href:  '/movimentacoes',
    icon:  '💳',
    label: 'Movimentações',
    desc:  'Visualize e importe fechamentos mensais por empresa',
    color: '#34d399',
  },
  {
    href:  '/relatorios',
    icon:  '📋',
    label: 'Relatórios',
    desc:  'Filtre e exporte dados completos de empresas',
    color: '#60a5fa',
  },
  {
    href:  '/importar',
    icon:  '⊕',
    label: 'Importar Empresas',
    desc:  'Carregue o Excel para atualizar o cadastro',
    color: '#fb923c',
  },
];

export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      padding: '48px 40px',
      fontFamily: "'DM Sans', sans-serif",
    }}>
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
          ♠ Vegas Card
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

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16,
        maxWidth: 960,
      }}>
        {cards.map(({ href, icon, label, desc, color }) => (
          <Link key={href} href={href} style={{
            display: 'block',
            background: '#111420',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16,
            padding: '28px 24px',
            textDecoration: 'none',
            transition: 'border-color 0.2s, transform 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = color + '44';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}>
            <div style={{ fontSize: '1.6rem', color, marginBottom: 16 }}>{icon}</div>
            <div style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 700,
              fontSize: '1rem',
              color: '#e8eaf0',
              marginBottom: 8,
            }}>{label}</div>
            <div style={{ color: '#4b5563', fontSize: '0.83rem', lineHeight: 1.5 }}>{desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
