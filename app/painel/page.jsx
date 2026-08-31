'use client';

import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';
import {
  Building2, CreditCard, BarChart3, LineChart, TrendingDown, ClipboardList,
  Sparkles, TrendingUp, Wallet, Monitor, Coins, Search, Upload, Settings,
  Target, User, Handshake, Folder, ArrowRight, Circle,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const OUTFIT = "'Outfit', sans-serif";
const INTER  = "'Inter', sans-serif";

// Resolve o nome do ícone Lucide (guardado no campo `icon`) para o componente.
const ICONS = {
  Building2, CreditCard, BarChart3, LineChart, TrendingDown, ClipboardList,
  Sparkles, TrendingUp, Wallet, Monitor, Coins, Target, User, Handshake, Folder,
};

const importCards = [
  {
    href: '/importar',
    color: '#f59e0b',
    icon: 'Building2',
    label: 'Empresas',
    desc: 'Importar cadastro do Excel',
  },
  {
    href: '/importar/liberacoes',
    color: '#10b981',
    icon: 'CreditCard',
    label: 'Liberações',
    desc: 'Créditos liberados por mês',
  },
  {
    href: '/importar/movimentacao',
    color: '#3b82f6',
    icon: 'BarChart3',
    label: 'Movimentação',
    desc: 'Convênio, Mobilidade e outros',
  },
  {
    href: '/importar/spreads',
    color: '#8b5cf6',
    icon: 'LineChart',
    label: 'Spreads',
    desc: 'Taxa ADM e rentabilidade',
  },
  {
    href: '/importar/taxa-negativa',
    color: '#ef4444',
    icon: 'TrendingDown',
    label: 'Taxa Negativa',
    desc: 'Desconto Condicional por mês',
  },
  {
    href: '/importar/fechamento',
    color: '#a855f7',
    icon: 'ClipboardList',
    label: 'Fechamento',
    desc: 'Vendas e taxas mensais',
  },
];

const analiseCards = [
  {
    href: '/previsao',
    color: '#f59e0b',
    icon: 'Sparkles',
    label: 'Previsão',
    desc: 'Potencial vs meta por consultor',
    ready: true,
  },
  {
    href: '/evolucao',
    color: '#10b981',
    icon: 'TrendingUp',
    label: 'Evolução',
    desc: 'Movimentação de todas as categorias',
    ready: true,
  },
  {
    href: '/rentabilidade',
    color: '#8b5cf6',
    icon: 'Wallet',
    label: 'Rentabilidade',
    desc: 'Spread e taxa ADM por empresa',
    ready: true,
  },
  {
    href: '/taxa-negativa',
    color: '#ef4444',
    icon: 'TrendingDown',
    label: 'Taxa Negativa',
    desc: 'Acompanhamento Desconto Condicional',
    ready: true,
  },
  {
    href: '/dashboard',
    color: '#6b7280',
    icon: 'Monitor',
    label: 'Dashboard',
    desc: 'Resultados reais (em breve)',
    ready: false,
  },
  {
    href: '/comissoes',
    color: '#6b7280',
    icon: 'Coins',
    label: 'Comissões',
    desc: 'Cálculo por consultor (em breve)',
    ready: false,
  },
];

const gestaoLinks = [
  { href: '/gestao',         label: 'Metas e Consultores', icon: 'Target'    },
  { href: '/base-empresas',  label: 'Base de Empresas',    icon: 'Building2' },
  { href: '/vendedor',       label: 'Dashboard Vendedor',  icon: 'User'      },
  { href: '/agregados',      label: 'Agregados',           icon: 'Handshake' },
  { href: '/adm-comercial',  label: 'Adm Comercial',       icon: 'Folder'    },
];

function CardConteudo({ card }) {
  const Ico = ICONS[card.icon] || Circle;
  return (
    <>
      <Ico size={20} strokeWidth={1.75} color="var(--vg-brand-500)" style={{ flexShrink: 0 }} />
      <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: 16, color: 'var(--vg-ink)' }}>{card.label}</div>
      <div style={{ fontSize: 14, color: 'var(--vg-ink-secondary)', lineHeight: 1.4 }}>{card.desc}</div>
    </>
  );
}

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
          background: var(--vg-surface);
          border: 1px solid var(--vg-border);
          border-radius: var(--vg-radius-lg);
          padding: 24px;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-shadow: 0 1px 2px rgba(28,31,59,0.04);
          transition: box-shadow 0.18s, transform 0.18s, border-color 0.18s;
          position: relative;
          overflow: hidden;
          animation: fadeUp 0.35s ease both;
        }
        .painel-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--vg-gradient);
          opacity: 0;
          transition: opacity 0.18s;
        }
        .painel-card:hover {
          box-shadow: 0 6px 20px rgba(28,31,59,0.10);
          transform: translateY(-2px);
        }
        .painel-card:hover::before { opacity: 1; }
        .painel-card.disabled {
          opacity: 0.55;
          cursor: default;
          pointer-events: none;
        }
        .painel-card .arrow {
          color: var(--vg-muted);
          transition: transform 0.18s;
          margin-top: auto;
          display: inline-flex;
        }
        .painel-card:hover .arrow {
          transform: translateX(4px);
        }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={s.tag}>Vegas Card / Painel</div>
        <h1 style={s.title}>Painel de Controle</h1>
        <p style={s.sub}>Acompanhe importações, previsões e evolução de créditos das empresas cadastradas</p>
      </div>

      {/* Seção Importação */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <Upload size={16} strokeWidth={1.75} color="var(--vg-muted)" />
          <span style={s.sectionLabel}>IMPORTAÇÃO</span>
        </div>
        <div style={s.grid}>
          {importCards.map((card, i) => (
            <Link
              key={card.href}
              href={card.href}
              className="painel-card"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <CardConteudo card={card} />
              <div className="arrow"><ArrowRight size={18} strokeWidth={1.75} /></div>
            </Link>
          ))}
        </div>
      </section>

      {/* Seção Análise */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <Search size={16} strokeWidth={1.75} color="var(--vg-muted)" />
          <span style={s.sectionLabel}>ANÁLISE</span>
        </div>
        <div style={s.grid}>
          {analiseCards.map((card, i) => (
            card.ready ? (
              <Link
                key={card.href}
                href={card.href}
                className="painel-card"
                style={{ animationDelay: `${(i + importCards.length) * 0.05}s` }}
              >
                <CardConteudo card={card} />
                <div className="arrow"><ArrowRight size={18} strokeWidth={1.75} /></div>
              </Link>
            ) : (
              <div
                key={card.href}
                className="painel-card disabled"
                style={{ animationDelay: `${(i + importCards.length) * 0.05}s` }}
              >
                <CardConteudo card={card} />
                <div style={{ marginTop: 'auto' }}>
                  <span style={{ background: 'var(--vg-neutral-bg)', color: 'var(--vg-neutral-fg)', borderRadius: 'var(--vg-radius-sm)', padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>Em breve</span>
                </div>
              </div>
            )
          ))}
        </div>
      </section>

      {/* Links rápidos de gestão */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <Settings size={16} strokeWidth={1.75} color="var(--vg-muted)" />
          <span style={s.sectionLabel}>GESTÃO</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {gestaoLinks.map((item, i) => {
            const Ico = ICONS[item.icon] || Circle;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  background: 'var(--vg-surface)',
                  border: '1px solid var(--vg-border)',
                  borderRadius: 'var(--vg-radius)',
                  padding: '10px 18px',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--vg-ink-secondary)',
                  boxShadow: '0 1px 2px rgba(28,31,59,0.04)',
                  transition: 'all 0.15s',
                  animation: `fadeUp 0.35s ease ${(i + importCards.length + analiseCards.length) * 0.05}s both`,
                }}
              >
                <Ico size={16} strokeWidth={1.75} color="var(--vg-brand-500)" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const s = {
  page:          { maxWidth: 1200, margin: '0 auto', padding: '32px 24px', fontFamily: INTER, color: 'var(--vg-ink)', background: 'var(--vg-bg)', minHeight: '100vh' },
  header:        { marginBottom: 36 },
  tag:           { color: 'var(--vg-muted)', fontWeight: 600, fontSize: 12, letterSpacing: '0.05em', marginBottom: 10, textTransform: 'uppercase' },
  title:         { fontFamily: OUTFIT, fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: 'var(--vg-ink)' },
  sub:           { color: 'var(--vg-ink-secondary)', fontSize: '0.92rem', margin: 0 },
  section:       { marginBottom: 40 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionLabel:  { fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', color: 'var(--vg-muted)', textTransform: 'uppercase' },
  grid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
};
