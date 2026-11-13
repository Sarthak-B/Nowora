// Creates the four D1 test clients (café, salon, builder, coach) once, and prints their dashboards and PINs.
//   node scripts/d1-seed.mjs https://make4yu.com      (or http://localhost:8788 for a local test)
const base = process.argv[2] || "http://localhost:8788";
let step = 0;
while (step !== null) {
  const r = await fetch(base + "/api/v2", { method: "POST", body: JSON.stringify({ action: "d1_seed_tests", step }) });
  const j = await r.json();
  if (!j.ok) { console.error(j.error); process.exit(1); }
  for (const c of j.clients) console.log(c.kind.padEnd(11), c.business.padEnd(20), base + c.dashboard, "PIN " + c.pin, "·", c.site, "·", c.visits, "visits ·", c.entries, "entries");
  step = j.next;
}
