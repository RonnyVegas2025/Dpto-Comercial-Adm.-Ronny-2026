'use client';

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [senha,    setSenha]    = useState('');
  const [erro,     setErro]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!email.trim() || !senha.trim()) { setErro('Preencha e-mail e senha'); return; }
    setLoading(true); setErro('');
    const error = await login(email.trim(), senha);
    if (error) {
      setErro(
        error.message.includes('Invalid login')
          ? 'E-mail ou senha incorretos'
          : 'Erro ao fazer login. Tente novamente.'
      );
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#f5f6fa',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Painel esquerdo — decorativo */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #1a1d2e 0%, #2d3250 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        display: 'flex',
      }}
        className="login-left"
      >
        <div style={{ maxWidth: 400, color: '#ffffff' }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ background: '#f0b429', borderRadius: 12, width: 48, height: 48,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem', fontWeight: 900, marginBottom: 20 }}>V</div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 8px',
              fontFamily: "'Syne', sans-serif" }}>Vegas Card</h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', margin: 0 }}>
              Gestão Comercial
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { icon: '📊', title: 'Dashboard Completo', desc: 'Acompanhe performance e metas em tempo real' },
              { icon: '🏢', title: 'Gestão de Empresas',  desc: 'Controle carteira de cartões e agregados' },
              { icon: '📦', title: 'Produtos Agregados', desc: 'WellHub, Total Pass, Telemedicina e mais' },
              { icon: '📋', title: 'Relatórios',         desc: 'Exportações e conferências mensais' },
            ].map(item => (
              <div key={item.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.2rem', marginTop: 1 }}>{item.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', marginTop: 2 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div style={{
        width: 480,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        background: '#ffffff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.06)',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1a1d2e',
            margin: '0 0 6px', fontFamily: "'Syne', sans-serif" }}>
            Bem-vindo de volta
          </h2>
          <p style={{ color: '#8b92b0', fontSize: '0.85rem', margin: '0 0 32px' }}>
            Entre com suas credenciais para acessar o sistema
          </p>

          {erro && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5',
              borderRadius: 8, padding: '10px 14px', color: '#dc2626',
              fontSize: '0.82rem', marginBottom: 20 }}>
              ⚠️ {erro}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={sL}>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                style={sI}
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label style={sL}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="••••••••"
                  style={{ ...sI, paddingRight: 44 }}
                  autoComplete="current-password"
                />
                <button type="button"
                  onClick={() => setMostrarSenha(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#8b92b0', fontSize: '0.85rem' }}>
                  {mostrarSenha ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              style={{
                background: loading ? '#d1d5e8' : '#f0b429',
                color: '#000',
                border: 'none',
                borderRadius: 10,
                padding: '12px',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                marginTop: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background 0.15s',
              }}>
              {loading ? (
                <>
                  <div style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.2)',
                    borderTop: '2px solid #000', borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite' }}></div>
                  Entrando...
                </>
              ) : 'Entrar →'}
            </button>
          </form>

          <p style={{ color: '#b0b7cc', fontSize: '0.72rem', textAlign: 'center',
            marginTop: 32, lineHeight: 1.6 }}>
            Acesso restrito a colaboradores Vegas Card.<br/>
            Problemas? Fale com o administrador do sistema.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) { .login-left { display: none !important; } }
        input:focus { border-color: #f0b429 !important; outline: none; box-shadow: 0 0 0 3px rgba(240,180,41,0.1); }
      `}</style>
    </div>
  );
}

const sL = { display: 'block', color: '#4a5068', fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 };
const sI = { width: '100%', background: '#f9fafb', border: '1px solid #e4e7ef', borderRadius: 8,
  padding: '10px 14px', color: '#1a1d2e', fontSize: '0.9rem', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 0.15s' };

