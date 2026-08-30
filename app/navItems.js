// Lista de navegação compartilhada entre o Sidebar e o AppShell (redirect pós-login).
// Manter aqui a definição única para não duplicar entre os dois lugares.
export const nav = [
  { href: '/inicio',             icon: '◈',  label: 'Início',        pagina: 'inicio'             },
  { href: '/painel',             icon: '🎛️', label: 'Painel',        pagina: 'painel'             },
  { href: '/vendedor',           icon: '👤', label: 'Vendedor',      pagina: 'vendedor'           },
  { href: '/movimentacoes',      icon: '📥', label: 'Importações',   pagina: 'movimentacoes'      },
  { href: '/importar-base',      icon: '🗂️', label: 'Base Empresas', pagina: 'movimentacoes'      },
  // Importador novo de spread (um mês por arquivo, só linhas com valor).
  // Substitui o antigo /importar-spreads, mantido apenas por referência na home.
  { href: '/importar-spread',    icon: '💹', label: 'Importar Spread', pagina: 'importar-spread'   },
  { href: '/importar-agregados', icon: '📦', label: 'Importar Agregados', pagina: 'importar-agregados' },
  { href: '/gestao',             icon: '⚙️', label: 'Gestão',        pagina: 'gestao'             },
  { href: '/relatorios',         icon: '📋', label: 'Relatórios',    pagina: 'relatorios'         },
  { href: '/fechamento-meta',    icon: '🔒', label: 'Fechamento Meta', pagina: 'fechamento-meta'  },
  { href: '/dashboard-diretor',  icon: '📊', label: 'Dashboard Diretor', pagina: 'dashboard-diretor' },
  { href: '/cartoes-vegas',      icon: '🃏', label: 'Cartões Vegas',     pagina: 'cartoes-vegas'      },
  { href: '/rentabilidade-nova', icon: '📈', label: 'Rentabilidade',    pagina: 'rentabilidade-nova' },
  { href: '/agregados-resultado', icon: '📦', label: 'Produtos Agregados', pagina: 'agregados-resultado' },
  { href: '/relatorio-empresas', icon: '📑', label: 'Rel. Empresas', pagina: 'relatorio_empresas' },
  // Agregados migrados para projeto separado — itens ocultos do menu.
  // Rotas e arquivos preservados; reativar removendo o comentário.
  // { href: '/agregados',          icon: '💚', label: 'Produtos Agregados', pagina: 'agregados'      },
  // { href: '/agregados-cadastro', icon: '📝', label: 'Cadastro Agregados', pagina: 'agregados-cadastro' },
  { href: '/adm-comercial',      icon: '🏢', label: 'Adm Comercial', pagina: 'adm-comercial'      },
];

// Itens visíveis para um perfil — mesma regra usada pelo Sidebar
// (esconde /inicio para admin, /painel para não-admin) + podeVer().
export function navVisivel(profile, podeVer) {
  const perfisAdmin = ['diretoria', 'gestor_master'];
  const isAdmin = perfisAdmin.includes(profile?.perfil);
  return nav.filter(item => {
    if (item.href === '/inicio' && isAdmin)  return false;
    if (item.href === '/painel' && !isAdmin) return false;
    return podeVer(item.pagina);
  });
}

// Permissão EFETIVA por página, direto do mapa permissoes (não usa o podeVer,
// que trata 'inicio' como sempre-true e depende de estado assíncrono). 'inicio'
// segue acessível como home pessoal a quem está logado — igual ao podeVer.
function temPermissao(profile, permissoes, pagina) {
  if (profile?.perfil === 'gestor_master') return true;
  if (pagina === 'inicio') return true;
  return permissoes?.[pagina]?.pode_ver === true;
}

// Rotas visíveis a partir do mapa de permissões (para o redirect pós-login).
export function rotasVisiveis(profile, permissoes) {
  const perfisAdmin = ['diretoria', 'gestor_master'];
  const isAdmin = perfisAdmin.includes(profile?.perfil);
  return nav.filter(item => {
    if (item.href === '/inicio' && isAdmin)  return false;
    if (item.href === '/painel' && !isAdmin) return false;
    return temPermissao(profile, permissoes, item.pagina);
  });
}

// Primeira rota do menu com permissão efetiva, na ordem do menu; /sem-acesso se nenhuma.
export function primeiraRotaPermitida(profile, permissoes) {
  const visiveis = rotasVisiveis(profile, permissoes);
  return visiveis.length ? visiveis[0].href : '/sem-acesso';
}
