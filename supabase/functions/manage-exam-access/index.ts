// K9 Academy Esami — Release 2.2.2 — accesso personale e transazioni database
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const normalizeUsername = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint, e.code]
      .filter((v) => typeof v === "string" && String(v).trim())
      .map((v) => String(v).trim());
    if (parts.length) return [...new Set(parts)].join(" · ");
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Errore inatteso.";
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") return json({ error: "Metodo non consentito." }, 405);
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

      // Limite lato server per i tentativi sullo stesso username e origine.
      // Il valore conservato nel DB e solo un hash, non la password o l'IP.
      const sourceIp = (request.headers.get('cf-connecting-ip') || 'gateway-unavailable').trim().slice(0,100);
      const attemptKey = await sha256Hex(`k9-login\n${username}\n${sourceIp}`);
      const { data: allowed, error: limitError } = await admin.rpc('k9_candidate_login_gate', {
        p_key_hash: attemptKey, p_success: false,
      });
      if (limitError) return json({ error: 'Accesso temporaneamente non disponibile.' }, 503);
      if (allowed !== true) return json({ error: 'Troppi tentativi. Riprova tra 15 minuti.' }, 429);
      const userKey = await sha256Hex(`k9-login-account\n${username}`);
      const { data: userAllowed, error: userLimitError } = await admin.rpc('k9_candidate_login_gate', { p_key_hash: userKey, p_success: false });
      if (userLimitError) return json({ error: 'Accesso temporaneamente non disponibile.' }, 503);
      if (userAllowed !== true) return json({ error: 'Troppi tentativi. Riprova tra 15 minuti.' }, 429);
      const clearLoginAttempts = async () => {
        await admin.rpc('k9_candidate_login_gate', { p_key_hash: attemptKey, p_success: true });
        await admin.rpc('k9_candidate_login_gate', { p_key_hash: userKey, p_success: true });
      };

      // Le credenziali personali sono verificate esclusivamente tramite Supabase Auth.
      // Un hash casuale resta nel campo legacy per compatibilità dello schema, non contiene la password.
      const { data: personalCredential, error: personalError } = await admin
        .from("student_credentials")
        .select("student_id,login_email,active")
        .eq("username", username)
        .maybeSingle();
      if (personalError) return json({ error: "Accesso temporaneamente non disponibile." }, 503);
      if (personalCredential) {
        if (!personalCredential.active) return json({ error: "Credenziali non valide." }, 401);
        const { data: activeProfile } = await admin.from("profiles").select("id")
          .eq("id", personalCredential.student_id).eq("role", "student").is("archived_at", null).maybeSingle();
        if (!activeProfile?.id) return json({ error: "Credenziali non valide." }, 401);
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (!anonKey) return json({ error: "Accesso temporaneamente non disponibile." }, 503);
        const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
        const { data: authSession, error: loginError } = await authClient.auth.signInWithPassword({ email: personalCredential.login_email, password });
        if (loginError || !authSession.session || authSession.user?.id !== personalCredential.student_id) return json({ error: "Credenziali non valide." }, 401);
        await clearLoginAttempts();
        return json({ login_email: personalCredential.login_email, access_token: authSession.session.access_token, refresh_token: authSession.session.refresh_token });
      }
      return json({ error: "Credenziali non valide." }, 401);
    }

    // Le azioni amministrative richiedono un Super o Vice Amministratore; le password restano riservate al Super.
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
      .select("role, archived_at")
      .eq("id", authData.user.id)
      .single();

    if (profileError || callerProfile?.archived_at || !["super_admin", "vice_admin", "teacher", "examiner"].includes(callerProfile?.role || "")) {
      return json({ error: "Funzione riservata allo staff autorizzato." }, 403);
    }
    const isSuper = callerProfile?.role === "super_admin";

    let callerPermissions: Record<string, boolean> = {};
    if (!isSuper) {
      const { data: permissionRow, error: permissionError } = await admin
        .from("role_permissions")
        .select("permissions")
        .eq("role", callerProfile?.role || "")
        .maybeSingle();
      if (permissionError) return json({ error: "Impossibile verificare i permessi del ruolo." }, 403);
      callerPermissions = (permissionRow?.permissions || {}) as Record<string, boolean>;
    }
    const can = (permission: string): boolean => isSuper || callerPermissions[permission] === true;
    const actionPermission: Record<string, string> = {
      create_course_with_students: "sessions_manage",
      delete_session: "sessions_manage",
      create_student_account: "candidates_create",
      create_staff_user: "users_create",
    };
    const neededPermission = actionPermission[action];
    if (neededPermission && !can(neededPermission)) {
      return json({ error: "Funzione non abilitata per questo ruolo." }, 403);
    }

    if (action === "create_student_account") {
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();
      const candidateCode = normalizeUsername(String(body.candidate_code || ""));
      const fiscalCode = String(body.fiscal_code || "").trim().toUpperCase();
      const birthDate = String(body.birth_date || "").trim();
      const birthPlace = String(body.birth_place || "").trim();
      if (password.length < 8) throw new Error("La password deve contenere almeno 8 caratteri.");
      if (!fullName) throw new Error("Inserisci nome e cognome.");
      if (candidateCode.length < 4) throw new Error("Username Corsista non valido.");
      if (!/^[A-Z0-9]{16}$/.test(fiscalCode)) throw new Error("Codice fiscale non valido: servono 16 caratteri alfanumerici.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error("Inserisci una data di nascita valida.");
      if (!birthPlace) throw new Error("Inserisci il luogo di nascita.");

      const { data: existingCredential } = await admin.from("student_credentials").select("student_id").eq("username", candidateCode).maybeSingle();
      if (existingCredential?.student_id) throw new Error("Username Corsista già utilizzato. Generane un altro.");
      const { data: existingFiscal } = await admin.from("profiles").select("id").eq("role", "student").eq("fiscal_code", fiscalCode).is("archived_at", null).maybeSingle();
      if (existingFiscal?.id) throw new Error("Esiste già un Corsista attivo con questo codice fiscale.");

      const loginEmail = `${crypto.randomUUID()}@candidate.k9academy.local`;
      const hash = await sha256Hex(crypto.randomUUID());
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email: loginEmail, password, email_confirm: true,
        user_metadata: { full_name: fullName, candidate_code: candidateCode },
      });
      if (createError || !createdUser.user) throw createError || new Error("Creazione Corsista non riuscita.");
      const authUserId = createdUser.user.id;
      try {
        const { error: profileUpsertError } = await admin.from("profiles").upsert({
          id: authUserId, email: loginEmail, full_name: fullName, fiscal_code: fiscalCode,
          birth_date: birthDate, birth_place: birthPlace, role: "student", updated_at: new Date().toISOString(),
        });
        if (profileUpsertError) throw profileUpsertError;
        const { error: credentialError } = await admin.from("student_credentials").insert({
          student_id: authUserId, username: candidateCode, login_email: loginEmail, credential_hash: hash, active: true,
        });
        if (credentialError) throw credentialError;
        return json({ student: { id: authUserId, full_name: fullName }, username: candidateCode });
      } catch (error) {
        await admin.auth.admin.deleteUser(authUserId);
        throw error;
      }
    }

    if (action === "create_course_with_students") {
      if (!can("assign_exam")) return json({ error: "Il ruolo non può assegnare prove d’esame." }, 403);
      const username = normalizeUsername(String(body.common_username || ""));
      const title = String(body.title || "").trim();
      const discipline = String(body.discipline || "");
      const questionCount = Number(body.question_count);
      const durationMinutes = Number(body.duration_minutes);
      const passPercentage = Number(body.pass_percentage);
      const studentIds = Array.isArray(body.student_ids) ? [...new Set(body.student_ids.map((x: unknown) => String(x)))] : [];
      if (!title) throw new Error("Inserisci il nome del corso.");
      if (username.length < 4) throw new Error("Codice corso non valido.");
      if (!studentIds.length) throw new Error("Seleziona almeno un Corsista.");
      if (!['dogsitter','mantrailing','hrdd','detection'].includes(discipline)) throw new Error("Disciplina non valida.");
      if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 200) throw new Error("Numero domande non valido.");
      if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) throw new Error("Durata non valida.");
      if (!Number.isInteger(passPercentage) || passPercentage < 1 || passPercentage > 100) throw new Error("Soglia non valida.");

      const { error: expiryError } = await admin.rpc("k9_expire_due_exams");
      if (expiryError) throw expiryError;
      const { data: openAssignments, error: openError } = await admin.from("exam_assignments").select("student_id").in("student_id", studentIds).in("status", ["assigned","in_progress"]);
      if (openError) throw openError;
      if ((openAssignments || []).length) throw new Error("Uno o più Corsisti selezionati hanno già un esame aperto. Concludilo o annullalo prima di preparare un nuovo corso.");

      const { data: profiles, error: profilesError } = await admin.from("profiles").select("id,full_name,archived_at").in("id", studentIds).eq("role", "student");
      if (profilesError) throw profilesError;
      if ((profiles || []).length !== studentIds.length || (profiles || []).some((x: any) => x.archived_at)) throw new Error("Uno o più Corsisti non sono disponibili.");
      const { data: credentials, error: credentialError } = await admin.from("student_credentials").select("student_id,username,login_email,active").in("student_id", studentIds);
      if (credentialError) throw credentialError;
      if ((credentials || []).length !== studentIds.length || (credentials || []).some((x: any) => !x.active)) throw new Error("Uno o più Corsisti non hanno credenziali personali attive. Verifica la loro anagrafica e lo stato dell’account.");

      const { data: result, error: courseError } = await admin.rpc("k9_create_course_atomic", {
        p_actor: authData.user.id, p_title: title, p_code: username,
        p_discipline: discipline, p_count: questionCount, p_duration: durationMinutes,
        p_pass: passPercentage, p_notes: body.notes || null, p_students: studentIds,
      });
      if (courseError || !result) throw new Error(`Creazione corso non riuscita: ${errorMessage(courseError)}`);
      return json(result);
    }

    if (action === "create_staff_user") {
      const fullName = String(body.full_name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const requestedRole = String(body.role || "");
      const allowedForStaff = ["student", "teacher", "examiner"];
      const allowedForSuper = [...allowedForStaff, "super_admin"];
      const allowed = isSuper ? allowedForSuper : allowedForStaff;
      if (!fullName) throw new Error("Inserisci nome e cognome.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email non valida.");
      if (password.length < 8) throw new Error("La password deve contenere almeno 8 caratteri.");
      if (!allowed.includes(requestedRole)) throw new Error(isSuper ? "Ruolo non valido." : "Solo il Super Amministratore può creare Super o Vice Amministratori.");
      const { data: created, error: createError } = await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}});
      if (createError || !created.user) throw createError || new Error("Creazione account non riuscita.");
      const { error: profileUpsertError } = await admin.from("profiles").upsert({id:created.user.id,email,full_name:fullName,role:requestedRole,updated_at:new Date().toISOString()});
      if (profileUpsertError) { await admin.auth.admin.deleteUser(created.user.id); throw profileUpsertError; }
      return json({ success:true,user_id:created.user.id,role:requestedRole });
    }


    if (action === "delete_session") {
      const sessionId = String(body.session_id || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
        throw new Error("Sessione non valida.");
      }
      const {error:deleteError}=await admin.rpc("k9_delete_course",{p_actor:authData.user.id,p_session:sessionId});
      if(deleteError)throw deleteError;
      return json({ success: true, deleted_session_id: sessionId, preserved_students: true });
    }


    if (action === "delete_exam") {
      if (!isSuper) return json({ error: "Solo il Super Amministratore può eliminare un esame." }, 403);

      const assignmentId = String(body.assignment_id || "");
      const confirmProgressed = body.confirm_progressed === true;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assignmentId)) {
        throw new Error("Esame non valido.");
      }

      const {data:result,error:deleteError}=await admin.rpc("k9_delete_exam",{p_actor:authData.user.id,p_assignment:assignmentId,p_confirm:confirmProgressed});
      if(deleteError)throw deleteError;
      return json(result);
    }

    if (["archive_user", "restore_user", "delete_user"].includes(action)) {
      if (!isSuper) return json({ error: "Solo il Super Amministratore può archiviare, ripristinare o eliminare utenti." }, 403);
      const userId = String(body.user_id || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) throw new Error("Utente non valido.");
      if (userId === authData.user.id) throw new Error("Non puoi archiviare o eliminare il tuo account Super Amministratore.");

      const { data: target, error: targetError } = await admin.from("profiles").select("id,full_name,email,role,archived_at").eq("id", userId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) throw new Error("Utente non trovato.");
      if (target.role === "super_admin") throw new Error("Un Super Amministratore non può essere archiviato o eliminato da questa funzione.");

      // Supabase Auth e Postgres non condividono una transazione. Conserviamo gli stati
      // precedenti e tentiamo il ripristino in caso di errore in un passaggio intermedio.
      const { data: originalCandidates, error: candidateReadError } = target.role === "student"
        ? await admin.from("session_candidates").select("id,active").eq("auth_user_id", userId)
        : { data: [], error: null };
      if (candidateReadError) throw candidateReadError;
      const { data: originalCredential, error: credentialReadError } = target.role === "student"
        ? await admin.from("student_credentials").select("student_id,active").eq("student_id", userId).maybeSingle()
        : { data: null, error: null };
      if (credentialReadError) throw credentialReadError;
      const restoreDatabaseStates = async () => {
        const failures: string[] = [];
        const { error: profileRollbackError } = await admin.from("profiles")
          .update({ archived_at: target.archived_at, updated_at: new Date().toISOString() }).eq("id", userId);
        if (profileRollbackError) failures.push(`profilo: ${errorMessage(profileRollbackError)}`);
        for (const candidate of (originalCandidates || [])) {
          const { error } = await admin.from("session_candidates").update({ active: candidate.active }).eq("id", candidate.id);
          if (error) failures.push(`iscrizione ${candidate.id}: ${errorMessage(error)}`);
        }
        if (originalCredential) {
          const { error } = await admin.from("student_credentials")
            .update({ active: originalCredential.active }).eq("student_id", userId);
          if (error) failures.push(`credenziali: ${errorMessage(error)}`);
        }
        return failures;
      };

      if (action === "archive_user") {
        if (target.archived_at) return json({ success: true, already_archived: true });
        const archivedAt = new Date().toISOString();
        try {
          const { error: updateError } = await admin.from("profiles").update({ archived_at: archivedAt, updated_at: archivedAt }).eq("id", userId);
          if (updateError) throw updateError;
          if (target.role === "student") {
            const { error: candidateError } = await admin.from("session_candidates").update({ active: false }).eq("auth_user_id", userId);
            if (candidateError) throw candidateError;
            const { error: credentialError } = await admin.from("student_credentials").update({ active: false }).eq("student_id", userId);
            if (credentialError) throw credentialError;
          }
          const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
          if (authUpdateError) throw authUpdateError;
          return json({ success: true, archived: true });
        } catch (error) {
          const rollbackFailures = await restoreDatabaseStates();
          if (rollbackFailures.length) throw new Error(`Archiviazione non completata; ripristino parziale (${rollbackFailures.join('; ')}). Controlla l'account manualmente.`);
          throw error;
        }
      }

      if (action === "restore_user") {
        if (!target.archived_at) return json({success:true,already_active:true});
        const now = new Date().toISOString();
        try {
          const { error: updateError } = await admin.from("profiles").update({ archived_at: null, updated_at: now }).eq("id", userId);
          if (updateError) throw updateError;
          if (target.role === "student") {
            const { error: credentialError } = await admin.from("student_credentials").update({ active: true }).eq("student_id", userId);
            if (credentialError) throw credentialError;
            const { error: candidateError } = await admin.from("session_candidates").update({ active: true }).eq("auth_user_id", userId);
            if (candidateError) throw candidateError;
          }
          // Sblocchiamo Auth solo dopo il completamento degli aggiornamenti SQL.
          const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
          if (authUpdateError) throw authUpdateError;
          return json({ success: true, restored: true });
        } catch (error) {
          const rollbackFailures = await restoreDatabaseStates();
          if (rollbackFailures.length) throw new Error(`Ripristino non completato; rollback parziale (${rollbackFailures.join('; ')}). Controlla l'account manualmente.`);
          throw error;
        }
      }

      const dependencyChecks = [
        ["exam_assignments", "student_id", "esami come Corsista"],
        ["exam_assignments", "assigned_by", "esami assegnati"],
        ["exam_assignments", "evaluator_id", "esami valutati"],
        ["practical_evaluations", "evaluator_id", "valutazioni pratiche"],
        ["answer_correction_reports", "reported_by", "segnalazioni risposte"],
        ["answer_correction_reports", "reviewed_by", "revisioni segnalazioni"],
        ["exam_sessions", "created_by", "sessioni create"],
        ["exam_settings", "updated_by", "impostazioni esami"],
        ["app_settings", "updated_by", "impostazioni applicazione"],
        ["role_permissions", "updated_by", "permessi ruoli"],
        ["exam_documents", "student_id", "documenti come Corsista"],
        ["exam_documents", "issued_by", "documenti emessi"],
        ["exam_document_generations", "generated_by", "PDF tracciati"],
      ] as const;
      const dependencies: string[] = [];
      for (const [table, column, label] of dependencyChecks) {
        const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, userId);
        if (error) {
          const code = String((error as any).code || "");
          const message = String(error.message || "");
          const missingSchemaObject =
            code === "PGRST204" ||
            code === "PGRST205" ||
            /does not exist|could not find the table|could not find the .* column|schema cache/i.test(message);
          if (!missingSchemaObject) throw error;
        } else if ((count || 0) > 0) {
          dependencies.push(`${label}: ${count}`);
        }
      }
      if (dependencies.length) {
        return json({ error: `Eliminazione bloccata per proteggere lo storico (${dependencies.join(", ")}). Usa Archivia.` }, 409);
      }

      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;
      return json({ success: true, deleted: true });
    }

    if (action === "reset_user_password") {
      if (!isSuper) return json({ error: "Solo il Super Amministratore può cambiare le password." }, 403);
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

      return json({ success: true });
    }

    throw new Error("Azione non valida.");
  } catch (error) {
    const message = errorMessage(error);
    console.error("manage-exam-access:", message, error);
    return json({ error: message }, 400);
  }
});
