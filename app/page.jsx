import Link from 'next/link';
import Sidebar from './Sidebar';

export default function Home() {
  const cards = [
    { href:'/vendedor',      icon:'👤', label:'Vendedor',       desc:'Dashboard de performance e metas',    cor:'#2563eb', bg:'#eff6ff' },
    { href:'/movimentacoes', icon:'💳', label:'Movimentações',  desc:'Importar fechamentos mensais',         cor:'#16a34a', bg:'#f0fdf4' },
    { href:'/gestao',        icon:'⚙️', label:'Gestão',         desc:'Painel de empresas e contratos',       cor:'#7c3aed', bg:'#f5f3ff' },
    { href:'/relatorios',    icon:'📋', label:'Relatórios',     desc:'Exportar dados e conferências',        cor:'#f0b429', bg:'#fff8e6' },
    { href:'/relatorio-empresas', icon:'📑', label:'Rel. Empresas', desc:'Relatório customizável de empresas', cor:'#0891b2', bg:'#ecfeff' },
    { href:'/agregados',     icon:'📦', label:'Agregados',      desc:'WellHub · Total Pass · Telemedicina',  cor:'#ea580c', bg:'#fff7ed' },
  ];

  return (
    <div style={{ display:'flex' }}>
      <Sidebar />
      <main style={{ marginLeft:220, flex:1, minHeight:'100vh', padding:'40px 40px', background:'#f5f6fa' }}>
        {/* Header */}
        <div style={{ marginBottom:40 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
            <span style={{ background:'#f0b429', borderRadius:8, width:36, height:36,
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              fontSize:'1.1rem', fontWeight:900 }}>♠</span>
            <div>
              <h1 style={{ fontSize:'1.5rem', fontWeight:700, color:'#1a1d2e', margin:0 }}>
                Bem-vindo ao Sistema
              </h1>
              <p style={{ color:'#8b92b0', fontSize:'0.85rem', margin:0, marginTop:2 }}>
                Vegas Card — Gestão Comercial · {new Date().toLocaleDateString('pt-BR', { month:'long', year:'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Cards de módulos */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 }}>
          {cards.map(c => (
            <Link key={c.href} href={c.href} style={{ textDecoration:'none' }}>
              <div style={{
                background:'#ffffff',
                border:'1px solid #e4e7ef',
                borderRadius:12,
                padding:'20px 24px',
                cursor:'pointer',
                transition:'all 0.15s',
                boxShadow:'0 1px 3px rgba(0,0,0,0.06)',
              }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';e.currentTarget.style.transform='translateY(-1px)';}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.06)';e.currentTarget.style.transform='translateY(0)';}}
              >
                <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                  <div style={{ background:c.bg, borderRadius:10, width:44, height:44,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'1.2rem', flexShrink:0 }}>
                    {c.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight:600, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:4 }}>
                      {c.label}
                    </div>
                    <div style={{ fontSize:'0.8rem', color:'#8b92b0', lineHeight:1.4 }}>
                      {c.desc}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid #f0f2f8',
                  display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:'0.75rem', color:c.cor, fontWeight:600 }}>Acessar →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
