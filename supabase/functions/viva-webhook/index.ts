import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okJson(extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

async function hmacSha256Hex(secret: string, body: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // ✅ Force a real ArrayBuffer (not SharedArrayBuffer) to satisfy TS + crypto.subtle
  const data = new Uint8Array(body).slice().buffer;

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

function parseMerchantTrns(merchantTrns: string | null | undefined) {
  const s = merchantTrns ?? "";
  const tenantMatch = s.match(/tenant=([0-9a-fA-F-]{36})/);
  const planMatch = s.match(/plan=([^;]+)/);
  return {
    tenant_id: tenantMatch?.[1] ?? null,
    plan_id: planMatch?.[1] ?? null,
  };
}

function addDaysISO(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const verificationKey = Deno.env.get("VIVA_WEBHOOK_VERIFICATION_KEY") ?? "";

  // Viva verification request
  if (req.method === "POST") {
    const bodyText = await req.text();

    if (bodyText === verificationKey) {
      return new Response(
        verificationKey,
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Re-create raw body for later signature verification
    req = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: bodyText,
    });
  }

  // ✅ Viva webhook URL verification can be GET/HEAD/OPTIONS and unsigned POST.
  // Return JSON 200 with no auth required.
  if (
    req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS"
  ) {
    return okJson({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS, HEAD",
      "Access-Control-Allow-Headers":
        "Content-Type, Viva-Signature-256, Viva-Delivery-Id",
    });
  }

  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const sig256 = req.headers.get("Viva-Signature-256") ?? "";

  // ✅ Viva sometimes verifies with unsigned POST (no signature). Accept & return 200 JSON.
  if (!sig256) return okJson();

  const secret = Deno.env.get("VIVA_WEBHOOK_SECRET") ?? "";
  if (!secret) return json(500, { error: "Missing VIVA_WEBHOOK_SECRET" });

  const deliveryId = req.headers.get("Viva-Delivery-Id") ??
    req.headers.get("Viva-Delivery-ID") ??
    "";

  // Read raw body once (used for signature + JSON parse)
  const raw = new Uint8Array(await req.arrayBuffer());

  const computed = await hmacSha256Hex(secret, raw);
  if (!timingSafeEqualHex(sig256.toLowerCase(), computed.toLowerCase())) {
    return json(401, { error: "Invalid signature" });
  }

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json(400, { error: "Invalid JSON payload" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(supabaseUrl, serviceKey);

  const eventId = deliveryId ||
    String(
      payload?.EventId ?? payload?.eventId ?? payload?.OrderCode ??
        crypto.randomUUID(),
    );

  // Idempotency (also helps with Viva retries)
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
    // Unique violation => already processed
    if ((insErr as any).code === "23505") {
      return json(200, { ok: true, duplicate: true });
    }
    return json(500, {
      error: "webhook_events insert failed",
      details: insErr.message,
    });
  }

  // Extract tenant/plan from MerchantTrns (we set this when creating the order)
  const merchantTrns = payload?.MerchantTrns ??
    payload?.merchantTrns ??
    payload?.Order?.MerchantTrns ??
    payload?.order?.merchantTrns;

  const { tenant_id, plan_id } = parseMerchantTrns(merchantTrns);

  if (!tenant_id || !plan_id) {
    await sb
      .from("payment_webhook_events")
      .update({
        processed_at: new Date().toISOString(),
        ok: false,
        error: "Missing tenant_id/plan_id in MerchantTrns",
      })
      .eq("id", eventRow.id);

    // Always 200 so Viva stops retrying; we already logged it.
    return json(200, { ok: true });
  }

  // Viva event type: your dashboard dropdown shows these ids:
  // 1796 = New Payment, 1798 = Transaction Failed, 1797 = Payment Reversal
  const eventTypeId = Number(
    payload?.EventTypeId ?? payload?.eventTypeId ?? payload?.EventType ?? 0,
  );

  const amountCents = Number(
    payload?.Amount ?? payload?.amount ?? payload?.Order?.Amount ?? 0,
  );
  const txnId = payload?.TransactionId ??
    payload?.transactionId ??
    payload?.OrderCode ??
    payload?.orderCode ??
    null;

  try {
    if (eventTypeId === 1796) {
      // ✅ Payment succeeded -> activate/renew for 30 days from today
      const periodStart = todayISO();
      const periodEnd = addDaysISO(30);

      await sb.from("tenant_payments").insert({
        tenant_id,
        plan_id,
        period_start: periodStart,
        period_end: periodEnd,
        amount_cents: amountCents,
        currency: "EUR",
        method: "card",
        provider: "viva",
        provider_txn_id: txnId ? String(txnId) : null,
        provider_event_id: eventId,
        raw_payload: payload,
      });

      const { error: rpcErr } = await sb.rpc("activate_tenant_subscription", {
        p_tenant_id: tenant_id,
        p_plan_id: plan_id,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });

      if (rpcErr) throw rpcErr;

      await sb
        .from("tenant_subscriptions")
        .update({
          last_payment_status: "succeeded",
          last_payment_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenant_id);
    } else if (eventTypeId === 1798) {
      // ✅ Payment failed -> past_due with 7-day grace (your DB fn)
      const { error: rpcErr } = await sb.rpc("set_tenant_past_due", {
        p_tenant_id: tenant_id,
      });
      if (rpcErr) throw rpcErr;

      await sb
        .from("tenant_subscriptions")
        .update({
          last_payment_status: "failed",
          last_payment_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenant_id);
    } else if (eventTypeId === 1797) {
      // ✅ Reversal/chargeback -> mark past_due immediately (safe default)
      const { error: rpcErr } = await sb.rpc("set_tenant_past_due", {
        p_tenant_id: tenant_id,
      });
      if (rpcErr) throw rpcErr;

      await sb
        .from("tenant_subscriptions")
        .update({
          last_payment_status: "reversed",
          last_payment_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenant_id);
    } else {
      // Unknown event type: log it, but don't fail webhook.
      // (Still mark processed ok so Viva stops retrying.)
    }

    await sb
      .from("payment_webhook_events")
      .update({
        processed_at: new Date().toISOString(),
        ok: true,
        tenant_id,
      })
      .eq("id", eventRow.id);

    return json(200, { ok: true });
  } catch (e: any) {
    await sb
      .from("payment_webhook_events")
      .update({
        processed_at: new Date().toISOString(),
        ok: false,
        tenant_id,
        error: e?.message ?? String(e),
      })
      .eq("id", eventRow.id);

    // Return 200 anyway to avoid endless retries; you can inspect payment_webhook_events.
    return json(200, { ok: true });
  }
});
