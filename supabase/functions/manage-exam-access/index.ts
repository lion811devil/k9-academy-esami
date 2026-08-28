// K9 Academy Esami — Release 1.83.2 — codice corso univoco automatico + composizione casuale
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

async function credentialHash(username: string, password: string): Promise<string> {
  return sha256Hex(`${normalizeUsername(username)}\n${password}`);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function isCommonUsernameDuplicate(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  if (String(e.code || "") !== "23505") return false;
  const text = [e.message, e.details, e.hint, e.constraint]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();
  return text.includes("exam_sessions_common_username_key") || text.includes("common_username");
}

async function insertSessionWithUniqueCode(
  admin: ReturnType<typeof createClient>,
  values: Record<string, unknown>,
  requestedCode: string,
) {
  const baseCode = normalizeUsername(requestedCode);
  if (baseCode.length < 4) throw new Error("Codice corso non valido.");

  // Il codice leggibile resta disciplina-data; in caso di più corsi nello stesso giorno
  // vengono usati automaticamente -02, -03, ... senza rimuovere il vincolo UNIQUE.
  for (let sequence = 1; sequence <= 999; sequence += 1) {
    const candidateCode = sequence === 1
      ? baseCode
      : `${baseCode}-${String(sequence).padStart(2, "0")}`;

    const { data, error } = await admin
      .from("exam_sessions")
      .insert({ ...values, common_username: candidateCode })
      .select("*")
      .single();

    if (!error && data) return data;
    if (isCommonUsernameDuplicate(error)) continue;
    throw error || new Error("Creazione corso non riuscita.");
  }

  throw new Error("Impossibile generare un codice corso univoco. Contatta l'amministratore.");
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

      // Nuovo flusso 1.77: credenziali personali del Corsista, riutilizzabili nei corsi successivi.
      const { data: personalCredential } = await admin
        .from("student_credentials")
        .select("student_id,login_email,active")
        .eq("credential_hash", hash)
        .eq("active", true)
        .ilike("username", username)
        .maybeSingle();

      if (personalCredential?.student_id && personalCredential?.login_email) {
        const { data: activeProfile } = await admin
          .from("profiles")
          .select("id,archived_at")
          .eq("id", personalCredential.student_id)
          .is("archived_at", null)
          .maybeSingle();
        if (activeProfile?.id) {
          const { data: openAssignment } = await admin
            .from("exam_assignments")
            .select("id")
            .eq("student_id", personalCredential.student_id)
            .in("status", ["assigned", "in_progress"])
            .limit(1)
            .maybeSingle();
          if (openAssignment?.id) return json({ login_email: personalCredential.login_email });
        }
      }

      // Compatibilità con le credenziali di sessione create dalle release precedenti.
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

      if (error || !data?.login_email) return json({ error: "Credenziali non valide." }, 401);
      return json({ login_email: data.login_email });
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
      create_session: "sessions_manage",
      create_course_with_students: "sessions_manage",
      delete_session: "sessions_manage",
      create_candidate: "candidates_create",
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

      const { data: existingCredential } = await admin.from("student_credentials").select("student_id").ilike("username", candidateCode).maybeSingle();
      if (existingCredential?.student_id) throw new Error("Username Corsista già utilizzato. Generane un altro.");
      const { data: existingFiscal } = await admin.from("profiles").select("id").eq("role", "student").eq("fiscal_code", fiscalCode).is("archived_at", null).maybeSingle();
      if (existingFiscal?.id) throw new Error("Esiste già un Corsista attivo con questo codice fiscale.");

      const authUserId = crypto.randomUUID();
      const loginEmail = `${authUserId}@candidate.k9academy.local`;
      const hash = await credentialHash(candidateCode, password);
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        id: authUserId, email: loginEmail, password, email_confirm: true,
        user_metadata: { full_name: fullName, candidate_code: candidateCode },
      });
      if (createError || !createdUser.user) throw createError || new Error("Creazione Corsista non riuscita.");
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

      const { data: openAssignments, error: openError } = await admin.from("exam_assignments").select("student_id").in("student_id", studentIds).in("status", ["assigned","in_progress"]);
      if (openError) throw openError;
      if ((openAssignments || []).length) throw new Error("Uno o più Corsisti selezionati hanno già un esame aperto. Concludilo o annullalo prima di preparare un nuovo corso.");

      const { data: profiles, error: profilesError } = await admin.from("profiles").select("id,full_name,archived_at").in("id", studentIds).eq("role", "student");
      if (profilesError) throw profilesError;
      if ((profiles || []).length !== studentIds.length || (profiles || []).some((x: any) => x.archived_at)) throw new Error("Uno o più Corsisti non sono disponibili.");
      const { data: credentials, error: credentialError } = await admin.from("student_credentials").select("student_id,username,login_email,active").in("student_id", studentIds);
      if (credentialError) throw credentialError;
      if ((credentials || []).length !== studentIds.length || (credentials || []).some((x: any) => !x.active)) throw new Error("Uno o più Corsisti provengono dal vecchio sistema e non hanno ancora credenziali personali 1.77. Ricreali o aggiorna le loro credenziali prima di inserirli nel nuovo corso.");

      const session = await insertSessionWithUniqueCode(admin, {
        title, discipline, question_count: questionCount,
        duration_minutes: durationMinutes, pass_percentage: passPercentage,
        notes: body.notes || null, created_by: authData.user.id,
      }, username);
      const createdAssignmentIds: string[] = [];
      try {
        const profileMap = new Map((profiles || []).map((x: any) => [x.id, x]));
        const credentialMap = new Map((credentials || []).map((x: any) => [x.student_id, x]));
        for (const studentId of studentIds) {
          const student: any = profileMap.get(studentId);
          const credential: any = credentialMap.get(studentId);
          const { error: candidateError } = await admin.from("session_candidates").insert({
            session_id: session.id, auth_user_id: studentId, full_name: student.full_name || "Corsista",
            candidate_code: credential.username, login_email: credential.login_email, credential_hash: null, active: true,
          });
          if (candidateError) throw new Error(`Collegamento Corsista al corso non riuscito: ${errorMessage(candidateError)}`);
          const { data: assignment, error: assignmentError } = await admin.from("exam_assignments").insert({
            student_id: studentId, session_id: session.id, discipline, question_count: questionCount,
            duration_minutes: durationMinutes, pass_percentage: passPercentage, notes: body.notes || null,
            assigned_by: authData.user.id, status: "assigned",
          }).select("id").single();
          if (assignmentError || !assignment) throw new Error(`Assegnazione prova non riuscita: ${errorMessage(assignmentError)}`);
          createdAssignmentIds.push(assignment.id);
          // Release 1.83: la prova viene composta al momento della creazione del corso.
          // La RPC privilegia domande mai usate per questo Corsista e diversifica anche i Corsisti dello stesso corso.
          const { error: prepareError } = await admin.rpc("prepare_exam_questions", { p_assignment_id: assignment.id });
          if (prepareError) throw new Error(`Composizione casuale prova non riuscita: ${prepareError.message}`);
        }
        return json({ session, assigned_count: studentIds.length });
      } catch (error) {
        if (createdAssignmentIds.length) await admin.from("exam_assignments").delete().in("id", createdAssignmentIds);
        await admin.from("exam_sessions").delete().eq("id", session.id);
        throw error;
      }
    }

    if (action === "create_session") {
      const username = normalizeUsername(String(body.common_username || ""));
      if (username.length < 4) throw new Error("Username della sessione non valido.");

      const data = await insertSessionWithUniqueCode(admin, {
        title: String(body.title || "").trim(),
        discipline: body.discipline,
        question_count: Number(body.question_count),
        duration_minutes: Number(body.duration_minutes),
        pass_percentage: Number(body.pass_percentage),
        notes: body.notes || null,
        created_by: authData.user.id,
      }, username);

      return json({ session: data });
    }

    if (action === "create_candidate") {
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();
      const candidateCode = String(body.candidate_code || "").trim();
      const fiscalCode = String(body.fiscal_code || "").trim().toUpperCase();
      const birthDate = String(body.birth_date || "").trim();
      const birthPlace = String(body.birth_place || "").trim();

      if (password.length < 8) throw new Error("La password deve contenere almeno 8 caratteri.");
      if (!fullName) throw new Error("Inserisci nome e cognome.");
      if (!candidateCode) throw new Error("Inserisci il codice candidato.");
      if (!/^[A-Z0-9]{16}$/.test(fiscalCode)) throw new Error("Codice fiscale non valido: servono 16 caratteri alfanumerici.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error("Inserisci una data di nascita valida.");
      if (!birthPlace) throw new Error("Inserisci il luogo di nascita.");

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
          fiscal_code: fiscalCode,
          birth_date: birthDate,
          birth_place: birthPlace,
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


    if (action === "create_staff_user") {
      const fullName = String(body.full_name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const requestedRole = String(body.role || "");
      const allowedForStaff = ["student", "teacher", "examiner", "vice_admin"];
      const allowedForSuper = [...allowedForStaff, "super_admin"];
      const allowed = isSuper ? allowedForSuper : allowedForStaff;
      if (!fullName) throw new Error("Inserisci nome e cognome.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email non valida.");
      if (password.length < 8) throw new Error("La password deve contenere almeno 8 caratteri.");
      if (!allowed.includes(requestedRole)) throw new Error(isSuper ? "Ruolo non valido." : "Solo il Super Amministratore può creare Super Amministratori.");
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
      const { data: session, error: sessionError } = await admin.from("exam_sessions").select("id,title").eq("id", sessionId).maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) throw new Error("Sessione non trovata.");

      const { data: linkedAssignments, error: assignmentReadError } = await admin.from("exam_assignments").select("id,status").eq("session_id", sessionId);
      if (assignmentReadError) throw assignmentReadError;
      const historical = (linkedAssignments || []).some((x: any) => ["in_progress","submitted","expired"].includes(x.status));
      if (historical) throw new Error("Il corso contiene esami iniziati o conclusi. Per conservarne lo storico usa Archivia invece di Elimina.");
      const ids = (linkedAssignments || []).map((x: any) => x.id);
      if (ids.length) { const { error: deleteAssignmentsError } = await admin.from("exam_assignments").delete().in("id", ids); if (deleteAssignmentsError) throw deleteAssignmentsError; }
      const { error: deleteSessionError } = await admin.from("exam_sessions").delete().eq("id", sessionId);
      if (deleteSessionError) throw deleteSessionError;
      return json({ success: true, deleted_session_id: sessionId, preserved_students: true });
    }


    if (action === "delete_exam") {
      if (!isSuper) return json({ error: "Solo il Super Amministratore può eliminare un esame." }, 403);

      const assignmentId = String(body.assignment_id || "");
      const confirmProgressed = body.confirm_progressed === true;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assignmentId)) {
        throw new Error("Esame non valido.");
      }

      const { data: assignment, error: assignmentError } = await admin
        .from("exam_assignments")
        .select("id,status,started_at,submitted_at,student_id,discipline")
        .eq("id", assignmentId)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) throw new Error("Esame non trovato.");

      const { data: student } = await admin
        .from("profiles")
        .select("full_name,email")
        .eq("id", assignment.student_id)
        .maybeSingle();

      const relatedChecks = [
        ["exam_questions", "assignment_id", "domande/risposte della prova"],
        ["practical_evaluations", "assignment_id", "valutazione pratica"],
        ["answer_correction_reports", "assignment_id", "segnalazioni/correzioni"],
        ["exam_documents", "assignment_id", "documenti d'esame"],
      ] as const;
      const details: string[] = [];
      let relatedCount = 0;
      for (const [table, column, label] of relatedChecks) {
        const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, assignmentId);
        if (error && !String(error.message || "").includes("does not exist")) throw error;
        if ((count || 0) > 0) {
          relatedCount += count || 0;
          details.push(`${label}: ${count}`);
        }
      }

      const progressed = assignment.status !== "assigned" || !!assignment.started_at || !!assignment.submitted_at || relatedCount > 0;
      if (progressed && !confirmProgressed) {
        return json({
          success: false,
          requires_confirmation: true,
          assignment_id: assignmentId,
          student_name: student?.full_name || student?.email || "Corsista",
          discipline: assignment.discipline,
          status: assignment.status,
          details,
        });
      }

      const { error: deleteExamError } = await admin
        .from("exam_assignments")
        .delete()
        .eq("id", assignmentId);
      if (deleteExamError) throw deleteExamError;

      return json({
        success: true,
        deleted: true,
        deleted_assignment_id: assignmentId,
        progressed,
        deleted_related_records: relatedCount,
      });
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

      if (action === "archive_user") {
        if (target.archived_at) return json({ success: true, already_archived: true });
        const archivedAt = new Date().toISOString();
        const { error: updateError } = await admin.from("profiles").update({ archived_at: archivedAt, updated_at: archivedAt }).eq("id", userId);
        if (updateError) throw updateError;
        if (target.role === "student") {
          const { error: candidateError } = await admin.from("session_candidates").update({ active: false }).eq("auth_user_id", userId);
          if (candidateError) throw candidateError;
        }
        const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
        if (authUpdateError) {
          await admin.from("profiles").update({ archived_at: null, updated_at: new Date().toISOString() }).eq("id", userId);
          throw authUpdateError;
        }
        return json({ success: true, archived: true });
      }

      if (action === "restore_user") {
        const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
        if (authUpdateError) throw authUpdateError;
        const now = new Date().toISOString();
        const { error: updateError } = await admin.from("profiles").update({ archived_at: null, updated_at: now }).eq("id", userId);
        if (updateError) throw updateError;
        if (target.role === "student") {
          const { error: candidateError } = await admin.from("session_candidates").update({ active: true }).eq("auth_user_id", userId);
          if (candidateError) throw candidateError;
        }
        return json({ success: true, restored: true });
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

      // Corsisti 1.77: aggiorna la credenziale personale riutilizzabile nei corsi successivi.
      const { data: personalCredential } = await admin
        .from("student_credentials")
        .select("student_id,username")
        .eq("student_id", userId)
        .maybeSingle();

      if (personalCredential?.username) {
        const hash = await credentialHash(personalCredential.username, password);
        const { error: personalUpdateError } = await admin
          .from("student_credentials")
          .update({ credential_hash: hash, updated_at: new Date().toISOString() })
          .eq("student_id", userId);
        if (personalUpdateError) throw personalUpdateError;
      } else {
        // Compatibilità Corsisti legacy: può esistere una sola credenziale di sessione utilizzabile.
        const { data: candidates } = await admin
          .from("session_candidates")
          .select("id, session_id, credential_hash, exam_sessions(common_username)")
          .eq("auth_user_id", userId)
          .not("credential_hash", "is", null)
          .limit(1);
        const candidate = candidates?.[0];
        if (candidate) {
          const relation = candidate.exam_sessions as { common_username?: string } | null;
          const legacyUsername = relation?.common_username || "";
          if (!legacyUsername) throw new Error("Sessione del Corsista non disponibile.");
          const legacyHash = await credentialHash(legacyUsername, password);
          const { error: candidateUpdateError } = await admin.from("session_candidates").update({ credential_hash: legacyHash }).eq("id", candidate.id);
          if (candidateUpdateError) throw candidateUpdateError;
        }
      }

      return json({ success: true });
    }

    throw new Error("Azione non valida.");
  } catch (error) {
    const message = errorMessage(error);
    console.error("manage-exam-access:", message, error);
    return json({ error: message }, 400);
  }
});
