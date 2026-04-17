'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function SemAcesso() {
  const { profile, logout } = useAuth();
  const router = useRouter();

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#f5f6fa', fontFamily:"'DM Sans',sans-serif", padding:24 }}>
      <div style={{ textAlign:'center', maxWidth:400 }}>
        <div style={{ fontSize:'3rem', marginBottom:16 }}>🔒</div>
        <h1 style={{ fontSize:'1.3rem', fontWeight:700, color:'#1a1d2e', margin:'0 0 8px' }}>
          Acesso Restrito
        </h1>
        <p style={{ color:'#8b92b0', fontSize:'0.875rem', lineHeight:1.6, margin:'0 0 24px' }}>
          Você não tem permissão para acessar esta página.<br/>
          Fale com o administrador para liberar o acesso.
        </p>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          <button onClick={() => router.push('/')}
            style={{ background:'#f0b429', color:'#000', border:'none', borderRadius:8,
              padding:'9px 20px', fontWeight:700, cursor:'pointer', fontSize:'0.85rem', fontFamily:'inherit' }}>
            ← Ir para Início
          </button>
          <button onClick={logout}
            style={{ background:'#f5f6fa', color:'#4a5068', border:'1px solid #e4e7ef',
              borderRadius:8, padding:'9px 20px', fontWeight:600, cursor:'pointer',
              fontSize:'0.85rem', fontFamily:'inherit' }}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}

