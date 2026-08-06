import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const normalizeUsername = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function credentialHash(username: string, password: string): Promise<string> {
  return sha256Hex(`${normalizeUsername(username)}\n${password}`);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Configurazione server incompleta.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await request.json();
    const action = String(body?.action || "");

    // Accesso Corsista: endpoint pubblico, risposta generica in caso di errore.
    if (action === "candidate_login") {
      const username = normalizeUsername(String(body.common_username || ""));
      const password = String(body.password || "");

      if (username.length < 4 || password.length < 6) {
        return json({ error: "Credenziali non valide." }, 401);
      }

      const hash = await credentialHash(username, password);

      const { data, error } = await admin
        .from("session_candidates")
        .select(`
          login_email,
          active,
          exam_sessions!inner(common_username, active)
        `)
        .eq("credential_hash", hash)
        .eq("active", true)
        .eq("exam_sessions.active", true)
        .ilike("exam_sessions.common_username", username)
        .maybeSingle();

      if (error || !data?.login_email) {
        return json({ error: "Credenziali non valide." }, 401);
      }

      return json({ login_email: data.login_email });
    }

    // Tutte le azioni seguenti richiedono un Super Amministratore autenticato.
    const authHeader = request.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");

    if (!accessToken) {
      return json({ error: "Accesso amministrativo richiesto." }, 401);
    }

    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return json({ error: "Sessione amministrativa non valida." }, 401);
    }

    const { data: callerProfile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    if (profileError || callerProfile?.role !== "super_admin") {
      return json({ error: "Funzione riservata al Super Amministratore." }, 403);
    }

    if (action === "create_session") {
      const username = normalizeUsername(String(body.common_username || ""));
      if (username.length < 4) throw new Error("Username della sessione non valido.");

      const { data, error } = await admin
        .from("exam_sessions")
        .insert({
          title: String(body.title || "").trim(),
          common_username: username,
          discipline: body.discipline,
          question_count: Number(body.question_count),
          duration_minutes: Number(body.duration_minutes),
          pass_percentage: Number(body.pass_percentage),
          notes: body.notes || null,
          created_by: authData.user.id,
        })
        .select("*")
        .single();

      if (error) throw error;
      return json({ session: data });
    }

    if (action === "create_candidate") {
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();
      const candidateCode = String(body.candidate_code || "").trim();

      if (password.length < 8) throw new Error("La password deve contenere almeno 8 caratteri.");
      if (!fullName) throw new Error("Inserisci nome e cognome.");
      if (!candidateCode) throw new Error("Inserisci il codice candidato.");

      const { data: session, error: sessionError } = await admin
        .from("exam_sessions")
        .select("*")
        .eq("id", body.session_id)
        .eq("active", true)
        .single();

      if (sessionError || !session) throw new Error("Sessione non disponibile.");

      const authUserId = crypto.randomUUID();
      const loginEmail = `${authUserId}@candidate.k9academy.local`;
      const hash = await credentialHash(session.common_username, password);

      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        id: authUserId,
        email: loginEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          candidate_code: candidateCode,
        },
      });

      if (createError || !createdUser.user) throw createError || new Error("Creazione utente non riuscita.");

      const userId = createdUser.user.id;

      try {
        const { error: profileUpsertError } = await admin.from("profiles").upsert({
          id: userId,
          email: loginEmail,
          full_name: fullName,
          role: "student",
          updated_at: new Date().toISOString(),
        });
        if (profileUpsertError) throw profileUpsertError;

        const { data: candidate, error: candidateError } = await admin
          .from("session_candidates")
          .insert({
            session_id: session.id,
            auth_user_id: userId,
            full_name: fullName,
            candidate_code: candidateCode,
            login_email: loginEmail,
            credential_hash: hash,
          })
          .select("*")
          .single();
        if (candidateError) throw candidateError;

        const { error: assignmentError } = await admin.from("exam_assignments").insert({
          student_id: userId,
          session_id: session.id,
          discipline: session.discipline,
          question_count: session.question_count,
          duration_minutes: session.duration_minutes,
          pass_percentage: session.pass_percentage,
          notes: session.notes,
          assigned_by: authData.user.id,
          status: "assigned",
        });
        if (assignmentError) throw assignmentError;

        return json({
          common_username: session.common_username,
          candidate,
        });
      } catch (error) {
        await admin.auth.admin.deleteUser(userId);
        throw error;
      }
    }

    if (action === "reset_user_password") {
      const userId = String(body.user_id || "");
      const password = String(body.password || "");

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
        throw new Error("Utente non valido.");
      }
      if (password.length < 8) {
        throw new Error("La password deve contenere almeno 8 caratteri.");
      }

      const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
      if (passwordError) throw passwordError;

      // Se l'account è un Corsista, aggiorna anche la credenziale di accesso
      // basata su username comune della sessione + nuova password.
      const { data: candidate } = await admin
        .from("session_candidates")
        .select("id, session_id, exam_sessions(common_username)")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (candidate) {
        const relation = candidate.exam_sessions as { common_username?: string } | null;
        const username = relation?.common_username || "";
        if (!username) throw new Error("Sessione del Corsista non disponibile.");

        const hash = await credentialHash(username, password);
        const { error: candidateUpdateError } = await admin
          .from("session_candidates")
          .update({ credential_hash: hash })
          .eq("id", candidate.id);

        if (candidateUpdateError) throw candidateUpdateError;
      }

      return json({ success: true });
    }

    throw new Error("Azione non valida.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso.";
    return json({ error: message }, 400);
  }
});
