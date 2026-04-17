import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ error: 'Configure a variável SUPABASE_SERVICE_ROLE_KEY no Vercel → Settings → Environment Variables e faça um novo deploy.' }, { status: 500 });
    }

    // Cria cliente admin dentro da função para garantir que as env vars estão disponíveis
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { nome, email, senha, perfil, consultor_id, gestor_vinculado } = await request.json();

    // Validações básicas
    if (!nome?.trim())  return Response.json({ error: 'Informe o nome' }, { status: 400 });
    if (!email?.trim()) return Response.json({ error: 'Informe o e-mail' }, { status: 400 });
    if (!senha || senha.length < 6) return Response.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 });

    // Cria usuário no Supabase Auth com confirmação automática
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email:          email.trim(),
      password:       senha,
      email_confirm:  true,
      user_metadata:  { nome: nome.trim(), perfil: perfil || 'vendedor' },
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    // Cria/atualiza perfil na tabela user_profiles
    const { error: profErr } = await supabaseAdmin.from('user_profiles').upsert({
      id:               data.user.id,
      nome:             nome.trim(),
      email:            email.trim(),
      perfil:           perfil || 'vendedor',
      consultor_id:     consultor_id || null,
      gestor_vinculado: gestor_vinculado || null,
      ativo:            true,
    });

    if (profErr) {
      return Response.json({ error: 'Usuário criado mas erro no perfil: ' + profErr.message }, { status: 500 });
    }

    return Response.json({ success: true, id: data.user.id });

  } catch (err) {
    return Response.json({ error: 'Erro interno: ' + err.message }, { status: 500 });
  }
}
