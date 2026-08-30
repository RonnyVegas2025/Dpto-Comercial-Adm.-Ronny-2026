'use client';

import { useState } from 'react';
import { useAuth, PERFIS, supabase } from '../context/AuthContext';
import {
  User, Mail, ShieldCheck, Building2, KeyRound, Eye, EyeOff,
  AlertTriangle, CheckCircle2, XCircle,
} from 'lucide-react';

const OUTFIT  = "'Outfit', sans-serif";
const CAPTION = { fontSize:12, lineHeight:'18px', color:'var(--vg-muted)' };
const LABEL   = { ...CAPTION, textTransform:'uppercase', letterSpacing:0.6 };
const H_CARD  = { fontFamily:OUTFIT, fontSize:16, lineHeight:'24px', fontWeight:600, color:'var(--vg-ink)' };
const ICON    = { size:16, strokeWidth:1.75, color:'var(--vg-ink-secondary)' };
const cardStyle = { background:'var(--vg-surface)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius-lg)', padding:24, boxShadow:'0 1px 2px rgba(28,31,59,0.04)' };

const SENHAS_PROIBIDAS = ['123456','12345678','1234567890','senha123','password','qwerty123','abc12345'];

function validarSenha(nova, conf, email) {
  if(nova.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if(nova !== conf) return 'As duas senhas não coincidem.';
  const low = nova.toLowerCase();
  if(SENHAS_PROIBIDAS.includes(low)) return 'Essa senha é óbvia demais. Escolha algo que só você saiba.';
  if(email && low === String(email).toLowerCase()) return 'A senha não pode ser igual ao seu e-mail.';
  // Sequências óbvias: dígitos em ordem crescente/decrescente ou o mesmo caractere repetido.
  if(/^(?:0123456789|1234567890|9876543210){1,}$/.test(nova) || /^(.)\1+$/.test(nova))
    return 'Evite sequências ou repetições óbvias.';
  return null;
}

function Campo({ label, valor, icon }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
      <div style={{ ...LABEL, display:'flex', alignItems:'center', gap:6 }}>{icon}{label}</div>
      <div style={{ fontSize:15, color:'var(--vg-ink)', fontWeight:500, overflowWrap:'anywhere' }}>{valor || '—'}</div>
    </div>
  );
}

export default function Perfil() {
  const { user, profile } = useAuth();

  const [nova, setNova]     = useState('');
  const [conf, setConf]     = useState('');
  const [verNova, setVerNova] = useState(false);
  const [verConf, setVerConf] = useState(false);
  const [erro, setErro]     = useState('');
  const [sucesso, setSucesso] = useState('');
  const [salvando, setSalvando] = useState(false);

  const email = user?.email || '';

  async function alterarSenha(e) {
    e.preventDefault();
    setErro(''); setSucesso('');
    const msg = validarSenha(nova, conf, email);
    if(msg) { setErro(msg); return; }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: nova });
    setSalvando(false);
    if(error) { setErro(error.message); return; }
    setSucesso('Senha alterada com sucesso.');
    setNova(''); setConf('');
  }

  const perfilLabel = PERFIS[profile?.perfil] || profile?.perfil || '—';
  const vinculo = profile?.gestor_vinculado || profile?.diretoria || '—';

  return (
    <div style={s.page}>
      <div style={{ height:3, background:'var(--vg-gradient)', margin:'-32px -24px 24px' }} />

      {/* Cabeçalho */}
      <div style={{ marginBottom:20 }}>
        <div style={{ ...CAPTION, marginBottom:6 }}>Vegas Card / Minha Conta</div>
        <h1 style={{ fontFamily:OUTFIT, fontSize:24, lineHeight:'32px', fontWeight:600, color:'var(--vg-ink)', margin:0 }}>Meu Perfil</h1>
        <p style={{ color:'var(--vg-ink-secondary)', fontSize:14, lineHeight:'22px', margin:'6px 0 0' }}>Seus dados de acesso e troca de senha</p>
      </div>

      {/* Aviso senha inicial */}
      <div style={s.avisoAmbar}>
        <AlertTriangle size={18} strokeWidth={2} color="var(--vg-warning-fg)" style={{ flexShrink:0, marginTop:1 }} />
        <span>Se você ainda usa a senha inicial fornecida pelo administrador, <strong>troque agora</strong> — ela é conhecida por outras pessoas.</span>
      </div>

      {/* Bloco 1 — Meus dados */}
      <div style={{ ...cardStyle, marginBottom:20 }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:18 }}>
          <User {...ICON} /> Meus Dados
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))', gap:20 }}>
          <Campo icon={<User {...ICON} />}       label="Nome"    valor={profile?.nome} />
          <Campo icon={<Mail {...ICON} />}       label="E-mail"  valor={email} />
          <Campo icon={<ShieldCheck {...ICON} />} label="Perfil"  valor={perfilLabel} />
          <Campo icon={<Building2 {...ICON} />}  label="Diretoria / Gestor vinculado" valor={vinculo} />
        </div>
      </div>

      {/* Bloco 2 — Alterar senha */}
      <div style={{ ...cardStyle, maxWidth:520 }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <KeyRound {...ICON} /> Alterar Senha
        </div>
        <div style={{ ...CAPTION, marginBottom:18 }}>Mínimo de 8 caracteres. Você não precisa informar a senha atual.</div>

        <form onSubmit={alterarSenha} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <CampoSenha label="Nova senha" valor={nova} onChange={setNova} ver={verNova} setVer={setVerNova} auto />
          <CampoSenha label="Confirmar nova senha" valor={conf} onChange={setConf} ver={verConf} setVer={setVerConf} />

          {erro && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, color:'var(--vg-danger-fg)', fontSize:13, lineHeight:'20px' }}>
              <XCircle size={16} strokeWidth={2} style={{ flexShrink:0, marginTop:1 }} /> {erro}
            </div>
          )}
          {sucesso && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, color:'var(--vg-success-fg)', fontSize:13, lineHeight:'20px' }}>
              <CheckCircle2 size={16} strokeWidth={2} style={{ flexShrink:0, marginTop:1 }} /> {sucesso}
            </div>
          )}

          <div>
            <button type="submit" disabled={salvando || !nova || !conf}
              style={{ background:'var(--vg-brand-500)', color:'#fff', border:'none', borderRadius:'var(--vg-radius)', padding:'10px 22px', fontWeight:600, fontSize:14, fontFamily:"'Inter', sans-serif", cursor: (salvando||!nova||!conf) ? 'default' : 'pointer', opacity: (salvando||!nova||!conf) ? 0.6 : 1 }}>
              {salvando ? 'Salvando…' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CampoSenha({ label, valor, onChange, ver, setVer, auto }) {
  return (
    <div>
      <label style={{ ...LABEL, display:'block', marginBottom:6 }}>{label}</label>
      <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--vg-surface)', border:'1px solid var(--vg-border-field)', borderRadius:'var(--vg-radius)', padding:'0 12px' }}>
        <input
          type={ver ? 'text' : 'password'}
          value={valor}
          onChange={e=>onChange(e.target.value)}
          autoComplete="new-password"
          autoFocus={auto}
          style={{ flex:1, border:'none', outline:'none', background:'transparent', color:'var(--vg-ink)', fontSize:15, fontFamily:"'Inter', sans-serif", padding:'11px 0' }} />
        <button type="button" onClick={()=>setVer(v=>!v)} title={ver ? 'Ocultar senha' : 'Mostrar senha'}
          style={{ background:'none', border:'none', cursor:'pointer', display:'inline-flex', padding:4, color:'var(--vg-muted)' }}>
          {ver ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  );
}

const s = {
  page: { maxWidth:1000, margin:'0 auto', padding:'32px 24px', fontFamily:"'Inter', sans-serif", color:'var(--vg-ink)', background:'var(--vg-bg)', minHeight:'100vh', boxSizing:'border-box' },
  avisoAmbar: { display:'flex', alignItems:'flex-start', gap:10, background:'var(--vg-warning-bg)', border:'1px solid var(--vg-warning-fg)', borderRadius:'var(--vg-radius-lg)', padding:'14px 18px', marginBottom:24, color:'var(--vg-warning-fg)', fontSize:13, lineHeight:'20px' },
};
