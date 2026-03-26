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
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": reqHdrs ||
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(body: BodyInit | null, init: ResponseInit, req: Request) {
  return new Response(body, {
    ...init,
    headers: { ...(init.headers || {}), ...buildCors(req) },
  });
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

async function getEffectiveMaxMembers(admin: any, tenantId: string) {
  const { data: sub, error: subErr } = await admin
    .from("tenant_subscriptions")
    .select("plan_id, status")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "trial", "past_due"])
    .maybeSingle();

  if (subErr) throw new Error(subErr.message);

  const planId = sub?.plan_id ?? "free";

  const { data: plan, error: planErr } = await admin
    .from("subscription_plans")
    .select("max_members")
    .eq("id", planId)
    .maybeSingle();

  if (planErr) throw new Error(planErr.message);

  return plan?.max_members ?? null;
}

async function countTenantMembers(admin: any, tenantId: string) {
  const { count, error } = await admin
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "member");

  if (error) throw new Error(error.message);
  console.log(`Current member count for tenant:`, count);
  return count ?? 0;
}

async function findAuthUserByEmail(admin: any, email: string) {
  let page = 1;
  const perPage = 200;
  const normalized = email.trim().toLowerCase();

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw new Error(error.message);

    const users = data?.users ?? [];
    const found = users.find((u: any) =>
      String(u.email ?? "").trim().toLowerCase() === normalized
    );

    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCors(null, { status: 204 }, req);
  }

  if (req.method !== "POST") {
    return withCors("Method not allowed", { status: 405 }, req);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return withCors(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400 },
      req,
    );
  }

  const {
    email,
    password,
    full_name,
    phone,
    tenant_id,
    birth_date,
    address,
    afm,
    max_dropin_debt,
    notes,
  } = payload || {};

  if (!email || !tenant_id) {
    return withCors(
      JSON.stringify({ error: "missing_fields" }),
      { status: 400 },
      req,
    );
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    await assertTenantActive(admin, String(tenant_id));
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

  try {
    const maxMembers = await getEffectiveMaxMembers(admin, String(tenant_id));
    if (maxMembers !== null) {
      const current = await countTenantMembers(admin, String(tenant_id));
      if (current >= maxMembers) {
        return withCors(
          JSON.stringify({
            error: "PLAN_LIMIT:MAX_MEMBERS_REACHED",
            limit: maxMembers,
            current,
          }),
          { status: 409 },
          req,
        );
      }
    }
  } catch (e: any) {
    return withCors(
      JSON.stringify({ error: e?.message ?? "PLAN_LIMIT_CHECK_FAILED" }),
      { status: 400 },
      req,
    );
  }

  let user: any = null;
  let createdNow = false;
  let reusedExistingAuthUser = false;

  try {
    user = await findAuthUserByEmail(admin, String(email));
  } catch (e: any) {
    return withCors(
      JSON.stringify({ error: e?.message ?? "auth_lookup_failed" }),
      { status: 500 },
      req,
    );
  }

  if (user) {
    reusedExistingAuthUser = true;
  }

  if (!user) {
    if (!password) {
      return withCors(
        JSON.stringify({ error: "Το password είναι απαραίτητο για νέο χρήστη" }),
        { status: 400 },
        req,
      );
    }

    const { data: created, error: createErr } = await admin.auth.admin
      .createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          phone,
        },
      });

    if (createErr || !created?.user) {
      return withCors(
        JSON.stringify({
          error: createErr?.message ?? "Αποτυχία δημιουργίας χρήστη",
        }),
        { status: 400 },
        req,
      );
    }

    user = created.user;
    createdNow = true;
  }

  const userId = user.id;

  const { data: existingProfile, error: profileFetchErr } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileFetchErr) {
    return withCors(
      JSON.stringify({ error: profileFetchErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!existingProfile) {
    const { error: profErr } = await admin.from("profiles").insert({
      id: userId,
    });

    if (profErr) {
      if (createdNow) await admin.auth.admin.deleteUser(userId);
      return withCors(
        JSON.stringify({ error: profErr.message }),
        { status: 400 },
        req,
      );
    }
  }

  const { data: existingTenantUser, error: tenantUserErr } = await admin
    .from("tenant_users")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (tenantUserErr) {
    if (createdNow) await admin.auth.admin.deleteUser(userId);
    return withCors(
      JSON.stringify({ error: tenantUserErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!existingTenantUser) {
    const { error: insertTenantUserErr } = await admin
      .from("tenant_users")
      .insert({
        tenant_id,
        user_id: userId,
        role: "member",
      });

    if (insertTenantUserErr) {
      if (createdNow) await admin.auth.admin.deleteUser(userId);
      return withCors(
        JSON.stringify({ error: insertTenantUserErr.message }),
        { status: 400 },
        req,
      );
    }
  }

  let maxDropinValue: number | null = null;
  if (
    max_dropin_debt !== undefined &&
    max_dropin_debt !== null &&
    max_dropin_debt !== ""
  ) {
    const n = Number(max_dropin_debt);
    maxDropinValue = Number.isFinite(n) ? n : null;
  }

  const { data: existingMember, error: existingMemberErr } = await admin
    .from("members")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingMemberErr) {
    return withCors(
      JSON.stringify({ error: existingMemberErr.message }),
      { status: 400 },
      req,
    );
  }

  if (existingMember) {
    return withCors(
      JSON.stringify({
        error: "Υπάρχει ήδη μέλος με αυτό το email",
        member_id: existingMember.id,
      }),
      { status: 409 },
      req,
    );
  }

  const { data: memberRow, error: memberErr } = await admin
    .from("members")
    .insert({
      tenant_id,
      user_id: userId,
      full_name: full_name || null,
      phone: phone || null,
      role: "member",
      email: email || null,
      birth_date: birth_date || null,
      address: address || null,
      afm: afm || null,
      max_dropin_debt: maxDropinValue,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (memberErr) {
    if (createdNow) await admin.auth.admin.deleteUser(userId);
    return withCors(
      JSON.stringify({ error: memberErr.message }),
      { status: 400 },
      req,
    );
  }

return withCors(
  JSON.stringify({
    ok: true,
    id: memberRow.id,
    user_id: userId,
    reused_existing_auth_user: reusedExistingAuthUser,
  }),
  { status: 200 },
  req,
);
});
