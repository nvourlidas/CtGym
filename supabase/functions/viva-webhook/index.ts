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
  const billingOrderMatch = s.match(/billing_order_id=([0-9a-fA-F-]{36})/);

  return {
    tenant_id: tenantMatch?.[1] ?? null,
    plan_id: planMatch?.[1] ?? null,
    billing_order_id: billingOrderMatch?.[1] ?? null,
  };
}

async function hmacHex(
  secret: string,
  body: Uint8Array,
  hash: "SHA-256" | "SHA-1",
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash },
    false,
    ["sign"],
  );

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
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response(JSON.stringify({ key: VERIFICATION_KEY || "" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") return okJson({ ok: true });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(supabaseUrl, serviceKey);

  const raw = new Uint8Array(await req.arrayBuffer());

  const sig256 = req.headers.get("Viva-Signature-256") ?? "";
  const sig1 = req.headers.get("Viva-Signature") ?? "";
  const deliveryId = req.headers.get("Viva-Delivery-Id") ??
    req.headers.get("Viva-Delivery-ID") ??
    "";

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

  const eventId = deliveryId ||
    String(
      payload?.MessageId ?? payload?.EventId ?? payload?.eventId ??
        crypto.randomUUID(),
    );

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
    if ((insErr as any).code === "23505") {
      return okJson({ ok: true, duplicate: true });
    }
    return okJson({ ok: true });
  }

  if (!WEBHOOK_SECRET) {
    await sb.from("payment_webhook_events").update({
      processed_at: new Date().toISOString(),
      ok: false,
      error: "Missing WEBHOOK_SECRET",
    }).eq("id", eventRow.id);

    return okJson({ ok: true });
  }

  const ALLOW_UNSIGNED_WEBHOOKS =
    (Deno.env.get("VIVA_ALLOW_UNSIGNED_WEBHOOKS") ?? "false").toLowerCase() ===
      "true";

  const hasAnySig = !!sig256 || !!sig1;

  if (!hasAnySig) {
    const msg = "Missing Viva-Signature header(s)";

    if (!ALLOW_UNSIGNED_WEBHOOKS) {
      await sb.from("payment_webhook_events").update({
        processed_at: new Date().toISOString(),
        ok: false,
        error: msg,
      }).eq("id", eventRow.id);

      return okJson({ ok: true });
    }

    await sb.from("payment_webhook_events").update({
      processed_at: new Date().toISOString(),
      ok: true,
      error: null,
    }).eq("id", eventRow.id);
  } else {
    let valid = false;

    if (sig256) {
      const computed256 = await hmacHex(WEBHOOK_SECRET, raw, "SHA-256");
      valid = timingSafeEqualHex(
        sig256.toLowerCase(),
        computed256.toLowerCase(),
      );
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

  const ed = payload?.EventData ?? payload?.eventData ?? {};

  const merchantTrns = ed?.MerchantTrns ??
    ed?.merchantTrns ??
    payload?.MerchantTrns ??
    payload?.merchantTrns ??
    null;

  const { tenant_id, plan_id, billing_order_id } = parseMerchantTrns(
    merchantTrns,
  );

  if (!tenant_id || !plan_id) {
    await sb.from("payment_webhook_events").update({
      processed_at: new Date().toISOString(),
      ok: false,
      error: "Missing tenant_id/plan_id in MerchantTrns",
    }).eq("id", eventRow.id);

    return okJson({ ok: true });
  }

  const eventTypeId = Number(payload?.EventTypeId ?? payload?.eventTypeId ?? 0);

  const amountEuro = Number(ed?.Amount ?? ed?.amount ?? 0);
  const amountCents = Math.round(amountEuro * 100);

  const txnId = ed?.TransactionId ??
    ed?.transactionId ??
    ed?.OrderCode ??
    payload?.TransactionId ??
    payload?.OrderCode ??
    null;

  const txnRef = txnId ? String(txnId) : null;

  try {
    if (eventTypeId === 1796) {
      if (billing_order_id) {
        const { error: billingUpdErr } = await sb
          .from("tenant_billing_orders")
          .update({
            status: "paid",
            viva_transaction_id: txnRef,
          })
          .eq("id", billing_order_id);

        if (billingUpdErr) {
          throw new Error(
            `tenant_billing_orders paid update failed: ${billingUpdErr.message}`,
          );
        }
      } else if (txnRef) {
        await sb
          .from("tenant_billing_orders")
          .update({
            status: "paid",
            viva_transaction_id: txnRef,
          })
          .eq("viva_order_code", txnRef);
      }

      if (txnRef) {
        const { data: existingPayment, error: existingPaymentErr } = await sb
          .from("tenant_payments")
          .select("id")
          .eq("reference", txnRef)
          .maybeSingle();

        if (existingPaymentErr) {
          throw new Error(
            `tenant_payments duplicate precheck failed: ${existingPaymentErr.message}`,
          );
        }

        if (existingPayment) {
          await sb.from("payment_webhook_events").update({
            processed_at: new Date().toISOString(),
            ok: true,
            tenant_id,
          }).eq("id", eventRow.id);

          return okJson({ ok: true, duplicate_payment: true });
        }
      }

      const { data: subRows, error: rpcErr } = await sb.rpc(
        "activate_tenant_subscription",
        {
          p_tenant_id: tenant_id,
          p_plan_id: plan_id,
        },
      );

      if (rpcErr) throw rpcErr;

      const subRow = Array.isArray(subRows) ? subRows[0] : subRows;

      if (!subRow?.period_start || !subRow?.period_end) {
        throw new Error(
          "activate_tenant_subscription did not return period_start/period_end",
        );
      }

      const payIns = await sb.from("tenant_payments").insert({
        tenant_id,
        plan_id,
        period_start: subRow.period_start,
        period_end: subRow.period_end,
        amount_cents: amountCents,
        currency: "EUR",
        method: "card",
        reference: txnRef,
      });

      if (payIns.error) {
        throw new Error(
          `tenant_payments insert failed: ${payIns.error.message}`,
        );
      }

      const { error: subMetaErr } = await sb
        .from("tenant_subscriptions")
        .update({
          provider: "viva",
          viva_initial_transaction_id: txnRef,
          recurring_enabled: true,
          recurring_source_code: String(ed?.SourceCode ?? ""),
          last_payment_status: "paid",
          last_payment_at: new Date().toISOString(),
          next_renewal_attempt_at: null,
          renewal_retry_count: 0,
          renewal_last_error: null,
        })
        .eq("tenant_id", tenant_id);

      if (subMetaErr) {
        throw new Error(
          `tenant_subscriptions recurring update failed: ${subMetaErr.message}`,
        );
      }
    } else if (eventTypeId === 1798 || eventTypeId === 1797) {
      if (billing_order_id) {
        const { error: billingUpdErr } = await sb
          .from("tenant_billing_orders")
          .update({
            status: "failed",
            viva_transaction_id: txnRef,
          })
          .eq("id", billing_order_id);

        if (billingUpdErr) {
          throw new Error(
            `tenant_billing_orders failed update failed: ${billingUpdErr.message}`,
          );
        }
      } else if (txnRef) {
        await sb
          .from("tenant_billing_orders")
          .update({
            status: "failed",
            viva_transaction_id: txnRef,
          })
          .eq("viva_order_code", txnRef);
      }

      const { error: rpcErr } = await sb.rpc("set_tenant_past_due", {
        p_tenant_id: tenant_id,
      });

      if (rpcErr) throw rpcErr;

      const { error: subFailErr } = await sb
        .from("tenant_subscriptions")
        .update({
          last_payment_status: "failed",
          last_payment_at: new Date().toISOString(),
          next_renewal_attempt_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString(),
          renewal_last_error: "Webhook reported failed payment",
        })
        .eq("tenant_id", tenant_id);

      if (subFailErr) {
        throw new Error(
          `tenant_subscriptions failed-payment update failed: ${subFailErr.message}`,
        );
      }
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
