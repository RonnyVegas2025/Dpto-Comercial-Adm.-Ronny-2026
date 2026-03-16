'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const fmtN   = (v) => Number(v||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtMes = (d) => { if (!d) return '—'; const [y,m] = String(d).substring(0,7).split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`; };

// Normaliza nomes de produtos da planilha para o banco
const NORM_PRODUTO = {
  'gympass':    'WellHub',
  'wellhub':    'WellHub',
  'totalpass':  'Total Pass',
  'total pass': 'Total Pass',
  'mediquo':    'Telemedicina',
  'telemedicina': 'Telemedicina',
  'vidalink auxilio r$ 50':  'Vidalink Auxilio R$ 50',
  'vidalink auxilio r$ 100': 'Vidalink Auxilio R$ 100',
  'vidalink auxilio r$ 150': 'Vidalink Auxilio R$ 150',
};
function normProduto(s) {
  if (!s) return null;
  const k = s.trim().toLowerCase().replace(/\s+/g,' ');
  return NORM_PRODUTO[k] || s.trim();
}
function normText(s) {
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function cleanDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const d = new Date(v.getTime() - v.getTimezoneOffset()*60000);
    return d.toISOString().split('T')[0];
  }
  const s = String(v).trim();
  if (s.match(/^\d{4}-\d{2}/)) return s.substring(0,10);
  const p = s.split('/');
  if (p.length===3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  return null;
}

const ABAS_DASH = [
  { key:'saude',      label:'💚 Saúde Financeira' },
  { key:'produtos',   label:'📦 Por Produto'       },
  { key:'consultores',label:'👤 Por Consultor'     },
  { key:'empresas',   label:'🏢 Empresas'          },
];

export default function Agregados() {
  const [aba,        setAba]        = useState('saude');
  const [abaPrinc,   setAbaPrinc]   = useState('dashboard'); // 'dashboard' | 'importar'
  const [xlsxLib,    setXlsxLib]    = useState(null);
  const [isDrag,     setIsDrag]     = useState(false);
  const [status,     setStatus]     = useState('idle');
  const [preview,    setPreview]    = useState([]);
  const [result,     setResult]     = useState({ ok:0, erros:[] });
  const [dados,      setDados]      = useState(null);
  const [loadDash,   setLoadDash]   = useState(true);
  const [mesFiltro,  setMesFiltro]  = useState('');
  const [meses,      setMeses]      = useState([]);
  const [busca,      setBusca]      = useState('');
  const [filtroGrupo,setFiltroGrupo]= useState('');

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m)); carregarDash(); }, []);
  useEffect(() => { if (mesFiltro !== undefined) carregarDash(); }, [mesFiltro]);

  // ── Parser da planilha ──────────────────────────────────────
  function parseRow(row) {
    // Linha 1=grupos, 2=headers, 3=instrucoes → dados a partir da linha 4
    const nome  = String(row[0]||'').trim();
    const cnpj  = String(row[1]||'').trim().replace(/\D/g,'');
    const dt    = cleanDate(row[2]);
    const vend  = String(row[3]||'').trim();
    const vend2 = String(row[4]||'').trim();
    const p1    = normProduto(row[5]);
    const tit1  = parseInt(row[6])||0;
    const dep1  = parseInt(row[7])||0;
    const vt1   = parseFloat(row[8])||0;
    const vd1   = parseFloat(row[9])||0;
    const p2    = normProduto(row[10]);
    const tit2  = parseInt(row[11])||0;
    const dep2  = parseInt(row[12])||0;
    const vt2   = parseFloat(row[13])||0;
    const vd2   = parseFloat(row[14])||0;
    const p3    = normProduto(row[15]);
    const tit3  = parseInt(row[16])||0;
    const dep3  = parseInt(row[17])||0;
    const vt3   = parseFloat(row[18])||0;
    const vd3   = parseFloat(row[19])||0;
    const boleto= parseFloat(row[20])||0;
    const mesRef= cleanDate(row[21]);

    if (!nome || !cnpj || !p1) return null;

    const isCombo = !!p2;
    const comboNome = isCombo
      ? [p1, p2, p3].filter(Boolean).join(' + ')
      : null;

    return { nome, cnpj, dt, vend, vend2, p1, tit1, dep1, vt1, vd1,
             p2, tit2, dep2, vt2, vd2, p3, tit3, dep3, vt3, vd3,
             boleto, mesRef, isCombo, comboNome };
  }

  function handleFile(f) {
    if (!f || !xlsxLib) return;
    setStatus('parsing');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb  = xlsxLib.read(e.target.result, { type:'array', cellDates:true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = xlsxLib.utils.sheet_to_json(ws, { raw:true, defval:'', header:1 });
        // Pula linhas 0,1,2 (grupos, headers, instruções)
        const parsed = raw.slice(3).map(parseRow).filter(Boolean);
        setPreview(parsed);
        setStatus('confirming');
      } catch(err) { setStatus('error'); setResult({ ok:0, erros:['Erro ao ler: '+err.message] }); }
    };
    reader.readAsArrayBuffer(f);
  }

  async function handleImport() {
    setStatus('importing');
    const erros = []; let ok = 0;
    try {
      // Busca produtos e consultores do banco
      const [{ data: prods }, { data: consults }] = await Promise.all([
        supabase.from('produtos').select('id, nome, custo').eq('ativo', true),
        supabase.from('consultores').select('id, nome').eq('ativo', true),
      ]);
      const prodMap    = Object.fromEntries((prods||[]).map(p => [normText(p.nome), p.id]));
      const consultMap = Object.fromEntries((consults||[]).map(c => [normText(c.nome), c.id]));

      // Debug: mostra produtos encontrados no banco
      console.log('Produtos no banco:', Object.keys(prodMap));
      console.log('Consultores no banco:', Object.keys(consultMap));

      for (const r of preview) {
        try {
          const consultId  = consultMap[normText(r.vend)]  || null;
          const consultId2 = consultMap[normText(r.vend2)] || null;

          // 1. Upsert empresa_agregada
          const { data: empData, error: empErr } = await supabase
            .from('empresas_agregadas')
            .upsert({ cnpj: r.cnpj, nome: r.nome, data_cadastro: r.dt,
                      consultor_principal_id: consultId, consultor_agregado_id: consultId2 },
              { onConflict: 'cnpj' })
            .select('id').single();
          if (empErr) throw new Error('Empresa: ' + empErr.message);

          const empId = empData.id;
          const p1Id  = prodMap[normText(r.p1)] || null;
          const p2Id  = r.p2 ? prodMap[normText(r.p2)] || null : null;
          const p3Id  = r.p3 ? prodMap[normText(r.p3)] || null : null;

          if (!p1Id) throw new Error(`Produto não encontrado: "${r.p1}" (chave: "${normText(r.p1)}")`);

          // 2. Contrato — busca existente ou insere novo
          let contId = null;
          const { data: contExist } = await supabase
            .from('contratos_agregados')
            .select('id')
            .eq('empresa_agregada_id', empId)
            .eq('produto_1_id', p1Id)
            .maybeSingle();

          if (contExist) {
            // Atualiza
            const { error: updErr } = await supabase
              .from('contratos_agregados')
              .update({
                is_combo: r.isCombo, combo_nome: r.comboNome,
                produto_2_id: p2Id, produto_3_id: p3Id,
                titulares: r.tit1 + r.tit2 + r.tit3,
                dependentes: r.dep1 + r.dep2 + r.dep3,
                valor_cobrado_titular_p1: r.vt1, valor_cobrado_dependente_p1: r.vd1,
                valor_cobrado_titular_p2: r.vt2, valor_cobrado_dependente_p2: r.vd2,
                valor_cobrado_titular_p3: r.vt3, valor_cobrado_dependente_p3: r.vd3,
                data_inicio: r.dt,
              })
              .eq('id', contExist.id);
            if (updErr) throw new Error('Contrato update: ' + updErr.message);
            contId = contExist.id;
          } else {
            // Insere novo
            const { data: contNew, error: insErr } = await supabase
              .from('contratos_agregados')
              .insert({
                empresa_agregada_id: empId,
                is_combo: r.isCombo, combo_nome: r.comboNome,
                produto_1_id: p1Id, produto_2_id: p2Id, produto_3_id: p3Id,
                titulares: r.tit1 + r.tit2 + r.tit3,
                dependentes: r.dep1 + r.dep2 + r.dep3,
                valor_cobrado_titular_p1: r.vt1, valor_cobrado_dependente_p1: r.vd1,
                valor_cobrado_titular_p2: r.vt2, valor_cobrado_dependente_p2: r.vd2,
                valor_cobrado_titular_p3: r.vt3, valor_cobrado_dependente_p3: r.vd3,
                data_inicio: r.dt,
              })
              .select('id').single();
            if (insErr) throw new Error('Contrato insert: ' + insErr.message);
            contId = contNew.id;
          }

          // 3. Fechamento — calcula custo manualmente no front (evita depender da RPC)
          if (r.mesRef && contId) {
            const totalTit = r.tit1 + r.tit2 + r.tit3;
            const totalDep = r.dep1 + r.dep2 + r.dep3;

            // Calcula custo baseado no produto principal
            let custoMes = 0;
            if (r.p1) {
              const nomeProd = normText(r.p1);
              const totalVidas = totalTit + totalDep;
              const temDep = totalDep > 0;
              if (nomeProd === normText('WellHub')) {
                // Tabela PEPM WellHub
                const tabela = temDep
                  ? [[10,11.99],[20,11.99],[100,9.99],[250,8.99],[500,7.99],[999999,6.99]]
                  : [[10,9.99],[20,9.99],[100,7.99],[250,6.99],[500,5.99],[999999,4.99]];
                const pepm = tabela.find(([lim]) => totalVidas <= lim)?.[1] || 4.99;
                custoMes = Math.max(100, totalVidas * pepm);
              } else if (nomeProd === normText('Total Pass')) {
                custoMes = Math.max(200, totalVidas * 5.85);
              } else {
                // Produto com custo fixo — busca do mapa de produtos
                const prod = (prods||[]).find(p => normText(p.nome) === nomeProd);
                const custoPorVida = prod?.custo || 0;
                custoMes = totalVidas * custoPorVida;
                // Se for combo adiciona custo dos outros produtos
                if (r.p2) {
                  const prod2 = (prods||[]).find(p => normText(p.nome) === normText(r.p2));
                  const vidas2 = r.tit2 + r.dep2;
                  custoMes += vidas2 * (prod2?.custo || 0);
                }
                if (r.p3) {
                  const prod3 = (prods||[]).find(p => normText(p.nome) === normText(r.p3));
                  const vidas3 = r.tit3 + r.dep3;
                  custoMes += vidas3 * (prod3?.custo || 0);
                }
              }
            }

            // Upsert fechamento
            const { error: fechErr } = await supabase
              .from('fechamentos_agregados')
              .upsert({
                contrato_id: contId,
                competencia: r.mesRef,
                titulares_mes: totalTit,
                dependentes_mes: totalDep,
                valor_boleto: r.boleto,
                custo_mes: parseFloat(custoMes.toFixed(2)),
              }, { onConflict: 'contrato_id,competencia' });
            if (fechErr) throw new Error('Fechamento: ' + fechErr.message);
          }
          ok++;
        } catch(err) {
          console.error('Erro linha:', r.nome, err);
          erros.push(`${r.nome}: ${err.message}`);
        }
      }
      setResult({ ok, erros }); setStatus('done');
      carregarDash();
    } catch(err) { setResult({ ok:0, erros:[err.message] }); setStatus('error'); }
  }

  // ── Carregar dashboard ──────────────────────────────────────
  async function carregarDash() {
    setLoadDash(true);
    try {
      let q = supabase.from('vw_agregados_mensal').select('*');
      if (mesFiltro) q = q.eq('competencia', mesFiltro + '-01');
      const { data } = await q;
      const rows = data || [];

      // Meses disponíveis
      const ms = [...new Set(rows.map(r => r.competencia?.substring(0,7)).filter(Boolean))].sort();
      setMeses(ms);

      setDados(rows);
    } catch(err) { console.error(err); }
    setLoadDash(false);
  }

  const reset = () => { setStatus('idle'); setPreview([]); setResult({ok:0,erros:[]}); };

  // ── Cálculos do dashboard ───────────────────────────────────
  const kpis = useMemo(() => {
    if (!dados) return null;
    const tot = { boleto:0, custo:0, lucro:0, vidas:0, empresas: new Set(), contratos: new Set() };
    const grupos = { retencao:{b:0,c:0,l:0,n:0}, subsidio:{b:0,c:0,l:0,n:0}, lucrativo:{b:0,c:0,l:0,n:0} };
    dados.forEach(r => {
      tot.boleto  += r.valor_boleto || 0;
      tot.custo   += r.custo_mes    || 0;
      tot.lucro   += r.lucro_mes    || 0;
      tot.vidas   += r.total_vidas  || 0;
      tot.empresas.add(r.cnpj);
      tot.contratos.add(r.empresa_agregada_id + r.produto_label);
      const g = grupos[r.grupo] || grupos.lucrativo;
      g.b += r.valor_boleto||0; g.c += r.custo_mes||0; g.l += r.lucro_mes||0; g.n++;
    });
    return { ...tot, empresas: tot.empresas.size, contratos: tot.contratos.size, grupos };
  }, [dados]);

  const porProduto = useMemo(() => {
    if (!dados) return [];
    const map = {};
    dados.forEach(r => {
      const k = r.produto_label || '—';
      if (!map[k]) map[k] = { nome:k, boleto:0, custo:0, lucro:0, vidas:0, n:0 };
      map[k].boleto += r.valor_boleto||0; map[k].custo += r.custo_mes||0;
      map[k].lucro  += r.lucro_mes||0;   map[k].vidas += r.total_vidas||0; map[k].n++;
    });
    return Object.values(map).sort((a,b) => b.boleto - a.boleto);
  }, [dados]);

  const porConsultor = useMemo(() => {
    if (!dados) return [];
    const map = {};
    dados.forEach(r => {
      const k = r.consultor_principal || 'Sem consultor';
      if (!map[k]) map[k] = { nome:k, boleto:0, custo:0, lucro:0, n:0 };
      map[k].boleto += r.valor_boleto||0; map[k].custo += r.custo_mes||0;
      map[k].lucro  += r.lucro_mes||0;   map[k].n++;
    });
    return Object.values(map).sort((a,b) => b.boleto - a.boleto);
  }, [dados]);

  const empresasFiltradas = useMemo(() => {
    if (!dados) return [];
    const map = {};
    dados.forEach(r => {
      const k = r.cnpj;
      if (!map[k]) map[k] = { cnpj:k, nome:r.empresa, consultor:r.consultor_principal,
        boleto:0, custo:0, lucro:0, vidas:0, produtos:[], grupo: r.grupo };
      map[k].boleto += r.valor_boleto||0; map[k].custo += r.custo_mes||0;
      map[k].lucro  += r.lucro_mes||0;   map[k].vidas += r.total_vidas||0;
      map[k].produtos.push(r.produto_label);
      // grupo = pior dos contratos
      if (r.grupo === 'retencao') map[k].grupo = 'retencao';
      else if (r.grupo === 'subsidio' && map[k].grupo !== 'retencao') map[k].grupo = 'subsidio';
    });
    return Object.values(map)
      .filter(e => !busca || e.nome?.toLowerCase().includes(busca.toLowerCase()) ||
                   e.cnpj?.includes(busca) || e.consultor?.toLowerCase().includes(busca.toLowerCase()))
      .filter(e => !filtroGrupo || e.grupo === filtroGrupo)
      .sort((a,b) => b.boleto - a.boleto);
  }, [dados, busca, filtroGrupo]);

  const corGrupo = (g) => g==='lucrativo'?'#34d399':g==='subsidio'?'#f0b429':'#f87171';
  const emojiGrupo = (g) => g==='lucrativo'?'💚':g==='subsidio'?'⚡':'❄️';
  const labelGrupo = (g) => g==='lucrativo'?'Lucrativo':g==='subsidio'?'Subsídio':'Retenção';

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Produtos Agregados</h1>
          <p style={s.sub}>Gestão de WellHub · Total Pass · Telemedicina · Vidalink</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => setAbaPrinc('dashboard')}
            style={{ ...s.btnTab, ...(abaPrinc==='dashboard'?s.btnTabAtivo:{}) }}>
            📊 Dashboard
          </button>
          <button onClick={() => setAbaPrinc('importar')}
            style={{ ...s.btnTab, ...(abaPrinc==='importar'?s.btnTabAtivo:{}) }}>
            📥 Importar
          </button>
        </div>
      </div>

      {/* ── IMPORTAÇÃO ─────────────────────────────────────── */}
      {abaPrinc === 'importar' && (
        <div>
          {status === 'idle' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
              {/* Card Cadastro */}
              <div
                style={{ ...s.importCard, borderColor: isDrag?'rgba(240,180,41,0.6)':'rgba(240,180,41,0.2)',
                  background: isDrag?'rgba(240,180,41,0.06)':'rgba(240,180,41,0.02)' }}
                onDragOver={e=>{e.preventDefault();setIsDrag(true)}}
                onDragLeave={()=>setIsDrag(false)}
                onDrop={e=>{e.preventDefault();setIsDrag(false);handleFile(e.dataTransfer.files[0])}}
                onClick={()=>document.getElementById('fi-agr').click()}
              >
                <div style={{ fontSize:'2.5rem', marginBottom:12 }}>📋</div>
                <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:6 }}>Cadastro + Fechamento</div>
                <div style={{ color:'#6b7280', fontSize:'0.82rem', lineHeight:1.6 }}>
                  Importa empresas, contratos e fechamento mensal<br/>
                  de uma só vez pelo modelo de cadastro
                </div>
                <div style={{ marginTop:14, color:'#f0b429', fontSize:'0.75rem', fontWeight:600 }}>
                  .xlsx — modelo_cadastro_agregados
                </div>
                <input id="fi-agr" type="file" accept=".xlsx,.xls" style={{display:'none'}}
                  onChange={e=>handleFile(e.target.files[0])} />
              </div>

              {/* Card Fechamento */}
              <div style={{ ...s.importCard, borderColor:'rgba(52,211,153,0.2)',
                background:'rgba(52,211,153,0.02)', cursor:'not-allowed', opacity:0.5 }}>
                <div style={{ fontSize:'2.5rem', marginBottom:12 }}>📊</div>
                <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:6 }}>Fechamento Mensal</div>
                <div style={{ color:'#6b7280', fontSize:'0.82rem', lineHeight:1.6 }}>
                  Atualiza titulares e boleto do mês para<br/>empresas já cadastradas
                </div>
                <div style={{ marginTop:14, color:'#34d399', fontSize:'0.75rem', fontWeight:600 }}>
                  Em breve
                </div>
              </div>
            </div>
          )}

          {status === 'parsing' && (
            <div style={s.stCard}><div style={s.spin}></div>Lendo arquivo...</div>
          )}

          {status === 'confirming' && (
            <div style={s.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
                <div>
                  <div style={s.cardTitle}>✅ {preview.length} registros encontrados</div>
                  <div style={{ color:'#6b7280', fontSize:'0.8rem', marginTop:4 }}>
                    {preview.filter(r=>r.isCombo).length} combos · {preview.filter(r=>r.boleto===0).length} retenções
                  </div>
                </div>
                <div style={{ display:'flex', gap:10 }}>
                  <button style={s.btnSec} onClick={reset}>Cancelar</button>
                  <button style={s.btnPri} onClick={handleImport}>
                    Importar {preview.length} registros →
                  </button>
                </div>
              </div>
              <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:420, border:'1px solid rgba(255,255,255,0.05)', borderRadius:8 }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {['Empresa','CNPJ','Vendedor','Produto(s)','Titulares','Boleto','Mês Ref.','Grupo'].map(h =>
                        <th key={h} style={{ ...s.th, background:'#1a1f2e', position:'sticky', top:0 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r,i) => {
                      const grupo = r.boleto===0?'retencao': 'lucrativo';
                      const cor = corGrupo(grupo);
                      return (
                        <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.015)'}:{}}>
                          <td style={{ ...s.td, fontWeight:600 }}>{r.nome}</td>
                          <td style={{ ...s.td, color:'#6b7280', fontSize:'0.72rem' }}>{r.cnpj}</td>
                          <td style={s.td}>{r.vend}</td>
                          <td style={s.td}>
                            <span style={{ color: r.isCombo?'#a78bfa':'#60a5fa', fontWeight:600 }}>
                              {r.isCombo ? '🔗 '+r.comboNome : r.p1}
                            </span>
                          </td>
                          <td style={{ ...s.td, textAlign:'center' }}>{r.tit1+r.tit2+r.tit3}</td>
                          <td style={{ ...s.td, color: r.boleto>0?'#34d399':'#6b7280' }}>{fmt(r.boleto)}</td>
                          <td style={{ ...s.td, color:'#6b7280' }}>{fmtMes(r.mesRef)}</td>
                          <td style={s.td}>
                            <span style={{ background:`${cor}18`, color:cor, borderRadius:5,
                              padding:'2px 8px', fontSize:'0.68rem', fontWeight:700 }}>
                              {emojiGrupo(grupo)} {labelGrupo(grupo)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {status === 'importing' && (
            <div style={s.stCard}><div style={s.spin}></div>
              <div style={{ fontWeight:600, marginBottom:8 }}>Importando {preview.length} registros...</div>
              <div style={{ color:'#6b7280', fontSize:'0.85rem' }}>Aguarde alguns segundos</div>
            </div>
          )}

          {status === 'done' && (
            <div style={{ ...s.card, textAlign:'center' }}>
              <div style={{ fontSize:'3rem', marginBottom:12 }}>✅</div>
              <div style={s.cardTitle}>Importação concluída!</div>
              <div style={{ fontSize:'2rem', fontWeight:800, color:'#34d399', margin:'16px 0' }}>
                {result.ok} registros
              </div>
              {result.erros.length>0 && (
                <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)',
                  borderRadius:10, padding:16, marginBottom:20, color:'#f87171', fontSize:'0.82rem', textAlign:'left' }}>
                  {result.erros.map((e,i)=><div key={i}>• {e}</div>)}
                </div>
              )}
              <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                <button style={s.btnSec} onClick={reset}>Importar outro arquivo</button>
                <button style={s.btnPri} onClick={()=>{ reset(); setAbaPrinc('dashboard'); }}>
                  Ver Dashboard →
                </button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div style={{ ...s.stCard, borderColor:'#f87171' }}>
              <div style={{ fontSize:'2.5rem', marginBottom:12 }}>❌</div>
              {result.erros.map((e,i)=><div key={i} style={{ color:'#f87171', fontSize:'0.85rem' }}>{e}</div>)}
              <button style={{ ...s.btnSec, marginTop:20 }} onClick={reset}>Tentar novamente</button>
            </div>
          )}
        </div>
      )}

      {/* ── DASHBOARD ──────────────────────────────────────── */}
      {abaPrinc === 'dashboard' && (
        <div>
          {/* Filtro de mês */}
          <div style={{ display:'flex', gap:8, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ color:'#6b7280', fontSize:'0.78rem', marginRight:4 }}>COMPETÊNCIA:</span>
            <button onClick={()=>setMesFiltro('')}
              style={{ ...s.mesBt, ...(mesFiltro===''?s.mesBtAtivo:{}) }}>🌐 Todos</button>
            {meses.map(m => (
              <button key={m} onClick={()=>setMesFiltro(m)}
                style={{ ...s.mesBt, ...(mesFiltro===m?s.mesBtAtivo:{}) }}>{fmtMes(m+'-01')}</button>
            ))}
          </div>

          {loadDash ? (
            <div style={{ textAlign:'center', padding:64 }}><div style={s.spin}></div></div>
          ) : !dados || dados.length === 0 ? (
            <div style={{ ...s.stCard, color:'#6b7280' }}>
              Nenhum dado encontrado. <button style={{ ...s.btnPri, marginLeft:16 }}
                onClick={()=>setAbaPrinc('importar')}>Importar dados →</button>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:20 }}>
                {[
                  { label:'Empresas',        val: kpis.empresas,        cor:'#60a5fa', icone:'🏢' },
                  { label:'Vidas Ativas',    val: kpis.vidas.toLocaleString('pt-BR'), cor:'#a78bfa', icone:'👥' },
                  { label:'Receita Boletos', val: fmt(kpis.boleto),     cor:'#34d399', icone:'💰' },
                  { label:'Custo Total',     val: fmt(kpis.custo),      cor:'#f87171', icone:'💸' },
                  { label:'Lucro Líquido',   val: fmt(kpis.lucro),      cor: kpis.lucro>=0?'#34d399':'#f87171', icone: kpis.lucro>=0?'📈':'📉' },
                ].map(k => (
                  <div key={k.label} style={{ background:'#161a26', border:`1px solid ${k.cor}22`,
                    borderRadius:14, padding:'16px 20px' }}>
                    <div style={{ fontSize:'1.2rem', marginBottom:6 }}>{k.icone}</div>
                    <div style={{ color:'#6b7280', fontSize:'0.65rem', textTransform:'uppercase',
                      letterSpacing:1, marginBottom:4 }}>{k.label}</div>
                    <div style={{ fontSize:'1.2rem', fontWeight:800, color:k.cor }}>{k.val}</div>
                  </div>
                ))}
              </div>

              {/* Cards dos 3 grupos */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
                {[
                  { key:'lucrativo', emoji:'💚', label:'Lucrativo', desc:'boleto ≥ custo' },
                  { key:'subsidio',  emoji:'⚡', label:'Subsídio',  desc:'boleto < custo' },
                  { key:'retencao',  emoji:'❄️', label:'Retenção',  desc:'boleto = R$ 0' },
                ].map(g => {
                  const d = kpis.grupos[g.key] || {b:0,c:0,l:0,n:0};
                  const cor = corGrupo(g.key);
                  return (
                    <div key={g.key} style={{ background:'#161a26', border:`1px solid ${cor}30`,
                      borderRadius:14, padding:'20px 22px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
                        <div>
                          <div style={{ fontSize:'1.3rem' }}>{g.emoji}</div>
                          <div style={{ fontWeight:700, fontSize:'0.95rem', color:cor, marginTop:4 }}>{g.label}</div>
                          <div style={{ color:'#4b5563', fontSize:'0.7rem' }}>{g.desc}</div>
                        </div>
                        <div style={{ background:`${cor}18`, color:cor, borderRadius:10,
                          padding:'4px 14px', fontWeight:800, fontSize:'1.2rem',
                          display:'flex', alignItems:'center' }}>{d.n}</div>
                      </div>
                      <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:12,
                        display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                        {[['Boleto',fmt(d.b),'#e8eaf0'],['Custo',fmt(d.c),'#f87171'],
                          ['Lucro',fmt(d.l), d.l>=0?'#34d399':'#f87171']].map(([lbl,val,c])=>(
                          <div key={lbl}>
                            <div style={{ color:'#4b5563', fontSize:'0.6rem', textTransform:'uppercase',
                              letterSpacing:0.8, marginBottom:3 }}>{lbl}</div>
                            <div style={{ fontWeight:700, fontSize:'0.78rem', color:c }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Abas */}
              <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
                {ABAS_DASH.map(a => (
                  <button key={a.key} onClick={()=>setAba(a.key)}
                    style={{ ...s.tab, ...(aba===a.key?s.tabAtiva:{}) }}>
                    {a.label}
                  </button>
                ))}
              </div>

              {/* ── SAÚDE FINANCEIRA ── */}
              {aba === 'saude' && (
                <div style={s.card}>
                  <div style={s.cardTitle}>💚 Saúde Financeira por Grupo</div>
                  <div style={{ marginTop:20, display:'flex', flexDirection:'column', gap:16 }}>
                    {['lucrativo','subsidio','retencao'].map(g => {
                      const d = kpis.grupos[g] || {b:0,c:0,l:0,n:0};
                      const cor = corGrupo(g);
                      const pctBoleto = kpis.boleto > 0 ? (d.b/kpis.boleto)*100 : 0;
                      const pctCusto  = kpis.custo  > 0 ? (d.c/kpis.custo)*100  : 0;
                      return (
                        <div key={g} style={{ background:'rgba(255,255,255,0.02)',
                          border:`1px solid ${cor}20`, borderRadius:12, padding:'18px 22px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between',
                            alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <span style={{ fontSize:'1.2rem' }}>{emojiGrupo(g)}</span>
                              <span style={{ fontWeight:700, color:cor }}>{labelGrupo(g)}</span>
                              <span style={{ background:`${cor}18`, color:cor, borderRadius:5,
                                padding:'2px 8px', fontSize:'0.7rem', fontWeight:700 }}>{d.n} empresas</span>
                            </div>
                            <span style={{ fontWeight:800, color: d.l>=0?'#34d399':'#f87171',
                              fontSize:'1rem' }}>Lucro: {fmt(d.l)}</span>
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                            <div>
                              <div style={{ display:'flex', justifyContent:'space-between',
                                marginBottom:4, fontSize:'0.72rem' }}>
                                <span style={{ color:'#6b7280' }}>Receita Boletos</span>
                                <span style={{ color:'#34d399', fontWeight:600 }}>{fmt(d.b)} ({pctBoleto.toFixed(0)}%)</span>
                              </div>
                              <div style={{ background:'rgba(255,255,255,0.07)', borderRadius:4, height:8, overflow:'hidden' }}>
                                <div style={{ background:'#34d399', height:'100%',
                                  width:`${pctBoleto}%`, borderRadius:4 }}></div>
                              </div>
                            </div>
                            <div>
                              <div style={{ display:'flex', justifyContent:'space-between',
                                marginBottom:4, fontSize:'0.72rem' }}>
                                <span style={{ color:'#6b7280' }}>Custo Vegas</span>
                                <span style={{ color:'#f87171', fontWeight:600 }}>{fmt(d.c)} ({pctCusto.toFixed(0)}%)</span>
                              </div>
                              <div style={{ background:'rgba(255,255,255,0.07)', borderRadius:4, height:8, overflow:'hidden' }}>
                                <div style={{ background:'#f87171', height:'100%',
                                  width:`${pctCusto}%`, borderRadius:4 }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── POR PRODUTO ── */}
              {aba === 'produtos' && (
                <div style={s.card}>
                  <div style={s.cardTitle}>📦 Desempenho por Produto</div>
                  <div style={{ overflowX:'auto', marginTop:16 }}>
                    <table style={s.table}>
                      <thead><tr>
                        {['Produto','Contratos','Vidas','Boleto','Custo','Lucro','Margem'].map(h=>
                          <th key={h} style={s.th}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {porProduto.map((p,i) => {
                          const margem = p.boleto>0?(p.lucro/p.boleto)*100:0;
                          const corM = margem>0?'#34d399':margem<0?'#f87171':'#6b7280';
                          return (
                            <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.015)'}:{}}>
                              <td style={{ ...s.td, fontWeight:600, color:'#a78bfa' }}>{p.nome}</td>
                              <td style={{ ...s.td, textAlign:'center' }}>{p.n}</td>
                              <td style={{ ...s.td, textAlign:'center' }}>{p.vidas.toLocaleString('pt-BR')}</td>
                              <td style={{ ...s.td, color:'#34d399' }}>{fmt(p.boleto)}</td>
                              <td style={{ ...s.td, color:'#f87171' }}>{fmt(p.custo)}</td>
                              <td style={{ ...s.td, color:corM, fontWeight:700 }}>{fmt(p.lucro)}</td>
                              <td style={{ ...s.td, color:corM, fontWeight:700 }}>{margem.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── POR CONSULTOR ── */}
              {aba === 'consultores' && (
                <div style={s.card}>
                  <div style={s.cardTitle}>👤 Desempenho por Consultor</div>
                  <div style={{ overflowX:'auto', marginTop:16 }}>
                    <table style={s.table}>
                      <thead><tr>
                        {['Consultor','Contratos','Boleto','Custo','Lucro','Margem'].map(h=>
                          <th key={h} style={s.th}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {porConsultor.map((c,i) => {
                          const margem = c.boleto>0?(c.lucro/c.boleto)*100:0;
                          const corM = margem>0?'#34d399':margem<0?'#f87171':'#6b7280';
                          const maxB = Math.max(...porConsultor.map(x=>x.boleto), 1);
                          return (
                            <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.015)'}:{}}>
                              <td style={{ ...s.td, fontWeight:600 }}>{c.nome}</td>
                              <td style={{ ...s.td, textAlign:'center' }}>{c.n}</td>
                              <td style={s.td}>
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                  <div style={{ background:'rgba(255,255,255,0.07)', borderRadius:3,
                                    height:6, width:80, overflow:'hidden' }}>
                                    <div style={{ background:'#34d399', height:'100%',
                                      width:`${(c.boleto/maxB)*100}%` }}></div>
                                  </div>
                                  <span style={{ color:'#34d399', fontWeight:600 }}>{fmt(c.boleto)}</span>
                                </div>
                              </td>
                              <td style={{ ...s.td, color:'#f87171' }}>{fmt(c.custo)}</td>
                              <td style={{ ...s.td, color:corM, fontWeight:700 }}>{fmt(c.lucro)}</td>
                              <td style={{ ...s.td, color:corM, fontWeight:700 }}>{margem.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── EMPRESAS ── */}
              {aba === 'empresas' && (
                <div style={s.card}>
                  <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
                    <input placeholder="🔍 Buscar empresa, CNPJ ou consultor..."
                      value={busca} onChange={e=>setBusca(e.target.value)}
                      style={{ flex:2, minWidth:200, ...s.inputFiltro }} />
                    <select value={filtroGrupo} onChange={e=>setFiltroGrupo(e.target.value)}
                      style={{ ...s.inputFiltro, minWidth:150 }}>
                      <option value=''>Todos os grupos</option>
                      <option value='lucrativo'>💚 Lucrativo</option>
                      <option value='subsidio'>⚡ Subsídio</option>
                      <option value='retencao'>❄️ Retenção</option>
                    </select>
                    {(busca||filtroGrupo) && (
                      <button onClick={()=>{setBusca('');setFiltroGrupo('');}}
                        style={{ ...s.btnSec, padding:'7px 14px', fontSize:'0.8rem' }}>✕ Limpar</button>
                    )}
                    <span style={{ color:'#4b5563', fontSize:'0.75rem', marginLeft:'auto' }}>
                      {empresasFiltradas.length} empresas
                    </span>
                  </div>
                  <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:'55vh',
                    border:'1px solid rgba(255,255,255,0.05)', borderRadius:8 }}>
                    <table style={s.table}>
                      <thead><tr>
                        {['Empresa','CNPJ','Consultor','Produto(s)','Vidas','Boleto','Custo','Lucro','Grupo'].map(h=>
                          <th key={h} style={{ ...s.th, background:'#1a1f2e', position:'sticky', top:0 }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {empresasFiltradas.map((e,i) => {
                          const cor = corGrupo(e.grupo);
                          return (
                            <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.015)'}:{}}>
                              <td style={{ ...s.td, fontWeight:600, minWidth:180 }}>{e.nome}</td>
                              <td style={{ ...s.td, color:'#6b7280', fontSize:'0.72rem' }}>{e.cnpj}</td>
                              <td style={s.td}>{e.consultor||'—'}</td>
                              <td style={{ ...s.td, color:'#a78bfa', fontSize:'0.78rem' }}>
                                {[...new Set(e.produtos)].join(' · ')}
                              </td>
                              <td style={{ ...s.td, textAlign:'center' }}>{e.vidas}</td>
                              <td style={{ ...s.td, color:'#34d399' }}>{fmt(e.boleto)}</td>
                              <td style={{ ...s.td, color:'#f87171' }}>{fmt(e.custo)}</td>
                              <td style={{ ...s.td, color:e.lucro>=0?'#34d399':'#f87171', fontWeight:700 }}>{fmt(e.lucro)}</td>
                              <td style={s.td}>
                                <span style={{ background:`${cor}18`, color:cor, borderRadius:5,
                                  padding:'2px 8px', fontSize:'0.68rem', fontWeight:700 }}>
                                  {emojiGrupo(e.grupo)} {labelGrupo(e.grupo)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:       { maxWidth:1300, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans',sans-serif", color:'#e8eaf0', background:'#0a0c10', minHeight:'100vh' },
  header:     { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, flexWrap:'wrap', gap:16 },
  tag:        { color:'#f0b429', fontWeight:800, fontSize:'0.9rem', letterSpacing:2, marginBottom:8, textTransform:'uppercase' },
  title:      { fontSize:'1.8rem', fontWeight:700, margin:'0 0 6px' },
  sub:        { color:'#6b7280', fontSize:'0.9rem' },
  btnTab:     { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'9px 20px', color:'#6b7280', cursor:'pointer', fontSize:'0.85rem', fontWeight:600, fontFamily:'inherit' },
  btnTabAtivo:{ background:'rgba(240,180,41,0.12)', border:'1px solid rgba(240,180,41,0.35)', color:'#f0b429' },
  importCard: { border:'2px dashed', borderRadius:16, padding:'40px 32px', textAlign:'center', cursor:'pointer', transition:'all 0.2s' },
  card:       { background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:24, marginBottom:20 },
  cardTitle:  { fontSize:'1rem', fontWeight:700 },
  stCard:     { background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:48, textAlign:'center', marginBottom:24 },
  spin:       { width:36, height:36, border:'3px solid rgba(255,255,255,0.1)', borderTop:'3px solid #f0b429', borderRadius:'50%', margin:'0 auto 16px', animation:'spin 0.8s linear infinite', display:'block' },
  btnPri:     { background:'#f0b429', color:'#000', border:'none', borderRadius:10, padding:'10px 22px', fontWeight:700, cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit' },
  btnSec:     { background:'rgba(255,255,255,0.07)', color:'#e8eaf0', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 22px', fontWeight:600, cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit' },
  mesBt:      { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'6px 14px', color:'#6b7280', cursor:'pointer', fontSize:'0.8rem', fontFamily:'inherit' },
  mesBtAtivo: { background:'rgba(240,180,41,0.12)', border:'1px solid rgba(240,180,41,0.3)', color:'#f0b429', fontWeight:700 },
  tab:        { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'8px 16px', color:'#6b7280', cursor:'pointer', fontSize:'0.85rem', fontFamily:'inherit' },
  tabAtiva:   { background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.3)', color:'#34d399' },
  table:      { width:'100%', borderCollapse:'collapse', fontSize:'0.79rem' },
  th:         { padding:'8px 12px', textAlign:'left', color:'#6b7280', fontWeight:500, borderBottom:'1px solid rgba(255,255,255,0.07)', whiteSpace:'nowrap', textTransform:'uppercase', fontSize:'0.67rem', letterSpacing:0.5 },
  td:         { padding:'9px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', whiteSpace:'nowrap' },
  inputFiltro:{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'7px 11px', color:'#e8eaf0', fontSize:'0.82rem', fontFamily:'inherit', outline:'none' },
};
