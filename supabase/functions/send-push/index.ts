// supabase/functions/send-push/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED = new Set([
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
  return new Response(body, {
    ...init,
    headers: { ...(init.headers || {}), ...buildCors(req) },
  });
}

async function getAuth(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const supa = createClient(URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) return { error: "unauthorized" };

  const { data: prof } = await supa
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!prof) return { error: "profile_not_found" };

  const isAdmin =
    user.app_metadata?.role === "admin" || (prof as any).role === "admin";

  return { tenantId: (prof as any).tenant_id as string, isAdmin };
}

type SendPushPayload = {
  user_ids?: string[];
  send_to_all?: boolean;
  tenant_id?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCors(null, { status: 204 }, req);
  }

  if (req.method !== "POST") {
    return withCors("Method not allowed", { status: 405 }, req);
  }

  const auth = await getAuth(req);
  if ((auth as any).error) {
    return withCors(
      JSON.stringify({ error: (auth as any).error }),
      { status: 401 },
      req,
    );
  }

  const { tenantId, isAdmin } = auth as { tenantId: string; isAdmin: boolean };

  if (!isAdmin) {
    return withCors(
      JSON.stringify({ error: "forbidden" }),
      { status: 403 },
      req,
    );
  }

  let body: SendPushPayload;
  try {
    body = (await req.json()) as SendPushPayload;
  } catch {
    return withCors(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400 },
      req,
    );
  }

  const tenant_id = (body.tenant_id ?? "").trim();
  if (!tenant_id) {
    return withCors(
      JSON.stringify({ error: "missing_tenant_id" }),
      { status: 400 },
      req,
    );
  }
  if (tenant_id !== tenantId) {
    return withCors(
      JSON.stringify({ error: "tenant_mismatch" }),
      { status: 403 },
      req,
    );
  }

  const title = (body.title ?? "").trim();
  const msgBody = (body.body ?? "").trim();
  if (!title || !msgBody) {
    return withCors(
      JSON.stringify({ error: "missing_title_or_body" }),
      { status: 400 },
      req,
    );
  }

  const sendToAll = !!body.send_to_all;
  const rawUserIds = Array.isArray(body.user_ids) ? body.user_ids : [];
  const userIds = rawUserIds
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (!sendToAll && userIds.length === 0) {
    return withCors(
      JSON.stringify({ error: "user_ids_required_when_send_to_all_false" }),
      { status: 400 },
      req,
    );
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // Load push tokens, restricted to this tenant
  let query = admin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("tenant_id", tenant_id)
    .eq("is_active", true);

  if (!sendToAll) {
    query = query.in("user_id", userIds);
  }

  const { data: tokens, error: tokenErr } = await query;
  if (tokenErr) {
    return withCors(
      JSON.stringify({ error: "token_query_failed", details: tokenErr.message }),
      { status: 500 },
      req,
    );
  }

  const expoTokens = (tokens ?? [])
    .map((t: any) => t.expo_push_token as string)
    .filter((t) => typeof t === "string" && t.length > 0);

  if (expoTokens.length === 0) {
    return withCors(
      JSON.stringify({ ok: true, message: "no_tokens_found", count: 0 }),
      { status: 200 },
      req,
    );
  }

  // Build Expo push messages
  const messages = expoTokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body: msgBody,
    data: body.data ?? {},
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

  return withCors(
    JSON.stringify({ ok: true, count: expoTokens.length }),
    { status: 200 },
    req,
  );
});
