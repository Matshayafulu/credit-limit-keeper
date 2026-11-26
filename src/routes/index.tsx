import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { askVaultBot } from "@/lib/vaultbot.functions";
import { getSlots, getMine, requestOtp, verifyOtp, bookSlot, payDeposit, cancelBooking, requestHuman } from "@/lib/bookings.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Beauty Vault — VaultBot Beauty Concierge" },
      { name: "description", content: "Chat with VaultBot to explore services and book salon appointments in Cape Town, Johannesburg and Durban." },
      { property: "og:title", content: "The Beauty Vault — VaultBot" },
      { property: "og:description", content: "Your Beauty. Your Time. Your Vault." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const SERVICES: Record<string, string[]> = {
  "Beauty Studio": ["Hair styling — R450", "Braiding — R650", "Gel nails — R320", "Eyelash extensions — R550", "Eyebrow lamination — R380"],
  "Wellness Clinic": ["Pedicure — R300", "Facial — R520", "Massage (60 min) — R600", "Body wrap — R480", "Waxing — from R150"],
  "Grooming Lounge": ["Men's haircut — R180", "Fade — R220", "Beard trim — R120", "Dreadlock maintenance — R400"],
  "Beauty Boutique": ["Human-hair wigs", "Hair care products", "Nail care kits", "Skincare"],
};
const PACKAGES = ["Bridal Glow — R1,800 (hair, makeup, nails)", "Vault Pamper Day — R1,400 (facial, massage, pedicure)", "Gentleman's Reset — R550 (cut, beard, facial)"];
const BRANCHES = ["Cape Town", "Johannesburg", "Durban"];
const TIMES = ["09:00", "10:30", "12:00", "14:00", "15:30"];

type Msg = { from: "bot" | "me"; text: string; chips?: string[] };
type Booking = { id: string; service: string; branch: string; date: string; time: string; name: string; phone: string; paid: boolean };
type Draft = Partial<Booking> & { step?: string; otp?: string; target?: string; after?: string };

const ALL = [...PACKAGES.map((p) => p.split(" — ")[0]!), ...Object.entries(SERVICES).filter(([k]) => k !== "Beauty Boutique").flatMap(([, v]) => v.map((s) => s.split(" — ")[0]!))];
const DUR: Record<string, string> = { "Hair styling": "60 min", Braiding: "3 h", "Gel nails": "60 min", "Eyelash extensions": "90 min", "Eyebrow lamination": "45 min", Pedicure: "45 min", Facial: "60 min", "Massage (60 min)": "60 min", "Body wrap": "75 min", Waxing: "30 min", "Men's haircut": "30 min", Fade: "40 min", "Beard trim": "20 min", "Dreadlock maintenance": "2 h", "Bridal Glow": "4 h", "Vault Pamper Day": "3 h", "Gentleman's Reset": "90 min" };
const DIVS: Record<string, string[]> = { ...Object.fromEntries(Object.entries(SERVICES).filter(([k]) => k !== "Beauty Boutique")), "Signature Packages": PACKAGES };
const DAYS = ["Today", "Tomorrow", "Saturday"];
const FAQ: [string, string][] = [
  ["late", "Arriving 15+ minutes late may shorten or reschedule your treatment."],
  ["refund", "Deposits are refundable if you cancel at least 24 hours before."],
  ["park", "Free parking is available at all three branches."],
  ["loyal", "Earn 1 Vault point per R10 spent (simulated); 500 points = R50 off."],
  ["product", "Boutique: human-hair wigs from R1,200, hair care from R150, nail kits R250, skincare from R180."],
];
let cache: { id: string; branch: string; date: string; time: string }[] = [];
const load = () => cache;
const refresh = async () => { try { cache = await getSlots(); } catch { /* keep last */ } };
// Internal demo staff rosters (not shown to customers): who works where, which days.
const STAFF: Record<string, { name: string; days: string[] }[]> = {
  "Cape Town": [{ name: "Ayesha", days: ["Today", "Tomorrow", "Saturday"] }, { name: "Liam", days: ["Today", "Saturday"] }],
  Johannesburg: [{ name: "Thandi", days: ["Today", "Tomorrow", "Saturday"] }, { name: "Sipho", days: ["Tomorrow"] }],
  Durban: [{ name: "Priya", days: ["Today", "Tomorrow"] }, { name: "Nomsa", days: ["Tomorrow", "Saturday"] }],
};
const dayTimes = (date?: string) => (date === "Saturday" ? TIMES.slice(0, 3) : TIMES);
const capacity = (d: Partial<Booking>) => (STAFF[d.branch ?? ""] ?? []).filter((x) => x.days.includes(d.date ?? "")).length;
const taken = (d: Partial<Booking>, skip?: string) => {
  const cap = capacity(d);
  const used = load().filter((b) => b.id !== skip && b.branch === d.branch && b.date === d.date).map((b) => b.time);
  return dayTimes(d.date).filter((t) => cap === 0 || used.filter((u) => u === t).length >= cap);
};
let session = "";
const MENU = ["Book appointment", "My bookings", "View services", "Packages", "FAQs", "Talk to a human"];

function Index() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "bot", text: "Welcome to The Beauty Vault ✨ I'm VaultBot, your beauty concierge. (Demo business data; payments and SMS are simulated.)", chips: MENU },
  ]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  const bot = (text: string, chips?: string[]) => setMsgs((m) => [...m, { from: "bot", text, ...(chips ? { chips } : {}) }]);
  const pick = (t: string, opts: string[]) => opts.find((o) => o.toLowerCase() === t.toLowerCase());

  async function listMine(phone: string) {
    const mine = (await getMine({ data: { token: session } })) as Booking[];
    setDraft({ phone, step: "manage" });
    if (!mine.length) return bot("No bookings found for this number.", MENU);
    bot(`⭐ Vault loyalty (simulated): ${mine.length * 50 + mine.filter((b) => b.paid).length * 10} points — 500 points = R50 off.`);
    bot(mine.map((b) => `#${b.id} ${b.service} — ${b.branch}, ${b.date} ${b.time} ${b.paid ? "(deposit paid)" : "(deposit due)"}`).join("\n"),
      mine.flatMap((b) => [`Cancel #${b.id}`, `Reschedule #${b.id}`]).concat("Menu"));
  }

  function handle(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setMsgs((m) => [...m, { from: "me", text: t }]);
    setInput("");
    const l = t.toLowerCase();
    const d: Draft = { ...draft };
    setTimeout(async () => { try {
      await refresh();
      if (l === "menu") { setDraft({}); return bot("How else can I help?", MENU); }
      switch (d.step) {
        case "division": {
          const v = pick(t, Object.keys(DIVS)); if (!v) return bot("Please choose a division.", Object.keys(DIVS));
          setDraft({ step: "service" });
          return bot(`${v}:\n` + DIVS[v]!.map((x) => `• ${x} · ${DUR[x.split(" — ")[0]!] ?? "60 min"}`).join("\n") + "\nWhich would you like?", DIVS[v]!.map((x) => x.split(" — ")[0]!));
        }
        case "service": { const v = pick(t, ALL); if (!v) return bot("Please choose a listed service.", ALL); setDraft({ ...d, service: v, step: "branch" }); return bot("Which branch?", BRANCHES); }
        case "branch": { const v = pick(t, BRANCHES); if (!v) return bot("Please choose a branch.", BRANCHES); setDraft({ ...d, branch: v, step: "date" }); return bot("Which day?", DAYS); }
        case "date": {
          const v = pick(t, DAYS); if (!v) return bot("Please choose a day.", DAYS);
          const free = dayTimes(v).filter((x) => !taken({ ...d, date: v }, d.target).includes(x));
          if (!free.length) return bot("That day is fully booked. Try another.", DAYS);
          setDraft({ ...d, date: v, step: "time" }); return bot(`Available at ${d.branch} on ${v}:`, free);
        }
        case "time": {
          const free = dayTimes(d.date).filter((x) => !taken(d, d.target).includes(x)); const v = pick(t, free);
          if (!v) return bot("That time isn't available.", free);
          if (d.target) { const r = await bookSlot({ data: { id: d.target, service: d.service!, branch: d.branch!, date: d.date!, time: v, name: d.name!, phone: d.phone!, cap: capacity(d), skip: d.target, token: session } }); if (!r.ok) return bot("That time was just taken. Pick another.", free.filter((x) => x !== v)); bot(`Rescheduled ✅ #${d.target} is now ${d.date} ${v}.\n${r.msg}`); return listMine(d.phone!); }
          setDraft({ ...d, time: v, step: "name" }); return bot("What name should I book under?");
        }
        case "name": if (t.length < 2) return bot("Please enter your name."); setDraft({ ...d, name: t, step: "phone" }); return bot("Your SA mobile number (e.g. 0821234567)?");
        case "h_reason": setDraft({ step: "h_contact", name: t }); return bot("Your SA mobile number so a consultant can call you back?");
        case "h_contact": {
          const hr = await requestHuman({ data: { reason: d.name!, contact: t.replace(/\s/g, "") } });
          if (!hr.ok) return bot("Please enter a valid SA mobile number, e.g. 0821234567.");
          setDraft({}); return bot("✅ Request logged. A consultant will call you within 1 business day (simulated). Urgent? Call 021 000 0000 (demo).", MENU);
        }
        case "lookup": {
          const r = await requestOtp({ data: { ref: t } });
          if (!r.ok) return bot(r.reason, MENU);
          setDraft({ step: "otp2", target: t.toUpperCase() });
          return bot(`📱 SIMULATED SMS to ${r.masked}: your Vault code is ${r.code}. It expires in 5 minutes (3 attempts).`);
        }
        case "otp2": {
          const r = await verifyOtp({ data: { ref: d.target!, code: t } });
          if (!r.ok) return bot(r.reason, r.reason.startsWith("Incorrect") ? undefined : MENU);
          session = r.token; return listMine("");
        }
        case "phone": {
          const ph = t.replace(/\s/g, ""); if (!/^0[6-8]\d{8}$/.test(ph)) return bot("Please enter a valid SA mobile number, e.g. 0821234567.");
          setDraft({ ...d, phone: ph, step: "review" });
          return bot(`Please review:\n• ${d.service}\n• ${d.branch}, ${d.date} at ${d.time}\n• ${d.name}, ${ph}\nDeposit: R100`, ["Confirm booking", "Menu"]);
        }
        case "review": {
          if (!l.startsWith("confirm")) return bot("Tap Confirm booking or Menu.", ["Confirm booking", "Menu"]);
          const b: Booking = { id: "BV" + String(Date.now()).slice(-5), service: d.service!, branch: d.branch!, date: d.date!, time: d.time!, name: d.name!, phone: d.phone!, paid: false };
          if (d.step === "review" && draft.step !== "review") return;
          setDraft({ step: "saving" });
          const r = await bookSlot({ data: { ...b, cap: capacity(b) } });
          if (r.token) session = r.token;
          if (r.msg) bot(r.msg);
          if (!r.ok) { setDraft({}); return bot("Sorry, that slot was just taken. Please start again.", ["Book appointment"]); }
          setDraft({ ...d, id: b.id, step: "pay" });
          return bot(`Booked ✅ Your reference is ${b.id} — keep it to manage your booking.  ${b.service} at ${b.branch}, ${b.date} ${b.time}, for ${b.name}. Pay the R100 deposit now?`, ["Pay deposit (simulated)", "Pay later"]);
        }
        case "pay":
          if (l.startsWith("pay deposit")) { const pr = await payDeposit({ data: { id: d.id!, token: session } }); setDraft({}); bot("💳 Simulated payment successful. Deposit received — see you soon!"); return bot(pr.msg, MENU); }
          setDraft({}); return bot("No problem — the deposit is due 24 hours before your visit.", MENU);
        case "manage": {
          const m = t.match(/^(cancel|reschedule) #(BV\d+)$/i); const b = m && ((await getMine({ data: { token: session } })) as Booking[]).find((x) => x.id === m[2]);
          if (!m || !b) break;
          if (m[1]!.toLowerCase() === "cancel") { const cr = await cancelBooking({ data: { id: b.id, token: session } }); bot(`Cancelled #${b.id}.${b.paid ? " Deposit refund simulated." : ""}\n${cr.msg}`); return listMine(d.phone!); }
          setDraft({ ...b, step: "date", target: b.id }); return bot(`New day for ${b.service}?`, DAYS);
        }
      }
      if (l.includes("book") && !l.includes("my")) { setDraft({ step: "division" }); return bot("Which division?", Object.keys(DIVS)); }
      if (l.includes("my booking") || l.includes("cancel") || l.includes("reschedul")) { setDraft({ step: "lookup" }); return bot("Please enter your booking reference (e.g. BV12345). I'll send a verification code to the number on the booking."); }
      if (l.includes("service") || l.includes("price")) return bot(Object.entries(SERVICES).map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n\n"), ["Book appointment"]);
      if (l.includes("package")) return bot("Signature packages:\n" + PACKAGES.map((p) => "• " + p).join("\n"), ["Book appointment"]);
      if (l.includes("human") || l.includes("agent")) { setDraft({ step: "h_reason" }); return bot("I'll connect you with a consultant. What's the reason?", ["Booking problem", "Payment question", "Complaint", "Product advice"]); }
      if (l.includes("hour") || l.includes("open")) return bot("Mon–Fri 08:00–19:00, Sat 08:00–17:00, Sun 09:00–14:00 at all branches.");
      if (l.includes("deposit") || l.includes("pay")) return bot("A R100 deposit secures your slot (simulated card/EFT); the balance is paid in salon.");
      const f = FAQ.find(([k]) => l.includes(k)); if (f) return bot(f[1], MENU);
      if (l.includes("faq")) return bot(FAQ.map(([, a]) => "• " + a).join("\n"), MENU);
      const hist = [...msgs, { from: "me", text: t }].slice(-12).map((m) => ({ role: m.from === "me" ? ("user" as const) : ("assistant" as const), content: m.text }));
      askVaultBot({ data: { history: hist } })
        .then((r) => bot(r.text || "I can help with bookings, rescheduling, services, packages, products, loyalty, hours and deposits.", MENU))
        .catch(() => bot("I can help with bookings, rescheduling, services, packages, products, loyalty, hours and deposits.", MENU));
    } catch { bot("Sorry, I couldn't reach our booking system. Please try again.", MENU); } }, 300);
  }

  return (
    <main className="min-h-screen bg-background flex flex-col items-center">
      <header className="w-full max-w-2xl px-5 pt-8 pb-4 text-center">
        <h1 className="font-display text-4xl tracking-wide text-foreground">The Beauty Vault</h1>
        <p className="mt-1 text-sm tracking-[0.2em] uppercase text-primary">Your Beauty. Your Time. Your Vault.</p>
        <Link to="/services" className="mt-2 inline-block text-xs underline text-muted-foreground">Services & packages</Link>
      </header>
      <section className="flex-1 w-full max-w-2xl flex flex-col bg-card border border-border sm:rounded-2xl shadow-[var(--shadow-soft)] overflow-hidden sm:mb-8">
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground grid place-items-center font-display">V</div>
          <div><p className="font-medium text-foreground">VaultBot</p><p className="text-xs text-muted-foreground">Your Virtual Beauty Concierge</p></div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-[60vh]">
          {msgs.map((m, i) => (
            <div key={i} className={m.from === "me" ? "flex justify-end" : ""}>
              <div className={`whitespace-pre-line max-w-[85%] text-sm leading-relaxed ${m.from === "me" ? "bg-foreground text-background rounded-2xl rounded-br-sm px-4 py-2" : "text-foreground"}`}>{m.text}</div>
              {m.chips && i === msgs.length - 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.chips.map((c) => <button key={c} onClick={() => handle(c)} className="text-xs px-3 py-1.5 rounded-full border border-primary text-foreground hover:bg-secondary transition">{c}</button>)}
                </div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handle(input); }} className="p-3 border-t border-border flex gap-2">
          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask VaultBot…" className="flex-1 bg-muted rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button className="rounded-full bg-primary text-primary-foreground px-5 text-sm font-medium">Send</button>
        </form>
      </section>
    </main>
  );
}
