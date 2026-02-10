import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ENV = (Deno.env.get("VIVA_ENV") ?? "demo").toLowerCase();
const IS_PROD = ENV === "prod";

const VERIFICATION_KEY = ENV === "demo"
  ? (Deno.env.get("VIVA_DEMO_WEBHOOK_VERIFICATION_KEY") ?? "")
  : (Deno.env.get("VIVA_PROD_WEBHOOK_VERIFICATION_KEY") ?? "");

const WEBHOOK_SECRET = ENV === "demo"
  ? (Deno.env.get("VIVA_DEMO_WEBHOOK_SECRET") ?? "")
  : (Deno.env.get("VIVA_PROD_WEBHOOK_SECRET") ?? "");

function okJson(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function parseMerchantTrns(merchantTrns: string | null | undefined) {
  const s = merchantTrns ?? "";
  const tenantMatch = s.match(/tenant=([0-9a-fA-F-]{36})/);
  const planMatch = s.match(/plan=([^;]+)/);
  return {
    tenant_id: tenantMatch?.[1] ?? null,
    plan_id: planMatch?.[1] ?? null,
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function hmacHex(secret: string, body: Uint8Array, hash: "SHA-256" | "SHA-1") {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash },
    false,
    ["sign"],
  );

  // ✅ force real ArrayBuffer
  const data: ArrayBuffer = new Uint8Array(body).slice().buffer;

  const sig = await crypto.subtle.sign("HMAC", key, data);

  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req) => {
  // ✅ Viva URL verification
  if (req.method === "GET" || req.method === "HEAD") {
    return okJson({ key: VERIFICATION_KEY });
  }

  if (req.method !== "POST") return okJson({ ok: true });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(supabaseUrl, serviceKey);

  const raw = new Uint8Array(await req.arrayBuffer());

  // Viva signature headers (support both)
  const sig256 = req.headers.get("Viva-Signature-256") ?? "";
  const sig1 = req.headers.get("Viva-Signature") ?? "";
  const deliveryId =
    req.headers.get("Viva-Delivery-Id") ??
    req.headers.get("Viva-Delivery-ID") ??
    "";

  // Parse JSON
  let payload: any = null;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    await sb.from("payment_webhook_events").insert({
      provider: "viva",
      event_id: deliveryId || `invalid-json-${crypto.randomUUID()}`,
      raw: { rawText: new TextDecoder().decode(raw).slice(0, 5000) },
      ok: false,
      error: "Invalid JSON payload",
    });
    return okJson({ ok: true });
  }

  const eventId =
    deliveryId ||
    String(payload?.MessageId ?? payload?.EventId ?? payload?.eventId ?? crypto.randomUUID());

  // Idempotency row
  const { data: eventRow, error: insErr } = await sb
    .from("payment_webhook_events")
    .insert({
      provider: "viva",
      event_id: eventId,
      raw: payload,
      ok: false,
    })
    .select("id")
    .single();

  if (insErr) {
    if ((insErr as any).code === "23505") return okJson({ ok: true, duplicate: true });
    return okJson({ ok: true });
  }

  // Signature verify
  if (!WEBHOOK_SECRET) {
    await sb.from("payment_webhook_events").update({
      processed_at: new Date().toISOString(),
      ok: false,
      error: "Missing WEBHOOK_SECRET",
    }).eq("id", eventRow.id);
    return okJson({ ok: true });
  }

  const hasAnySig = !!sig256 || !!sig1;

  // If missing signature:
  // - DEMO: allow processing so you can keep testing
  // - PROD: do NOT process (but return 200 to stop retries)
  if (!hasAnySig) {
    const msg = "Missing Viva-Signature header(s)";
    await sb.from("payment_webhook_events").update({
      processed_at: new Date().toISOString(),
      ok: !IS_PROD, // demo true, prod false
      error: IS_PROD ? msg : null,
    }).eq("id", eventRow.id);

    if (IS_PROD) return okJson({ ok: true }); // do not process in prod
    // DEMO: continue processing without signature
  } else {
    let valid = false;

    if (sig256) {
      const computed256 = await hmacHex(WEBHOOK_SECRET, raw, "SHA-256");
      valid = timingSafeEqualHex(sig256.toLowerCase(), computed256.toLowerCase());
    } else if (sig1) {
      const computed1 = await hmacHex(WEBHOOK_SECRET, raw, "SHA-1");
      valid = timingSafeEqualHex(sig1.toLowerCase(), computed1.toLowerCase());
    }

    if (!valid) {
      await sb.from("payment_webhook_events").update({
        processed_at: new Date().toISOString(),
        ok: false,
        error: "Invalid signature",
      }).eq("id", eventRow.id);

      return okJson({ ok: true });
    }
  }

  // ✅ Viva details are inside EventData
  const ed = payload?.EventData ?? payload?.eventData ?? {};

  const merchantTrns =
    ed?.MerchantTrns ??
    ed?.merchantTrns ??
    payload?.MerchantTrns ??
    payload?.merchantTrns ??
    null;

  const { tenant_id, plan_id } = parseMerchantTrns(merchantTrns);

  if (!tenant_id || !plan_id) {
    await sb.from("payment_webhook_events").update({
      processed_at: new Date().toISOString(),
      ok: false,
      error: "Missing tenant_id/plan_id in MerchantTrns",
    }).eq("id", eventRow.id);

    return okJson({ ok: true });
  }

  const eventTypeId = Number(payload?.EventTypeId ?? payload?.eventTypeId ?? 0);

  // Amount is euros in your EventData -> cents
  const amountEuro = Number(ed?.Amount ?? ed?.amount ?? 0);
  const amountCents = Math.round(amountEuro * 100);

  const txnId =
    ed?.TransactionId ??
    ed?.transactionId ??
    ed?.OrderCode ??
    payload?.TransactionId ??
    payload?.OrderCode ??
    null;

  try {
    if (eventTypeId === 1796) {
      const periodStart = todayISO();
      const periodEnd = addDaysISO(30);

      const payIns = await sb.from("tenant_payments").insert({
        tenant_id,
        plan_id,
        period_start: periodStart,
        period_end: periodEnd,
        amount_cents: amountCents,
        currency: "EUR",
        method: "card",
        reference: txnId ? String(txnId) : null,
      });

      if (payIns.error) throw new Error(`tenant_payments insert failed: ${payIns.error.message}`);

      const { error: rpcErr } = await sb.rpc("activate_tenant_subscription", {
        p_tenant_id: tenant_id,
        p_plan_id: plan_id,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });
      if (rpcErr) throw rpcErr;
    } else if (eventTypeId === 1798 || eventTypeId === 1797) {
      const { error: rpcErr } = await sb.rpc("set_tenant_past_due", { p_tenant_id: tenant_id });
      if (rpcErr) throw rpcErr;
    }

    await sb.from("payment_webhook_events").update({
      processed_at: new Date().toISOString(),
      ok: true,
      tenant_id,
    }).eq("id", eventRow.id);

    return okJson({ ok: true });
  } catch (e: any) {
    await sb.from("payment_webhook_events").update({
      processed_at: new Date().toISOString(),
      ok: false,
      tenant_id,
      error: e?.message ?? String(e),
    }).eq("id", eventRow.id);

    return okJson({ ok: true });
  }
});
