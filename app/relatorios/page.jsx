'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt  = (v) => Number(v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = String(d).substring(0,7).split('-');
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${meses[parseInt(m)-1]}/${y}`;
};

// ── Gera e baixa Excel ──────────────────────────────────────────────────────
async function baixarExcel(nomeArquivo, colunas, linhas) {
  const XLSX = await import('xlsx');
  const ws   = XLSX.utils.aoa_to_sheet([colunas, ...linhas]);

  // Largura automática das colunas
  ws['!cols'] = colunas.map((_, ci) => ({
    wch: Math.max(colunas[ci].length, ...linhas.map(r => String(r[ci]||'').length)) + 2
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  XLSX.writeFile(wb, nomeArquivo);
}

// ── Modal de seleção ────────────────────────────────────────────────────────
function Modal({ titulo, children, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200,
      display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
      onClick={onClose}>
      <div style={{ background:'#111420', border:'1px solid rgba(255,255,255,0.1)',
        borderRadius:20, padding:32, width:'100%', maxWidth:480, position:'relative' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <div style={{ fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:'1.1rem' }}>{titulo}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#6b7280',
            fontSize:'1.3rem', cursor:'pointer', lineHeight:1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Card de Relatório ───────────────────────────────────────────────────────
function RelCard({ icon, titulo, desc, cor, onClick, loading }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? `linear-gradient(135deg, ${cor}14, ${cor}06)` : '#111420',
        border: `1px solid ${hover ? cor+'55' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 20,
        padding: '32px 28px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s',
        transform: hover ? 'translateY(-3px)' : 'none',
        fontFamily: "'DM Sans', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}>
      {/* Glow de fundo */}
      <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100,
        borderRadius:'50%', background: cor, opacity: hover ? 0.06 : 0.03,
        transition:'opacity 0.2s', filter:'blur(30px)' }} />

      {/* Ícone */}
      <div style={{ width:52, height:52, borderRadius:14, background:`${cor}18`,
        border:`1px solid ${cor}33`, display:'flex', alignItems:'center',
        justifyContent:'center', fontSize:'1.5rem', marginBottom:18 }}>
        {icon}
      </div>

      <div style={{ fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:'1.05rem',
        color:'#e8eaf0', marginBottom:8 }}>{titulo}</div>

      <div style={{ color:'#4b5563', fontSize:'0.82rem', lineHeight:1.6 }}>{desc}</div>

      {/* Botão de ação */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:20 }}>
        <div style={{ background: cor, borderRadius:8, padding:'6px 16px',
          fontSize:'0.78rem', fontWeight:700, color: cor === '#f0b429' ? '#000' : '#fff',
          opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Gerando...' : 'Gerar Relatório'}
        </div>
        {!loading && <span style={{ color: cor, fontSize:'0.9rem' }}>→</span>}
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function Relatorios() {
  const [consultores,     setConsultores]     = useState([]);
  const [mesesDisponiveis,setMesesDisponiveis] = useState([]);
  const [loading,         setLoading]         = useState({});
  const [modal,           setModal]           = useState(null); // 'carteira' | 'evolucao' | 'movimentacao' | 'meta'

  // Seleções nos modais
  const [consultorSel, setConsultorSel] = useState('');
  const [mesSel,       setMesSel]       = useState('');

  useEffect(() => {
    // Carrega consultores e meses disponíveis
    Promise.all([
      supabase.from('consultores').select('id, nome, gestor').eq('ativo', true).order('nome'),
      supabase.from('movimentacoes').select('competencia').order('competencia', { ascending:false }),
    ]).then(([{ data: conss }, { data: movs }]) => {
      setConsultores(conss || []);
      const meses = [...new Set((movs||[]).map(m => m.competencia?.substring(0,7)).filter(Boolean))];
      setMesesDisponiveis(meses);
      if (meses.length > 0) setMesSel(meses[0]);
    });
  }, []);

  function setLoad(key, val) { setLoading(l => ({ ...l, [key]: val })); }

  // ── 1. Modelo de Importação — Movimentação Real ───────────────────────────
  async function gerarModeloMovimentacao() {
    setLoad('mov', true);
    try {
      const { data: empresas } = await supabase
        .from('empresas')
        .select('produto_id, nome, cnpj, categoria, produto_contratado, peso_categoria, consultor_principal:consultor_principal_id(nome)')
        .eq('ativo', true)
        .order('nome');

      const colunas = ['Produto ID','Nome da Empresa','CNPJ','Consultor Principal','Categoria','Produto Contratado','Peso (%)','Movimentação Real','Taxa Negativa (%)','Taxa Negativa (R$)','Taxa Adm Bruta','Mês Referencia'];
      const linhas  = (empresas||[]).map(e => [
        e.produto_id,
        e.nome,
        e.cnpj || '',
        e.consultor_principal?.nome || '',
        e.categoria || '',
        e.produto_contratado || '',
        `${Math.round((e.peso_categoria||1)*100)}%`,
        0, 0, 0, 0,
        '', // Mês Ref — preenchido manualmente
      ]);
      await baixarExcel(`modelo_movimentacao_${new Date().toISOString().substring(0,10)}.xlsx`, colunas, linhas);
    } catch(err) { alert('Erro: ' + err.message); }
    setLoad('mov', false);
  }

  // ── 2. Modelo de Importação — Meta ────────────────────────────────────────
  async function gerarModeloMeta() {
    setLoad('meta', true);
    try {
      const { data: empresas } = await supabase
        .from('empresas')
        .select('produto_id, nome, cnpj, categoria, produto_contratado, peso_categoria, consultor_principal:consultor_principal_id(nome)')
        .eq('ativo', true)
        .order('nome');

      const colunas = ['Produto ID','Nome da Empresa','CNPJ','Consultor Principal','Categoria','Produto Contratado','Peso (%)','Resultado Meta','Mês Referencia'];
      const linhas  = (empresas||[]).map(e => [
        e.produto_id,
        e.nome,
        e.cnpj || '',
        e.consultor_principal?.nome || '',
        e.categoria || '',
        e.produto_contratado || '',
        `${Math.round((e.peso_categoria||1)*100)}%`,
        0,
        '', // Mês Ref — preenchido manualmente
      ]);
      await baixarExcel(`modelo_meta_${new Date().toISOString().substring(0,10)}.xlsx`, colunas, linhas);
    } catch(err) { alert('Erro: ' + err.message); }
    setLoad('meta', false);
  }

  // ── 3. Carteira por Vendedor ──────────────────────────────────────────────
  async function gerarCarteira() {
    if (!consultorSel) return;
    setLoad('carteira', true);
    try {
      const consultor = consultores.find(c => c.id === consultorSel);
      const { data: empresas } = await supabase
        .from('empresas')
        .select(`
          produto_id, nome, cnpj, categoria, produto_contratado, peso_categoria,
          potencial_movimentacao, cartoes_emitidos, taxa_positiva, taxa_negativa,
          cidade, estado, data_cadastro,
          consultor_principal:consultor_principal_id(nome),
          consultor_agregado:consultor_agregado_id(nome),
          parceiro:parceiro_id(nome)
        `)
        .or(`consultor_principal_id.eq.${consultorSel},consultor_agregado_id.eq.${consultorSel}`)
        .eq('ativo', true)
        .order('nome');

      const colunas = [
        'Produto ID','Nome da Empresa','CNPJ','Consultor Principal','Consultor Agregado',
        'Parceiro','Categoria','Produto Contratado','Peso (%)','Potencial Bruto',
        'Resultado Esperado','Cartões Emitidos','Taxa Positiva (%)','Taxa Negativa (%)',
        'Cidade','UF','Data Cadastro'
      ];
      const linhas = (empresas||[]).map(e => [
        e.produto_id,
        e.nome,
        e.cnpj || '',
        e.consultor_principal?.nome || '',
        e.consultor_agregado?.nome  || '',
        e.parceiro?.nome            || '',
        e.categoria || '',
        e.produto_contratado || '',
        `${Math.round((e.peso_categoria||1)*100)}%`,
        e.potencial_movimentacao || 0,
        (e.potencial_movimentacao||0) * (e.peso_categoria||1),
        e.cartoes_emitidos || 0,
        `${((e.taxa_positiva||0)*100).toFixed(2)}%`,
        `${((e.taxa_negativa||0)*100).toFixed(2)}%`,
        e.cidade || '',
        e.estado || '',
        e.data_cadastro || '',
      ]);

      const nome = consultor?.nome?.replace(/\s+/g,'_') || 'consultor';
      await baixarExcel(`carteira_${nome}_${new Date().toISOString().substring(0,10)}.xlsx`, colunas, linhas);
      setModal(null);
    } catch(err) { alert('Erro: ' + err.message); }
    setLoad('carteira', false);
  }

  // ── 4. Evolução Mensal ────────────────────────────────────────────────────
  async function gerarEvolucao() {
    if (!mesSel) return;
    setLoad('evolucao', true);
    try {
      // Busca movimentações do mês
      const { data: movs } = await supabase
        .from('movimentacoes')
        .select('empresa_id, valor_movimentacao, receita_bruta, custo_taxa_negativa')
        .gte('competencia', mesSel + '-01')
        .lte('competencia', mesSel + '-28');

      const movMap = {};
      (movs||[]).forEach(m => { movMap[m.empresa_id] = m; });

      // Busca empresas com taxa_negativa
      const { data: empresas } = await supabase
        .from('empresas')
        .select(`
          id, produto_id, nome, cnpj, categoria, produto_contratado, peso_categoria,
          potencial_movimentacao, taxa_negativa,
          consultor_principal:consultor_principal_id(id, nome),
          parceiro:parceiro_id(nome)
        `)
        .eq('ativo', true)
        .order('nome');

      // Busca metas do mês por consultor
      const { data: metas } = await supabase
        .from('metas_vendedor')
        .select('consultor_id, valor_beneficio, valor_total')
        .gte('competencia', mesSel + '-01')
        .lte('competencia', mesSel + '-28');

      // Mapa: consultor_id → meta total do consultor no mês
      const metaConsultorMap = {};
      (metas||[]).forEach(m => {
        metaConsultorMap[m.consultor_id] = m.valor_total || m.valor_beneficio || 0;
      });

      // Filtra apenas empresas com movimentação no mês
      const empresasComMov = (empresas||[]).filter(e => movMap[e.id]);

      // Potencial total por consultor (apenas empresas com mov no mês)
      // Usado para calcular o peso proporcional de cada empresa na meta do consultor
      const potencialTotalConsultor = {};
      empresasComMov.forEach(e => {
        const cId = e.consultor_principal?.id;
        if (!cId) return;
        potencialTotalConsultor[cId] = (potencialTotalConsultor[cId] || 0) + (e.potencial_movimentacao || 0);
      });

      const colunas = [
        'Produto ID','Nome da Empresa','CNPJ','Consultor Principal','Parceiro',
        'Categoria','Produto Contratado','Taxa Negativa (%)','Peso (%)',
        'Potencial Bruto','Resultado Esperado','Movimentação Real',
        'Receita Bruta','Custo Taxa Neg.','Spread Líquido',
        'Meta Proporcional','Mês Ref.'
      ];

      const linhas = empresasComMov.map(e => {
        const mov        = movMap[e.id];
        const potencial  = e.potencial_movimentacao || 0;
        const resultado  = potencial * (e.peso_categoria || 1);
        const movReal    = mov.valor_movimentacao  || 0;
        const receita    = mov.receita_bruta       || 0;
        const custo      = mov.custo_taxa_negativa || 0;
        const cId        = e.consultor_principal?.id;
        const metaTotal  = metaConsultorMap[cId]          || 0;
        const potTotalC  = potencialTotalConsultor[cId]   || 1;
        // Meta proporcional = meta do consultor × (potencial desta empresa / potencial total do consultor)
        const metaProp   = potTotalC > 0 ? metaTotal * (potencial / potTotalC) : 0;
        const txNeg      = `${((e.taxa_negativa||0)*100).toFixed(2)}%`;
        return [
          e.produto_id,
          e.nome,
          e.cnpj || '',
          e.consultor_principal?.nome || '',
          e.parceiro?.nome            || '',
          e.categoria || '',
          e.produto_contratado || '',
          txNeg,
          `${Math.round((e.peso_categoria||1)*100)}%`,
          potencial,
          resultado,
          movReal,
          receita,
          custo,
          receita - custo,
          Math.round(metaProp * 100) / 100,
          fmtMes(mesSel),
        ];
      });

      await baixarExcel(`evolucao_${mesSel}_${new Date().toISOString().substring(0,10)}.xlsx`, colunas, linhas);
      setModal(null);
    } catch(err) { alert('Erro: ' + err.message); }
    setLoad('evolucao', false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const cards = [
    {
      key:   'mov',
      icon:  '📥',
      titulo:'Modelo — Importação Movimentação',
      desc:  'Baixa planilha Excel pronta com todas as empresas ativas, consultor e colunas para preencher a movimentação real do mês.',
      cor:   '#f0b429',
      acao:  gerarModeloMovimentacao,
    },
    {
      key:   'meta',
      icon:  '🎯',
      titulo:'Modelo — Importação Meta',
      desc:  'Baixa planilha Excel com todas as empresas ativas e colunas para preencher o resultado meta de cada empresa.',
      cor:   '#34d399',
      acao:  gerarModeloMeta,
    },
    {
      key:   'carteira',
      icon:  '👤',
      titulo:'Carteira por Vendedor',
      desc:  'Selecione um consultor e exporte todas as suas empresas com potencial, resultado esperado, taxas e dados cadastrais.',
      cor:   '#a78bfa',
      acao:  () => setModal('carteira'),
    },
    {
      key:   'evolucao',
      icon:  '📈',
      titulo:'Evolução Mensal',
      desc:  'Selecione o mês e exporte: potencial bruto, resultado esperado, movimentação real, receita, custo, spread e meta por empresa.',
      cor:   '#60a5fa',
      acao:  () => setModal('evolucao'),
    },
  ];

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'40px 24px',
      fontFamily:"'DM Sans', sans-serif", color:'#e8eaf0', background:'#0a0c10', minHeight:'100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ color:'#f0b429', fontFamily:"'Syne', sans-serif", fontWeight:800,
          fontSize:'0.75rem', letterSpacing:3, textTransform:'uppercase', marginBottom:14 }}>
          ♠ Vegas Card
        </div>
        <h1 style={{ fontFamily:"'Syne', sans-serif", fontSize:'2rem', fontWeight:700,
          margin:'0 0 10px', color:'#e8eaf0' }}>
          Relatórios
        </h1>
        <p style={{ color:'#4b5563', fontSize:'0.9rem', margin:0 }}>
          Gere e exporte relatórios padronizados para conferência e importação
        </p>
      </div>

      {/* Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 }}>
        {cards.map(c => (
          <RelCard
            key={c.key}
            icon={c.icon}
            titulo={c.titulo}
            desc={c.desc}
            cor={c.cor}
            loading={loading[c.key]}
            onClick={c.acao}
          />
        ))}
      </div>

      {/* ── MODAL: Carteira por Vendedor ─────────────────────────────────── */}
      {modal === 'carteira' && (
        <Modal titulo="👤 Carteira por Vendedor" onClose={() => setModal(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={sLabel}>Consultor</label>
              <select style={sSelect} value={consultorSel} onChange={e => setConsultorSel(e.target.value)}>
                <option value="">— Selecione —</option>
                {consultores.map(c => (
                  <option key={c.id} value={c.id}>{c.nome} {c.gestor ? `(${c.gestor})` : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ background:'rgba(167,139,250,0.06)', border:'1px solid rgba(167,139,250,0.15)',
              borderRadius:10, padding:'12px 16px', fontSize:'0.8rem', color:'#9ca3af' }}>
              📋 Colunas: Produto ID · Empresa · CNPJ · <strong style={{color:'#a78bfa'}}>Consultor Principal</strong> · Cons. Agregado · Parceiro · Categoria · Produto · Peso · Potencial · Resultado · Cartões · Taxas · Cidade · UF · Data Cadastro
            </div>
            <button
              onClick={gerarCarteira}
              disabled={!consultorSel || loading.carteira}
              style={{ background: consultorSel ? '#a78bfa' : 'rgba(255,255,255,0.06)',
                color: consultorSel ? '#fff' : '#4b5563', border:'none', borderRadius:10,
                padding:'12px 24px', fontWeight:700, fontSize:'0.9rem', cursor: consultorSel ? 'pointer' : 'not-allowed',
                fontFamily:'inherit', transition:'all 0.2s' }}>
              {loading.carteira ? '⏳ Gerando...' : '⬇️ Baixar Excel'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Evolução Mensal ────────────────────────────────────────── */}
      {modal === 'evolucao' && (
        <Modal titulo="📈 Evolução Mensal" onClose={() => setModal(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={sLabel}>Mês de Referência</label>
              <select style={sSelect} value={mesSel} onChange={e => setMesSel(e.target.value)}>
                <option value="">— Selecione —</option>
                {mesesDisponiveis.map(m => (
                  <option key={m} value={m}>{fmtMes(m)}</option>
                ))}
              </select>
            </div>
            <div style={{ background:'rgba(96,165,250,0.06)', border:'1px solid rgba(96,165,250,0.15)',
              borderRadius:10, padding:'12px 16px', fontSize:'0.8rem', color:'#9ca3af' }}>
              📋 Colunas: Produto ID · Empresa · CNPJ · <strong style={{color:'#60a5fa'}}>Consultor Principal</strong> · Parceiro · Categoria · Produto · Taxa Negativa · Peso · Potencial Bruto · Resultado Esperado · Movimentação Real · Receita Bruta · Custo Tax Neg · Spread Líquido · <strong style={{color:'#60a5fa'}}>Meta Proporcional</strong> · Mês Ref.
            </div>
            <button
              onClick={gerarEvolucao}
              disabled={!mesSel || loading.evolucao}
              style={{ background: mesSel ? '#60a5fa' : 'rgba(255,255,255,0.06)',
                color: mesSel ? '#fff' : '#4b5563', border:'none', borderRadius:10,
                padding:'12px 24px', fontWeight:700, fontSize:'0.9rem', cursor: mesSel ? 'pointer' : 'not-allowed',
                fontFamily:'inherit', transition:'all 0.2s' }}>
              {loading.evolucao ? '⏳ Gerando...' : '⬇️ Baixar Excel'}
            </button>
          </div>
        </Modal>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const sLabel  = { display:'block', color:'#6b7280', fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:1, marginBottom:8, fontWeight:600 };
const sSelect = { width:'100%', background:'#1a1f2e', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 14px', color:'#e8eaf0', fontSize:'0.9rem', fontFamily:"'DM Sans', sans-serif", cursor:'pointer' };
