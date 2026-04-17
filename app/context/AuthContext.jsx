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

const AuthContext = createContext({
  user: null, profile: null, permissoes: {}, loading: true,
  login: async () => null, logout: async () => {},
  podeVer: () => false, podeEditar: () => false,
});

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
      const { data: prof, error: profErr } = await supabase
        .from('user_profiles')
        .select('*, consultor:consultor_id(id,nome)')
        .eq('id', authUser.id)
        .single();

      if (profErr) {
        console.error('Erro ao carregar perfil:', profErr.message);
        // Fallback: cria perfil básico com os dados do auth
        const fallback = {
          id: authUser.id,
          email: authUser.email,
          nome: authUser.email?.split('@')[0] || 'Usuário',
          perfil: 'vendedor',
          ativo: true,
        };
        setProfile(fallback);
        setLoading(false);
        return;
      }

      setProfile(prof);

      const { data: perms } = await supabase
        .from('perfil_permissoes')
        .select('*')
        .eq('perfil', prof?.perfil || 'vendedor');

      const mapa = {};
      (perms || []).forEach(p => {
        mapa[p.pagina] = { pode_ver: p.pode_ver, pode_editar: p.pode_editar };
      });
      setPermissoes(mapa);
    } catch(e) {
      console.error('Erro inesperado carregarPerfil:', e);
    }
    setLoading(false);
  }

  async function login(email, senha) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return error;
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  const podeVer    = (pagina) => {
    if (!profile) return false;
    if (profile.perfil === 'gestor_master') return true;
    return permissoes[pagina]?.pode_ver === true;
  };
  const podeEditar = (pagina) => {
    if (!profile) return false;
    if (profile.perfil === 'gestor_master') return true;
    return permissoes[pagina]?.pode_editar === true;
  };

  return (
    <AuthContext.Provider value={{ user, profile, permissoes, loading, login, logout, podeVer, podeEditar }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { supabase };
