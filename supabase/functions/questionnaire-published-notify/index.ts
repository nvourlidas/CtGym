// supabase/functions/questionnaire-published-notify/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sendExpoPush(params: {
  admin: any;
  tenant_id: string;
  user_id: string; // auth/profile user id
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
    return { ok: false, sent: 0, error: error.message };
  }

  type PushTokenRow = {
    expo_push_token: string | null;
  };

  const tokenRows = (tokens ?? []) as PushTokenRow[];

  const expoTokens: string[] = tokenRows
    .map((row) => row.expo_push_token)
    .filter((token): token is string => !!token && token.length > 0);

  if (expoTokens.length === 0) {
    return { ok: true, sent: 0 };
  }

  const messages = expoTokens.map((token) => ({
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

    await fetch(expoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(chunk),
    });
  }

  return { ok: true, sent: expoTokens.length };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_json" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Supabase DB Webhook payload shape typically includes: record, old_record, type
  const record = payload?.record ?? null;
  const oldRecord = payload?.old_record ?? null;
  const eventType = payload?.type ?? payload?.eventType ?? null;

  if (!record) {
    return new Response(
      JSON.stringify({ ok: true, ignored: "no_record" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const tenant_id = String(record.tenant_id ?? "").trim();
  const questionnaire_id = String(record.id ?? "").trim();

  if (!tenant_id || !questionnaire_id) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_record_fields" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const oldStatus = String(oldRecord?.status ?? "").toLowerCase();
  const newStatus = String(record?.status ?? "").toLowerCase();

  const becamePublished =
    (eventType === "UPDATE" || eventType === "update" || !!oldRecord) &&
    oldStatus !== "published" &&
    newStatus === "published";

  const insertedPublished =
    (eventType === "INSERT" || eventType === "insert") &&
    newStatus === "published";

  if (!becamePublished && !insertedPublished) {
    return new Response(
      JSON.stringify({ ok: true, ignored: "not_published_transition" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const qTitle =
    String(record.title ?? record.name ?? "Νέο ερωτηματολόγιο");

  // 1) tenant members -> get linked auth/profile user ids
  const { data: members, error: mErr } = await admin
    .from("members")
    .select("id, user_id, role")
    .eq("tenant_id", tenant_id)
    .eq("role", "member");

  if (mErr) {
    return new Response(
      JSON.stringify({ ok: false, error: mErr.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const memberUserIds = Array.from(
    new Set(
      (members ?? [])
        .map((m: any) => String(m.user_id ?? "").trim())
        .filter((id: string) => id.length > 0),
    ),
  );

  if (memberUserIds.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, message: "no_members" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const notifTitle = "Νέο ερωτηματολόγιο";
  const notifBody =
    `Δημοσιεύτηκε: ${qTitle}. Άνοιξε την εφαρμογή για να το συμπληρώσεις.`;

  const notifData = {
    kind: "questionnaire_published",
    tenantId: tenant_id,
    questionnaireId: questionnaire_id,
    publishedAt: new Date().toISOString(),
  };

  // 2) store inbox notifications
  const nowIso = new Date().toISOString();
  const rows = memberUserIds.map((user_id: string) => ({
    tenant_id,
    user_id,
    title: notifTitle,
    body: notifBody,
    type: "questionnaire",
    data: notifData,
    sent_at: nowIso,
  }));

  const { error: insErr } = await admin
    .from("user_notifications")
    .insert(rows);

  if (insErr) {
    console.log("user_notifications insert error:", insErr.message);
  }

  // 3) push notifications
  let pushed = 0;
  for (const user_id of memberUserIds) {
    const res = await sendExpoPush({
      admin,
      tenant_id,
      user_id,
      title: notifTitle,
      body: notifBody,
      data: notifData,
    });

    if (res.ok) pushed += res.sent ?? 0;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      members: memberUserIds.length,
      inbox_ok: !insErr,
      pushed,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});