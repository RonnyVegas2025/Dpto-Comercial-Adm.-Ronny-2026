'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './context/AuthContext';
import Sidebar from './Sidebar';

export default function AppShell({ children }) {
  const { user, profile, loading, podeVer } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (loading) return;
    if (!user && !isLoginPage) {
      router.replace('/login');
      return;
    }
    if (user && isLoginPage) {
      router.replace('/');
      return;
    }
  }, [user, loading, isLoginPage, router]);

  // Verifica permissão para a rota atual
  useEffect(() => {
    if (loading || !user || isLoginPage) return;
    const pagina = pathname.split('/')[1] || 'inicio';
    if (profile && !podeVer(pagina) && profile.perfil !== 'gestor_master') {
      router.replace('/sem-acesso');
    }
  }, [pathname, profile, loading]);

  // Tela de loading
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#f5f6fa', flexDirection:'column', gap:16 }}>
      <div style={{ width:40, height:40, border:'3px solid #e4e7ef',
        borderTop:'3px solid #f0b429', borderRadius:'50%',
        animation:'spin 0.8s linear infinite' }}></div>
      <div style={{ color:'#8b92b0', fontSize:'0.85rem' }}>Carregando...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // Página de login — sem sidebar
  if (isLoginPage || !user) return <>{children}</>;

  // App normal — com sidebar
  return (
    <div style={{ display:'flex' }}>
      <Sidebar />
      <main style={{ marginLeft:220, flex:1, minHeight:'100vh' }}>
        {children}
      </main>
    </div>
  );
}

