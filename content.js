(() => {
  const TAG = "range-datepicker-cell";
  const toISO = (sec) =>
    sec && !Number.isNaN(sec) ? new Date(sec * 1000).toISOString() : null;

  // Collect all ranges visible to THIS frame
  function collectFrame() {
    const arr = [];
    document
      .querySelectorAll(`${TAG}, [date-from][date-to]`)
      .forEach((el) => {
        const s = Number(el.getAttribute("date-from"));
        const e = Number(el.getAttribute("date-to")); // usually exclusive
        if (Number.isFinite(s) && Number.isFinite(e)) {
          arr.push({ startSec: s, endSec: e, frameUrl: location.href });
        }
      });
    return arr;
  }

  // Send results: child frames -> bg -> top; top frames handle directly.
  function post(entries) {
    if (!entries.length) return;
    if (window === window.top) {
      window.dispatchEvent(new CustomEvent("__pickerBatchLocal", { detail: entries }));
    } else {
      chrome.runtime?.sendMessage?.({ type: "pickerBatch", entries });
    }
  }

  // Debounced trigger to avoid spam
  const schedule = (() => {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(() => post(collectFrame()), 60);
    };
  })();

  // Initial scan
  schedule();

  // Re-scan on relevant DOM changes
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes") {
        const t = m.target;
        if (
          t?.getAttribute &&
          (t.tagName?.toLowerCase() === TAG ||
            m.attributeName === "date-from" ||
            m.attributeName === "date-to" ||
            (t.hasAttribute?.("date-from") && t.hasAttribute?.("date-to")))
        ) {
          schedule();
        }
      }
      m.addedNodes?.forEach((n) => {
        if (
          n.nodeType === 1 &&
          (n.tagName?.toLowerCase() === TAG ||
            (n.hasAttribute?.("date-from") && n.hasAttribute?.("date-to")))
        ) {
          schedule();
        }
      });
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["date-from", "date-to"]
  });

  // Also re-scan when users interact with the picker
  document.addEventListener(
    "click",
    (e) => {
      const host = (e.composedPath?.() || []).find(
        (n) => n?.tagName?.toLowerCase?.() === TAG
      );
      if (host) schedule();
    },
    true
  );

  // -------- Top-frame aggregator & logger --------
  if (window === window.top) {
    const counts = new Map(); // key = "start|end" (seconds) -> count

    function add(entries) {
      for (const { startSec, endSec } of entries) {
        const key = `${startSec}|${endSec}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      print();
    }

    function print() {
      const rows = [...counts.entries()]
        .map(([k, c]) => {
          const [s, e] = k.split("|").map(Number);
          return {
            startUTC: toISO(s),
            endExclusiveUTC: toISO(e),
            count: c
          };
        })
        .sort((a, b) => b.count - a.count);

      // Plain lines (what you asked for):
      console.group("[Datepicker] startUTC → endExclusiveUTC");
      rows.forEach((r) =>
        console.log(`${r.startUTC} → ${r.endExclusiveUTC}`)
      );
      console.groupEnd();

      // Nice to have: quick table & helper stash
      console.table(rows);
      window.__datepickerPairs = rows;
    }

    window.addEventListener("__pickerBatchLocal", (e) => add(e.detail));
    chrome.runtime?.onMessage?.addListener?.((msg) => {
      if (msg?.type === "pickerBatch" && Array.isArray(msg.entries)) add(msg.entries);
    });
  }
})();
