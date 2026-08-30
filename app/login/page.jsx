'use client';

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

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
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', background:'var(--vg-bg)', fontFamily:"'Inter', sans-serif" }}>
      {/* Faixa de assinatura no topo */}
      <div style={{ height:3, background:'var(--vg-gradient)', width:'100%', flexShrink:0 }} />

      <div style={{ flex:1, display:'flex' }}>
        {/* ESQUERDA — painel institucional */}
        <div className="login-left" style={{
          flex:'0 0 45%', background:'var(--vg-brand-800)', color:'#fff',
          display:'flex', flexDirection:'column', justifyContent:'center',
          padding:'56px 56px 40px', boxSizing:'border-box', position:'relative',
        }}>
          <div style={{ maxWidth:460 }}>
            <h1 style={{ fontFamily:"'Outfit', sans-serif", fontSize:32, lineHeight:'42px', fontWeight:600, margin:0 }}>
              Vegas Card<br /><span style={{ whiteSpace:'nowrap' }}>Gestão Comercial</span>
            </h1>
            <p style={{ color:'rgba(255,255,255,0.7)', fontSize:14, lineHeight:'22px', margin:'18px 0 0', maxWidth:400 }}>
              Ambiente interno. Os dados exibidos são confidenciais e o acesso é registrado.
            </p>
          </div>
          <div style={{ position:'absolute', left:56, bottom:40, color:'rgba(255,255,255,0.5)', fontSize:12, letterSpacing:0.4 }}>Vegas Card — uso interno</div>
        </div>

        {/* DIREITA — autenticação */}
        <div className="login-right" style={{
          flex:1, display:'flex', alignItems:'center', justifyContent:'center',
          padding:'48px 24px', boxSizing:'border-box', background:'var(--vg-bg)',
        }}>
          <div style={{ width:'100%', maxWidth:400 }}>
            <img src="/logo-vegas.png" alt="Vegas Card"
              style={{ display:'block', width:240, maxWidth:'70%', height:'auto', objectFit:'contain', margin:'0 auto 12px' }} />

            <h2 style={{ fontFamily:"'Outfit', sans-serif", fontSize:24, lineHeight:'32px', fontWeight:600, color:'var(--vg-ink)', margin:'0 0 6px', textAlign:'center' }}>
              Vegas Card —<wbr /> <span style={{ whiteSpace:'nowrap' }}>ADM Comercial</span>
            </h2>
            <p style={{ color:'var(--vg-ink-secondary)', fontSize:14, lineHeight:'22px', margin:'0 0 28px', textAlign:'center' }}>
              Acesse com seu e-mail corporativo.
            </p>

            <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:16 }}>
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
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', border:'1px solid var(--vg-border-field)', borderRadius:'var(--vg-radius)', padding:'0 14px' }}>
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    placeholder="••••••••"
                    style={{ flex:1, border:'none', outline:'none', background:'transparent', color:'var(--vg-ink)', fontSize:15, fontFamily:"'Inter', sans-serif", padding:'12px 0' }}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setMostrarSenha(v => !v)}
                    aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:44, height:44, background:'none', border:'none', cursor:'pointer', color:'var(--vg-muted)' }}>
                    {mostrarSenha ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
                  </button>
                </div>
                {erro && (
                  <div style={{ color:'var(--vg-danger-fg)', fontSize:13, lineHeight:'20px', marginTop:8 }}>{erro}</div>
                )}
              </div>

              <button type="submit" disabled={loading}
                style={{
                  width:'100%', background:'var(--vg-brand-500)', color:'#fff', border:'none',
                  borderRadius:'var(--vg-radius)', padding:'13px', fontWeight:600, fontSize:15,
                  fontFamily:"'Inter', sans-serif", cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.7 : 1, marginTop:4,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8, minHeight:48,
                }}>
                {loading ? (
                  <>
                    <span style={{ width:16, height:16, border:'2px solid rgba(255,255,255,0.4)', borderTop:'2px solid #fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
                    Entrando…
                  </>
                ) : 'Entrar'}
              </button>
            </form>

            <p style={{ color:'var(--vg-muted)', fontSize:12, lineHeight:'20px', textAlign:'center', margin:'28px 0 0' }}>
              Acesso restrito a colaboradores Vegas Card.<br/>
              Problemas? Fale com o administrador do sistema.
            </p>
            <p style={{ color:'var(--vg-muted)', fontSize:12, textAlign:'center', margin:'16px 0 0' }}>v0.1.0</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) { .login-left { display: none !important; } }
        input:focus { border-color: var(--vg-brand-500) !important; outline: none; }
      `}</style>
    </div>
  );
}

const sL = { display:'block', color:'var(--vg-ink-secondary)', fontSize:12, lineHeight:'18px', textTransform:'uppercase', letterSpacing:0.6, fontWeight:600, marginBottom:6 };
const sI = { width:'100%', background:'#fff', border:'1px solid var(--vg-border-field)', borderRadius:'var(--vg-radius)', padding:'12px 14px', color:'var(--vg-ink)', fontSize:15, fontFamily:"'Inter', sans-serif", boxSizing:'border-box' };
