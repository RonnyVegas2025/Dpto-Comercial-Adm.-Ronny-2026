'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const nav = [
  { href: '/',           icon: '◈', label: 'Início'     },
  { href: '/previsao',   icon: '◉', label: 'Previsão'   },
  { href: '/vendedor',   icon: '👤', label: 'Vendedor'   },
  { href: '/fechamento', icon: '◎', label: 'Fechamento' },
  { href: '/importar',   icon: '⊕', label: 'Importar'   },
];

export default function Sidebar() {
  const pathname = usePathname();

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
      <div style={{ padding: '0 24px 28px' }}>
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
        <div style={{
          color: '#2d3748',
          fontSize: '0.68rem',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginTop: 6,
          paddingLeft: 2,
        }}>
          Gestão Comercial
        </div>
      </div>

      {/* Divisor */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 16px 16px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>
        {nav.map(({ href, icon, label }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              borderRadius: 10,
              textDecoration: 'none',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: active ? 600 : 500,
              fontSize: '0.88rem',
              transition: 'all 0.15s',
              background: active ? 'rgba(240,180,41,0.1)' : 'transparent',
              color: active ? '#f0b429' : '#6b7280',
              borderLeft: active ? '2px solid #f0b429' : '2px solid transparent',
            }}>
              <span style={{ fontSize: '1rem' }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Rodapé */}
      <div style={{
        padding: '16px 24px 0',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        color: '#1f2937',
        fontSize: '0.7rem',
        letterSpacing: 1,
      }}>
        v1.0 · 2026
      </div>
    </aside>
  );
}
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const nav = [
  { href: '/',           icon: '◈', label: 'Início'     },
  { href: '/previsao',   icon: '◉', label: 'Previsão'   },
  { href: '/vendedor',   icon: '👤', label: 'Vendedor'   },
  { href: '/fechamento', icon: '◎', label: 'Fechamento' },
  { href: '/importar',   icon: '⊕', label: 'Importar'   },
];

export default function Sidebar() {
  const pathname = usePathname();

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
      <div style={{ padding: '0 24px 28px' }}>
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
        <div style={{
          color: '#2d3748',
          fontSize: '0.68rem',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginTop: 6,
          paddingLeft: 2,
        }}>
          Gestão Comercial
        </div>
      </div>

      {/* Divisor */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 16px 16px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>
        {nav.map(({ href, icon, label }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              borderRadius: 10,
              textDecoration: 'none',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: active ? 600 : 500,
              fontSize: '0.88rem',
              transition: 'all 0.15s',
              background: active ? 'rgba(240,180,41,0.1)' : 'transparent',
              color: active ? '#f0b429' : '#6b7280',
              borderLeft: active ? '2px solid #f0b429' : '2px solid transparent',
            }}>
              <span style={{ fontSize: '1rem' }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Rodapé */}
      <div style={{
        padding: '16px 24px 0',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        color: '#1f2937',
        fontSize: '0.7rem',
        letterSpacing: 1,
      }}>
        v1.0 · 2026
      </div>
    </aside>
  );
}
