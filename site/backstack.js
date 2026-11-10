/* make4yu back button: every pop-up, sheet and the website editor becomes a step in the browser's history,
   so the phone/browser Back button closes the top one instead of leaving the site.
   Loaded by the studio site / owner dashboard (index.html) and the client dashboard (client/index.html).
   Views (owner dashboard tabs, client workspaces) push their own steps; see admSync() in index.html. */
(function () {
  "use strict";
  if (window.BackStack) return;
  var stack = [], skip = 0, seq = 0;

  function open(close) {
    var id = ++seq;
    stack.push({ id: id, close: close });
    var st = Object.assign({}, history.state || {}, { bs: id });
    history.pushState(st, "", location.href);
    return id;
  }
  function closed(id) {
    var i = -1;
    for (var k = 0; k < stack.length; k++) if (stack[k].id === id) i = k;
    if (i < 0) return;
    var wasTop = i === stack.length - 1;
    stack.splice(i, 1);
    if (wasTop && history.state && history.state.bs === id) { skip++; history.back(); }
  }
  window.BackStack = { open: open, closed: closed, depth: function () { return stack.length; } };

  // Runs before any other popstate listener (this file loads first): Back while a pop-up is open closes it.
  addEventListener("popstate", function (e) {
    if (skip) { skip--; e.stopImmediatePropagation(); return; }
    var top = stack[stack.length - 1];
    if (top && !(e.state && e.state.bs === top.id)) {
      stack.pop();
      try { top.close(); } catch (err) {}
      e.stopImmediatePropagation();
    }
  });

  /* ---- pop-ups are found automatically, so no module needs to know about history ---- */
  var KINDS = [
    { sel: "#modalBg.open", close: function () { if (typeof window.closeModal === "function") window.closeModal(); else { var m = document.getElementById("modalBg"); if (m) m.classList.remove("open"); } } },
    { sel: ".upsell", close: function (el) { var x = el.querySelector(".up-x"); if (x) x.click(); else el.remove(); } },
    { sel: ".sh-modal", close: function (el) { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); } },
    { sel: "#dbModal", close: function (el) { el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); } },
    { sel: ".nwe-modal", close: function (el) { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); } },
    { sel: "#nwe", close: function () { var b = document.getElementById("nweBack"); if (b) b.click(); } }
  ];
  var tracked = new Map(); // element -> stack id

  function present(el, kind) { return el.isConnected && el.matches(kind.sel); }
  function scan() {
    tracked.forEach(function (v, el) {
      if (!present(el, v.kind)) { tracked.delete(el); closed(v.id); }
    });
    KINDS.forEach(function (kind) {
      document.querySelectorAll(kind.sel).forEach(function (el) {
        if (tracked.has(el)) return;
        var rec = { kind: kind, id: 0 };
        rec.id = open(function () {
          tracked.delete(el);
          kind.close(el);
          // it may refuse to close (e.g. "unpublished changes — leave?" → Cancel, or busy): keep it as a step
          setTimeout(function () { if (present(el, kind) && !tracked.has(el)) { var again = { kind: kind, id: 0 }; again.id = open(rec.closeFn); tracked.set(el, again); } }, 450);
        });
        rec.closeFn = stack[stack.length - 1].close;
        tracked.set(el, rec);
      });
    });
  }
  var queued = false;
  function later() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; scan(); }); }
  function start() {
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    scan();
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
