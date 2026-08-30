'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './context/AuthContext';
import Sidebar from './Sidebar';
import { primeiraRotaPermitida } from './navItems';

export default function AppShell({ children }) {
  const { user, profile, loading, podeVer, permissoes } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (loading) return;

    // Não logado → vai para login
    if (!user && !isLoginPage) {
      router.replace('/login');
      return;
    }

    // Logado e está na página de login → primeira página permitida (ou ?next=, se houver)
    if (user && isLoginPage) {
      let next = null;
      try { next = new URLSearchParams(window.location.search).get('next'); } catch (_) {}
      const destino = next && next.startsWith('/') ? next : primeiraRotaPermitida(profile, permissoes);
      router.replace(destino);
      return;
    }

    // ✅ Logado e está na raiz "/" → primeira página permitida
    if (user && pathname === '/') {
      router.replace(primeiraRotaPermitida(profile, permissoes));
      return;
    }

    // Auto-recuperação: preso em /sem-acesso mas há rota permitida (ex.: permissões
    // carregaram depois do primeiro cálculo). Reavalia quando `permissoes` muda.
    if (user && pathname === '/sem-acesso') {
      const destino = primeiraRotaPermitida(profile, permissoes);
      if (destino !== '/sem-acesso') {
        router.replace(destino);
      }
      return;
    }
  }, [user, loading, isLoginPage, pathname, profile, permissoes, router]);

  // Verifica permissão para a rota atual
  useEffect(() => {
    if (loading || !user || isLoginPage) return;
    if (pathname === '/') return; // raiz é tratada acima
    const pagina = pathname.split('/')[1] || 'inicio';
    // 'perfil' é livre: todo usuário autenticado pode ver seus dados e trocar a senha.
    if (!pagina || pagina === 'sem-acesso' || pagina === 'perfil') return;
    console.log('[AppShell] pagina:', pagina, '| podeVer:', podeVer(pagina), '| perfil:', profile?.perfil);
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
      <main style={{ marginLeft:248, flex:1, minHeight:'100vh' }}>
        {children}
      </main>
    </div>
  );
}
