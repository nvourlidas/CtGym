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
  type?: string; // optional
  data?: Record<string, unknown>;
};

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

async function resolveRecipientUserIds(
  admin: any,
  tenant_id: string,
  sendToAll: boolean,
  explicitUserIds: string[],
) {
  if (!sendToAll) return uniq(explicitUserIds);

  // ✅ Send-to-all: all non-admin users of this tenant
  // Assumption: profiles has tenant_id + role
  const { data, error } = await admin
    .from("profiles")
    .select("id, role")
    .eq("tenant_id", tenant_id);

  if (error) throw error;

  const ids =
    (data ?? [])
      .filter((r: any) => (r?.role ?? "") !== "admin") // exclude admins
      .map((r: any) => r.id as string)
      .filter((id: any) => typeof id === "string" && id.length > 0) ?? [];

  return uniq(ids);
}

async function insertInboxNotifications(params: {
  admin: any;
  tenant_id: string;
  userIds: string[];
  title: string;
  body: string;
  type?: string;
  data?: Record<string, unknown>;
}) {
  const { admin, tenant_id, userIds, title, body, type, data } = params;

  if (!userIds.length) return { inserted: 0 };

  const rows = userIds.map((uid) => ({
    tenant_id,
    user_id: uid,
    title,
    body,
    type: type ?? "info",
    data: data ?? {},
    // sent_at default exists, but we can set explicitly too:
    sent_at: new Date().toISOString(),
    read_at: null,
    archived_at: null,
  }));

  // chunk insert for safety
  const CHUNK = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await admin.from("user_notifications").insert(slice);
    if (error) throw error;
    inserted += slice.length;
  }

  return { inserted };
}

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
    return withCors(JSON.stringify({ error: "forbidden" }), { status: 403 }, req);
  }

  let body: SendPushPayload;
  try {
    body = (await req.json()) as SendPushPayload;
  } catch {
    return withCors(JSON.stringify({ error: "invalid_json" }), { status: 400 }, req);
  }

  const tenant_id = (body.tenant_id ?? "").trim();
  if (!tenant_id) {
    return withCors(JSON.stringify({ error: "missing_tenant_id" }), { status: 400 }, req);
  }
  if (tenant_id !== tenantId) {
    return withCors(JSON.stringify({ error: "tenant_mismatch" }), { status: 403 }, req);
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
  const explicitUserIds = rawUserIds
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (!sendToAll && explicitUserIds.length === 0) {
    return withCors(
      JSON.stringify({ error: "user_ids_required_when_send_to_all_false" }),
      { status: 400 },
      req,
    );
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // ✅ Resolve recipients first (for inbox)
  let recipientUserIds: string[] = [];
  try {
    recipientUserIds = await resolveRecipientUserIds(
      admin,
      tenant_id,
      sendToAll,
      explicitUserIds,
    );
  } catch (e: any) {
    return withCors(
      JSON.stringify({ error: "recipient_resolve_failed", details: e?.message ?? String(e) }),
      { status: 500 },
      req,
    );
  }

  // ✅ Save inbox notifications (even if no push tokens)
  let inserted = 0;
  try {
    const res = await insertInboxNotifications({
      admin,
      tenant_id,
      userIds: recipientUserIds,
      title,
      body: msgBody,
      type: body.type ?? "info",
      data: body.data ?? {},
    });
    inserted = res.inserted;
  } catch (e: any) {
    return withCors(
      JSON.stringify({ error: "inbox_insert_failed", details: e?.message ?? String(e) }),
      { status: 500 },
      req,
    );
  }

  // Load push tokens, restricted to this tenant
  let query = admin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("tenant_id", tenant_id)
    .eq("is_active", true);

  if (!sendToAll) {
    query = query.in("user_id", explicitUserIds);
  }
  // If sendToAll=true, we keep the existing behavior (all tokens for tenant)

  const { data: tokens, error: tokenErr } = await query;
  if (tokenErr) {
    // still return ok for inbox insertion, but report push failure
    return withCors(
      JSON.stringify({
        ok: true,
        inbox_saved: inserted,
        push_sent: 0,
        push_error: "token_query_failed",
        details: tokenErr.message,
      }),
      { status: 200 },
      req,
    );
  }

  const expoTokens = (tokens ?? [])
    .map((t: any) => t.expo_push_token as string)
    .filter((t) => typeof t === "string" && t.length > 0);

  // If no tokens -> inbox already saved
  if (expoTokens.length === 0) {
    return withCors(
      JSON.stringify({
        ok: true,
        inbox_saved: inserted,
        push_sent: 0,
        message: "no_tokens_found",
      }),
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
    JSON.stringify({
      ok: true,
      inbox_saved: inserted,
      push_sent: expoTokens.length,
      recipients: recipientUserIds.length,
    }),
    { status: 200 },
    req,
  );
});
