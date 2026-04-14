'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const nav = [
  { href: '/',                 icon: '◈',  label: 'Início'        },
  { href: '/vendedor',         icon: '👤', label: 'Vendedor'      },
  { href: '/gestao',           icon: '⚙️', label: 'Gestão'        },
  { href: '/relatorios',       icon: '📋', label: 'Relatórios'    },
  { href: '/relatorio-empresas', icon: '📑', label: 'Rel. Empresas' },
  { href: '/agregados',        icon: '📦', label: 'Agregados'     },
  { href: '/movimentacoes',    icon: '📥', label: 'Importações'   },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      position: 'fixed',
      top: 0, left: 0,
      width: 220,
      height: '100vh',
      background: '#ffffff',
      borderRight: '1px solid #e4e7ef',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      padding: '24px 0',
      boxShadow: '1px 0 0 #e4e7ef',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            color: '#1a1d2e',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: '1rem',
            letterSpacing: 0.3,
            lineHeight: 1.2,
          }}>Vegas Card</div>
          <div style={{
            color: '#8b92b0',
            fontSize: '0.65rem',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginTop: 3,
          }}>Gestão Comercial</div>
        </div>
      </div>

      {/* Divisor */}
      <div style={{ height: 1, background: '#e4e7ef', margin: '0 0 12px' }} />

      {/* Seção label */}
      <div style={{ padding: '0 20px 8px', color: '#8b92b0', fontSize: '0.62rem',
        fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' }}>
        Menu
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, padding: '0 10px' }}>
        {nav.map(({ href, icon, label }) => {
          const active = pathname === href || (href !== '/' && pathname?.startsWith(href));
          return (
            <Link key={href} href={href} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: active ? 600 : 400,
              fontSize: '0.875rem',
              transition: 'all 0.12s',
              background: active ? '#fff8e6' : 'transparent',
              color: active ? '#b45309' : '#4a5068',
            }}>
              <span style={{
                width: 28, height: 28,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: active ? '#f0b429' : '#f0f2f8',
                borderRadius: 6,
                fontSize: '0.8rem',
                flexShrink: 0,
              }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Rodapé */}
      <div style={{
        padding: '16px 20px 0',
        borderTop: '1px solid #e4e7ef',
        color: '#b0b7cc',
        fontSize: '0.68rem',
        letterSpacing: 0.5,
      }}>
        v1.0 · 2026
      </div>
    </aside>
  );
}
