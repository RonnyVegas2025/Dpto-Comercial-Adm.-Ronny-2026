'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── Helpers ────────────────────────────────────────────────────────────────
function norm(s) { return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function findKey(obj, target) {
  if (obj[target] !== undefined) return obj[target];
  const t = norm(target);
  for (const key of Object.keys(obj)) if (norm(key) === t) return obj[key];
  return undefined;
}
function findKeyContains(obj, fragment) {
  const f = norm(fragment);
  for (const key of Object.keys(obj)) if (norm(key).includes(f)) return obj[key];
  return undefined;
}
function clean(v) { if (v===null||v===undefined) return null; const s=String(v).trim(); return (s==='-'||s==='') ? null : s; }
function cleanNum(v) {
  if (v===null||v===undefined||v==='-'||v==='') return 0;
  if (typeof v==='number') return isNaN(v) ? 0 : v;
  let s = String(v).replace(/R\$\s*/g,'').replace(/\s/g,'').trim();
  if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}
function cleanDate(v) {
  if (!v||v==='-'||v==='') return null;
  if (v instanceof Date) { const d=new Date(v.getTime()-v.getTimezoneOffset()*60000); return d.toISOString().split('T')[0]; }
  if (typeof v==='number') { const d=new Date(Math.round((v-25569)*86400*1000)); const d2=new Date(d.getTime()-d.getTimezoneOffset()*60000); return d2.toISOString().split('T')[0]; }
  const parts=String(v).trim().split('/');
  if (parts.length===3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  if (String(v).match(/^\d{4}-\d{2}-\d{2}/)) return String(v).substring(0,10);
  return null;
}
function cleanMesRef(v) {
  if (!v) return null;
  if (v instanceof Date) { const d=new Date(v.getTime()-v.getTimezoneOffset()*60000); return d.toISOString().substring(0,7)+'-01'; }
  if (typeof v==='number') { const d=new Date(Math.round((v-25569)*86400*1000)); const d2=new Date(d.getTime()-d.getTimezoneOffset()*60000); return d2.toISOString().substring(0,7)+'-01'; }
  const s=String(v).trim();
  if (s.match(/^\d{4}-\d{2}/)) return s.substring(0,7)+'-01';
  const parts=s.split('/');
  if (parts.length===3) return `${parts[2]}-${parts[1].padStart(2,'0')}-01`;
  if (parts.length===2) return `${parts[1]}-${parts[0].padStart(2,'0')}-01`;
  return null;
}
const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtMes = (d) => { if(!d) return '—'; const[y,m]=String(d).substring(0,7).split('-'); const ms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return `${ms[parseInt(m)-1]}/${y}`; };

// ── Parsers ────────────────────────────────────────────────────────────────
function parseRowMovimentacao(row) {
  // Aceita o modelo exportado: Produto ID, Nome da Empresa, ..., Movimentação Real, Taxa Negativa (%), Taxa Negativa (R$), Taxa Adm Bruta, Mês Referencia
  const mesRef = findKeyContains(row,'mes') ?? findKeyContains(row,'referencia') ?? findKeyContains(row,'competencia');
  return {
    produto_id:        parseInt(findKey(row,'Produto ID') ?? findKey(row,'Produto Id')) || null,
    nome:              clean(findKey(row,'Nome da Empresa') ?? findKey(row,'Empresa')),
    movimentacao_real: cleanNum(findKeyContains(row,'movimentacao') ?? findKeyContains(row,'movimentação')),
    taxa_neg_pct:      cleanNum(findKeyContains(row,'taxa negativa (%') ?? findKeyContains(row,'taxa neg')),
    taxa_neg_rs:       cleanNum(findKeyContains(row,'taxa negativa (r') ?? findKeyContains(row,'taxa neg r')),
    taxa_adm_bruta:    cleanNum(findKeyContains(row,'taxa adm') ?? findKeyContains(row,'adm bruta')),
    competencia:       cleanMesRef(mesRef),
  };
}

function parseRowMeta(row) {
  // Aceita o modelo exportado: Produto ID, Nome da Empresa, ..., Resultado Meta, Mês Referencia
  const mesRef = findKeyContains(row,'mes') ?? findKeyContains(row,'referencia') ?? findKeyContains(row,'competencia');
  return {
    produto_id:    parseInt(findKey(row,'Produto ID') ?? findKey(row,'Produto Id')) || null,
    nome:          clean(findKey(row,'Nome da Empresa') ?? findKey(row,'Empresa')),
    valor_meta:    cleanNum(findKeyContains(row,'resultado meta') ?? findKeyContains(row,'meta')),
    competencia:   cleanMesRef(mesRef),
  };
}

function parseRowEmpresa(row) {
  // Igual à página /importar original
  function findKeyE(obj, target) {
    if (obj[target] !== undefined) return obj[target];
    const t = norm(target);
    for (const key of Object.keys(obj)) if (norm(key) === t) return obj[key];
    return undefined;
  }
  return {
    produto_id:             parseInt(findKeyE(row,'Produto Id')) || null,
    nome:                   clean(findKeyE(row,'Empresa')),
    cnpj:                   clean(findKeyE(row,'CNPJ')),
    data_cadastro:          cleanDate(findKeyE(row,'Data de Cadastro')),
    categoria:              clean(findKeyE(row,'Categoria')),
    produto_contratado:     clean(findKeyE(row,'Produto Contratado') ?? findKeyE(row,'Produto')),
    cidade:                 clean(findKeyE(row,'Cidade')),
    estado:                 clean(findKeyE(row,'Estado')),
    cartoes_emitidos:       parseInt(cleanNum(findKeyE(row,'Cartoes Emitidos') ?? findKeyE(row,'Cartões Emitidos'))) || 0,
    potencial_movimentacao: cleanNum(findKeyE(row,'Potencial de Movimentacao') ?? findKeyE(row,'Potencial de Movimentação')),
    tipo_boleto:            clean(findKeyE(row,'Tipo do Boleto')),
    confeccao_cartao:       cleanNum(findKeyE(row,'Confeccao de Cartao') ?? findKeyE(row,'Confecção de Cartão')),
    taxa_negativa:          cleanNum(findKeyE(row,'Taxa Negativa')),
    taxa_positiva:          cleanNum(findKeyE(row,'Taxa Positiva')),
    dias_prazo:             parseInt(cleanNum(findKeyE(row,'Dias de Prazo'))) || 0,
    _consultor_principal:   clean(findKeyE(row,'Consultor Principal')),
    _consultor_agregado:    clean(findKeyE(row,'Consultor Agregado')),
    _parceiro:              clean(findKeyE(row,'Parceiro Comercial')),
  };
}

// ── Componente Card de Importação ──────────────────────────────────────────
function ImportCard({ icon, titulo, desc, cor, colunas, onFile, status, preview, previewCols, onImport, onReset, result, file, resumo }) {
  const [isDrag, setIsDrag] = useState(false);
  const [xlsxLib, setXlsxLib] = useState(null);
  useEffect(() => { import('xlsx').then(m => setXlsxLib(m)); }, []);

  const handleFile = useCallback((f) => {
    if (!f || !xlsxLib) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb  = xlsxLib.read(e.target.result, { type:'array', cellDates:true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = xlsxLib.utils.sheet_to_json(ws, { raw:true, defval:'' });
        onFile(f, raw);
      } catch(err) { onFile(null, null, err.message); }
    };
    reader.readAsArrayBuffer(f);
  }, [xlsxLib, onFile]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setIsDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx')||f.name.endsWith('.xls'))) handleFile(f);
  }, [handleFile]);

  const inputId = `fi-${titulo.replace(/\s/g,'')}`;

  return (
    <div style={{ background:'#ffffff', border:`1px solid ${status==='done' ? cor+'66' : '#e4e7ef'}`, borderRadius:12, boxShadow:'0 1px 3px rgba(0,0,0,0.06)', overflow:'hidden', display:'flex', flexDirection:'column' }}>

      {/* Cabeçalho */}
      <div style={{ padding:'24px 24px 20px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:`${cor}18`, border:`1px solid ${cor}33`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem' }}>{icon}</div>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:'1rem', color:'#1a1d2e' }}>{titulo}</div>
            <div style={{ color:'#8b92b0', fontSize:'0.75rem', marginTop:2 }}>{desc}</div>
          </div>
        </div>
        {/* Colunas esperadas */}
        <div style={{ background:'#f9fafb', border:'1px solid #e4e7ef', borderRadius:8, padding:'10px 14px', fontSize:'0.7rem', color:'#8b92b0', lineHeight:1.7 }}>
          <span style={{ color: cor, fontWeight:600 }}>Colunas: </span>{colunas}
        </div>
      </div>

      {/* Corpo */}
      <div style={{ padding:24, flex:1 }}>

        {/* IDLE / PARSING — Dropzone */}
        {(status==='idle'||status==='parsing') && (
          <div
            style={{ border:`2px dashed ${isDrag ? cor : cor+'44'}`, borderRadius:14, padding:'32px 20px',
              textAlign:'center', cursor:'pointer', background: isDrag ? `${cor}08` : 'transparent', transition:'all 0.2s' }}
            onDragOver={(e)=>{e.preventDefault();setIsDrag(true);}}
            onDragLeave={()=>setIsDrag(false)}
            onDrop={onDrop}
            onClick={()=>document.getElementById(inputId).click()}>
            <div style={{ fontSize:'2rem', marginBottom:10 }}>📂</div>
            <div style={{ fontWeight:600, fontSize:'0.9rem', color:'#4a5068', marginBottom:4 }}>
              {status==='parsing' ? 'Lendo arquivo...' : (xlsxLib ? 'Arraste o Excel aqui ou clique' : 'Carregando...')}
            </div>
            <div style={{ color:'#8b92b0', fontSize:'0.75rem' }}>.xlsx ou .xls</div>
            <input id={inputId} type="file" accept=".xlsx,.xls" style={{display:'none'}}
              onChange={e=>handleFile(e.target.files[0])} />
          </div>
        )}

        {/* CONFIRMING */}
        {status==='confirming' && (
          <div>
            {/* Resumo */}
            {resumo && (
              <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
                {resumo.map(r => (
                  <div key={r.label} style={{ background:'#f5f6fa', borderRadius:8, padding:'10px 16px', border:'1px solid #e4e7ef', flex:1, minWidth:100 }}>
                    <div style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:1, marginBottom:4 }}>{r.label}</div>
                    <div style={{ fontWeight:700, color: r.cor||'#1a1d2e', fontSize:'1rem' }}>{r.val}</div>
                  </div>
                ))}
              </div>
            )}
            {/* Mini tabela preview */}
            <div style={{ overflowX:'auto', marginBottom:16, maxHeight:220, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.75rem' }}>
                <thead>
                  <tr>{previewCols.map(c=><th key={c} style={{ padding:'6px 10px', textAlign:'left', color:'#8b92b0', borderBottom:'1px solid #e4e7ef', background:'#f9fafb', whiteSpace:'nowrap', fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:0.5 }}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.slice(0,8).map((r,i)=>(
                    <tr key={i} style={i%2===0?{background:'#f9fafb'}:{}}>
                      {previewCols.map(c=><td key={c} style={{ padding:'7px 10px', borderBottom:'1px solid #f0f2f8', whiteSpace:'nowrap', color:'#4a5068' }}>{r[c]??''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize:'0.75rem', color:'#8b92b0', marginBottom:14 }}>
              📄 {file?.name} · {preview.length} registros
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={onReset} style={{ ...sBtnSec, flex:1 }}>Cancelar</button>
              <button onClick={onImport} style={{ ...sBtnPri(cor), flex:2 }}>Importar {preview.length} registros →</button>
            </div>
          </div>
        )}

        {/* IMPORTING */}
        {status==='importing' && (
          <div style={{ textAlign:'center', padding:'32px 0' }}>
            <div style={{ width:36, height:36, border:`3px solid ${cor}33`, borderTop:`3px solid ${cor}`, borderRadius:'50%', margin:'0 auto 16px', animation:'spin 0.8s linear infinite' }}></div>
            <div style={{ fontWeight:600, color:'#4a5068', fontSize:'0.9rem' }}>Importando...</div>
          </div>
        )}

        {/* DONE */}
        {status==='done' && (
          <div style={{ textAlign:'center', padding:'16px 0' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:10 }}>✅</div>
            <div style={{ fontWeight:700, fontSize:'1rem', color:'#1a1d2e', marginBottom:4 }}>Importação concluída!</div>
            <div style={{ color: cor, fontSize:'1.4rem', fontWeight:800, marginBottom:4 }}>{result?.inserted}</div>
            <div style={{ color:'#8b92b0', fontSize:'0.75rem', marginBottom: result?.errors?.length ? 12 : 20 }}>registros salvos</div>
            {result?.errors?.length > 0 && (
              <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:10, padding:12, marginBottom:16, color:'#f87171', fontSize:'0.75rem', textAlign:'left' }}>
                {result.errors.map((e,i)=><div key={i}>• {e}</div>)}
              </div>
            )}
            <button onClick={onReset} style={sBtnPri(cor)}>Importar outro arquivo</button>
          </div>
        )}

        {/* ERROR */}
        {status==='error' && (
          <div style={{ textAlign:'center', padding:'16px 0' }}>
            <div style={{ fontSize:'2rem', marginBottom:10 }}>❌</div>
            <div style={{ fontWeight:600, color:'#f87171', fontSize:'0.85rem', marginBottom:12 }}>
              {result?.errors?.[0] || 'Erro inesperado'}
            </div>
            <button onClick={onReset} style={sBtnSec}>Tentar novamente</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function Movimentacoes() {

  // ── Estado de cada card ───────────────────────────────────────────────────
  const mkState = () => ({ status:'idle', file:null, preview:[], result:{inserted:0,errors:[]}, resumo:[] });
  const [mov,    setMov]    = useState(mkState());
  const [meta,   setMeta]   = useState(mkState());
  const [emp,    setEmp]    = useState(mkState());
  const [xlsxLib, setXlsxLib] = useState(null);
  useEffect(()=>{ import('xlsx').then(m=>setXlsxLib(m)); },[]);

  function upd(setter, patch) { setter(s => ({ ...s, ...patch })); }

  // ── MOVIMENTAÇÃO REAL ─────────────────────────────────────────────────────
  function onFileMov(f, raw, err) {
    if (err || !raw) { upd(setMov, { status:'error', result:{inserted:0,errors:[err||'Erro ao ler']} }); return; }

    // Parse sem filtrar por competencia ainda
    const allParsed = raw.map(parseRowMovimentacao).filter(r => r.produto_id);

    // Detecta o mês da planilha — pega o primeiro que tiver competencia preenchida
    const mesDetectado = allParsed.find(r => r.competencia)?.competencia || null;

    // Propaga o mês para todas as linhas sem competencia
    const parsed = allParsed
      .map(r => ({ ...r, competencia: r.competencia || mesDetectado }))
      .filter(r => r.competencia); // descarta só se não houver mês em nenhuma linha

    const mesRef = parsed[0]?.competencia;
    const totalMov = parsed.reduce((s,r)=>s+r.movimentacao_real,0);
    upd(setMov, {
      status:'confirming', file:f, preview:parsed,
      resumo:[
        { label:'Registros', val: parsed.length },
        { label:'Competência', val: fmtMes(mesRef), cor:'#f0b429' },
        { label:'Total Movimentado', val: fmt(totalMov), cor:'#f0b429' },
      ]
    });
  }

  async function importarMov() {
    upd(setMov, { status:'importing' });
    const { preview } = mov;
    try {
      const ids = preview.map(r=>r.produto_id);
      const { data: empresas } = await supabase.from('empresas').select('id,produto_id').in('produto_id',ids);
      const empMap = Object.fromEntries((empresas||[]).map(e=>[e.produto_id,e.id]));

      const rows = preview.map(r => ({
        empresa_id:           empMap[r.produto_id] || null,
        competencia:          r.competencia,
        valor_movimentacao:   r.movimentacao_real,
        receita_bruta:        r.taxa_adm_bruta,
        custo_taxa_negativa:  r.taxa_neg_rs,
      })).filter(r => r.empresa_id);

      const errors = []; let inserted = 0;
      for (let i=0; i<rows.length; i+=50) {
        const batch = rows.slice(i,i+50);
        const { data, error } = await supabase.from('movimentacoes')
          .upsert(batch, { onConflict:'empresa_id,competencia' }).select('id');
        if (error) errors.push(`Lote ${Math.floor(i/50)+1}: ${error.message}`);
        else inserted += data?.length||0;
      }
      upd(setMov, { status:'done', result:{ inserted, errors } });
    } catch(err) { upd(setMov, { status:'error', result:{ inserted:0, errors:[err.message] } }); }
  }

  // ── META ──────────────────────────────────────────────────────────────────
  function onFileMeta(f, raw, err) {
    if (err || !raw) { upd(setMeta, { status:'error', result:{inserted:0,errors:[err||'Erro ao ler']} }); return; }

    const allParsed = raw.map(parseRowMeta).filter(r => r.produto_id);
    const mesDetectado = allParsed.find(r => r.competencia)?.competencia || null;
    const parsed = allParsed
      .map(r => ({ ...r, competencia: r.competencia || mesDetectado }))
      .filter(r => r.competencia && r.valor_meta > 0);
    const mesRef = parsed[0]?.competencia;
    const totalMeta = parsed.reduce((s,r)=>s+r.valor_meta,0);
    upd(setMeta, {
      status:'confirming', file:f, preview:parsed,
      resumo:[
        { label:'Empresas', val: parsed.length },
        { label:'Competência', val: fmtMes(mesRef), cor:'#34d399' },
        { label:'Total Meta', val: fmt(totalMeta), cor:'#34d399' },
      ]
    });
  }

  async function importarMeta() {
    upd(setMeta, { status:'importing' });
    const { preview } = meta;
    try {
      const ids = preview.map(r=>r.produto_id);
      const { data: empresas } = await supabase.from('empresas').select('id,produto_id,consultor_principal_id').in('produto_id',ids);
      const empMap = Object.fromEntries((empresas||[]).map(e=>[e.produto_id,e]));

      // 1. Upsert em metas_empresa (por empresa)
      const rowsEmp = preview.map(r => ({
        empresa_id:  empMap[r.produto_id]?.id || null,
        competencia: r.competencia,
        valor_meta:  r.valor_meta,
      })).filter(r => r.empresa_id);

      const errors = []; let inserted = 0;
      for (let i=0; i<rowsEmp.length; i+=50) {
        const batch = rowsEmp.slice(i,i+50);
        const { data, error } = await supabase.from('metas_empresa')
          .upsert(batch, { onConflict:'empresa_id,competencia' }).select('id');
        if (error) errors.push(`metas_empresa lote ${Math.floor(i/50)+1}: ${error.message}`);
        else inserted += data?.length||0;
      }

      // 2. Recalcular metas_vendedor agrupando por consultor
      const competencia = preview[0]?.competencia;
      if (competencia) {
        // Agrupa meta por consultor_principal
        const consultorMeta = {};
        preview.forEach(r => {
          const emp = empMap[r.produto_id];
          if (!emp?.consultor_principal_id) return;
          const cId = emp.consultor_principal_id;
          consultorMeta[cId] = (consultorMeta[cId]||0) + r.valor_meta;
        });

        const rowsConsultor = Object.entries(consultorMeta).map(([cId, val]) => ({
          consultor_id:    cId,
          competencia:     competencia,
          valor_beneficio: val,
        }));

        for (let i=0; i<rowsConsultor.length; i+=50) {
          const batch = rowsConsultor.slice(i,i+50);
          const { error } = await supabase.from('metas_vendedor')
            .upsert(batch, { onConflict:'consultor_id,competencia' });
          if (error) errors.push(`metas_vendedor lote ${Math.floor(i/50)+1}: ${error.message}`);
        }
      }

      upd(setMeta, { status:'done', result:{ inserted, errors } });
    } catch(err) { upd(setMeta, { status:'error', result:{ inserted:0, errors:[err.message] } }); }
  }

  // ── NOVAS EMPRESAS ────────────────────────────────────────────────────────
  async function resolveEmpresaIds(rows) {
    const { data: produtos }    = await supabase.from('produtos').select('id,nome,peso');
    const { data: consultores } = await supabase.from('consultores').select('id,nome');
    const { data: parceiros }   = await supabase.from('parceiros').select('id,nome');
    const prodMap    = Object.fromEntries((produtos||[]).map(p=>[norm(p.nome),{id:p.id,peso:p.peso}]));
    const consultMap = Object.fromEntries((consultores||[]).map(c=>[norm(c.nome),c.id]));
    const parcMap    = Object.fromEntries((parceiros||[]).map(p=>[norm(p.nome),p.id]));

    const novosC = new Set(); const novosP = new Set();
    rows.forEach(r => {
      if (r._consultor_principal && !consultMap[norm(r._consultor_principal)]) novosC.add(r._consultor_principal);
      if (r._consultor_agregado  && !consultMap[norm(r._consultor_agregado)])  novosC.add(r._consultor_agregado);
      if (r._parceiro            && !parcMap[norm(r._parceiro)])               novosP.add(r._parceiro);
    });
    if (novosC.size>0) { const {data:c}=await supabase.from('consultores').insert([...novosC].map(nome=>({nome,tipo:'interno'}))).select('id,nome'); (c||[]).forEach(x=>{consultMap[norm(x.nome)]=x.id;}); }
    if (novosP.size>0) { const {data:p}=await supabase.from('parceiros').insert([...novosP].map(nome=>({nome}))).select('id,nome'); (p||[]).forEach(x=>{parcMap[norm(x.nome)]=x.id;}); }

    return rows.map(r => {
      const prod = prodMap[norm(r.produto_contratado||'')];
      const { _consultor_principal, _consultor_agregado, _parceiro, ...rest } = r;
      return { ...rest, produto_id_ref:prod?.id||null, peso_categoria:prod?.peso??1.0,
        consultor_principal_id: _consultor_principal ? consultMap[norm(_consultor_principal)]||null : null,
        consultor_agregado_id:  _consultor_agregado  ? consultMap[norm(_consultor_agregado)]||null  : null,
        parceiro_id:            _parceiro            ? parcMap[norm(_parceiro)]||null               : null,
      };
    });
  }

  function onFileEmp(f, raw, err) {
    if (err || !raw) { upd(setEmp, { status:'error', result:{inserted:0,errors:[err||'Erro ao ler']} }); return; }
    const parsed = raw.map(parseRowEmpresa).filter(r => r.nome && r.produto_id);
    upd(setEmp, {
      status:'confirming', file:f, preview:parsed,
      resumo:[
        { label:'Empresas', val: parsed.length },
        { label:'Com Consultor', val: parsed.filter(r=>r._consultor_principal).length, cor:'#a78bfa' },
        { label:'Com Parceiro',  val: parsed.filter(r=>r._parceiro).length, cor:'#60a5fa' },
      ]
    });
  }

  async function importarEmp() {
    upd(setEmp, { status:'importing' });
    try {
      const rows = await resolveEmpresaIds(emp.preview);
      const errors = []; let inserted = 0;
      for (let i=0; i<rows.length; i+=50) {
        const { data, error } = await supabase.from('empresas')
          .upsert(rows.slice(i,i+50), { onConflict:'produto_id' }).select('id');
        if (error) errors.push(`Lote ${Math.floor(i/50)+1}: ${error.message}`);
        else inserted += data?.length||0;
      }
      upd(setEmp, { status:'done', result:{ inserted, errors } });
    } catch(err) { upd(setEmp, { status:'error', result:{ inserted:0, errors:[err.message] } }); }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth:1200, margin:'0 auto', padding:'40px 24px',
      fontFamily:"'DM Sans',sans-serif", color:'#1a1d2e', background:'#f5f6fa', minHeight:'100vh' }}>

      <div style={{ marginBottom:40 }}>
        <div style={{ color:'#f0b429', fontFamily:"'Syne',sans-serif", fontWeight:800,
          fontSize:'0.75rem', letterSpacing:3, textTransform:'uppercase', marginBottom:14 }}>♠ Vegas Card</div>
        <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:'1.6rem', fontWeight:700, margin:'0 0 8px', color:'#1a1d2e' }}>Importações</h1>
        <p style={{ color:'#8b92b0', fontSize:'0.875rem', margin:0 }}>
          Importe movimentação real, metas e novas empresas — tudo em um lugar
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:20 }}>

        {/* CARD 1 — Movimentação Real */}
        <ImportCard
          icon="💳" titulo="Movimentação Real" cor="#f0b429"
          desc="Importe o fechamento mensal com movimentação e taxas por empresa"
          colunas="Produto ID · Nome da Empresa · Consultor Principal · Movimentação Real · Taxa Adm Bruta · Taxa Negativa (%) · Taxa Negativa (R$) · Mês Referencia"
          status={mov.status} file={mov.file} preview={mov.preview} result={mov.result} resumo={mov.resumo}
          previewCols={['produto_id','nome','competencia','movimentacao_real','taxa_adm_bruta','taxa_neg_rs']}
          onFile={onFileMov} onImport={importarMov} onReset={()=>setMov(mkState())}
        />

        {/* CARD 2 — Meta */}
        <ImportCard
          icon="🎯" titulo="Meta do Mês" cor="#34d399"
          desc="Importe as metas por empresa — salva por empresa e agrega por consultor automaticamente"
          colunas="Produto ID · Nome da Empresa · Consultor Principal · Resultado Meta · Mês Referencia"
          status={meta.status} file={meta.file} preview={meta.preview} result={meta.result} resumo={meta.resumo}
          previewCols={['produto_id','nome','competencia','valor_meta']}
          onFile={onFileMeta} onImport={importarMeta} onReset={()=>setMeta(mkState())}
        />

        {/* CARD 3 — Novas Empresas */}
        <ImportCard
          icon="🏢" titulo="Novas Empresas" cor="#a78bfa"
          desc="Importe ou atualize empresas a partir do Excel exportado do sistema"
          colunas="Produto Id · Empresa · CNPJ · Categoria · Produto Contratado · Cidade · Estado · Potencial · Consultor Principal · Parceiro Comercial"
          status={emp.status} file={emp.file} preview={emp.preview} result={emp.result} resumo={emp.resumo}
          previewCols={['produto_id','nome','categoria','produto_contratado','_consultor_principal']}
          onFile={onFileEmp} onImport={importarEmp} onReset={()=>setEmp(mkState())}
        />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const sBtnPri = (cor) => ({ background:cor, color: cor==='#f0b429'?'#000':'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontWeight:700, cursor:'pointer', fontSize:'0.85rem', fontFamily:'inherit', width:'100%' });
const sBtnSec = { background:'#f5f6fa', color:'#4a5068', border:'1px solid #e4e7ef', borderRadius:10, padding:'10px 20px', fontWeight:600, cursor:'pointer', fontSize:'0.85rem', fontFamily:'inherit', width:'100%' };
