'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const PERFIS = {
  gestor_master:        'Gestor Master',
  diretoria:            'Diretoria',
  gestor_comercial:     'Gestor Comercial',
  supervisor_comercial: 'Supervisor Comercial',
  supervisor_adm:       'Supervisor Adm',
  administrativo:       'Administrativo',
  vendedor:             'Vendedor',
};

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);
  const [profile,     setProfile]     = useState(null);
  const [permissoes,  setPermissoes]  = useState({});
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    // Verifica sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) carregarPerfil(session.user);
      else setLoading(false);
    });

    // Escuta mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) carregarPerfil(session.user);
      else { setUser(null); setProfile(null); setPermissoes({}); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function carregarPerfil(authUser) {
    setUser(authUser);
    try {
      const [{ data: prof }, { data: perms }] = await Promise.all([
        supabase.from('user_profiles').select('*, consultor:consultor_id(id,nome)').eq('id', authUser.id).single(),
        supabase.from('perfil_permissoes').select('*'),
      ]);

      setProfile(prof);

      // Monta mapa de permissões: { 'vendedor': { pode_ver: true, pode_editar: false }, ... }
      const perfil = prof?.perfil || 'vendedor';
      const mapa = {};
      (perms || []).filter(p => p.perfil === perfil).forEach(p => {
        mapa[p.pagina] = { pode_ver: p.pode_ver, pode_editar: p.pode_editar };
      });
      setPermissoes(mapa);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  async function login(email, senha) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return error;
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  const podeVer    = (pagina) => profile?.perfil === 'gestor_master' || permissoes[pagina]?.pode_ver    === true;
  const podeEditar = (pagina) => profile?.perfil === 'gestor_master' || permissoes[pagina]?.pode_editar === true;

  return (
    <AuthContext.Provider value={{ user, profile, permissoes, loading, login, logout, podeVer, podeEditar }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { supabase };
