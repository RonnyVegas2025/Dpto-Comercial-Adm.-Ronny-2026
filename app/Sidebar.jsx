'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, PERFIS } from './context/AuthContext';

const nav = [
  { href: '/',                  icon: '◈',  label: 'Início',        pagina: 'inicio'            },
  { href: '/vendedor',          icon: '👤', label: 'Vendedor',      pagina: 'vendedor'           },
  { href: '/movimentacoes',     icon: '📥', label: 'Importações',   pagina: 'movimentacoes'      },
  { href: '/importar-base',     icon: '🗂️', label: 'Base Empresas', pagina: 'movimentacoes'      },
  { href: '/gestao',            icon: '⚙️', label: 'Gestão',        pagina: 'gestao'             },
  { href: '/relatorios',        icon: '📋', label: 'Relatórios',    pagina: 'relatorios'         },
  { href: '/relatorio-empresas',icon: '📑', label: 'Rel. Empresas', pagina: 'relatorio-empresas' },
  { href: '/agregados',         icon: '📦', label: 'Agregados',     pagina: 'agregados'          },
  { href: '/adm-comercial',     icon: '🏢', label: 'Adm Comercial', pagina: 'adm-comercial'      },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, podeVer, logout } = useAuth();
  const navFiltrado = nav.filter(item => podeVer(item.pagina));

  const corPerfil = {
    gestor_master: '#f0b429', diretoria: '#2563eb', gestor_comercial: '#16a34a',
    supervisor_comercial: '#7c3aed', supervisor_adm: '#ea580c',
    administrativo: '#0891b2', vendedor: '#6b7280',
  };
  const cor = corPerfil[profile?.perfil] || '#6b7280';

  return (
    <aside style={{ position:'fixed', top:0, left:0, width:220, height:'100vh',
      background:'#ffffff', borderRight:'1px solid #e4e7ef',
      display:'flex', flexDirection:'column', zIndex:100, padding:'24px 0' }}>

      <div style={{ padding:'0 20px 20px' }}>
        <div style={{ fontWeight:700, fontSize:'1rem', color:'#1a1d2e', fontFamily:"'DM Sans',sans-serif" }}>Vegas Card</div>
        <div style={{ color:'#8b92b0', fontSize:'0.65rem', letterSpacing:1.5, textTransform:'uppercase', marginTop:3 }}>Gestão Comercial</div>
      </div>

      {profile && (
        <div style={{ margin:'0 10px 12px', background:`${cor}08`, border:`1px solid ${cor}20`, borderRadius:10, padding:'10px 12px' }}>
          <div style={{ fontWeight:600, fontSize:'0.8rem', color:'#1a1d2e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{profile.nome}</div>
          <div style={{ background:cor, color:'#fff', borderRadius:4, padding:'1px 7px', fontSize:'0.62rem', fontWeight:700, display:'inline-block', marginTop:4 }}>
            {PERFIS[profile.perfil] || profile.perfil}
          </div>
        </div>
      )}

      <div style={{ height:1, background:'#e4e7ef', margin:'0 0 10px' }} />
      <div style={{ padding:'0 20px 6px', color:'#8b92b0', fontSize:'0.62rem', fontWeight:600, letterSpacing:1.5, textTransform:'uppercase' }}>Menu</div>

      <nav style={{ flex:1, display:'flex', flexDirection:'column', gap:1, padding:'0 10px', overflowY:'auto' }}>
        {navFiltrado.map(({ href, icon, label }) => {
          const active = pathname === href || (href !== '/' && pathname?.startsWith(href));
          return (
            <Link key={href} href={href} style={{ display:'flex', alignItems:'center', gap:10,
              padding:'8px 12px', borderRadius:8, textDecoration:'none',
              fontFamily:"'DM Sans',sans-serif", fontWeight:active?600:400, fontSize:'0.875rem',
              background:active?'#fff8e6':'transparent', color:active?'#b45309':'#4a5068' }}>
              <span style={{ width:28, height:28, display:'inline-flex', alignItems:'center', justifyContent:'center',
                background:active?'#f0b429':'#f0f2f8', borderRadius:6, fontSize:'0.8rem', flexShrink:0 }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding:'12px 10px 0', borderTop:'1px solid #e4e7ef' }}>
        <button onClick={logout} style={{ display:'flex', alignItems:'center', gap:10,
          width:'100%', padding:'8px 12px', borderRadius:8, background:'transparent',
          border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
          fontSize:'0.85rem', fontWeight:500, color:'#dc2626' }}
          onMouseEnter={e=>e.currentTarget.style.background='#fef2f2'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <span style={{ width:28, height:28, display:'inline-flex', alignItems:'center',
            justifyContent:'center', background:'#fef2f2', borderRadius:6, fontSize:'0.8rem' }}>🚪</span>
          Sair
        </button>
        <div style={{ color:'#b0b7cc', fontSize:'0.65rem', letterSpacing:0.5, padding:'8px 12px 0' }}>v1.0 · 2026</div>
      </div>
    </aside>
  );
}
