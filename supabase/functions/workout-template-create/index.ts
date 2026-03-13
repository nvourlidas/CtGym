// supabase/functions/workout-template-create/index.ts
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

type IncomingSet = {
  reps?: string | number | null;
  weight?: string | number | null;
};

type IncomingItem = {
  wger_id: number;
  name?: string;
  sets?: IncomingSet[];
};

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n;
}

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
  const name = String(body?.name ?? "").trim();
  const notes = String(body?.notes ?? "").trim() || null;
  const items = (body?.items ?? []) as IncomingItem[];
  const coach_id = String(body?.coach_id ?? "").trim() || null;

  if (!tenant_id) {
    return withCors(
      JSON.stringify({ error: "tenant_required" }),
      { status: 400 },
      req,
    );
  }

  // caller must belong to tenant and be admin/owner there
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

  if (!name) {
    return withCors(
      JSON.stringify({ error: "name_required" }),
      { status: 400 },
      req,
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    return withCors(
      JSON.stringify({ error: "items_required" }),
      { status: 400 },
      req,
    );
  }

  // Validate items
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const wgerId = Number(it?.wger_id);

    if (!Number.isFinite(wgerId) || wgerId <= 0) {
      return withCors(
        JSON.stringify({ error: "invalid_item_wger_id", index: i }),
        { status: 400 },
        req,
      );
    }

    if (it?.sets && !Array.isArray(it.sets)) {
      return withCors(
        JSON.stringify({ error: "invalid_item_sets", index: i }),
        { status: 400 },
        req,
      );
    }
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // subscription gate
  try {
    await assertTenantActive(admin, tenant_id);
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

  // validate coach belongs to same tenant
  if (coach_id) {
    const { data: c, error: cErr } = await admin
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

    if (!c) {
      return withCors(
        JSON.stringify({ error: "coach_not_found" }),
        { status: 404 },
        req,
      );
    }

    if (String(c.tenant_id) !== tenant_id) {
      return withCors(
        JSON.stringify({ error: "coach_tenant_mismatch" }),
        { status: 403 },
        req,
      );
    }
  }

  // 1) Create template
  const { data: template, error: tErr } = await admin
    .from("workout_templates")
    .insert({
      tenant_id,
      created_by: user.id,
      coach_id: coach_id ?? null,
      name,
      notes,
    })
    .select("id, created_by, name, notes, created_at, updated_at")
    .single();

  if (tErr || !template) {
    return withCors(
      JSON.stringify({ error: tErr?.message ?? "template_create_failed" }),
      { status: 400 },
      req,
    );
  }

  // 2) Insert template exercises
  const exercisesPayload = items.map((it, idx) => ({
    template_id: template.id,
    exercise_wger_id: Number(it.wger_id),
    sort_order: idx,
  }));

  const { data: insertedExercises, error: exErr } = await admin
    .from("workout_template_exercises")
    .insert(exercisesPayload)
    .select("id, exercise_wger_id, sort_order");

  if (exErr || !insertedExercises) {
    await admin.from("workout_templates").delete().eq("id", template.id);

    return withCors(
      JSON.stringify({
        error: exErr?.message ?? "template_exercises_insert_failed",
      }),
      { status: 400 },
      req,
    );
  }

  // map wger_id -> inserted template_exercise_id
  const exIdByWger = new Map<number, string>();
  for (const row of insertedExercises as any[]) {
    exIdByWger.set(Number(row.exercise_wger_id), String(row.id));
  }

  // 3) Insert sets
  const setsPayload: any[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const teId = exIdByWger.get(Number(it.wger_id));
    if (!teId) continue;

    const sets = Array.isArray(it.sets) && it.sets.length > 0
      ? it.sets
      : [{ reps: null, weight: null }];

    for (let s = 0; s < sets.length; s++) {
      const reps = toIntOrNull(sets[s]?.reps);
      const weight = toNumOrNull(sets[s]?.weight);

      setsPayload.push({
        template_exercise_id: teId,
        set_no: s + 1,
        reps,
        weight,
        weight_unit: "kg",
      });
    }
  }

  if (setsPayload.length > 0) {
    const { error: sErr } = await admin
      .from("workout_template_sets")
      .insert(setsPayload);

    if (sErr) {
      await admin.from("workout_templates").delete().eq("id", template.id);

      return withCors(
        JSON.stringify({ error: sErr.message }),
        { status: 400 },
        req,
      );
    }
  }

  return withCors(
    JSON.stringify({
      ok: true,
      data: {
        template,
        counts: {
          exercises: insertedExercises.length,
          sets: setsPayload.length,
        },
      },
    }),
    { status: 200 },
    req,
  );
});