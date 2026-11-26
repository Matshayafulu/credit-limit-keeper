import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";

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
const BRANCHES = ["Cape Town", "Johannesburg", "Durban"];
const TIMES = ["09:00", "10:30", "12:00", "14:00", "15:30"];

type Msg = { from: "bot" | "me"; text: string; chips?: string[] };
type Booking = { id: string; service: string; branch: string; date: string; time: string; name: string; phone: string; paid: boolean };
type Draft = Partial<Booking> & { step?: string; otp?: string; target?: string; after?: string };

const ALL = Object.entries(SERVICES).filter(([k]) => k !== "Beauty Boutique").flatMap(([, v]) => v.map((s) => s.split(" — ")[0]!));
const DAYS = ["Today", "Tomorrow", "Saturday"];
const FAQ: [string, string][] = [
  ["late", "Arriving 15+ minutes late may shorten or reschedule your treatment."],
  ["refund", "Deposits are refundable if you cancel at least 24 hours before."],
  ["park", "Free parking is available at all three branches."],
  ["loyal", "Earn 1 Vault point per R10 spent (simulated); 500 points = R50 off."],
  ["product", "Boutique: human-hair wigs from R1,200, hair care from R150, nail kits R250, skincare from R180."],
];
const load = (): Booking[] => JSON.parse(localStorage.getItem("vault-bookings") || "[]");
const save = (b: Booking[]) => localStorage.setItem("vault-bookings", JSON.stringify(b));
const taken = (d: Partial<Booking>, skip?: string) => load().filter((b) => b.id !== skip && b.branch === d.branch && b.date === d.date).map((b) => b.time);
const MENU = ["Book appointment", "My bookings", "View services", "FAQs", "Talk to a human"];

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

  function sendOtp(d: Draft, after: string) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setDraft({ ...d, step: "otp", otp, after });
    bot(`📱 Simulated SMS to ${d.phone}: your Vault code is ${otp}. Please enter it.`);
  }
  function listMine(phone: string) {
    const mine = load().filter((b) => b.phone === phone);
    setDraft({ phone, step: "manage" });
    if (!mine.length) return bot("No bookings found for this number.", MENU);
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
    setTimeout(() => {
      if (l === "menu") { setDraft({}); return bot("How else can I help?", MENU); }
      switch (d.step) {
        case "service": { const v = pick(t, ALL); if (!v) return bot("Please choose a listed service.", ALL); setDraft({ ...d, service: v, step: "branch" }); return bot("Which branch?", BRANCHES); }
        case "branch": { const v = pick(t, BRANCHES); if (!v) return bot("Please choose a branch.", BRANCHES); setDraft({ ...d, branch: v, step: "date" }); return bot("Which day?", DAYS); }
        case "date": {
          const v = pick(t, DAYS); if (!v) return bot("Please choose a day.", DAYS);
          const free = TIMES.filter((x) => !taken({ ...d, date: v }, d.target).includes(x));
          if (!free.length) return bot("That day is fully booked. Try another.", DAYS);
          setDraft({ ...d, date: v, step: "time" }); return bot(`Available at ${d.branch} on ${v}:`, free);
        }
        case "time": {
          const free = TIMES.filter((x) => !taken(d, d.target).includes(x)); const v = pick(t, free);
          if (!v) return bot("That time isn't available.", free);
          if (d.target) { save(load().map((b) => (b.id === d.target ? { ...b, date: d.date!, time: v } : b))); bot(`Rescheduled ✅ #${d.target} is now ${d.date} ${v}.`); return listMine(d.phone!); }
          setDraft({ ...d, time: v, step: "name" }); return bot("What name should I book under?");
        }
        case "name": if (t.length < 2) return bot("Please enter your name."); setDraft({ ...d, name: t, step: "phone" }); return bot("Your SA mobile number (e.g. 0821234567)?");
        case "phone": case "lookup": {
          const ph = t.replace(/\s/g, ""); if (!/^0[6-8]\d{8}$/.test(ph)) return bot("Please enter a valid SA mobile number, e.g. 0821234567.");
          return sendOtp({ ...d, phone: ph }, d.step === "phone" ? "book" : "list");
        }
        case "otp": {
          if (t !== d.otp) return bot("Incorrect code. Try again.");
          if (d.after === "list") return listMine(d.phone!);
          const b: Booking = { id: String(Date.now()).slice(-5), service: d.service!, branch: d.branch!, date: d.date!, time: d.time!, name: d.name!, phone: d.phone!, paid: false };
          if (taken(b).includes(b.time)) { setDraft({}); return bot("Sorry, that slot was just taken. Please start again.", ["Book appointment"]); }
          save([...load(), b]); setDraft({ ...d, id: b.id, step: "pay" });
          return bot(`Booked ✅ #${b.id}: ${b.service} at ${b.branch}, ${b.date} ${b.time}, for ${b.name}. Pay the R100 deposit now?`, ["Pay deposit (simulated)", "Pay later"]);
        }
        case "pay":
          if (l.startsWith("pay deposit")) { save(load().map((b) => (b.id === d.id ? { ...b, paid: true } : b))); setDraft({}); return bot("💳 Simulated payment successful. Deposit received — see you soon!", MENU); }
          setDraft({}); return bot("No problem — the deposit is due 24 hours before your visit.", MENU);
        case "manage": {
          const m = t.match(/^(cancel|reschedule) #(\d+)$/i); const b = m && load().find((x) => x.id === m[2] && x.phone === d.phone);
          if (!m || !b) break;
          if (m[1]!.toLowerCase() === "cancel") { save(load().filter((x) => x.id !== b.id)); bot(`Cancelled #${b.id}.${b.paid ? " Deposit refund simulated." : ""}`); return listMine(d.phone!); }
          setDraft({ ...b, step: "date", target: b.id }); return bot(`New day for ${b.service}?`, DAYS);
        }
      }
      if (l.includes("book") && !l.includes("my")) { setDraft({ step: "service" }); return bot("Which service would you like?", ALL); }
      if (l.includes("my booking") || l.includes("cancel") || l.includes("reschedul")) { setDraft({ step: "lookup" }); return bot("Enter the mobile number you booked with — I'll send a code."); }
      if (l.includes("service") || l.includes("price")) return bot(Object.entries(SERVICES).map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n\n"), ["Book appointment"]);
      if (l.includes("human") || l.includes("agent")) return bot("A consultant will contact you (simulated). Call us on 021 000 0000 (demo) Mon–Sat.", MENU);
      if (l.includes("hour") || l.includes("open")) return bot("Mon–Fri 08:00–19:00, Sat 08:00–17:00, Sun 09:00–14:00 at all branches.");
      if (l.includes("deposit") || l.includes("pay")) return bot("A R100 deposit secures your slot (simulated card/EFT); the balance is paid in salon.");
      const f = FAQ.find(([k]) => l.includes(k)); if (f) return bot(f[1], MENU);
      if (l.includes("faq")) return bot(FAQ.map(([, a]) => "• " + a).join("\n"), MENU);
      bot("I can help with bookings, rescheduling, services, products, loyalty, hours and deposits.", MENU);
    }, 300);
  }

  return (
    <main className="min-h-screen bg-background flex flex-col items-center">
      <header className="w-full max-w-2xl px-5 pt-8 pb-4 text-center">
        <h1 className="font-display text-4xl tracking-wide text-foreground">The Beauty Vault</h1>
        <p className="mt-1 text-sm tracking-[0.2em] uppercase text-primary">Your Beauty. Your Time. Your Vault.</p>
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
