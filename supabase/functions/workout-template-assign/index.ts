// supabase/functions/workout-template-assign/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr",
  "https://ctgym.cloudtec.gr",
]);

function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED.has(origin) ? origin : "";
  const reqHdrs = req.headers.get("access-control-request-headers") ?? "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      reqHdrs || "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(body: BodyInit | null, init: ResponseInit, req: Request) {
  const headers = new Headers({ ...(init.headers || {}), ...buildCors(req) });
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  return new Response(body, { ...init, headers });
}

async function assertTenantActive(admin: any, tenantId: string) {
  const { data, error } = await admin
    .from("tenant_subscription_status")
    .select("is_active, status, current_period_end, grace_until")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data?.is_active) {
    const err: any = new Error("SUBSCRIPTION_INACTIVE");
    err.details = {
      status: data?.status ?? null,
      current_period_end: data?.current_period_end ?? null,
      grace_until: data?.grace_until ?? null,
    };
    throw err;
  }
}

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getAuthContext(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const supa = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await supa.auth.getUser();

  if (userErr || !user) return { error: "unauthorized" as const };

  return { supa, user };
}

async function sendExpoPush(params: {
  admin: any;
  tenant_id: string;
  user_id: string; // here this should be auth/profile user id
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const { admin, tenant_id, user_id, title, body, data } = params;

  const { data: tokens, error } = await admin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("tenant_id", tenant_id)
    .eq("user_id", user_id)
    .eq("is_active", true);

  if (error) {
    return {
      ok: false,
      sent: 0,
      error: "token_query_failed",
      details: error.message,
    };
  }

  const expoTokens = (tokens ?? [])
    .map((t: any) => t.expo_push_token as string)
    .filter((t: string) => typeof t === "string" && t.length > 0);

  if (expoTokens.length === 0) {
    return { ok: true, sent: 0, message: "no_tokens_found" };
  }

  const messages = expoTokens.map((token: string) => ({
    to: token,
    sound: "default",
    title,
    body,
    data: data ?? {},
  }));

  const expoUrl = "https://exp.host/--/api/v2/push/send";
  const chunkSize = 100;

  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    const res = await fetch(expoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(chunk),
    });

    const json = await res.json();
    console.log("Expo push response chunk:", json);
  }

  return { ok: true, sent: expoTokens.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);

  if (req.method !== "POST") {
    return withCors(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405 },
      req,
    );
  }

  const auth = await getAuthContext(req);
  if ("error" in auth) {
    return withCors(
      JSON.stringify({ error: auth.error }),
      { status: 401 },
      req,
    );
  }

  const { supa, user } = auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400 },
      req,
    );
  }

  const tenant_id = String(body?.tenant_id ?? "").trim();
  const template_id = String(body?.template_id ?? "").trim();
  const member_id = String(body?.member_id ?? "").trim(); // members.id
  const coach_id_raw = String(body?.coach_id ?? "").trim() || null;
  const adminMessage =
    typeof body?.message === "string" ? body.message.trim() : null;

  if (!tenant_id) {
    return withCors(
      JSON.stringify({ error: "tenant_required" }),
      { status: 400 },
      req,
    );
  }

  const { data: callerTenantUser, error: callerTenantUserErr } = await supa
    .from("tenant_users")
    .select("tenant_id, user_id, role")
    .eq("tenant_id", tenant_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (callerTenantUserErr) {
    return withCors(
      JSON.stringify({ error: callerTenantUserErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!callerTenantUser) {
    return withCors(
      JSON.stringify({ error: "tenant_access_denied" }),
      { status: 403 },
      req,
    );
  }

  const callerRole = String(callerTenantUser.role ?? "").toLowerCase();
  const isAdmin =
    callerRole === "admin" ||
    callerRole === "owner" ||
    user.app_metadata?.role === "admin";

  if (!isAdmin) {
    return withCors(
      JSON.stringify({ error: "forbidden" }),
      { status: 403 },
      req,
    );
  }

  if (!template_id) {
    return withCors(
      JSON.stringify({ error: "template_required" }),
      { status: 400 },
      req,
    );
  }

  if (!member_id) {
    return withCors(
      JSON.stringify({ error: "member_required" }),
      { status: 400 },
      req,
    );
  }

  const adminClient = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  try {
    await assertTenantActive(adminClient, tenant_id);
  } catch (e: any) {
    return withCors(
      JSON.stringify({
        error: e?.message ?? "SUBSCRIPTION_INACTIVE",
        details: e?.details ?? null,
      }),
      { status: 402 },
      req,
    );
  }

  // 1) template exists and belongs to tenant
  const { data: tpl, error: tErr } = await adminClient
    .from("workout_templates")
    .select("id, tenant_id, coach_id, name")
    .eq("id", template_id)
    .maybeSingle();

  if (tErr) {
    return withCors(
      JSON.stringify({ error: tErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!tpl) {
    return withCors(
      JSON.stringify({ error: "template_not_found" }),
      { status: 404 },
      req,
    );
  }

  if (String((tpl as any).tenant_id) !== tenant_id) {
    return withCors(
      JSON.stringify({ error: "cross_tenant_forbidden" }),
      { status: 403 },
      req,
    );
  }

  // 2) member exists in this tenant
  const { data: mem, error: mErr } = await adminClient
    .from("members")
    .select("id, tenant_id, user_id, role")
    .eq("id", member_id)
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  if (mErr) {
    return withCors(
      JSON.stringify({ error: mErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!mem) {
    return withCors(
      JSON.stringify({ error: "member_not_found" }),
      { status: 404 },
      req,
    );
  }

  if (String((mem as any).role ?? "") !== "member") {
    return withCors(
      JSON.stringify({ error: "not_a_member" }),
      { status: 400 },
      req,
    );
  }

  const memberProfileUserId = String((mem as any).user_id ?? "");
  if (!memberProfileUserId) {
    return withCors(
      JSON.stringify({ error: "member_profile_link_missing" }),
      { status: 400 },
      req,
    );
  }

  // 3) choose coach_id: body.coach_id OR template.coach_id
  const coach_id = coach_id_raw ?? (tpl as any).coach_id ?? null;
  if (!coach_id) {
    return withCors(
      JSON.stringify({ error: "coach_required" }),
      { status: 400 },
      req,
    );
  }

  // 4) validate coach exists and belongs to tenant
  const { data: coach, error: cErr } = await adminClient
    .from("coaches")
    .select("id, tenant_id")
    .eq("id", coach_id)
    .maybeSingle();

  if (cErr) {
    return withCors(
      JSON.stringify({ error: cErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!coach) {
    return withCors(
      JSON.stringify({ error: "coach_not_found" }),
      { status: 404 },
      req,
    );
  }

  if ((coach as any).tenant_id && String((coach as any).tenant_id) !== tenant_id) {
    return withCors(
      JSON.stringify({ error: "cross_tenant_coach" }),
      { status: 403 },
      req,
    );
  }

  // 5) insert assignment
  const { data: assignment, error: insErr } = await adminClient
    .from("workout_template_assignments")
    .insert({
      tenant_id,
      template_id,
      coach_id,
      member_id, // members.id
      message: adminMessage || null,
      status: "sent",
    })
    .select(
      "id, tenant_id, template_id, coach_id, member_id, message, status, created_at",
    )
    .single();

  if (insErr) {
    return withCors(
      JSON.stringify({ error: insErr.message }),
      { status: 400 },
      req,
    );
  }

  const templateName = (tpl as any).name ?? "Πρόγραμμα";
  const notifTitle = "Νέο πρόγραμμα προπόνησης";
  let notifBody =
    `Σου ανατέθηκε το template: ${templateName}. Άνοιξε την εφαρμογή για να το δεις.`;

  if (adminMessage) {
    notifBody += `\n\nΜήνυμα προπονητή: ${adminMessage}`;
  }

  const notifData: Record<string, unknown> = {
    kind: "template_assigned",
    tenantId: tenant_id,
    templateId: template_id,
    assignmentId: (assignment as any)?.id ?? null,
    sentAt: new Date().toISOString(),
  };

  // inbox notification should go to the real profile/auth user id
  const { error: inboxErr } = await adminClient
    .from("user_notifications")
    .insert({
      tenant_id,
      user_id: memberProfileUserId,
      title: notifTitle,
      body: notifBody,
      type: "workout",
      data: notifData,
      sent_at: new Date().toISOString(),
    });

  if (inboxErr) {
    return withCors(
      JSON.stringify({
        ok: true,
        data: assignment,
        inbox_saved: false,
        inbox_error: inboxErr.message,
      }),
      { status: 200 },
      req,
    );
  }

  // push should also use the real profile/auth user id
  const pushRes = await sendExpoPush({
    admin: adminClient,
    tenant_id,
    user_id: memberProfileUserId,
    title: notifTitle,
    body: notifBody,
    data: notifData,
  });

  return withCors(
    JSON.stringify({
      ok: true,
      data: assignment,
      inbox_saved: true,
      push: pushRes,
    }),
    { status: 200 },
    req,
  );
});