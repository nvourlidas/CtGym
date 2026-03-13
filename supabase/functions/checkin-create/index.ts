// supabase/functions/checkin-create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ALLOWED = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr",
  "https://ctgym.cloudtec.gr",
]);

const cors = (r: Request) => ({
  "Access-Control-Allow-Origin": ALLOWED.has(r.headers.get("origin") ?? "")
    ? (r.headers.get("origin") as string)
    : "",
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    r.headers.get("access-control-request-headers") ??
      "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
});

const withCors = (r: Request, body: BodyInit | null, init: ResponseInit) =>
  new Response(body, {
    ...init,
    headers: { ...(init.headers || {}), ...cors(r) },
  });

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(req, null, { status: 204 });

  if (req.method !== "POST") {
    return withCors(req, "Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  const anon = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await anon.auth.getUser();

  if (authErr || !user) {
    return withCors(req, JSON.stringify({ error: "unauthorized" }), {
      status: 401,
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(req, JSON.stringify({ error: "invalid_json" }), {
      status: 400,
    });
  }

  const tenantId = String(body?.tenant_id ?? "").trim();
  const session_id = String(body?.session_id ?? "").trim();
  const user_id = String(body?.user_id ?? "").trim(); // members.id

  if (!tenantId || !session_id || !user_id) {
    return withCors(req, JSON.stringify({ error: "missing_fields" }), {
      status: 400,
    });
  }

  const { data: callerTenantUser, error: callerTenantUserErr } = await anon
    .from("tenant_users")
    .select("tenant_id, user_id, role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (callerTenantUserErr) {
    return withCors(
      req,
      JSON.stringify({ error: callerTenantUserErr.message }),
      { status: 400 },
    );
  }

  if (!callerTenantUser) {
    return withCors(req, JSON.stringify({ error: "tenant_access_denied" }), {
      status: 403,
    });
  }

  const callerRole = String(callerTenantUser.role ?? "").toLowerCase();
  const isAdmin =
    callerRole === "admin" ||
    callerRole === "owner" ||
    user.app_metadata?.role === "admin";

  if (!isAdmin) {
    return withCors(req, JSON.stringify({ error: "forbidden" }), {
      status: 403,
    });
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // validate member exists and belongs to tenant
  const { data: member, error: memberErr } = await admin
    .from("members")
    .select("id, tenant_id, role")
    .eq("id", user_id)
    .maybeSingle();

  if (memberErr || !member) {
    return withCors(
      req,
      JSON.stringify({ error: memberErr?.message ?? "member_not_found" }),
      { status: 400 },
    );
  }

  if (String(member.tenant_id) !== tenantId) {
    return withCors(req, JSON.stringify({ error: "member_wrong_tenant" }), {
      status: 403,
    });
  }

  if (String(member.role ?? "") !== "member") {
    return withCors(req, JSON.stringify({ error: "not_a_member" }), {
      status: 400,
    });
  }

  // load session, check time window (15min before start → 30min after end)
  const { data: ses, error: sErr } = await admin
    .from("class_sessions")
    .select("id, tenant_id, starts_at, ends_at")
    .eq("id", session_id)
    .maybeSingle();

  if (sErr || !ses) {
    return withCors(
      req,
      JSON.stringify({ error: sErr?.message ?? "session_not_found" }),
      { status: 400 },
    );
  }

  if (String(ses.tenant_id) !== tenantId) {
    return withCors(req, JSON.stringify({ error: "tenant_mismatch" }), {
      status: 403,
    });
  }

  const now = new Date();
  const start = ses.starts_at ? new Date(ses.starts_at) : null;
  const end = ses.ends_at ? new Date(ses.ends_at) : null;
  const canFrom = start ? new Date(start.getTime() - 15 * 60 * 1000) : null;
  const canTo = end
    ? new Date(end.getTime() + 30 * 60 * 1000)
    : (start ? new Date(start.getTime() + 2 * 60 * 60 * 1000) : null);

  if ((canFrom && now < canFrom) || (canTo && now > canTo)) {
    return withCors(req, JSON.stringify({ error: "outside_checkin_window" }), {
      status: 409,
    });
  }

  // find or create booking
  let { data: bk, error: bkErr } = await admin
    .from("bookings")
    .select("id, status, booking_type, membership_id")
    .eq("tenant_id", tenantId)
    .eq("session_id", session_id)
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (bkErr) {
    return withCors(req, JSON.stringify({ error: bkErr.message }), {
      status: 400,
    });
  }

  const existing = bk?.[0] as any | undefined;
  let bookingId = existing?.id as string | undefined;

  if (!bookingId) {
    // walk-in: create booking first
    const { data: created, error: cErr } = await admin
      .from("bookings")
      .insert({
        tenant_id: tenantId,
        session_id,
        user_id, // members.id
        status: "booked",
        booking_type: "membership",
      })
      .select("id")
      .single();

    if (cErr) {
      return withCors(req, JSON.stringify({ error: cErr.message }), {
        status: 400,
      });
    }

    bookingId = created.id;
  }

  // consume 1 session credit if plan is session-based
  try {
    const alreadyConsumed = !!existing?.membership_id;
    const isAlreadyCheckedIn = String(existing?.status ?? "") === "checked_in";
    const bookingType = String(existing?.booking_type ?? "membership");

    if (!alreadyConsumed && !isAlreadyCheckedIn && bookingType === "membership") {
      const { error: consumeErr } = await admin.rpc("consume_membership_session", {
        p_tenant_id: tenantId,
        p_user_id: user_id, // members.id
        p_booking_id: bookingId,
      });

      if (consumeErr && !/does not exist/i.test(consumeErr.message)) {
        return withCors(req, JSON.stringify({ error: consumeErr.message }), {
          status: 400,
        });
      }
    }
  } catch {
    // best effort, preserve previous behavior
  }

  // insert checkin (best effort)
  await admin
    .from("checkins")
    .insert({
      tenant_id: tenantId,
      session_id,
      user_id, // members.id
    })
    .select()
    .maybeSingle();

  // flip booking status to checked_in
  const { data: updated, error: uErr } = await admin
    .from("bookings")
    .update({ status: "checked_in" })
    .eq("id", bookingId)
    .select("*")
    .single();

  if (uErr) {
    return withCors(req, JSON.stringify({ error: uErr.message }), {
      status: 400,
    });
  }

  return withCors(req, JSON.stringify({ ok: true, data: updated }), {
    status: 200,
  });
});