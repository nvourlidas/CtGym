// supabase/functions/booking-create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** CORS */
const ALLOWED = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr",
  "https://ctgym.cloudtec.gr",
]);
const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": ALLOWED.has(req.headers.get("origin") ?? "")
    ? (req.headers.get("origin") as string)
    : "",
  Vary: "Origin",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    req.headers.get("access-control-request-headers") ??
      "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
});
const withCors = (req: Request, body: BodyInit | null, init: ResponseInit) =>
  new Response(body, {
    ...init,
    headers: { ...(init.headers || {}), ...cors(req) },
  });

/** Supabase */
const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(req, null, { status: 204 });
  if (req.method !== "POST") {
    return withCors(req, "Method not allowed", { status: 405 });
  }

  // who is calling?
  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await anon.auth.getUser();
  if (!user) {
    return withCors(req, JSON.stringify({ error: "unauthorized" }), {
      status: 401,
    });
  }

  const { data: callerProfile } = await anon
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!callerProfile) {
    return withCors(req, JSON.stringify({ error: "profile_not_found" }), {
      status: 401,
    });
  }

  const callerTenantId = callerProfile.tenant_id as string;
  const isAdmin = user.app_metadata?.role === "admin" ||
    (callerProfile as any).role === "admin";

  // payload
  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(req, JSON.stringify({ error: "invalid_json" }), {
      status: 400,
    });
  }

  const tenant_id = String(body?.tenant_id ?? "");
  const session_id = String(body?.session_id ?? "");
  let user_id = String(body?.user_id ?? "");

  // requested booking type (optional)
  const booking_type_raw = typeof body?.booking_type === "string"
    ? (body.booking_type as string).toLowerCase()
    : null;
  const requestedType: "membership" | "drop_in" | null =
    booking_type_raw === "membership" || booking_type_raw === "drop_in"
      ? booking_type_raw
      : null;

  if (!tenant_id || !session_id) {
    return withCors(req, JSON.stringify({ error: "missing_fields" }), {
      status: 400,
    });
  }

  // Non-admins can only book for themselves
  if (!isAdmin) {
    user_id = user.id;
    if (tenant_id !== callerTenantId) {
      return withCors(
        req,
        JSON.stringify({ error: "tenant_mismatch" }),
        { status: 403 },
      );
    }
  } else {
    if (!user_id) {
      return withCors(
        req,
        JSON.stringify({ error: "user_id_required_for_admin" }),
        { status: 400 },
      );
    }
    const { data: targetProfile } = await anon
      .from("profiles")
      .select("tenant_id")
      .eq("id", user_id)
      .maybeSingle();
    if (!targetProfile || targetProfile.tenant_id !== tenant_id) {
      return withCors(
        req,
        JSON.stringify({ error: "target_user_wrong_tenant" }),
        { status: 403 },
      );
    }
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // load session
  const { data: session, error: sErr } = await admin
    .from("class_sessions")
    .select("id, tenant_id, starts_at, ends_at, capacity, class_id")
    .eq("id", session_id)
    .maybeSingle();
  if (sErr || !session) {
    return withCors(
      req,
      JSON.stringify({ error: sErr?.message ?? "session_not_found" }),
      { status: 400 },
    );
  }
  if (session.tenant_id !== tenant_id) {
    return withCors(
      req,
      JSON.stringify({ error: "session_wrong_tenant" }),
      { status: 403 },
    );
  }

  // load class for category + drop-in
  const { data: cls, error: cErr } = await admin
    .from("classes")
    .select("id, tenant_id, category_id, drop_in_enabled, drop_in_price")
    .eq("id", session.class_id)
    .maybeSingle();
  if (cErr || !cls) {
    return withCors(
      req,
      JSON.stringify({ error: cErr?.message ?? "class_not_found" }),
      { status: 400 },
    );
  }
  if (cls.tenant_id !== tenant_id) {
    return withCors(
      req,
      JSON.stringify({ error: "class_wrong_tenant" }),
      { status: 403 },
    );
  }

  // Decide final booking type
  let finalType: "membership" | "drop_in" = "membership";
  let chosenMembership: { id: string; plan_kind: string } | null = null;

  // ---------- NON-ADMIN (MEMBER) ----------
  if (!isAdmin) {
    // If member explicitly chose drop-in => SKIP membership entirely
    if (requestedType === "drop_in") {
      if (!cls.drop_in_enabled) {
        return withCors(
          req,
          JSON.stringify({ error: "drop_in_not_allowed_for_class" }),
          { status: 409 },
        );
      }
      finalType = "drop_in";
    } else {
      // Try membership first, then fallback to drop-in if allowed

      const { data: ms } = await admin
        .from("memberships")
        .select(`
    id,
    status,
    starts_at,
    ends_at,
    plan_kind,
    remaining_sessions,
    membership_plans(category_id)
  `)
        .eq("tenant_id", tenant_id)
        .eq("user_id", user_id)
        .eq("status", "active")
        .order("starts_at", { ascending: false })
        .limit(1);

      const m = (ms?.[0] ?? null) as any;

      // membership_plans comes back as an array → take the first one
      let planCat: string | null = null;
      if (m?.membership_plans) {
        if (Array.isArray(m.membership_plans)) {
          planCat = m.membership_plans[0]?.category_id ?? null;
        } else {
          // fallback just in case
          planCat = m.membership_plans.category_id ?? null;
        }
      }

      const now = new Date();
      const timeOk = m &&
        (!m.starts_at || new Date(m.starts_at) <= now) &&
        (!m.ends_at || now <= new Date(m.ends_at));
      const sessionsOk = m && m.plan_kind === "sessions"
        ? (m.remaining_sessions ?? 0) > 0
        : !!m;

      const hasActiveMembership = !!m && !!timeOk && !!sessionsOk;

      // class category is in `cls.category_id`
      const categoryMatch = hasActiveMembership &&
        (!cls.category_id || !planCat || planCat === cls.category_id);

      const canUseMembership = hasActiveMembership && categoryMatch;

      if (canUseMembership) {
        finalType = "membership";
        chosenMembership = {
          id: m.id as string,
          plan_kind: String(m.plan_kind),
        };
      } else if (cls.drop_in_enabled) {
        finalType = "drop_in";
      } else {
        return withCors(
          req,
          JSON.stringify({ error: "no_active_membership" }),
          { status: 409 },
        );
      }
    }
  } else {
    // ---------- ADMIN ----------
    if (requestedType === "drop_in") {
      if (!cls.drop_in_enabled) {
        return withCors(
          req,
          JSON.stringify({ error: "drop_in_not_allowed_for_class" }),
          { status: 409 },
        );
      }
      finalType = "drop_in";
    } else {
      finalType = "membership";
    }
  }

  // duplicate booking
  const { data: dup } = await admin
    .from("bookings")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("session_id", session_id)
    .eq("user_id", user_id)
    .in("status", ["booked", "checked_in"])
    .limit(1);
  if ((dup?.length ?? 0) > 0) {
    return withCors(
      req,
      JSON.stringify({ error: "already_booked" }),
      { status: 409 },
    );
  }

  // capacity check
  if (session.capacity && session.capacity > 0) {
    const { count } = await admin
      .from("bookings")
      .select("*", { head: true, count: "exact" })
      .eq("tenant_id", tenant_id)
      .eq("session_id", session_id)
      .in("status", ["booked", "checked_in"]);
    if ((count ?? 0) >= session.capacity) {
      return withCors(
        req,
        JSON.stringify({ error: "session_full" }),
        { status: 409 },
      );
    }
  }

  // create booking
const insertData: any = {
  tenant_id,
  session_id,
  user_id,
  status: "booked",
  booking_type: finalType,
};

if (finalType === "membership" && chosenMembership?.id) {
  insertData.membership_id = chosenMembership.id; // ✅ this is what was missing
}

if (finalType === "drop_in") {
  insertData.drop_in_price = cls.drop_in_price ?? null;
}


  const { data: created, error: insErr } = await admin
    .from("bookings")
    .insert(insertData)
    .select("*")
    .single();
  if (insErr) {
    return withCors(
      req,
      JSON.stringify({ error: insErr.message }),
      { status: 400 },
    );
  }

  // ✅ consume 1 session immediately (and store membership_id on this booking)
if (finalType === "membership" && chosenMembership?.plan_kind === "sessions") {
  const { error: consumeErr } = await admin.rpc("consume_membership_session", {
    p_tenant_id: tenant_id,
    p_user_id: user_id,
    p_booking_id: created.id,
  });

  if (consumeErr) {
    await admin.from("bookings").delete().eq("id", created.id);
    return withCors(req, JSON.stringify({ error: consumeErr.message }), { status: 409 });
  }
}


  return withCors(
    req,
    JSON.stringify({ ok: true, data: created }),
    { status: 200 },
  );
});
