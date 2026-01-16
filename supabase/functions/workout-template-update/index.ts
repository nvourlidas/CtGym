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
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(body, { ...init, headers });
}

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type IncomingSet = { reps?: string | number | null; weight?: string | number | null };
type IncomingItem = { wger_id: number; sets?: IncomingSet[] };

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

  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: "unauthorized" as const };

  const { data: prof, error: pErr } = await supa
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr || !prof) return { error: "profile_not_found" as const };

  const isAdmin = user.app_metadata?.role === "admin" || prof.role === "admin";
  return { user, isAdmin, tenant_id: prof.tenant_id as string | null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);
  if (req.method !== "POST") {
    return withCors(JSON.stringify({ error: "method_not_allowed" }), { status: 405 }, req);
  }

  const auth = await getAuthContext(req);
  if ((auth as any).error) {
    return withCors(JSON.stringify({ error: (auth as any).error }), { status: 401 }, req);
  }

  const { user, isAdmin, tenant_id } = auth as { user: any; isAdmin: boolean; tenant_id: string | null };
  if (!isAdmin) return withCors(JSON.stringify({ error: "forbidden" }), { status: 403 }, req);
  if (!tenant_id) return withCors(JSON.stringify({ error: "tenant_required" }), { status: 400 }, req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(JSON.stringify({ error: "invalid_json" }), { status: 400 }, req);
  }

  const id = String(body?.id ?? "").trim();
  const nameRaw = body?.name;
  const notesRaw = body?.notes;
  const coachRaw = body?.coach_id;
  const itemsRaw = body?.items;

  if (!id) return withCors(JSON.stringify({ error: "id_required" }), { status: 400 }, req);

  const patch: Record<string, any> = {};

  if (nameRaw !== undefined) {
    const name = String(nameRaw ?? "").trim();
    if (!name) return withCors(JSON.stringify({ error: "name_required" }), { status: 400 }, req);
    patch.name = name;
  }

  if (notesRaw !== undefined) {
    patch.notes = String(notesRaw ?? "").trim() || null;
  }

  // ✅ support coach_id updates
  if (coachRaw !== undefined) {
    const coach_id = String(coachRaw ?? "").trim() || null;
    patch.coach_id = coach_id;
  }

  const hasItems = itemsRaw !== undefined;
  const items = (hasItems ? (itemsRaw ?? []) : []) as IncomingItem[];

  if (!hasItems && Object.keys(patch).length === 0) {
    return withCors(JSON.stringify({ error: "no_changes" }), { status: 400 }, req);
  }

  if (hasItems) {
    if (!Array.isArray(items) || items.length === 0) {
      return withCors(JSON.stringify({ error: "items_required" }), { status: 400 }, req);
    }
    for (let i = 0; i < items.length; i++) {
      const wgerId = Number(items[i]?.wger_id);
      if (!Number.isFinite(wgerId) || wgerId <= 0) {
        return withCors(JSON.stringify({ error: "invalid_item_wger_id", index: i }), { status: 400 }, req);
      }
    }
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // ✅ Ensure template exists AND belongs to same tenant
  const { data: existing, error: exErr } = await admin
    .from("workout_templates")
    .select("id, created_by, tenant_id")
    .eq("id", id)
    .maybeSingle();

  if (exErr) return withCors(JSON.stringify({ error: exErr.message }), { status: 400 }, req);
  if (!existing) return withCors(JSON.stringify({ error: "not_found" }), { status: 404 }, req);
  if (existing.tenant_id !== tenant_id) {
    return withCors(JSON.stringify({ error: "cross_tenant_forbidden" }), { status: 403 }, req);
  }

  // 1) Update header
  let updatedTemplate: any;
  if (Object.keys(patch).length > 0) {
    const { data: t, error: uErr } = await admin
      .from("workout_templates")
      .update(patch)
      .eq("id", id)
      .select("id, tenant_id, created_by, coach_id, name, notes, created_at, updated_at")
      .single();

    if (uErr) return withCors(JSON.stringify({ error: uErr.message }), { status: 400 }, req);
    updatedTemplate = t;
  } else {
    const { data: t, error: tErr } = await admin
      .from("workout_templates")
      .select("id, tenant_id, created_by, coach_id, name, notes, created_at, updated_at")
      .eq("id", id)
      .single();

    if (tErr) return withCors(JSON.stringify({ error: tErr.message }), { status: 400 }, req);
    updatedTemplate = t;
  }

  // 2) Replace items (if provided)
  let exCount = 0;
  let setCount = 0;

  if (hasItems) {
    // delete old exercises (sets should cascade or be FK-dependent)
    const { error: delErr } = await admin
      .from("workout_template_exercises")
      .delete()
      .eq("template_id", id);

    if (delErr) return withCors(JSON.stringify({ error: delErr.message }), { status: 400 }, req);

    const exercisesPayload = items.map((it, idx) => ({
      template_id: id,
      exercise_wger_id: Number(it.wger_id),
      sort_order: idx,
    }));

    const { data: insertedExercises, error: insErr } = await admin
      .from("workout_template_exercises")
      .insert(exercisesPayload)
      .select("id, exercise_wger_id, sort_order");

    if (insErr || !insertedExercises) {
      return withCors(JSON.stringify({ error: insErr?.message ?? "exercises_insert_failed" }), { status: 400 }, req);
    }

    exCount = insertedExercises.length;

    const exIdByWger = new Map<number, string>();
    for (const row of insertedExercises as any[]) {
      exIdByWger.set(Number(row.exercise_wger_id), String(row.id));
    }

    const setsPayload: any[] = [];
    for (const it of items) {
      const teId = exIdByWger.get(Number(it.wger_id));
      if (!teId) continue;

      const sets = Array.isArray(it.sets) && it.sets.length ? it.sets : [{ reps: null, weight: null }];
      for (let s = 0; s < sets.length; s++) {
        setsPayload.push({
          template_exercise_id: teId,
          set_no: s + 1,
          reps: toIntOrNull(sets[s]?.reps),
          weight: toNumOrNull(sets[s]?.weight),
          weight_unit: "kg",
        });
      }
    }

    if (setsPayload.length > 0) {
      const { error: sErr } = await admin.from("workout_template_sets").insert(setsPayload);
      if (sErr) return withCors(JSON.stringify({ error: sErr.message }), { status: 400 }, req);
    }

    setCount = setsPayload.length;
  }

  return withCors(
    JSON.stringify({
      ok: true,
      data: {
        template: updatedTemplate,
        counts: hasItems ? { exercises: exCount, sets: setCount } : undefined,
      },
    }),
    { status: 200 },
    req,
  );
});
