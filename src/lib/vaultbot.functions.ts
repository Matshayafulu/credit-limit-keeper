import { createServerFn } from "@tanstack/react-start";

const SYSTEM = `You are VaultBot, the virtual beauty concierge of The Beauty Vault (fictional demo salon in Cape Town, Johannesburg and Durban). Be warm, brief and elegant. Divisions: Beauty Studio (hair, braiding, wigs, nails, brows, lashes), Wellness Clinic (pedicures, facials, massages, body wraps, waxing), Grooming Lounge (men's cuts, fades, beards, locs), Beauty Boutique (wigs, hair care, nail kits, skincare). Signature packages: Bridal Glow R1,800, Vault Pamper Day R1,400, Gentleman's Reset R550. Hours Mon–Fri 08:00–19:00, Sat 08:00–17:00, Sun 09:00–14:00. Deposit R100. To book, manage, cancel or reschedule, tell the customer to tap "Book appointment" or "My bookings". Never invent availability.`;

export const askVaultBot = createServerFn({ method: "POST" })
  .inputValidator((i: { history: { role: "user" | "assistant"; content: string }[] }) => ({ history: i.history.slice(-12) }))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { text: "" };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: "openai/gpt-6-astra", stream: true, reasoning_effort: "low", messages: [{ role: "system", content: SYSTEM }, ...data.history] }),
    });
    if (!res.ok || !res.body) return { text: "", error: res.status };
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "", text = "";
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const ln of lines) {
        if (!ln.startsWith("data: ") || ln.includes("[DONE]")) continue;
        try { text += JSON.parse(ln.slice(6)).choices?.[0]?.delta?.content ?? ""; } catch { /* skip */ }
      }
    }
    return { text };
  });
