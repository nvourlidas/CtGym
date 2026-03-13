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

async function getUsableMembership(
  admin: any,
  tenantId: string,
  memberId: string,
  classCategoryId: string | null,
) {
  const { data: memberships, error: membershipErr } = await admin
    .from("memberships")
    .select(`
      id,
      status,
      starts_at,
      ends_at,
      plan_kind,
      remaining_sessions,
      plan_id
    `)
    .eq("tenant_id", tenantId)
    .eq("user_id", memberId)
    .eq("status", "active")
    .order("starts_at", { ascending: false });

  if (membershipErr) {
    throw new Error(membershipErr.message);
  }

  const now = new Date();

  for (const m of memberships ?? []) {
    const timeOk =
      (!m.starts_at || new Date(m.starts_at) <= now) &&
      (!m.ends_at || now <= new Date(m.ends_at));

    const sessionsOk =
      m.plan_kind === "sessions"
        ? (m.remaining_sessions ?? 0) > 0
        : true;

    const hasActiveMembership = !!timeOk && !!sessionsOk;
    if (!hasActiveMembership) continue;

    // If class has no category, any active membership is fine
    if (!classCategoryId) {
      return {
        id: String(m.id),
        plan_kind: String(m.plan_kind ?? ""),
      };
    }

    // Check whether this membership plan allows the class category
    const { data: allowedCats, error: allowedCatsErr } = await admin
      .from("membership_plan_categories")
      .select("category_id")
      .eq("tenant_id", tenantId)
      .eq("membership_plan_id", m.plan_id);

    if (allowedCatsErr) {
      throw new Error(allowedCatsErr.message);
    }

    const allowedCategoryIds = new Set(
      (allowedCats ?? []).map((row: any) => String(row.category_id)),
    );

    if (allowedCategoryIds.has(String(classCategoryId))) {
      return {
        id: String(m.id),
        plan_kind: String(m.plan_kind ?? ""),
      };
    }
  }

  return null;
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

  const tenant_id = String(body?.tenant_id ?? "").trim();
  const session_id = String(body?.session_id ?? "").trim();
  let user_id = String(body?.user_id ?? "").trim(); // this is members.id
  const booking_type_raw = typeof body?.booking_type === "string"
    ? String(body.booking_type).toLowerCase().trim()
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

  // -----------------------------
  // Caller tenant membership + role
  // -----------------------------
  const { data: callerTenantUser, error: callerTenantUserErr } = await anon
    .from("tenant_users")
    .select("tenant_id, user_id, role")
    .eq("tenant_id", tenant_id)
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

  // -----------------------------
  // Target member resolution
  // -----------------------------
  let targetMember: any = null;

  if (!isAdmin) {
    // non-admin books only for their own member row
    const { data: selfMember, error: selfMemberErr } = await anon
      .from("members")
      .select("id, tenant_id, user_id, role")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (selfMemberErr) {
      return withCors(
        req,
        JSON.stringify({ error: selfMemberErr.message }),
        { status: 400 },
      );
    }

    if (!selfMember) {
      return withCors(req, JSON.stringify({ error: "member_not_found" }), {
        status: 404,
      });
    }

    targetMember = selfMember;
    user_id = String(selfMember.id); // bookings.user_id = members.id
  } else {
    if (!user_id) {
      return withCors(
        req,
        JSON.stringify({ error: "user_id_required_for_admin" }),
        { status: 400 },
      );
    }

    const { data: adminTargetMember, error: targetMemberErr } = await admin
      .from("members")
      .select("id, tenant_id, user_id, role")
      .eq("tenant_id", tenant_id)
      .eq("id", user_id)
      .maybeSingle();

    if (targetMemberErr) {
      return withCors(
        req,
        JSON.stringify({ error: targetMemberErr.message }),
        { status: 400 },
      );
    }

    if (!adminTargetMember) {
      return withCors(req, JSON.stringify({ error: "member_not_found" }), {
        status: 404,
      });
    }

    targetMember = adminTargetMember;
  }

  const linkedProfileUserId = String(targetMember.user_id ?? "");

  // extra validation: the member's linked auth/profile user must belong to tenant_users too
  const { data: targetTenantUser, error: targetTenantUserErr } = await admin
    .from("tenant_users")
    .select("tenant_id, user_id, role")
    .eq("tenant_id", tenant_id)
    .eq("user_id", linkedProfileUserId)
    .maybeSingle();

  if (targetTenantUserErr) {
    return withCors(
      req,
      JSON.stringify({ error: targetTenantUserErr.message }),
      { status: 400 },
    );
  }

  if (!targetTenantUser) {
    return withCors(
      req,
      JSON.stringify({ error: "target_user_wrong_tenant" }),
      { status: 403 },
    );
  }

  // -----------------------------
  // Tenant subscription gate
  // -----------------------------
  try {
    await assertTenantActive(admin, tenant_id);
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
  // Load session
  // -----------------------------
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

  // -----------------------------
  // Load class
  // -----------------------------
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

  // -----------------------------
  // Decide final booking type
  // -----------------------------
  let finalType: "membership" | "drop_in" = "membership";
  let chosenMembership: { id: string; plan_kind: string } | null = null;

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
    try {
      chosenMembership = await getUsableMembership(
        admin,
        tenant_id,
        user_id, // members.id
        cls.category_id ? String(cls.category_id) : null,
      );
    } catch (e: any) {
      return withCors(
        req,
        JSON.stringify({ error: e?.message ?? "membership_lookup_failed" }),
        { status: 400 },
      );
    }

    if (chosenMembership) {
      finalType = "membership";
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

  // -----------------------------
  // Duplicate booking check
  // -----------------------------
  const { data: dup, error: dupErr } = await admin
    .from("bookings")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("session_id", session_id)
    .eq("user_id", user_id)
    .in("status", ["booked", "checked_in"])
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

  // -----------------------------
  // Capacity check
  // -----------------------------
  if (session.capacity && session.capacity > 0) {
    const { count, error: capErr } = await admin
      .from("bookings")
      .select("id", { head: true, count: "exact" })
      .eq("tenant_id", tenant_id)
      .eq("session_id", session_id)
      .in("status", ["booked", "checked_in"]);

    if (capErr) {
      return withCors(req, JSON.stringify({ error: capErr.message }), {
        status: 400,
      });
    }

    if ((count ?? 0) >= session.capacity) {
      return withCors(
        req,
        JSON.stringify({ error: "session_full" }),
        { status: 409 },
      );
    }
  }

  // -----------------------------
  // Create booking
  // -----------------------------
  const insertData: any = {
    tenant_id,
    session_id,
    user_id, // members.id
    status: "booked",
    booking_type: finalType,
  };

  if (finalType === "membership" && chosenMembership?.id) {
    insertData.membership_id = chosenMembership.id;
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
    return withCors(req, JSON.stringify({ error: insErr.message }), {
      status: 400,
    });
  }

  // -----------------------------
  // Consume membership session
  // -----------------------------
  if (
    finalType === "membership" &&
    chosenMembership?.plan_kind === "sessions"
  ) {
    const { error: consumeErr } = await admin.rpc(
      "consume_membership_session",
      {
        p_tenant_id: tenant_id,
        p_user_id: user_id, // members.id
        p_booking_id: created.id,
      },
    );

    if (consumeErr) {
      await admin.from("bookings").delete().eq("id", created.id);

      return withCors(req, JSON.stringify({ error: consumeErr.message }), {
        status: 409,
      });
    }
  }

  return withCors(
    req,
    JSON.stringify({ ok: true, data: created }),
    { status: 200 },
  );
});