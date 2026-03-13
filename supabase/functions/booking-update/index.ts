// supabase/functions/booking-update/index.ts
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

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // -----------------------------
  // Authenticated caller
  // -----------------------------
  const {
    data: { user },
    error: authErr,
  } = await anon.auth.getUser();

  if (authErr || !user) {
    return withCors(req, JSON.stringify({ error: "unauthorized" }), {
      status: 401,
    });
  }

  // -----------------------------
  // Payload
  // -----------------------------
  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(req, JSON.stringify({ error: "invalid_json" }), {
      status: 400,
    });
  }

  const id = String(body?.id ?? "").trim();
  if (!id) {
    return withCors(req, JSON.stringify({ error: "id_required" }), {
      status: 400,
    });
  }

  // -----------------------------
  // Load booking first
  // -----------------------------
  const { data: bk, error: bErr } = await admin
    .from("bookings")
    .select("id, tenant_id, session_id, user_id, status, booking_type, membership_id")
    .eq("id", id)
    .maybeSingle();

  if (bErr || !bk) {
    return withCors(
      req,
      JSON.stringify({ error: bErr?.message ?? "not_found" }),
      { status: 404 },
    );
  }

  // -----------------------------
  // Caller tenant role check
  // -----------------------------
  const { data: callerTenantUser, error: callerTenantUserErr } = await anon
    .from("tenant_users")
    .select("tenant_id, user_id, role")
    .eq("tenant_id", bk.tenant_id)
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

  // -----------------------------
  // Subscription gate
  // -----------------------------
  try {
    await assertTenantActive(admin, String(bk.tenant_id));
  } catch (e: any) {
    return withCors(
      req,
      JSON.stringify({
        error: e?.message ?? "SUBSCRIPTION_INACTIVE",
        details: e?.details ?? null,
      }),
      { status: 402 },
    );
  }

  // -----------------------------
  // Current session
  // -----------------------------
  const { data: currentSession, error: currentSessionErr } = await admin
    .from("class_sessions")
    .select("id, tenant_id, starts_at, ends_at, capacity")
    .eq("id", bk.session_id)
    .maybeSingle();

  if (currentSessionErr) {
    return withCors(
      req,
      JSON.stringify({ error: currentSessionErr.message }),
      { status: 400 },
    );
  }

  const updates: Record<string, any> = {};

  // -----------------------------
  // Status update
  // -----------------------------
  if (typeof body?.status === "string" && body.status.trim()) {
    const target = String(body.status).trim() as
      | "booked"
      | "checked_in"
      | "cancelled"
      | "no_show";

    const allowedStatuses = new Set([
      "booked",
      "checked_in",
      "cancelled",
      "no_show",
    ]);

    if (!allowedStatuses.has(target)) {
      return withCors(req, JSON.stringify({ error: "invalid_status" }), {
        status: 400,
      });
    }

    if (target === "cancelled") {
      const now = new Date();
      const start = currentSession?.starts_at
        ? new Date(currentSession.starts_at)
        : null;

      if (!start) {
        return withCors(
          req,
          JSON.stringify({ error: "session_has_no_start" }),
          { status: 400 },
        );
      }

      // same current rule: until 2 hours before start
      const deadline = new Date(start.getTime() - 2 * 60 * 60 * 1000);
      if (now > deadline) {
        return withCors(
          req,
          JSON.stringify({ error: "cancel_deadline_passed" }),
          { status: 409 },
        );
      }
    }

    updates.status = target;
  }

  // -----------------------------
  // Move booking to another session
  // -----------------------------
  if (typeof body?.session_id === "string" && body.session_id.trim()) {
    const newSessionId = String(body.session_id).trim();

    const { data: newSession, error: newSessionErr } = await admin
      .from("class_sessions")
      .select("id, tenant_id, capacity")
      .eq("id", newSessionId)
      .maybeSingle();

    if (newSessionErr || !newSession) {
      return withCors(
        req,
        JSON.stringify({ error: newSessionErr?.message ?? "session_not_found" }),
        { status: 400 },
      );
    }

    if (String(newSession.tenant_id) !== String(bk.tenant_id)) {
      return withCors(
        req,
        JSON.stringify({ error: "session_wrong_tenant" }),
        { status: 403 },
      );
    }

    // prevent duplicate active booking for same member in target session
    const { data: dup, error: dupErr } = await admin
      .from("bookings")
      .select("id")
      .eq("tenant_id", bk.tenant_id)
      .eq("session_id", newSessionId)
      .eq("user_id", bk.user_id)
      .in("status", ["booked", "checked_in"])
      .neq("id", id)
      .limit(1);

    if (dupErr) {
      return withCors(req, JSON.stringify({ error: dupErr.message }), {
        status: 400,
      });
    }

    if ((dup?.length ?? 0) > 0) {
      return withCors(
        req,
        JSON.stringify({ error: "already_booked" }),
        { status: 409 },
      );
    }

    // capacity check
    if (newSession.capacity && newSession.capacity > 0) {
      const { count, error: capErr } = await admin
        .from("bookings")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", bk.tenant_id)
        .eq("session_id", newSessionId)
        .in("status", ["booked", "checked_in"])
        .neq("id", id);

      if (capErr) {
        return withCors(req, JSON.stringify({ error: capErr.message }), {
          status: 400,
        });
      }

      if ((count ?? 0) >= newSession.capacity) {
        return withCors(req, JSON.stringify({ error: "session_full" }), {
          status: 409,
        });
      }
    }

    updates.session_id = newSessionId;
  }

  if (Object.keys(updates).length === 0) {
    return withCors(req, JSON.stringify({ error: "no_updates_provided" }), {
      status: 400,
    });
  }

  // -----------------------------
  // Update booking
  // -----------------------------
  const { data, error } = await admin
    .from("bookings")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return withCors(req, JSON.stringify({ error: error.message }), {
      status: 400,
    });
  }

  return withCors(req, JSON.stringify({ ok: true, data }), { status: 200 });
});