import { createServerFn } from "@tanstack/react-start";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const phoneOk = (p: string) => /^0[6-8]\d{8}$/.test(p);

// Public: only slot occupancy, no personal details.
export const getSlots = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await (await db()).from("bookings").select("id, branch, date, time");
  if (error) throw new Error(error.message);
  return data;
});

export const getMine = createServerFn({ method: "POST" })
  .inputValidator((i: { phone: string }) => { if (!phoneOk(i.phone)) throw new Error("bad phone"); return i; })
  .handler(async ({ data }) => {
    const { data: rows, error } = await (await db()).from("bookings").select("id, service, branch, date, time, name, phone, paid").eq("phone", data.phone).order("created_at");
    if (error) throw new Error(error.message);
    return rows;
  });

type Slot = { id: string; service: string; branch: string; date: string; time: string; name: string; phone: string; cap: number; skip?: string };
export const bookSlot = createServerFn({ method: "POST" })
  .inputValidator((i: Slot) => { if (!phoneOk(i.phone) || i.cap < 1 || i.cap > 5) throw new Error("invalid"); return i; })
  .handler(async ({ data: d }) => {
    const { data, error } = await (await db()).rpc("book_slot", { _id: d.id, _service: d.service, _branch: d.branch, _date: d.date, _time: d.time, _name: d.name, _phone: d.phone, _cap: d.cap, ...(d.skip ? { _skip: d.skip } : {}) });
    if (error) throw new Error(error.message);
    return { ok: data === true };
  });

export const payDeposit = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; phone: string }) => i)
  .handler(async ({ data }) => {
    const { error } = await (await db()).from("bookings").update({ paid: true }).eq("id", data.id).eq("phone", data.phone);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelBooking = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; phone: string }) => i)
  .handler(async ({ data }) => {
    const { error } = await (await db()).from("bookings").delete().eq("id", data.id).eq("phone", data.phone);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Simulated OTP delivery: the code is returned for on-screen display instead of a real SMS.
export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((i: { ref: string }) => ({ ref: i.ref.trim().toUpperCase().slice(0, 12) }))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: b } = await sb.from("bookings").select("phone").eq("id", data.ref).maybeSingle();
    if (!b) return { ok: false as const };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await sb.from("bookings").update({ otp_code: code, otp_expires: new Date(Date.now() + 5 * 60000).toISOString(), otp_attempts: 0 }).eq("id", data.ref);
    return { ok: true as const, masked: b.phone.slice(0, 3) + "****" + b.phone.slice(-3), code };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((i: { ref: string; code: string }) => ({ ref: i.ref.trim().toUpperCase().slice(0, 12), code: i.code.trim().slice(0, 6) }))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: b } = await sb.from("bookings").select("*").eq("id", data.ref).maybeSingle();
    if (!b || !b.otp_code) return { ok: false as const, reason: "Please request a new code." };
    if (b.otp_attempts >= 3) return { ok: false as const, reason: "Too many attempts. Request a new code." };
    if (new Date(b.otp_expires!) < new Date()) return { ok: false as const, reason: "Code expired. Request a new code." };
    if (b.otp_code !== data.code) {
      await sb.from("bookings").update({ otp_attempts: b.otp_attempts + 1 }).eq("id", data.ref);
      return { ok: false as const, reason: `Incorrect code. ${2 - b.otp_attempts} attempt(s) left.` };
    }
    await sb.from("bookings").update({ otp_code: null, otp_attempts: 0 }).eq("id", data.ref);
    return { ok: true as const, phone: b.phone };
  });
