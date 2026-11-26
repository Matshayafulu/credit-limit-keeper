import { createServerFn } from "@tanstack/react-start";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const phoneOk = (p: string) => /^0[6-8]\d{8}$/.test(p);
const clean = (v: string, n: number) => v.replace(/[<>]/g, "").trim().slice(0, n);
const newToken = () => crypto.randomUUID();
type DB = Awaited<ReturnType<typeof db>>;

async function phoneFor(sb: DB, token: string) {
  if (!token) throw new Error("Please verify first.");
  const { data } = await sb.from("bookings").select("phone, session_expires").eq("session_token", token).maybeSingle();
  if (!data || new Date(data.session_expires!) < new Date()) throw new Error("Your verified session expired. Please verify again.");
  return data.phone;
}
async function notify(sb: DB, booking_id: string, kind: string, message: string) {
  await sb.from("notifications").insert({ booking_id, kind, message });
  return `📩 SIMULATED SMS: ${message}`;
}

// Public: slot occupancy only, no personal details.
export const getSlots = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await (await db()).from("bookings").select("id, branch, date, time");
  if (error) throw new Error("Could not load availability.");
  return data;
});

export const getMine = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => i)
  .handler(async ({ data }) => {
    const sb = await db(); const phone = await phoneFor(sb, data.token);
    const { data: rows } = await sb.from("bookings").select("id, service, branch, date, time, name, phone, paid").eq("phone", phone).order("created_at");
    return rows ?? [];
  });

type Slot = { id: string; service: string; branch: string; date: string; time: string; name: string; phone: string; cap: number; skip?: string; token?: string };
export const bookSlot = createServerFn({ method: "POST" })
  .inputValidator((i: Slot) => {
    if (i.cap < 1 || i.cap > 5 || !/^BV\d{5}$/.test(i.id)) throw new Error("invalid");
    return { ...i, name: clean(i.name, 60), service: clean(i.service, 60) };
  })
  .handler(async ({ data: d }) => {
    const sb = await db();
    let phone = d.phone;
    if (d.skip) phone = await phoneFor(sb, d.token ?? ""); else if (!phoneOk(phone) || d.name.length < 2) throw new Error("invalid");
    const { data, error } = await sb.rpc("book_slot", { _id: d.id, _service: d.service, _branch: d.branch, _date: d.date, _time: d.time, _name: d.name, _phone: phone, _cap: d.cap, ...(d.skip ? { _skip: d.skip } : {}) });
    if (error) {
      if (error.code === "23505") return { ok: false, msg: "" }; // duplicate submission
      throw new Error("Booking failed. Please try again.");
    }
    if (data !== true) return { ok: false, msg: "" };
    if (d.skip) return { ok: true, msg: await notify(sb, d.skip, "rescheduled", `Your booking ${d.skip} is now ${d.date} at ${d.time}.`) };
    const token = newToken();
    await sb.from("bookings").update({ session_token: token, session_expires: new Date(Date.now() + 15 * 60000).toISOString() }).eq("id", d.id);
    const msg = await notify(sb, d.id, "confirmation", `Confirmed: ${d.service}, ${d.branch}, ${d.date} ${d.time}. Ref ${d.id}. Reminder will be sent 24h before.`);
    return { ok: true, msg, token };
  });

export const payDeposit = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; token: string }) => i)
  .handler(async ({ data }) => {
    const sb = await db(); const phone = await phoneFor(sb, data.token);
    await sb.from("bookings").update({ paid: true }).eq("id", data.id).eq("phone", phone);
    return { msg: await notify(sb, data.id, "payment", `R100 deposit received for ${data.id}. +10 loyalty points.`) };
  });

export const cancelBooking = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; token: string }) => i)
  .handler(async ({ data }) => {
    const sb = await db(); const phone = await phoneFor(sb, data.token);
    const msg = await notify(sb, data.id, "cancellation", `Booking ${data.id} has been cancelled.`);
    await sb.from("bookings").delete().eq("id", data.id).eq("phone", phone);
    return { msg };
  });

// Simulated OTP delivery: the code is returned for on-screen display instead of a real SMS.
export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((i: { ref: string }) => ({ ref: clean(i.ref, 12).toUpperCase() }))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: b } = await sb.from("bookings").select("phone, otp_sent_at").eq("id", data.ref).maybeSingle();
    if (!b) return { ok: false as const, reason: "I couldn't find that booking reference. Please check it (e.g. BV12345)." };
    if (b.otp_sent_at && Date.now() - new Date(b.otp_sent_at).getTime() < 30000) return { ok: false as const, reason: "A code was just sent. Please wait 30 seconds before requesting another." };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await sb.from("bookings").update({ otp_code: code, otp_expires: new Date(Date.now() + 5 * 60000).toISOString(), otp_attempts: 0, otp_sent_at: new Date().toISOString() }).eq("id", data.ref);
    return { ok: true as const, masked: b.phone.slice(0, 3) + "****" + b.phone.slice(-3), code };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((i: { ref: string; code: string }) => ({ ref: clean(i.ref, 12).toUpperCase(), code: clean(i.code, 6) }))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: b } = await sb.from("bookings").select("otp_code, otp_attempts, otp_expires").eq("id", data.ref).maybeSingle();
    if (!b || !b.otp_code) return { ok: false as const, reason: "Please request a new code." };
    if (b.otp_attempts >= 3) return { ok: false as const, reason: "Too many attempts. Request a new code." };
    if (new Date(b.otp_expires!) < new Date()) return { ok: false as const, reason: "Code expired. Request a new code." };
    if (b.otp_code !== data.code) {
      await sb.from("bookings").update({ otp_attempts: b.otp_attempts + 1 }).eq("id", data.ref);
      return { ok: false as const, reason: `Incorrect code. ${2 - b.otp_attempts} attempt(s) left.` };
    }
    const token = newToken();
    await sb.from("bookings").update({ otp_code: null, otp_attempts: 0, session_token: token, session_expires: new Date(Date.now() + 15 * 60000).toISOString() }).eq("id", data.ref);
    return { ok: true as const, token };
  });

export const requestHuman = createServerFn({ method: "POST" })
  .inputValidator((i: { reason: string; contact: string }) => ({ reason: clean(i.reason, 500), contact: clean(i.contact, 20) }))
  .handler(async ({ data }) => {
    if (!phoneOk(data.contact) || data.reason.length < 3) return { ok: false };
    await (await db()).from("support_requests").insert(data);
    return { ok: true };
  });
