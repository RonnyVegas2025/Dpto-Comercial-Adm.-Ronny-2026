'use client';

import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const importCards = [
  {
    href: '/importar',
    color: '#f59e0b',
    icon: '🏢',
    label: 'Empresas',
    desc: 'Importar cadastro do Excel',
  },
  {
    href: '/importar/liberacoes',
    color: '#10b981',
    icon: '💳',
    label: 'Liberações',
    desc: 'Créditos liberados por mês',
  },
  {
    href: '/importar/movimentacao',
    color: '#3b82f6',
    icon: '📊',
    label: 'Movimentação',
    desc: 'Convênio, Mobilidade e outros',
  },
  {
    href: '/importar/spreads',
    color: '#8b5cf6',
    icon: '📉',
    label: 'Spreads',
    desc: 'Taxa ADM e rentabilidade',
  },
  {
    href: '/importar/taxa-negativa',
    color: '#ef4444',
    icon: '➖',
    label: 'Taxa Negativa',
    desc: 'Desconto Condicional por mês',
  },
  {
    href: '/importar/fechamento',
    color: '#a855f7',
    icon: '📋',
    label: 'Fechamento',
    desc: 'Vendas e taxas mensais',
  },
];

const analiseCards = [
  {
    href: '/previsao',
    color: '#f59e0b',
    icon: '🔮',
    label: 'Previsão',
    desc: 'Potencial vs meta por consultor',
    ready: true,
  },
  {
    href: '/evolucao',
    color: '#10b981',
    icon: '📈',
    label: 'Evolução',
    desc: 'Movimentação de todas as categorias',
    ready: true,
  },
  {
    href: '/rentabilidade',
    color: '#8b5cf6',
    icon: '💰',
    label: 'Rentabilidade',
    desc: 'Spread e taxa ADM por empresa',
    ready: true,
  },
  {
    href: '/taxa-negativa',
    color: '#ef4444',
    icon: '➖',
    label: 'Taxa Negativa',
    desc: 'Acompanhamento Desconto Condicional',
    ready: true,
  },
  {
    href: '/dashboard',
    color: '#6b7280',
    icon: '🖥️',
    label: 'Dashboard',
    desc: 'Resultados reais (em breve)',
    ready: false,
  },
  {
    href: '/comissoes',
    color: '#6b7280',
    icon: '💸',
    label: 'Comissões',
    desc: 'Cálculo por consultor (em breve)',
    ready: false,
  },
];

export default function PainelPage() {
  const [prof, setProf] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('user_profiles').select('perfil,nome').eq('id', user.id).single()
        .then(({ data }) => setProf(data));
    });
  }, []);

  return (
    <div style={s.page}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .painel-card {
          background: #ffffff;
          border: 1px solid #e4e7ef;
          border-radius: 14px;
          padding: 24px 22px 20px;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: box-shadow 0.18s, transform 0.18s, border-color 0.18s;
          position: relative;
          overflow: hidden;
          animation: fadeUp 0.35s ease both;
        }
        .painel-card:hover {
          box-shadow: 0 6px 24px rgba(0,0,0,0.10);
          transform: translateY(-2px);
        }
        .painel-card.disabled {
          opacity: 0.55;
          cursor: default;
          pointer-events: none;
        }
        .painel-card .arrow {
          color: #d1d5db;
          font-size: 1.1rem;
          transition: color 0.18s, transform 0.18s;
          margin-top: auto;
        }
        .painel-card:hover .arrow {
          transform: translateX(4px);
        }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={s.tag}>♠ Vegas Card</div>
        <h1 style={s.title}>Painel de Controle</h1>
        <p style={s.sub}>Acompanhe importações, previsões e evolução de créditos das empresas cadastradas</p>
      </div>

      {/* Seção Importação */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionIcon}>📥</span>
          <span style={s.sectionLabel}>IMPORTAÇÃO</span>
        </div>
        <div style={s.grid}>
          {importCards.map((card, i) => (
            <Link
              key={card.href}
              href={card.href}
              className="painel-card"
              style={{ animationDelay: `${i * 0.05}s`, borderTop: `3px solid ${card.color}` }}
            >
              <div style={{ fontSize: '1.8rem', lineHeight: 1 }}>{card.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1a1d2e' }}>{card.label}</div>
              <div style={{ fontSize: '0.8rem', color: '#8b92b0', lineHeight: 1.4 }}>{card.desc}</div>
              <div className="arrow">→</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Seção Análise */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionIcon}>🔍</span>
          <span style={s.sectionLabel}>ANÁLISE</span>
        </div>
        <div style={s.grid}>
          {analiseCards.map((card, i) => (
            card.ready ? (
              <Link
                key={card.href}
                href={card.href}
                className="painel-card"
                style={{ animationDelay: `${(i + importCards.length) * 0.05}s`, borderTop: `3px solid ${card.color}` }}
              >
                <div style={{ fontSize: '1.8rem', lineHeight: 1 }}>{card.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1a1d2e' }}>{card.label}</div>
                <div style={{ fontSize: '0.8rem', color: '#8b92b0', lineHeight: 1.4 }}>{card.desc}</div>
                <div className="arrow">→</div>
              </Link>
            ) : (
              <div
                key={card.href}
                className="painel-card disabled"
                style={{ animationDelay: `${(i + importCards.length) * 0.05}s`, borderTop: `3px solid ${card.color}` }}
              >
                <div style={{ fontSize: '1.8rem', lineHeight: 1 }}>{card.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1a1d2e' }}>{card.label}</div>
                <div style={{ fontSize: '0.8rem', color: '#8b92b0', lineHeight: 1.4 }}>{card.desc}</div>
                <div style={{ marginTop: 'auto' }}>
                  <span style={{ background: '#f3f4f6', color: '#9ca3af', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600 }}>Em breve</span>
                </div>
              </div>
            )
          ))}
        </div>
      </section>

      {/* Links rápidos de gestão */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionIcon}>⚙️</span>
          <span style={s.sectionLabel}>GESTÃO</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { href: '/gestao',         label: 'Metas e Consultores', icon: '🎯' },
            { href: '/base-empresas',  label: 'Base de Empresas',    icon: '🏢' },
            { href: '/vendedor',       label: 'Dashboard Vendedor',  icon: '👤' },
            { href: '/agregados',      label: 'Agregados',           icon: '🤝' },
            { href: '/adm-comercial',  label: 'Adm Comercial',       icon: '📁' },
          ].map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                background: '#ffffff',
                border: '1px solid #e4e7ef',
                borderRadius: 10,
                padding: '10px 18px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#4a5068',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.15s',
                animation: `fadeUp 0.35s ease ${(i + importCards.length + analiseCards.length) * 0.05}s both`,
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

const s = {
  page:          { maxWidth: 1200, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#1a1d2e', background: '#f5f6fa', minHeight: '100vh' },
  header:        { marginBottom: 36 },
  tag:           { color: '#b45309', fontWeight: 700, fontSize: '0.75rem', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' },
  title:         { fontSize: '2rem', fontWeight: 700, margin: '0 0 8px', color: '#1a1d2e' },
  sub:           { color: '#8b92b0', fontSize: '0.92rem', margin: 0 },
  section:       { marginBottom: 40 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionIcon:   { fontSize: '1rem' },
  sectionLabel:  { fontSize: '0.72rem', fontWeight: 700, letterSpacing: 2, color: '#9ca3af', textTransform: 'uppercase' },
  grid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
};

