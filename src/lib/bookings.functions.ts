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
    const { data: rows, error } = await (await db()).from("bookings").select("*").eq("phone", data.phone).order("created_at");
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
