'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, PERFIS } from './context/AuthContext';
import { navVisivel } from './navItems';
import {
  LayoutDashboard, User, Upload, Building2, LineChart, PackagePlus, Settings,
  ClipboardList, Lock, BarChart3, CreditCard, TrendingUp, Package, FileText,
  Briefcase, LogOut, Circle,
} from 'lucide-react';

const ICONES = {
  LayoutDashboard, User, Upload, Building2, LineChart, PackagePlus, Settings,
  ClipboardList, Lock, BarChart3, CreditCard, TrendingUp, Package, FileText, Briefcase,
};

const OUTFIT = "'Outfit', sans-serif";
const INTER  = "'Inter', sans-serif";

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, podeVer, logout } = useAuth();

  const navFiltrado = navVisivel(profile, podeVer);

  return (
    <aside style={{ position:'fixed', top:0, left:0, width:248, height:'100vh',
      background:'var(--vg-surface)', borderRight:'1px solid var(--vg-border)',
      display:'flex', flexDirection:'column', zIndex:100, padding:'24px 0', fontFamily:INTER }}>

      {/* Cabeçalho */}
      <div style={{ padding:'0 20px 20px' }}>
        <div style={{ fontFamily:OUTFIT, fontWeight:600, fontSize:18, lineHeight:'24px', color:'var(--vg-ink)' }}>Vegas Card</div>
        <div style={{ color:'var(--vg-muted)', fontSize:12, letterSpacing:'0.05em', textTransform:'uppercase', marginTop:3 }}>Gestão Comercial</div>
      </div>

      {/* Bloco do usuário */}
      {profile && (
        <div style={{ margin:'0 12px 12px', background:'var(--vg-surface-muted)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius)', padding:'10px 12px' }}>
          <div style={{ fontWeight:600, fontSize:13, color:'var(--vg-ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{profile.nome}</div>
          <div style={{ background:'var(--vg-info-bg)', color:'var(--vg-info-fg)', borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:600, display:'inline-block', marginTop:5 }}>
            {PERFIS[profile.perfil] || profile.perfil}
          </div>
          {/* Perfil: acessível a QUALQUER usuário autenticado, fora do filtro podeVer(). */}
          <Link href="/perfil" style={{ display:'flex', alignItems:'center', gap:6, marginTop:9, textDecoration:'none',
            color: pathname?.startsWith('/perfil') ? 'var(--vg-brand-700)' : 'var(--vg-ink-secondary)', fontSize:12, fontWeight:600 }}>
            <Settings size={14} strokeWidth={1.75} color={pathname?.startsWith('/perfil') ? 'var(--vg-brand-500)' : 'var(--vg-muted)'} /> Meu perfil e senha
          </Link>
        </div>
      )}

      <div style={{ height:1, background:'var(--vg-border)', margin:'0 0 10px' }} />
      <div style={{ padding:'0 20px 6px', color:'var(--vg-muted)', fontSize:12, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase' }}>Menu</div>

      {/* Itens */}
      <nav style={{ flex:1, display:'flex', flexDirection:'column', gap:2, padding:'0 10px', overflowY:'auto' }}>
        {navFiltrado.map(({ href, icon, label }) => {
          const active = pathname === href || (href !== '/' && pathname?.startsWith(href));
          const Ico = ICONES[icon] || Circle;
          return (
            <Link key={href} href={href}
              onMouseEnter={e => { if(!active) e.currentTarget.style.background = 'var(--vg-surface-muted)'; }}
              onMouseLeave={e => { if(!active) e.currentTarget.style.background = 'transparent'; }}
              style={{ position:'relative', display:'flex', alignItems:'center', gap:10,
                padding:'9px 12px', borderRadius:'var(--vg-radius-sm)', textDecoration:'none',
                fontFamily:INTER, fontWeight:active?600:500, fontSize:14,
                background: active ? 'var(--vg-brand-50)' : 'transparent',
                color: active ? 'var(--vg-brand-700)' : 'var(--vg-ink-secondary)',
                transition:'background 0.15s' }}>
              {active && <span style={{ position:'absolute', left:0, top:6, bottom:6, width:3, borderRadius:2, background:'var(--vg-gradient)' }} />}
              <Ico size={18} strokeWidth={1.75} color={active ? 'var(--vg-brand-500)' : 'var(--vg-muted)'} style={{ flexShrink:0 }} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sair */}
      <div style={{ padding:'12px 10px 0', borderTop:'1px solid var(--vg-border)' }}>
        <button onClick={logout} style={{ display:'flex', alignItems:'center', gap:10,
          width:'100%', padding:'9px 12px', borderRadius:'var(--vg-radius-sm)', background:'transparent',
          border:'none', cursor:'pointer', fontFamily:INTER, fontSize:14, fontWeight:500, color:'var(--vg-danger-fg)', transition:'background 0.15s' }}
          onMouseEnter={e=>e.currentTarget.style.background='var(--vg-danger-bg)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <LogOut size={18} strokeWidth={1.75} color="var(--vg-danger-fg)" style={{ flexShrink:0 }} /> Sair
        </button>
        <div style={{ color:'var(--vg-muted)', fontSize:11, letterSpacing:0.3, padding:'8px 12px 0' }}>v1.0 · 2026</div>
      </div>
    </aside>
  );
}
