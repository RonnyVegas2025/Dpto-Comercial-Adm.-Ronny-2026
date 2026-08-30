'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Loader2, ArrowRight,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PRODUTOS = ['TotalPass','WellHub','Telemedicina','Vidalink'];

// Mapa de gestor: o sistema de agregados usa o nome civil; o Vegas Card usa o apelido.
// Chave normalizada (sem acento, minúscula). Fácil de estender.
const MAPA_GESTOR = { 'danilo aparecido damiao': 'Vago' };

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtInt = (v) => Number(v||0).toLocaleString('pt-BR');
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=String(d).split('-'); const ms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return `${ms[parseInt(m)-1]}/${y}`; };
const norm   = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

function cleanNum(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).replace(/R\$\s*/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function findCol(obj, targets) {
  for (const t of targets) {
    if (obj[t] !== undefined) return obj[t];
    const tn = norm(t);
    for (const k of Object.keys(obj)) if (norm(k) === tn) return obj[k];
  }
  return undefined;
}
function mapGestor(g) { return MAPA_GESTOR[norm(g)] || String(g||'').trim(); }

// Competência MM/AAAA (coluna) → YYYY-MM-01.
function parseCompetencia(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-01`;
  const s = String(v||'').trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);          if (m) return `${m[2]}-${String(m[1]).padStart(2,'0')}-01`;
  m = s.match(/^(\d{1,2})[\/\-](\d{2})$/);              if (m) return `20${m[2]}-${String(m[1]).padStart(2,'0')}-01`;
  m = s.match(/^(\d{4})[-\/](\d{1,2})/);                if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-01`;
  return null;
}
// Data (dd/mm/aaaa ou Date ou ISO) → YYYY-MM-DD.
function parseData(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  const s = String(v||'').trim(); if (!s) return null;
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) { let y=m[3]; if(y.length===2) y='20'+y; return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseAgregados(ws, xlsxLib, produto) {
  const rows = xlsxLib.utils.sheet_to_json(ws, { raw:true, defval:'' });
  let totalLinhas = 0, descartadas = 0;
  const registros = [];
  for (const row of rows) {
    const empresa = String(findCol(row, ['empresa','empresa_nome','Razão Social','razao_social']) || '').trim();
    const compRaw = findCol(row, ['competencia','competência','mes','mês']);
    const competencia = parseCompetencia(compRaw);
    if (!empresa || !competencia) continue;
    totalLinhas++;

    const receita   = cleanNum(findCol(row, ['receita']));
    const custo     = cleanNum(findCol(row, ['custo']));
    const resultado = receita - custo; // coluna gerada no banco = receita - custo
    if (!(resultado > 0)) { descartadas++; continue; }

    registros.push({
      produto,
      empresa_nome: empresa,
      cnpj:         String(findCol(row, ['cnpj']) || '').trim() || null,
      inicio:       parseData(findCol(row, ['inicio','início','data_inicio','data de início'])),
      modalidade:   'venda_nova',
      valor_titular: cleanNum(findCol(row, ['valor_por_titular','valor por titular','valor_titular'])),
      vendedor:     String(findCol(row, ['vendedor']) || '').trim() || null,
      equipe:       String(findCol(row, ['equipe']) || '').trim() || null,
      gestor:       mapGestor(findCol(row, ['gestor'])) || null,
      diretor:      String(findCol(row, ['diretor']) || '').trim() || null,
      competencia,
      vidas:        Math.round(cleanNum(findCol(row, ['vidas_custo','vidas','vidas custo']))),
      receita, custo, resultado,
    });
  }
  const competencias = [...new Set(registros.map(r => r.competencia))].sort();
  const totais = registros.reduce((a,r) => ({ receita:a.receita+r.receita, custo:a.custo+r.custo, resultado:a.resultado+r.resultado }), { receita:0, custo:0, resultado:0 });
  registros.sort((a,b) => b.resultado - a.resultado);
  return { totalLinhas, descartadas, registros, competencias, totais };
}

export default function ImportarAgregados() {
  const [xlsxLib, setXlsxLib]   = useState(null);
  const [produto, setProduto]   = useState('');
  const [file, setFile]         = useState(null);
  const [prev, setPrev]         = useState(null);
  const [status, setStatus]     = useState('idle');
  const [result, setResult]     = useState({ inserted:0, deleted:0, errors:[] });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m)); }, []);

  const handleFile = useCallback((f) => {
    if (!f || !xlsxLib || !produto) return;
    setFile(f); setStatus('parsing');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = xlsxLib.read(e.target.result, { type:'array', cellDates:true });
        const parsed = parseAgregados(wb.Sheets[wb.SheetNames[0]], xlsxLib, produto);
        if (!parsed.registros.length) {
          setStatus('error');
          setResult({ inserted:0, deleted:0, errors:['Nenhuma linha com resultado positivo encontrada. Verifique as colunas (empresa, competencia, receita, custo).'] });
          return;
        }
        // Quantas linhas já existem para (produto + competências do arquivo).
        let jaExistem = 0;
        try {
          const { count } = await supabase.from('agregados_resultado').select('id', { count:'exact', head:true })
            .eq('produto', produto).in('competencia', parsed.competencias);
          jaExistem = count || 0;
        } catch (_) {}
        setPrev({ ...parsed, jaExistem });
        setStatus('confirming');
      } catch (err) {
        setStatus('error');
        setResult({ inserted:0, deleted:0, errors:['Erro ao ler arquivo: ' + err.message] });
      }
    };
    reader.readAsArrayBuffer(f);
  }, [xlsxLib, produto]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) handleFile(f);
  }, [handleFile]);

  const handleImport = async () => {
    if (!prev) return;
    setStatus('importing');
    try {
      // Reimportação: apaga (produto + competências) antes de inserir.
      const { error: delErr } = await supabase.from('agregados_resultado').delete()
        .eq('produto', produto).in('competencia', prev.competencias);
      if (delErr) { setResult({ inserted:0, deleted:0, errors:['Erro ao limpar: ' + delErr.message] }); setStatus('error'); return; }

      const rows = prev.registros.map(r => ({
        produto: r.produto, empresa_nome: r.empresa_nome, cnpj: r.cnpj, inicio: r.inicio,
        modalidade: r.modalidade, valor_titular: r.valor_titular, vendedor: r.vendedor,
        equipe: r.equipe, gestor: r.gestor, diretor: r.diretor, competencia: r.competencia,
        vidas: r.vidas, receita: r.receita, custo: r.custo,
        // resultado é GENERATED ALWAYS no banco — não enviar.
      }));

      let inserted = 0; const errors = [];
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { data, error } = await supabase.from('agregados_resultado').insert(batch).select('id');
        if (error) errors.push(`Lote ${Math.floor(i/50)+1}: ${error.message}`);
        else inserted += data?.length || 0;
      }
      setResult({ inserted, deleted: prev.jaExistem, errors });
      setStatus('done');
    } catch (err) {
      setResult({ inserted:0, deleted:0, errors:[err.message] });
      setStatus('error');
    }
  };

  const reset = () => { setStatus('idle'); setPrev(null); setFile(null); setResult({ inserted:0, deleted:0, errors:[] }); };

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ height:3, background:'var(--vg-gradient)', margin:'-32px -24px 24px' }} />

      <div style={{ marginBottom:20 }}>
        <div style={{ ...CAPTION, marginBottom:6 }}>Vegas Card / Importações</div>
        <h1 style={{ fontFamily:OUTFIT, fontSize:24, lineHeight:'32px', fontWeight:600, color:'var(--vg-ink)', margin:0 }}>Importar Produtos Agregados</h1>
        <p style={{ color:'var(--vg-ink-secondary)', fontSize:14, lineHeight:'22px', margin:'6px 0 0' }}>Resultado das vendas novas (só o que dá lucro) — um produto por importação</p>
      </div>

      {/* Seleção de produto */}
      {(status === 'idle' || status === 'parsing') && (
        <>
          <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, marginBottom:8 }}>1. Escolha o produto</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:20 }}>
            {PRODUTOS.map(p => {
              const ativo = produto === p;
              return (
                <button key={p} onClick={()=>setProduto(p)} style={{
                  background: ativo ? 'var(--vg-brand-50)' : 'var(--vg-surface)',
                  border:`1px solid ${ativo ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`,
                  color: ativo ? 'var(--vg-brand-700)' : 'var(--vg-ink-secondary)',
                  borderRadius:'var(--vg-radius)', padding:'9px 18px', fontSize:14, fontWeight:600,
                  fontFamily:"'Inter', sans-serif", cursor:'pointer', outline:'none' }}>{p}</button>
              );
            })}
          </div>

          <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, marginBottom:8 }}>2. Envie a planilha</div>
          <div style={{ ...s.dropzone, ...(isDragging ? s.dropzoneOn : {}), opacity: produto ? 1 : 0.55, pointerEvents: produto ? 'auto' : 'none' }}
            onDragOver={(e)=>{ e.preventDefault(); setIsDragging(true); }}
            onDragLeave={()=>setIsDragging(false)}
            onDrop={onDrop}
            onClick={()=>produto && document.getElementById('fi-agr').click()}>
            {status === 'parsing'
              ? <Loader2 size={40} strokeWidth={1.75} color="var(--vg-brand-500)" style={{ animation:'spin 0.8s linear infinite' }} />
              : <UploadCloud size={40} strokeWidth={1.5} color="var(--vg-brand-500)" />}
            <div style={{ fontFamily:OUTFIT, fontSize:16, fontWeight:600, color:'var(--vg-ink)', marginTop:14 }}>
              {status === 'parsing' ? 'Lendo planilha…' : (produto ? `Arraste a planilha de ${produto} aqui` : 'Escolha um produto acima primeiro')}
            </div>
            <div style={{ ...CAPTION, marginTop:6 }}>.xlsx — competência na coluna (MM/AAAA)</div>
            <div style={{ ...CAPTION, marginTop:4 }}>Colunas: empresa · vendedor · equipe · gestor · diretor · competencia · vidas_custo · receita · custo · resultado</div>
            <input id="fi-agr" type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={(e)=>handleFile(e.target.files[0])} />
          </div>
        </>
      )}

      {status === 'confirming' && prev && (
        <div style={cardStyle}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <FileSpreadsheet size={20} strokeWidth={1.75} color="var(--vg-brand-500)" />
              <div>
                <div style={{ ...H_CARD }}>{file?.name}</div>
                <div style={CAPTION}>Produto: <strong style={{ color:'var(--vg-ink-secondary)' }}>{produto}</strong> · {prev.competencias.map(c=>fmtMes(c)).join(', ')}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button style={s.btnSec} onClick={reset}>Cancelar</button>
              <button style={s.btnPri} onClick={handleImport}>Importar {fmtInt(prev.registros.length)} contratos <ArrowRight size={15} strokeWidth={2} /></button>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px,1fr))', gap:14, marginBottom:20 }}>
            <Resumo label="Linhas no arquivo" valor={fmtInt(prev.totalLinhas)} />
            <Resumo label="Com resultado +" valor={fmtInt(prev.registros.length)} cor="var(--vg-success-fg)" />
            <Resumo label="Descartadas (≤ 0)" valor={fmtInt(prev.descartadas)} cor="var(--vg-muted)" />
            <Resumo label="Receita" valor={fmt(prev.totais.receita)} />
            <Resumo label="Resultado" valor={fmt(prev.totais.resultado)} cor="var(--vg-brand-700)" />
          </div>

          {prev.jaExistem > 0 && (
            <div style={s.avisoAmbar}>
              <AlertTriangle size={17} strokeWidth={2} color="var(--vg-warning-fg)" style={{ flexShrink:0, marginTop:1 }} />
              <span>Já existem <strong className="vg-num">{fmtInt(prev.jaExistem)}</strong> linhas de {produto} para esse(s) mês(es). Ao importar, serão <strong>apagadas e substituídas</strong>.</span>
            </div>
          )}

          <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, margin:'8px 0 8px' }}>15 maiores resultados</div>
          <div style={{ overflowX:'auto', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
              <thead>
                <tr>
                  <th style={s.th}>Empresa</th>
                  <th style={s.th}>Mês</th>
                  <th style={s.th}>Vendedor</th>
                  <th style={{ ...s.th, textAlign:'right' }}>Receita</th>
                  <th style={{ ...s.th, textAlign:'right' }}>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {prev.registros.slice(0,15).map((r,i) => (
                  <tr key={i} style={{ borderTop:'1px solid var(--vg-border)' }}>
                    <td style={{ ...s.td, fontWeight:500, color:'var(--vg-ink)' }}>{r.empresa_nome}</td>
                    <td style={{ ...s.td, color:'var(--vg-ink-secondary)' }}>{fmtMes(r.competencia)}</td>
                    <td style={{ ...s.td, color:'var(--vg-ink-secondary)' }}>{r.vendedor || '—'}</td>
                    <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{fmt(r.receita)}</td>
                    <td style={{ ...s.td, textAlign:'right', color:'var(--vg-success-fg)', fontWeight:600 }} className="vg-num">{fmt(r.resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {status === 'importing' && (
        <div style={{ ...cardStyle, textAlign:'center', padding:48 }}>
          <div style={s.spin} />
          <div style={{ ...H_CARD, marginBottom:6 }}>Importando {fmtInt(prev?.registros.length||0)} contratos…</div>
          <div style={CAPTION}>Apagando o período e gravando em lotes de 50</div>
        </div>
      )}

      {status === 'done' && (
        <div style={{ ...cardStyle, textAlign:'center' }}>
          <CheckCircle2 size={44} strokeWidth={1.5} color="var(--vg-success-fg)" style={{ margin:'0 auto 12px', display:'block' }} />
          <div style={{ ...H_CARD, fontSize:18 }}>{produto} importado com sucesso</div>
          <div style={{ display:'flex', justifyContent:'center', gap:40, margin:'20px 0', flexWrap:'wrap' }}>
            <div><div className="vg-num" style={{ fontFamily:OUTFIT, fontSize:28, fontWeight:600, color:'var(--vg-success-fg)' }}>{fmtInt(result.inserted)}</div><div style={LABEL}>contratos gravados</div></div>
            <div><div className="vg-num" style={{ fontFamily:OUTFIT, fontSize:28, fontWeight:600, color:'var(--vg-brand-700)' }}>{fmt(prev?.totais.resultado||0)}</div><div style={LABEL}>resultado total</div></div>
            {result.deleted > 0 && <div><div className="vg-num" style={{ fontFamily:OUTFIT, fontSize:28, fontWeight:600, color:'var(--vg-muted)' }}>{fmtInt(result.deleted)}</div><div style={LABEL}>substituídas</div></div>}
          </div>
          {result.errors.length > 0 && <div style={s.errBox}>{result.errors.map((e,i)=><div key={i}>• {e}</div>)}</div>}
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginTop:8 }}>
            <button style={s.btnPri} onClick={reset}>Importar outro</button>
            <a href="/agregados-resultado" style={{ ...s.btnSec, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>Ver Agregados <ArrowRight size={15} strokeWidth={2} /></a>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ ...cardStyle, textAlign:'center', borderColor:'var(--vg-danger-fg)' }}>
          <XCircle size={40} strokeWidth={1.5} color="var(--vg-danger-fg)" style={{ margin:'0 auto 12px', display:'block' }} />
          <div style={{ ...H_CARD, marginBottom:8 }}>Erro na importação</div>
          {result.errors.map((e,i)=><div key={i} style={{ color:'var(--vg-danger-fg)', fontSize:14 }}>{e}</div>)}
          <button style={{ ...s.btnSec, marginTop:20 }} onClick={reset}>Tentar novamente</button>
        </div>
      )}

      <div style={{ ...cardStyle, marginTop:24, background:'var(--vg-surface-muted)' }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <FileSpreadsheet {...ICON} /> Como funciona
        </div>
        <ul style={{ margin:0, paddingLeft:20, color:'var(--vg-ink-secondary)', fontSize:13, lineHeight:2 }}>
          <li>Escolha o produto (o arquivo não traz essa informação) e envie a planilha do mês.</li>
          <li>A <strong>competência vem na coluna</strong> (MM/AAAA); um arquivo pode ter vários meses.</li>
          <li>Só entram <strong>vendas novas com resultado positivo</strong> — o resto é descartado.</li>
          <li>Reimportar apaga e substitui as linhas de (produto + competência).</li>
          <li>O gestor "Danilo Aparecido Damião" é convertido para "Vago".</li>
        </ul>
      </div>
    </div>
  );
}

function Resumo({ label, valor, cor }) {
  return (
    <div style={{ background:'var(--vg-surface)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius)', padding:'14px 16px' }}>
      <div style={LABEL}>{label}</div>
      <div className="vg-num" style={{ fontFamily:OUTFIT, fontWeight:600, fontSize:20, color: cor || 'var(--vg-ink)', marginTop:2, overflowWrap:'anywhere' }}>{valor}</div>
    </div>
  );
}

const OUTFIT  = "'Outfit', sans-serif";
const CAPTION = { fontSize:12, lineHeight:'18px', color:'var(--vg-muted)' };
const LABEL   = { ...CAPTION, textTransform:'uppercase', letterSpacing:0.6 };
const H_CARD  = { fontFamily:OUTFIT, fontSize:16, lineHeight:'24px', fontWeight:600, color:'var(--vg-ink)' };
const ICON    = { size:16, strokeWidth:1.75, color:'var(--vg-ink-secondary)' };
const cardStyle = { background:'var(--vg-surface)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius-lg)', padding:24, boxShadow:'0 1px 2px rgba(28,31,59,0.04)' };

const s = {
  page:       { maxWidth:1100, margin:'0 auto', padding:'32px 24px', fontFamily:"'Inter', sans-serif", color:'var(--vg-ink)', background:'var(--vg-bg)', minHeight:'100vh', boxSizing:'border-box' },
  dropzone:   { border:'2px dashed var(--vg-border-field)', borderRadius:'var(--vg-radius-lg)', padding:'48px 32px', textAlign:'center', cursor:'pointer', background:'var(--vg-surface)', transition:'all 0.2s' },
  dropzoneOn: { borderColor:'var(--vg-brand-500)', background:'var(--vg-brand-50)' },
  btnPri:     { display:'inline-flex', alignItems:'center', gap:7, background:'var(--vg-brand-500)', color:'#fff', border:'none', borderRadius:'var(--vg-radius)', padding:'10px 20px', fontWeight:600, cursor:'pointer', fontSize:14, fontFamily:"'Inter', sans-serif" },
  btnSec:     { background:'var(--vg-surface)', color:'var(--vg-ink-secondary)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius)', padding:'10px 20px', fontWeight:600, cursor:'pointer', fontSize:14, fontFamily:"'Inter', sans-serif" },
  th:         { textAlign:'left', padding:'10px 16px', ...LABEL, background:'var(--vg-surface-muted)', whiteSpace:'nowrap' },
  td:         { padding:'11px 16px', verticalAlign:'middle', whiteSpace:'nowrap' },
  spin:       { width:36, height:36, border:'3px solid var(--vg-border)', borderTop:'3px solid var(--vg-brand-500)', borderRadius:'50%', margin:'0 auto 16px', animation:'spin 0.8s linear infinite' },
  avisoAmbar: { display:'flex', alignItems:'flex-start', gap:10, background:'var(--vg-warning-bg)', border:'1px solid var(--vg-warning-fg)', borderRadius:'var(--vg-radius)', padding:'12px 16px', marginBottom:14, color:'var(--vg-warning-fg)', fontSize:13, lineHeight:'20px' },
  errBox:     { background:'var(--vg-danger-bg)', border:'1px solid var(--vg-danger-fg)', borderRadius:'var(--vg-radius)', padding:14, margin:'12px 0', color:'var(--vg-danger-fg)', fontSize:13, textAlign:'left' },
};
