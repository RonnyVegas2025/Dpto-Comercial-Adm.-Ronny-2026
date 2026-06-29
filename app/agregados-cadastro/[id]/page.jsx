'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt     = (v) => Number(v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const fmtData = (d) => { if (!d) return '—'; const [y,m,dd] = String(d).substring(0,10).split('-'); return `${dd}/${m}/${y}`; };
const fmtMes  = (d) => { if (!d) return '—'; const [y,m] = String(d).substring(0,7).split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`; };
const soDigitos = (v) => String(v||'').replace(/\D/g,'');

export default function AgregadoDetalhe({ params }) {
  const router = useRouter();
  const id     = params?.id;

  const [empresa,     setEmpresa]     = useState(null);
  const [contrato,    setContrato]    = useState(null);
  const [fechamentos, setFechamentos] = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [produtos,    setProdutos]    = useState([]);
  const [loading,     setLoading]     = useState(true);

  const [editEmp,  setEditEmp]  = useState(false);
  const [editCont, setEditCont] = useState(false);
  const [formEmp,  setFormEmp]  = useState({});
  const [formCont, setFormCont] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState('');
  const [sucesso,  setSucesso]  = useState('');

  // CRM
  const [crm,        setCrm]        = useState({ crm_obs:'', crm_status:'Ativo', crm_ultimo_contato:'' });
  const [salvandoCrm,setSalvandoCrm]= useState(false);
  const [crmMsg,     setCrmMsg]     = useState('');

  useEffect(() => { if (id) carregar(); }, [id]);

  async function carregar() {
    setLoading(true);
    try {
      const { data: emp } = await supabase
        .from('empresas_agregadas')
        .select(`
          id, cnpj, nome, data_cadastro, ativo,
          consultor_principal:consultor_principal_id (id, nome, equipe, gestor),
          consultor_agregado:consultor_agregado_id (id, nome),
          contratos:contratos_agregados (
            *,
            produto_1:produto_1_id (id, nome, custo),
            produto_2:produto_2_id (id, nome),
            produto_3:produto_3_id (id, nome)
          )
        `)
        .eq('id', id).single();
      setEmpresa(emp || null);
      const cont = (emp?.contratos || [])[0] || null;
      setContrato(cont);

      const [{ data: cons }, { data: prods }] = await Promise.all([
        supabase.from('consultores').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('produtos').select('id, nome').eq('ativo', true).order('nome'),
      ]);
      setConsultores(cons || []);
      setProdutos(prods || []);

      // Fechamentos (histórico financeiro) — APENAS do contrato atual (cont.id), em ordem crescente
      if (cont?.id) {
        const { data: fech } = await supabase
          .from('fechamentos_agregados')
          .select('competencia, titulares_mes, dependentes_mes, valor_boleto, custo_mes, lucro_mes, grupo')
          .eq('contrato_id', cont.id)
          .order('competencia', { ascending: true });
        setFechamentos(fech || []);
      } else {
        setFechamentos([]);
      }

      // CRM — defensivo: colunas podem não existir ainda
      try {
        const { data: crmData, error: crmErr } = await supabase
          .from('empresas_agregadas')
          .select('crm_obs, crm_status, crm_ultimo_contato')
          .eq('id', id).single();
        if (!crmErr && crmData) {
          setCrm({
            crm_obs:            crmData.crm_obs || '',
            crm_status:         crmData.crm_status || 'Ativo',
            crm_ultimo_contato: crmData.crm_ultimo_contato ? String(crmData.crm_ultimo_contato).substring(0,10) : '',
          });
        }
      } catch(_) { /* colunas CRM ainda não existem — ignora */ }
    } catch (err) {
      console.error('[agregados-cadastro/id] erro:', err);
    }
    setLoading(false);
  }

  // ── Editar empresa ──
  function abrirEditEmp() {
    setFormEmp({
      nome: empresa?.nome || '', cnpj: empresa?.cnpj || '',
      data_cadastro: empresa?.data_cadastro ? String(empresa.data_cadastro).substring(0,10) : '',
      ativo: empresa?.ativo ?? true,
    });
    setErro(''); setEditEmp(true);
  }
  async function salvarEmp() {
    setErro(''); setSalvando(true);
    try {
      const { error } = await supabase.from('empresas_agregadas').update({
        nome: formEmp.nome.trim(), cnpj: soDigitos(formEmp.cnpj),
        data_cadastro: formEmp.data_cadastro || null, ativo: formEmp.ativo,
      }).eq('id', id);
      if (error) throw new Error(error.message);
      setEditEmp(false); setSucesso('Dados atualizados!'); await carregar(); setTimeout(()=>setSucesso(''),3000);
    } catch(err) { setErro('Erro: ' + err.message); }
    setSalvando(false);
  }

  // ── Editar contrato ──
  function abrirEditCont() {
    setFormCont({
      produto_id: contrato?.produto_1?.id || '',
      tipo: contrato?.is_combo ? 'Combo' : 'Individual',
      tipo_contrato: contrato?.tipo_contrato || 'Venda Nova',
      custo_unitario_manual: contrato?.custo_unitario_manual ?? '',
      licencas_minimas: contrato?.licencas_minimas ?? '',
      valor_titular: contrato?.valor_cobrado_titular_p1 ?? '',
      valor_dependente: contrato?.valor_cobrado_dependente_p1 ?? '',
      consultor_principal_id: empresa?.consultor_principal?.id || '',
      consultor_agregado_id:  empresa?.consultor_agregado?.id || '',
    });
    setErro(''); setEditCont(true);
  }
  async function salvarCont() {
    setErro(''); setSalvando(true);
    try {
      // Consultores ficam na empresa_agregada
      const { error: empErr } = await supabase.from('empresas_agregadas').update({
        consultor_principal_id: formCont.consultor_principal_id || null,
        consultor_agregado_id:  formCont.consultor_agregado_id  || null,
      }).eq('id', id);
      if (empErr) throw new Error(empErr.message);

      if (contrato?.id) {
        const prodNome = produtos.find(p => p.id === formCont.produto_id)?.nome || null;
        const { error: contErr } = await supabase.from('contratos_agregados').update({
          produto_1_id: formCont.produto_id || null,
          is_combo: formCont.tipo === 'Combo',
          combo_nome: formCont.tipo === 'Combo' ? prodNome : null,
          valor_cobrado_titular_p1:    parseFloat(formCont.valor_titular)    || 0,
          valor_cobrado_dependente_p1: parseFloat(formCont.valor_dependente) || 0,
        }).eq('id', contrato.id);
        if (contErr) throw new Error(contErr.message);

        // Campos extras — colunas podem não existir ainda. Update separado e defensivo
        // para não bloquear o save principal caso a coluna falte.
        try {
          const { error: extraErr } = await supabase.from('contratos_agregados').update({
            tipo_contrato: formCont.tipo_contrato || null,
            custo_unitario_manual: formCont.custo_unitario_manual === '' ? null : (parseFloat(formCont.custo_unitario_manual) || 0),
            licencas_minimas: formCont.licencas_minimas === '' ? null : (parseInt(formCont.licencas_minimas) || 0),
          }).eq('id', contrato.id);
          if (extraErr) console.warn('[contrato extras] colunas podem não existir:', extraErr.message);
        } catch(_) { /* colunas tipo_contrato/custo_unitario_manual/licencas_minimas ainda não existem */ }
      }
      setEditCont(false); setSucesso('Contrato atualizado!'); await carregar(); setTimeout(()=>setSucesso(''),3000);
    } catch(err) { setErro('Erro: ' + err.message); }
    setSalvando(false);
  }

  // ── CRM ──
  async function salvarCrm() {
    setSalvandoCrm(true); setCrmMsg('');
    try {
      const { error } = await supabase.from('empresas_agregadas').update({
        crm_obs: crm.crm_obs || null,
        crm_status: crm.crm_status || null,
        crm_ultimo_contato: crm.crm_ultimo_contato || null,
      }).eq('id', id);
      if (error) { setCrmMsg('⚠️ Não foi possível salvar (campos de CRM podem não existir no banco ainda).'); }
      else { setCrmMsg('✅ CRM salvo!'); setTimeout(()=>setCrmMsg(''),3000); }
    } catch(_) {
      setCrmMsg('⚠️ Não foi possível salvar o CRM.');
    }
    setSalvandoCrm(false);
  }

  if (loading) return <div style={s.page}><div style={{ textAlign:'center', padding:64 }}><div style={s.spin}></div></div></div>;
  if (!empresa) return (
    <div style={s.page}>
      <button style={s.btnSec} onClick={()=>router.push('/agregados-cadastro')}>← Voltar</button>
      <div style={{ ...s.card, textAlign:'center', color:'#8b92b0', marginTop:20 }}>Empresa não encontrada.</div>
    </div>
  );

  const prodLabel = contrato
    ? (contrato.is_combo && contrato.combo_nome
        ? contrato.combo_nome
        : [contrato.produto_1?.nome, contrato.produto_2?.nome, contrato.produto_3?.nome].filter(Boolean).join(' · ') || '—')
    : '—';

  const maxRC = Math.max(1, ...fechamentos.map(f => Math.max(f.valor_boleto||0, f.custo_mes||0)));

  // Custo unitário/vida: manual (se preenchido) tem prioridade sobre o custo do produto
  const custoUnitario = (contrato?.custo_unitario_manual != null && contrato?.custo_unitario_manual !== '')
    ? contrato.custo_unitario_manual
    : (contrato?.produto_1?.custo || 0);
  // Aviso de licenças: titulares do último fechamento < licenças mínimas contratadas
  const titularesUltimo = fechamentos.length ? (fechamentos[fechamentos.length-1].titulares_mes || 0) : 0;
  const avisoLicencas = (contrato?.licencas_minimas > 0) && (titularesUltimo < contrato.licencas_minimas);

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <button style={s.btnSec} onClick={()=>router.push('/agregados-cadastro')}>← Cadastro Agregados</button>
        {sucesso && <span style={{ color:'#16a34a', fontWeight:600, fontSize:'0.85rem' }}>✅ {sucesso}</span>}
      </div>

      {/* ── Seção 1 — Dados da empresa ── */}
      <div style={s.card}>
        <div style={s.secHead}>
          <div style={s.cardTitle}>🏢 Dados da Empresa</div>
          <button style={s.btnPri} onClick={abrirEditEmp}>✏️ Editar</button>
        </div>
        <div style={s.grid4}>
          <Campo label="Nome" valor={empresa.nome} />
          <Campo label="CNPJ" valor={empresa.cnpj || '—'} />
          <Campo label="Data Implantação" valor={fmtData(empresa.data_cadastro)} />
          <div>
            <div style={s.fLabel}>Status</div>
            <span style={{ background:empresa.ativo?'rgba(52,211,153,0.1)':'rgba(248,113,113,0.1)',
              color:empresa.ativo?'#34d399':'#f87171', borderRadius:6, padding:'3px 10px',
              fontSize:'0.8rem', fontWeight:600 }}>{empresa.ativo?'● Ativa':'● Inativa'}</span>
          </div>
        </div>
      </div>

      {/* ── Seção 2 — Contrato ── */}
      <div style={s.card}>
        <div style={s.secHead}>
          <div style={s.cardTitle}>📄 Contrato</div>
          <button style={s.btnPri} onClick={abrirEditCont} disabled={!contrato}>✏️ Editar contrato</button>
        </div>
        {!contrato ? (
          <div style={{ color:'#8b92b0', fontSize:'0.85rem' }}>Nenhum contrato cadastrado para esta empresa.</div>
        ) : (
          <div style={s.grid4}>
            <Campo label="Produto" valor={prodLabel} cor="#a78bfa" />
            <Campo label="Tipo" valor={contrato.is_combo ? '🔗 Combo' : '📦 Individual'} />
            <Campo label="Tipo de contrato" valor={contrato.tipo_contrato || '—'} />
            <Campo label="Valor Titular" valor={fmt(contrato.valor_cobrado_titular_p1)} />
            <Campo label="Valor Dependente" valor={fmt(contrato.valor_cobrado_dependente_p1)} />
            <Campo label="Custo unitário/vida" valor={fmt(custoUnitario)} />
            <div>
              <div style={s.fLabel}>Licenças mínimas</div>
              <div style={s.fVal}>
                {contrato.licencas_minimas ?? '—'}
                {avisoLicencas && (
                  <span style={{ marginLeft:8, background:'rgba(248,113,113,0.12)', color:'#dc2626',
                    borderRadius:5, padding:'2px 8px', fontSize:'0.66rem', fontWeight:700 }}>
                    ⚠️ {titularesUltimo} titulares &lt; mínimo
                  </span>
                )}
              </div>
            </div>
            <Campo label="Consultor Principal" valor={empresa.consultor_principal?.nome || '—'} />
            <Campo label="Equipe" valor={empresa.consultor_principal?.equipe || '—'} />
            <Campo label="Gestor" valor={empresa.consultor_principal?.gestor || '—'} />
            <Campo label="Consultor Agregado" valor={empresa.consultor_agregado?.nome || '—'} />
            <Campo label="Parceiro" valor="—" />
          </div>
        )}
      </div>

      {/* ── Seção 3 — Histórico financeiro ── */}
      <div style={s.card}>
        <div style={s.cardTitle}>💰 Histórico Financeiro</div>
        {fechamentos.length === 0 ? (
          <div style={{ color:'#8b92b0', fontSize:'0.85rem', marginTop:12 }}>Nenhum fechamento registrado.</div>
        ) : (
          <>
            {/* Mini gráfico Receita vs Custo */}
            <div style={{ display:'flex', alignItems:'flex-end', gap:14, height:140, padding:'18px 4px 8px', overflowX:'auto' }}>
              {fechamentos.map((f,i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, minWidth:54 }}>
                  <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:100 }}>
                    <div title={`Receita ${fmt(f.valor_boleto)}`} style={{ width:14, height:`${Math.max(2,((f.valor_boleto||0)/maxRC)*100)}%`, background:'#34d399', borderRadius:'3px 3px 0 0' }}></div>
                    <div title={`Custo ${fmt(f.custo_mes)}`} style={{ width:14, height:`${Math.max(2,((f.custo_mes||0)/maxRC)*100)}%`, background:'#f87171', borderRadius:'3px 3px 0 0' }}></div>
                  </div>
                  <span style={{ fontSize:'0.62rem', color:'#8b92b0', whiteSpace:'nowrap' }}>{fmtMes(f.competencia)}</span>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:16, marginBottom:14, fontSize:'0.72rem', color:'#6b7280' }}>
              <span><span style={{ display:'inline-block', width:10, height:10, background:'#34d399', borderRadius:2, marginRight:5 }}></span>Receita</span>
              <span><span style={{ display:'inline-block', width:10, height:10, background:'#f87171', borderRadius:2, marginRight:5 }}></span>Custo</span>
            </div>
            <div style={{ overflowX:'auto', border:'1px solid #f0f2f8', borderRadius:8 }}>
              <table style={s.table}>
                <thead><tr>
                  {['Competência','Titulares','Dependentes','Receita','Custo','Lucro','Margem','Status'].map(h=>
                    <th key={h} style={{ ...s.th, background:'#f9fafb' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {fechamentos.map((f,i) => {
                    const margem = (f.valor_boleto||0) > 0 ? ((f.lucro_mes||0)/(f.valor_boleto||1))*100 : 0;
                    const lucro = f.lucro_mes || 0;
                    const stt = (f.valor_boleto||0) === 0 ? { t:'Zero', c:'#6b7280' } : lucro >= 0 ? { t:'Lucro', c:'#34d399' } : { t:'Prejuízo', c:'#f87171' };
                    return (
                      <tr key={i} style={i%2===0?{background:'#f9fafb'}:{}}>
                        <td style={{ ...s.td, fontWeight:600 }}>{fmtMes(f.competencia)}</td>
                        <td style={{ ...s.td, textAlign:'center' }}>{f.titulares_mes ?? 0}</td>
                        <td style={{ ...s.td, textAlign:'center' }}>{f.dependentes_mes ?? 0}</td>
                        <td style={{ ...s.td, color:'#34d399' }}>{fmt(f.valor_boleto)}</td>
                        <td style={{ ...s.td, color:'#f87171' }}>{fmt(f.custo_mes)}</td>
                        <td style={{ ...s.td, color:lucro>=0?'#34d399':'#f87171', fontWeight:700 }}>{fmt(lucro)}</td>
                        <td style={{ ...s.td, color:stt.c, fontWeight:600 }}>{margem.toFixed(1)}%</td>
                        <td style={s.td}><span style={{ background:`${stt.c}18`, color:stt.c, borderRadius:5, padding:'2px 8px', fontSize:'0.68rem', fontWeight:700 }}>{stt.t}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Seção 4 — CRM ── */}
      <div style={s.card}>
        <div style={s.secHead}>
          <div style={s.cardTitle}>📇 CRM / Relacionamento</div>
          {crmMsg && <span style={{ fontSize:'0.8rem', fontWeight:600, color: crmMsg.startsWith('✅')?'#16a34a':'#d97706' }}>{crmMsg}</span>}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:6 }}>
          <div style={{ gridColumn:'1 / -1' }}>
            <label style={s.fLabel}>Observações</label>
            <textarea style={{ ...s.input, minHeight:90, resize:'vertical' }} value={crm.crm_obs}
              onChange={e=>setCrm(c=>({ ...c, crm_obs:e.target.value }))} placeholder="Anotações sobre o relacionamento..." />
          </div>
          <div>
            <label style={s.fLabel}>Status do relacionamento</label>
            <select style={s.input} value={crm.crm_status} onChange={e=>setCrm(c=>({ ...c, crm_status:e.target.value }))}>
              <option value="Ativo">🟢 Ativo</option>
              <option value="Em risco">🟡 Em risco</option>
              <option value="Inativo">🔴 Inativo</option>
            </select>
          </div>
          <div>
            <label style={s.fLabel}>Data último contato</label>
            <input type="date" style={s.input} value={crm.crm_ultimo_contato}
              onChange={e=>setCrm(c=>({ ...c, crm_ultimo_contato:e.target.value }))} />
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
          <button style={s.btnPri} onClick={salvarCrm} disabled={salvandoCrm}>{salvandoCrm?'Salvando...':'💾 Salvar CRM'}</button>
        </div>
      </div>

      {/* Modal editar empresa */}
      {editEmp && (
        <div style={s.overlay} onClick={()=>setEditEmp(false)}>
          <div style={s.modal} onClick={e=>e.stopPropagation()}>
            <div style={s.secHead}><div style={s.cardTitle}>✏️ Editar Empresa</div>
              <button onClick={()=>setEditEmp(false)} style={s.btnFechar}>✕</button></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:6 }}>
              <div style={{ gridColumn:'1 / -1' }}>
                <label style={s.fLabel}>Nome</label>
                <input style={s.input} value={formEmp.nome} onChange={e=>setFormEmp(f=>({ ...f, nome:e.target.value }))} />
              </div>
              <div><label style={s.fLabel}>CNPJ</label>
                <input style={s.input} value={formEmp.cnpj} onChange={e=>setFormEmp(f=>({ ...f, cnpj:e.target.value }))} /></div>
              <div><label style={s.fLabel}>Data Implantação</label>
                <input type="date" style={s.input} value={formEmp.data_cadastro} onChange={e=>setFormEmp(f=>({ ...f, data_cadastro:e.target.value }))} /></div>
              <div><label style={s.fLabel}>Status</label>
                <select style={s.input} value={String(formEmp.ativo)} onChange={e=>setFormEmp(f=>({ ...f, ativo:e.target.value==='true' }))}>
                  <option value="true">Ativa</option><option value="false">Inativa</option>
                </select></div>
            </div>
            {erro && <div style={{ color:'#dc2626', fontSize:'0.82rem', marginTop:12 }}>{erro}</div>}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button style={s.btnSec} onClick={()=>setEditEmp(false)}>Cancelar</button>
              <button style={s.btnPri} onClick={salvarEmp} disabled={salvando}>{salvando?'Salvando...':'💾 Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar contrato */}
      {editCont && (
        <div style={s.overlay} onClick={()=>setEditCont(false)}>
          <div style={s.modal} onClick={e=>e.stopPropagation()}>
            <div style={s.secHead}><div style={s.cardTitle}>✏️ Editar Contrato</div>
              <button onClick={()=>setEditCont(false)} style={s.btnFechar}>✕</button></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:6 }}>
              <div><label style={s.fLabel}>Produto</label>
                <select style={s.input} value={formCont.produto_id} onChange={e=>setFormCont(f=>({ ...f, produto_id:e.target.value }))}>
                  <option value="">— Selecione —</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select></div>
              <div><label style={s.fLabel}>Tipo</label>
                <select style={s.input} value={formCont.tipo} onChange={e=>setFormCont(f=>({ ...f, tipo:e.target.value }))}>
                  <option value="Individual">Individual</option><option value="Combo">Combo</option>
                </select></div>
              <div><label style={s.fLabel}>Tipo de contrato</label>
                <select style={s.input} value={formCont.tipo_contrato} onChange={e=>setFormCont(f=>({ ...f, tipo_contrato:e.target.value }))}>
                  <option value="Venda Nova">Venda Nova</option><option value="Retenção">Retenção</option>
                </select></div>
              <div><label style={s.fLabel}>Custo unitário/vida (manual)</label>
                <input type="number" step="0.01" style={s.input} value={formCont.custo_unitario_manual} onChange={e=>setFormCont(f=>({ ...f, custo_unitario_manual:e.target.value }))} placeholder="0,00" /></div>
              <div><label style={s.fLabel}>Licenças mínimas</label>
                <input type="number" step="1" style={s.input} value={formCont.licencas_minimas} onChange={e=>setFormCont(f=>({ ...f, licencas_minimas:e.target.value }))} placeholder="0" /></div>
              <div><label style={s.fLabel}>Valor Titular</label>
                <input type="number" step="0.01" style={s.input} value={formCont.valor_titular} onChange={e=>setFormCont(f=>({ ...f, valor_titular:e.target.value }))} /></div>
              <div><label style={s.fLabel}>Valor Dependente</label>
                <input type="number" step="0.01" style={s.input} value={formCont.valor_dependente} onChange={e=>setFormCont(f=>({ ...f, valor_dependente:e.target.value }))} /></div>
              <div><label style={s.fLabel}>Consultor Principal</label>
                <select style={s.input} value={formCont.consultor_principal_id} onChange={e=>setFormCont(f=>({ ...f, consultor_principal_id:e.target.value }))}>
                  <option value="">— Selecione —</option>
                  {consultores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select></div>
              <div><label style={s.fLabel}>Consultor Agregado</label>
                <select style={s.input} value={formCont.consultor_agregado_id} onChange={e=>setFormCont(f=>({ ...f, consultor_agregado_id:e.target.value }))}>
                  <option value="">— Nenhum —</option>
                  {consultores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select></div>
            </div>
            {erro && <div style={{ color:'#dc2626', fontSize:'0.82rem', marginTop:12 }}>{erro}</div>}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button style={s.btnSec} onClick={()=>setEditCont(false)}>Cancelar</button>
              <button style={s.btnPri} onClick={salvarCont} disabled={salvando}>{salvando?'Salvando...':'💾 Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Campo({ label, valor, cor }) {
  return (
    <div>
      <div style={s.fLabel}>{label}</div>
      <div style={{ ...s.fVal, ...(cor?{ color:cor }:{}) }}>{valor}</div>
    </div>
  );
}

const s = {
  page:      { maxWidth:1100, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans',sans-serif", color:'#1a1d2e', background:'#f5f6fa', minHeight:'100vh' },
  card:      { background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:16, padding:24, marginBottom:18 },
  cardTitle: { fontSize:'1rem', fontWeight:700 },
  secHead:   { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:12, flexWrap:'wrap' },
  grid4:     { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16 },
  fLabel:    { color:'#8b92b0', fontSize:'0.68rem', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5, marginBottom:5 },
  fVal:      { fontSize:'0.9rem', fontWeight:600, color:'#1a1d2e' },
  spin:      { width:36, height:36, border:'3px solid #e4e7ef', borderTop:'3px solid #f0b429', borderRadius:'50%', margin:'0 auto', animation:'spin 0.8s linear infinite', display:'block' },
  btnPri:    { background:'#f0b429', color:'#000', border:'none', borderRadius:10, padding:'9px 18px', fontWeight:700, cursor:'pointer', fontSize:'0.85rem', fontFamily:'inherit' },
  btnSec:    { background:'#eaecf2', color:'#1a1d2e', border:'1px solid #e4e7ef', borderRadius:10, padding:'9px 18px', fontWeight:600, cursor:'pointer', fontSize:'0.85rem', fontFamily:'inherit' },
  btnFechar: { background:'transparent', border:'none', color:'#8b92b0', cursor:'pointer', fontSize:'1.1rem', fontFamily:'inherit' },
  table:     { width:'100%', borderCollapse:'collapse', fontSize:'0.79rem' },
  th:        { padding:'8px 12px', textAlign:'left', color:'#8b92b0', fontWeight:500, borderBottom:'1px solid #e4e7ef', whiteSpace:'nowrap', textTransform:'uppercase', fontSize:'0.66rem', letterSpacing:0.5 },
  td:        { padding:'9px 12px', borderBottom:'1px solid #f0f2f8', whiteSpace:'nowrap' },
  overlay:   { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 },
  modal:     { background:'#ffffff', borderRadius:16, padding:'24px 26px', width:'100%', maxWidth:640, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 10px 40px rgba(0,0,0,0.2)' },
  input:     { width:'100%', background:'#f5f6fa', border:'1px solid #e4e7ef', borderRadius:8, padding:'9px 11px', color:'#1a1d2e', fontSize:'0.85rem', fontFamily:'inherit', outline:'none', boxSizing:'border-box' },
};
