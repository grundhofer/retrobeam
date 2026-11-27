// sb-feedback.js: feedback from inside the product (Blueprint parts/feedback, NAV-12, EIN-07). Classic script (pages
// open from file://), CSP-safe: no inline handlers, no eval, styles only through classes and the CSSOM.
// A bug, a wish or a question becomes a public issue of the product, without an account, through the feedback
// service (POST <endpoint>/v1/feedback, multipart: product, kind, text, context, image[], challenge, nonce).
// Markup (the words are the product's; see the specimen on components.html):
//   a trigger [data-sb-feedback-open="<id>"], e.g. the item „Rückmeldung geben“ of the „Mehr“ menu; an optional
//   data-sb-feedback-text="<sentence>" fills the text (an error page names its error there)
//   dialog.sb-feedback#<id> with data-sb-feedback-product="<id of sebaro.product.json>",
//     data-sb-feedback-endpoint="https://…" (or data-sb-demo="ok" | "fail" on a page without a service),
//     optional data-sb-feedback-version, data-sb-feedback-commit, and data-sb-feedback-pictures="off" for a product
//     with sensitive data (TEC-12: no picture at all)
//     form > .sb-feedback__head (title, [data-sb-feedback-close]), fieldset.sb-feedback__kinds (radios name="kind"
//     value fehler | wunsch | frage), .sb-feedback__write (textarea name="text" required in an sb-field,
//     ul.sb-feedback__pictures with a <template data-sb-feedback-picture> of one li, button [data-sb-feedback-add],
//     details.sb-feedback__context with dd[data-sb-feedback-context="<key>"], p.sb-feedback__note,
//     p.sb-feedback__message, the submit .sb-primary-action with __label and __bar), then .sb-feedback__done[hidden]
//     with a[data-sb-feedback-issue] (its [data-sb-feedback-issue-number] gets the number) and the heading
//     .sb-feedback__done-title[tabindex="-1"]
//   dialog.sb-feedback-editor (one per page) with canvas, buttons [data-sb-feedback-tool="redact" | "mark"]
//     (aria-pressed), [data-sb-feedback-undo], [data-sb-feedback-drop], [data-sb-feedback-apply]
// Flow
//   open: from 40em a non-modal panel at the bottom end (the page stays usable), below a modal sheet that starts at
//     step 1 (the kind; choosing one goes to step 2, [data-sb-feedback-back] goes back). Focus returns to the trigger
//     on close; Escape closes the panel too.
//   picture: the page as it was when the form opened, drawn into a canvas from the page's own markup and styles
//     (SVG foreignObject; no getDisplayMedia, which asks for permission and cannot black anything out). Every element
//     with data-sb-private (and the feedback dialogs) is hidden in the copy AND covered with an opaque black box at its
//     place, so nothing of it reaches the picture. A picture goes along only after the person has looked at it in the
//     editor („Übernehmen“: data-sb-state="seen"); before that it stays in the list but is not sent. If the browser
//     cannot draw the page (a tainted canvas), there is no picture and „Bild hinzufügen“ stays. At most three; an
//     added file is decoded and drawn anew too. Every picture leaves as a new PNG (WebP, smaller, when the PNG is over
//     5 MB) from a canvas: no metadata goes along.
//   send: only the text is required (an empty one gets „<label> fehlt.“ under the field). The script asks the service
//     for a challenge, finds a nonce so that SHA-256("<challenge>:<nonce>") starts with `difficulty` zero bits, and
//     posts. 201: the done part with the issue's link replaces the form and takes focus. 403 (an old challenge) is
//     tried once more with a new one; 422, 429 and failures keep every entry and say why before the button.
//   context (what goes along by itself, readable before sending): version, commit, view (data-sb-view of the
//     trigger's view, else the page's path), platform "web", browser and os (name and major version only), viewport,
//     theme, locale, motion, and recentErrors (the messages of the last five uncaught errors, at most 200 characters
//     each, no stack).
// Messages follow the language of the dialog (closest [lang], else <html lang>): German default, English built in;
// window.sbMessages = { "sb-feedback": { fr: { … } } } before this script adds one (D87).
(function () {
  var MESSAGES = {
    de: {
      busy: "Wird gesendet …", retry: "Noch mal versuchen", missing: "{field} fehlt.",
      offline: "Keine Verbindung. Dein Text ist noch da; versuch es gleich noch einmal.",
      failed: "Senden hat nicht geklappt. Dein Text ist noch da.",
      tooMany: "Gerade kamen zu viele Rückmeldungen an. Dein Text ist noch da; versuch es in einer Stunde noch einmal.",
      refused: "Der Dienst hat die Rückmeldung nicht angenommen. Prüf den Text und die Bilder.",
      big: "Das Bild ist zu groß, auch verkleinert. Lass es weg oder wähl ein anderes.",
      full: "Mehr als drei Bilder gehen nicht mit."
    },
    en: {
      busy: "Sending …", retry: "Try again", missing: "{field} is missing.",
      offline: "No connection. Your text is still here; try again in a moment.",
      failed: "Sending did not work. Your text is still here.",
      tooMany: "Too much feedback arrived just now. Your text is still here; try again in an hour.",
      refused: "The service did not accept the feedback. Check the text and the pictures.",
      big: "The picture is too large, even made smaller. Leave it out or choose another.",
      full: "No more than three pictures can go along."
    }
  };
  var extra = window.sbMessages && window.sbMessages["sb-feedback"];
  if (extra) Object.keys(extra).forEach(function (l) { MESSAGES[l.toLowerCase()] = extra[l]; });
  function lang(el) {
    var holder = el && el.closest("[lang]");
    return ((holder || document.documentElement).getAttribute("lang") || "de").toLowerCase();
  }
  function t(el, key) {
    var l = lang(el);
    var table = MESSAGES[l] || MESSAGES[l.split("-")[0]] || MESSAGES.de;
    return table[key] != null ? table[key] : MESSAGES.de[key];
  }
  function icon(href, cls) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", cls || "sb-icon sb-icon--16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var use = document.createElementNS(ns, "use");
    use.setAttribute("href", href); svg.appendChild(use);
    return svg;
  }

  var MAX_PICTURES = 3, MAX_BYTES = 5 * 1024 * 1024;
  var WIDE = "(min-width: 40em)";

  // ------------------------------------------------------------------ recent errors (messages only, no stack)
  var errors = [];
  function remember(message) {
    if (!message) return;
    errors.push(String(message).slice(0, 200));
    if (errors.length > 5) errors.shift();
  }
  window.addEventListener("error", function (e) { remember(e.message); });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason; remember(r && r.message ? r.message : r);
  });

  // ------------------------------------------------------------------ context
  function browserOs() {
    var ua = navigator.userAgent, b = "", o = "";
    var m = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/);
    if (m) b = ({ Edg: "Edge", OPR: "Opera", Version: "Safari" }[m[1]] || m[1]) + " " + m[2];
    if (/Android/.test(ua)) o = "Android"; else if (/iPhone|iPad/.test(ua)) o = "iOS";
    else if (/Mac OS X/.test(ua)) o = "macOS"; else if (/Windows/.test(ua)) o = "Windows"; else if (/Linux/.test(ua)) o = "Linux";
    return { browser: b, os: o };
  }
  function theme() {
    var root = document.documentElement, set = root.getAttribute("data-theme");
    var mode = set || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var tone = root.getAttribute("data-sb-tone");
    return tone ? mode + " " + tone : mode;
  }
  function context(dialog, opener) {
    var view = opener && opener.closest("[data-sb-view]");
    var bo = browserOs();
    var reduce = document.documentElement.getAttribute("data-sb-motion") === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var c = {
      version: dialog.getAttribute("data-sb-feedback-version") || "",
      commit: dialog.getAttribute("data-sb-feedback-commit") || "",
      view: view ? view.getAttribute("data-sb-view") : location.pathname,
      platform: "web", browser: bo.browser, os: bo.os,
      viewport: window.innerWidth + "×" + window.innerHeight,
      theme: theme(), locale: lang(dialog), motion: reduce ? "reduce" : "no-preference",
      recentErrors: errors.slice()
    };
    dialog.querySelectorAll("[data-sb-feedback-context]").forEach(function (dd) {
      var key = dd.getAttribute("data-sb-feedback-context");
      var value = key === "recentErrors" ? c.recentErrors.join(" · ") : c[key];
      var row = [dd, dd.previousElementSibling && dd.previousElementSibling.tagName === "DT" ? dd.previousElementSibling : null];
      row.forEach(function (el) { if (el) el.hidden = !value; });
      dd.textContent = value || "";
    });
    return c;
  }

  // ------------------------------------------------------------------ picture of the page
  function toDataUrl(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    });
  }
  function sameOrigin(url) {
    // a page from file:// cannot fetch its files (and would log an error): there images and fonts stay out of the picture
    try { var u = new URL(url, location.href); return /^https?:$/.test(u.protocol) && u.origin === location.origin; }
    catch (e) { return false; }
  }
  // the page's CSS as text, its url() resources inlined (fonts, images); rules of a foreign sheet are not readable
  function styles() {
    var jobs = Array.prototype.map.call(document.styleSheets, function (sheet) {
      var text = "";
      try { text = Array.prototype.map.call(sheet.cssRules, function (r) { return r.cssText; }).join("\n"); }
      catch (e) { return Promise.resolve(""); }
      var base = sheet.href || location.href;
      var urls = [];
      text.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, function (all, q, u) { if (!/^(data:|#)/.test(u)) urls.push(u); return all; });
      return Promise.all(urls.map(function (u) {
        var abs = new URL(u, base).href;
        if (!sameOrigin(abs)) return Promise.resolve([u, null]);
        return toDataUrl(abs).then(function (d) { return [u, d]; }, function () { return [u, null]; });
      })).then(function (pairs) {
        pairs.forEach(function (p) { if (p[1]) text = text.split(p[0]).join(p[1]); });
        return text;
      });
    });
    return Promise.all(jobs).then(function (parts) { return parts.join("\n"); });
  }
  function privateBoxes() {
    var boxes = [];
    document.querySelectorAll("[data-sb-private]").forEach(function (el) {
      Array.prototype.forEach.call(el.getClientRects(), function (r) {
        if (r.width > 0 && r.height > 0) boxes.push([r.left, r.top, r.width, r.height]);
      });
    });
    return boxes;
  }
  function capture() {
    var w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var boxes = privateBoxes(), sx = window.scrollX, sy = window.scrollY;   // now, before anything can scroll
    var root = document.documentElement;
    var copy = root.cloneNode(true);
    // the clone has the same elements in the same order: pair them before anything in the copy changes
    var live = root.querySelectorAll("*"), mirror = copy.querySelectorAll("*"), swaps = [];
    var probe = document.createElement("div");
    probe.style.cssText = "position:absolute;top:-999px;inline-size:100px;block-size:100px;overflow:scroll";
    document.body.appendChild(probe);
    var overlayBars = probe.offsetWidth - probe.clientWidth === 0;   // the page's scroll boxes take no room
    probe.remove();
    Array.prototype.forEach.call(live, function (el, i) {
      var c = mirror[i];
      if (!c) return;
      var tag = el.tagName;
      if (tag === "CANVAS") {                 // its pixels as an image of the same box
        var img = document.createElement("img"), r0 = el.getBoundingClientRect();
        try { img.src = el.toDataURL(); } catch (e) { /* a tainted canvas stays empty */ }
        img.className = el.getAttribute("class") || "";
        img.setAttribute("style", "width:" + r0.width + "px !important;height:" + r0.height + "px !important");
        swaps.push([c, img]);
        return;
      }
      if (tag === "TEXTAREA") c.textContent = el.value;
      else if (tag === "SELECT") Array.prototype.forEach.call(c.options, function (o, k) { if (el.options[k] && el.options[k].selected) o.setAttribute("selected", ""); });
      else if (tag === "INPUT") {
        if (el.type === "checkbox" || el.type === "radio") { if (el.checked) c.setAttribute("checked", ""); else c.removeAttribute("checked"); }
        else c.setAttribute("value", el.value);
      } else if (/^(IMG|VIDEO|IFRAME|OBJECT|EMBED)$/.test(tag)) {
        // replaced elements keep the box they have now: a lazy image the page has not loaded yet would otherwise
        // take its full size in the copy and push everything below it out of place
        var r = el.getBoundingClientRect();
        c.removeAttribute("loading");
        c.style.setProperty("width", r.width + "px", "important");
        c.style.setProperty("height", r.height + "px", "important");
        if (tag !== "IMG") { var box = document.createElement("div"); box.setAttribute("style", c.getAttribute("style")); swaps.push([c, box]); }
      }
      var cs = getComputedStyle(el), pos = cs.position;
      // every block keeps the size it has now: the copy's text may break a little differently, and without this a
      // line more here or there would add up down the page
      if (cs.display !== "inline" && cs.display !== "contents" && cs.display !== "none" && !/^(HTML|BODY|svg)$/i.test(tag) && !(el instanceof SVGElement)) {
        var rb = el.getBoundingClientRect();
        c.style.setProperty("box-sizing", "border-box", "important");
        c.style.setProperty("height", rb.height + "px", "important");
        c.style.setProperty("min-height", "0", "important");
        c.style.setProperty("max-height", "none", "important");
        if (cs.display !== "table-row" && cs.display !== "table-cell") c.style.setProperty("width", rb.width + "px", "important");
      }
      if (pos === "fixed") {
        // the copy is moved by the scroll offset; a fixed element goes to its place in the window
        var rf = el.getBoundingClientRect();
        c.style.setProperty("position", "absolute", "important");
        c.style.setProperty("inset", "auto", "important");
        c.style.setProperty("top", (rf.top + sy) + "px", "important");
        c.style.setProperty("left", (rf.left + sx) + "px", "important");
        c.style.setProperty("width", rf.width + "px", "important");
      } else if (pos === "sticky") {
        // stuck now: the copy has no scrolling, so it is moved by what sticking moved it
        var stuck = el.getBoundingClientRect(), keep = el.style.position;
        el.style.position = "static";
        var flow = el.getBoundingClientRect();
        el.style.position = keep;
        c.style.setProperty("position", "relative", "important");
        c.style.setProperty("inset", "auto", "important");
        c.style.setProperty("top", (stuck.top - flow.top) + "px", "important");
        c.style.setProperty("left", (stuck.left - flow.left) + "px", "important");
      }
      if ((el.scrollTop || el.scrollLeft) && el !== document.scrollingElement && el !== document.body) {
        // a scrolled box: its children move by its scroll offset, the box clips them
        Array.prototype.forEach.call(c.children, function (k) {
          k.style.setProperty("translate", (-el.scrollLeft) + "px " + (-el.scrollTop) + "px", "important");
        });
      }
    });
    swaps.forEach(function (s) { s[0].replaceWith(s[1]); });
    copy.querySelectorAll("script, dialog.sb-feedback, dialog.sb-feedback-editor, [data-sb-feedback-skip], noscript").forEach(function (el) { el.remove(); });
    copy.querySelectorAll("[data-sb-private]").forEach(function (el) { el.style.setProperty("visibility", "hidden", "important"); });
    var images = Array.prototype.filter.call(copy.querySelectorAll("img[src]"), function (img) { return !/^data:/.test(img.getAttribute("src")); });
    var jobs = images.map(function (img) {
      var abs = new URL(img.getAttribute("src"), location.href).href;
      img.removeAttribute("srcset");
      if (!sameOrigin(abs)) { img.removeAttribute("src"); return Promise.resolve(); }
      return toDataUrl(abs).then(function (d) { img.setAttribute("src", d); }, function () { img.removeAttribute("src"); });
    });
    return Promise.all(jobs).then(styles).then(function (css) {
      var head = copy.querySelector("head");
      if (head) head.querySelectorAll("link, style").forEach(function (el) { el.remove(); });
      var style = document.createElement("style");
      style.textContent = css + (overlayBars ? "\n* { scrollbar-width: none !important; }" : "");
      (head || copy).appendChild(style);
      copy.setAttribute("style", "transform: translate(" + (-sx) + "px, " + (-sy) + "px)");
      var attrs = Array.prototype.map.call(root.attributes, function (a) {
        return a.name === "style" || a.name === "xmlns" ? "" : " " + a.name + '="' + a.value.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"';
      }).join("");
      var html = new XMLSerializer().serializeToString(copy);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg"' + attrs + ' width="' + w + '" height="' + h + '">' +
        '<foreignObject x="0" y="0" width="100%" height="100%">' + html + "</foreignObject></svg>";
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error("draw")); };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      });
    }).then(function (img) {
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000000";
      boxes.forEach(function (b) { ctx.fillRect(Math.floor(b[0] * dpr), Math.floor(b[1] * dpr), Math.ceil(b[2] * dpr) + 1, Math.ceil(b[3] * dpr) + 1); });
      ctx.getImageData(0, 0, 1, 1);          // throws on a tainted canvas: then there is no picture
      return canvas;
    });
  }
  function fromFile(file) {
    return createImageBitmap(file).then(function (bitmap) {
      var canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      return canvas;
    });
  }
  function blob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
  }
  // a new PNG, else a WebP, else smaller: no metadata, at most 5 MB
  function encode(canvas, scale) {
    scale = scale || 1;
    var c = canvas;
    if (scale < 1) {
      c = document.createElement("canvas");
      c.width = Math.round(canvas.width * scale); c.height = Math.round(canvas.height * scale);
      c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
    }
    return blob(c, "image/png").then(function (png) {
      if (png && png.size <= MAX_BYTES) return png;
      return blob(c, "image/webp", 0.9).then(function (webp) {
        if (webp && webp.type === "image/webp" && webp.size <= MAX_BYTES) return webp;
        if (scale < 0.3) return null;
        return encode(canvas, scale * 0.75);
      });
    });
  }

  // ------------------------------------------------------------------ the editor
  var editing = null;   // { item, base canvas, boxes: [{tool, x, y, w, h}], tool }
  function editor() { return document.querySelector("dialog.sb-feedback-editor"); }
  function paint() {
    var ed = editor(), stage = ed && ed.querySelector("canvas");
    if (!stage || !editing) return;
    var base = editing.base;
    stage.width = base.width; stage.height = base.height;
    var ctx = stage.getContext("2d");
    ctx.drawImage(base, 0, 0);
    editing.boxes.forEach(function (b) { draw(ctx, b, base.width); });
  }
  function draw(ctx, b, width) {
    var x = Math.min(b.x, b.x + b.w), y = Math.min(b.y, b.y + b.h), w = Math.abs(b.w), h = Math.abs(b.h);
    if (b.tool === "redact") { ctx.fillStyle = "#000000"; ctx.fillRect(x, y, w, h); }
    else {
      var line = Math.max(3, Math.round(width / 400));
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--sb-color-warning").trim() || "#BE5A0A";
      ctx.lineWidth = line; ctx.strokeRect(x, y, w, h);
    }
  }
  function flatten() {
    var c = document.createElement("canvas");
    c.width = editing.base.width; c.height = editing.base.height;
    var ctx = c.getContext("2d");
    ctx.drawImage(editing.base, 0, 0);
    editing.boxes.forEach(function (b) { draw(ctx, b, c.width); });
    return c;
  }
  function setTool(tool) {
    var ed = editor();
    editing.tool = tool;
    ed.querySelectorAll("[data-sb-feedback-tool]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-sb-feedback-tool") === tool));
    });
  }
  function openEditor(item) {
    var ed = editor();
    if (!ed) return;
    editing = { item: item, base: item._sbBase, boxes: (item._sbBoxes || []).slice(), tool: "redact" };
    setTool("redact");
    paint();
    ed.showModal();
  }
  function closeEditor(apply) {
    var ed = editor(), item = editing && editing.item;
    if (!item) return;
    if (apply === "apply") {
      item._sbBoxes = editing.boxes.slice();
      item._sbCanvas = flatten();
      item.setAttribute("data-sb-state", "seen");
      var img = item.querySelector("img");
      if (img) img.src = item._sbCanvas.toDataURL();
    } else if (apply === "drop") dropPicture(item);
    editing = null;
    if (ed.open) ed.close();
    var back = item.isConnected ? item.querySelector("[data-sb-feedback-edit]") : null;
    var dialog = back ? back.closest("dialog.sb-feedback") : null;
    if (back) back.focus();
    else if (dialog) (dialog.querySelector("[data-sb-feedback-add]") || dialog.querySelector("textarea")).focus();
  }
  function stagePoint(e) {
    var stage = editor().querySelector("canvas"), r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) * stage.width / r.width, y: (e.clientY - r.top) * stage.height / r.height };
  }
  document.addEventListener("pointerdown", function (e) {
    var stage = e.target instanceof Element && e.target.closest(".sb-feedback-editor canvas");
    if (!stage || !editing) return;
    var p = stagePoint(e);
    editing.drag = { tool: editing.tool, x: p.x, y: p.y, w: 0, h: 0 };
    editing.boxes.push(editing.drag);
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  document.addEventListener("pointermove", function (e) {
    if (!editing || !editing.drag) return;
    var p = stagePoint(e);
    editing.drag.w = p.x - editing.drag.x; editing.drag.h = p.y - editing.drag.y;
    paint();
  });
  document.addEventListener("pointerup", function () {
    if (!editing || !editing.drag) return;
    var d = editing.drag;
    if (Math.abs(d.w) < 4 || Math.abs(d.h) < 4) editing.boxes.pop();
    editing.drag = null;
    paint();
  });

  // ------------------------------------------------------------------ pictures in the form
  function pictureList(dialog) { return dialog.querySelector(".sb-feedback__pictures"); }
  function pictures(dialog) { var list = pictureList(dialog); return list ? Array.prototype.slice.call(list.children) : []; }
  function addPicture(dialog, canvas) {
    var list = pictureList(dialog), tpl = dialog.querySelector("template[data-sb-feedback-picture]");
    if (!list || !tpl || pictures(dialog).length >= MAX_PICTURES) return null;
    var item = tpl.content.firstElementChild.cloneNode(true);
    item._sbBase = canvas;
    item.removeAttribute("data-sb-state");
    var img = item.querySelector("img");
    if (img) img.src = canvas.toDataURL();
    list.appendChild(item);
    syncAdd(dialog);
    return item;
  }
  function dropPicture(item) {
    var dialog = item.closest("dialog.sb-feedback");
    item.remove();
    if (dialog) syncAdd(dialog);
  }
  function syncAdd(dialog) {
    var add = dialog.querySelector("[data-sb-feedback-add]");
    if (add) add.hidden = dialog.getAttribute("data-sb-feedback-pictures") === "off" || pictures(dialog).length >= MAX_PICTURES;
  }

  // ------------------------------------------------------------------ open, steps, close
  var openers = new WeakMap();
  function wide() { return window.matchMedia(WIDE).matches; }
  function setStep(dialog, n) {
    if (wide()) { dialog.removeAttribute("data-sb-step"); return; }
    dialog.setAttribute("data-sb-step", String(n));
    dialog.querySelectorAll("[data-sb-feedback-step-n]").forEach(function (el) { el.textContent = String(n); });
  }
  function open(dialog, opener) {
    if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;
    openers.set(dialog, opener || document.activeElement);
    var form = dialog.querySelector("form"), done = dialog.querySelector(".sb-feedback__done");
    if (done && !done.hidden) reset(dialog);
    var text = form && form.elements.namedItem("text");
    var preset = opener && opener.getAttribute("data-sb-feedback-text");
    if (text && preset && !text.value) text.value = preset;
    context(dialog, opener);
    syncAdd(dialog);
    var wantPicture = dialog.getAttribute("data-sb-feedback-pictures") !== "off" && pictures(dialog).length === 0;
    var shot = wantPicture ? capture().catch(function () { return null; }) : Promise.resolve(null);
    // the picture is taken before the panel shows, so the panel is never in it (it is also removed from the copy)
    shot.then(function (canvas) {
      if (canvas) addPicture(dialog, canvas);
    });
    if (wide()) { dialog.removeAttribute("data-sb-step"); dialog.show(); if (text) text.focus(); }
    else {
      setStep(dialog, 1);
      dialog.showModal();
      var first = dialog.querySelector('.sb-feedback__kinds input:checked') || dialog.querySelector(".sb-feedback__kinds input");
      if (first) first.focus();
    }
  }
  function close(dialog) {
    if (!dialog.open) return;
    dialog.close();
  }
  function reset(dialog) {
    var form = dialog.querySelector("form"), done = dialog.querySelector(".sb-feedback__done");
    if (form) { form.reset(); form.hidden = false; }
    if (done) done.hidden = true;
    pictures(dialog).forEach(function (item) { item.remove(); });
    message(dialog, null);
  }
  window.sbFeedback = { open: open, close: close };

  document.addEventListener("click", function (e) {
    var el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    var trigger = el.closest("[data-sb-feedback-open]");
    if (trigger) {
      var dialog = document.getElementById(trigger.getAttribute("data-sb-feedback-open"));
      if (dialog && dialog.classList.contains("sb-feedback")) { e.preventDefault(); open(dialog, trigger); }
      return;
    }
    var fb = el.closest("dialog.sb-feedback");
    if (fb) {
      if (el.closest("[data-sb-feedback-close]")) { e.preventDefault(); close(fb); }
      else if (el.closest("[data-sb-feedback-back]")) { e.preventDefault(); setStep(fb, 1); var k = fb.querySelector(".sb-feedback__kinds input:checked"); if (k) k.focus(); }
      else if (el.closest("[data-sb-feedback-edit]")) { e.preventDefault(); openEditor(el.closest("li")); }
      else if (el.closest("[data-sb-feedback-drop]")) { e.preventDefault(); var li = el.closest("li"), add = fb.querySelector("[data-sb-feedback-add]"); dropPicture(li); if (add && !add.hidden) add.focus(); else fb.querySelector("textarea").focus(); }
      else if (el.closest("[data-sb-feedback-add]")) {
        e.preventDefault();
        var input = document.createElement("input");
        input.type = "file"; input.accept = "image/png,image/webp,image/jpeg";
        input.addEventListener("change", function () {
          var file = input.files && input.files[0];
          if (!file) return;
          if (pictures(fb).length >= MAX_PICTURES) { message(fb, "full"); return; }
          fromFile(file).then(function (canvas) { var item = addPicture(fb, canvas); if (item) openEditor(item); }, function () { message(fb, "refused"); });
        });
        input.click();
      }
      return;
    }
    var ed = el.closest("dialog.sb-feedback-editor");
    if (ed && editing) {
      var tool = el.closest("[data-sb-feedback-tool]");
      if (tool) setTool(tool.getAttribute("data-sb-feedback-tool"));
      else if (el.closest("[data-sb-feedback-undo]")) { editing.boxes.pop(); paint(); }
      else if (el.closest("[data-sb-feedback-apply]")) closeEditor("apply");
      else if (el.closest("[data-sb-feedback-drop]")) closeEditor("drop");
    }
  });
  // phone: choosing a kind goes to step 2
  document.addEventListener("change", function (e) {
    var input = e.target;
    if (!(input instanceof HTMLInputElement) || input.name !== "kind") return;
    var dialog = input.closest("dialog.sb-feedback");
    if (!dialog || wide()) return;
    setStep(dialog, 2);
    var text = dialog.querySelector("textarea");
    if (text) text.focus();
  });
  // a press on a radio that is already checked (phone, coming back from step 2) goes on too
  document.addEventListener("click", function (e) {
    var input = e.target;
    if (!(input instanceof HTMLInputElement) || input.name !== "kind" || !input.checked) return;
    var dialog = input.closest("dialog.sb-feedback");
    if (dialog && !wide() && dialog.getAttribute("data-sb-step") === "1" && e.detail !== 0) { setStep(dialog, 2); dialog.querySelector("textarea").focus(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var ed = editor();
    if (ed && ed.open) { e.preventDefault(); closeEditor("cancel"); return; }
    var panel = document.querySelector("dialog.sb-feedback[open]:not(:modal)");
    if (panel && panel.contains(document.activeElement)) { e.preventDefault(); close(panel); }
  });
  document.addEventListener("close", function (e) {
    var dialog = e.target;
    if (dialog instanceof HTMLDialogElement && dialog.classList.contains("sb-feedback-editor")) {
      if (editing) closeEditor("cancel");
      return;
    }
    if (!(dialog instanceof HTMLDialogElement) || !dialog.classList.contains("sb-feedback")) return;
    var opener = openers.get(dialog);
    if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
  }, true);

  // ------------------------------------------------------------------ sending
  function parts(dialog) {
    var button = dialog.querySelector('form .sb-primary-action[type="submit"]');
    return { button: button, label: button && button.querySelector(".sb-primary-action__label") };
  }
  function message(dialog, key) {
    var box = dialog.querySelector(".sb-feedback__message");
    if (!box) return;
    box.textContent = "";
    if (!key) return;
    box.appendChild(icon("#error--16"));
    box.appendChild(document.createTextNode(t(dialog, key)));
  }
  function busy(dialog, on) {
    var p = parts(dialog);
    if (!p.button) return;
    if (on) {
      if (p.label && !p.label.hasAttribute("data-sb-idle")) p.label.setAttribute("data-sb-idle", p.label.textContent);
      p.button.removeAttribute("data-sb-state");
      p.button.setAttribute("aria-busy", "true");
      p.button.setAttribute("data-sb-progress", "indeterminate");
      if (p.label) p.label.textContent = t(dialog, "busy");
    } else {
      p.button.removeAttribute("aria-busy");
      p.button.removeAttribute("data-sb-progress");
    }
  }
  function failed(dialog, key) {
    var p = parts(dialog);
    busy(dialog, false);
    if (p.button) p.button.setAttribute("data-sb-state", "retry");
    if (p.label) p.label.textContent = t(dialog, "retry");
    message(dialog, key);
  }
  function markMissing(dialog, field) {
    var id = (field.id || "sb-feedback-text") + "-missing";
    if (document.getElementById(id)) return;
    var label = field.labels && field.labels[0] ? field.labels[0].textContent.replace(/\s+/g, " ").trim() : "";
    var p = document.createElement("p");
    p.className = "sb-field__error"; p.id = id;
    p.appendChild(icon("#error--filled-16"));
    p.appendChild(document.createTextNode(t(dialog, "missing").replace("{field}", label)));
    (field.closest(".sb-field__control") || field).insertAdjacentElement("afterend", p);
    field.setAttribute("aria-invalid", "true");
    field.setAttribute("aria-describedby", id + (field.getAttribute("aria-describedby") ? " " + field.getAttribute("aria-describedby") : ""));
    field.focus();
  }
  document.addEventListener("input", function (e) {
    var field = e.target;
    if (!(field instanceof HTMLTextAreaElement) || !field.closest("dialog.sb-feedback") || field.getAttribute("aria-invalid") !== "true") return;
    var id = (field.id || "sb-feedback-text") + "-missing", note = document.getElementById(id);
    if (note) note.remove();
    field.removeAttribute("aria-invalid");
    var rest = (field.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (x) { return x && x !== id; });
    if (rest.length) field.setAttribute("aria-describedby", rest.join(" ")); else field.removeAttribute("aria-describedby");
  });
  function zeroBits(bytes) {
    var n = 0;
    for (var i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) { n += 8; continue; }
      for (var b = 7; b >= 0 && !(bytes[i] >> b & 1); b--) n++;
      break;
    }
    return n;
  }
  // SHA-256("<challenge>:<nonce>") with `difficulty` leading zero bits; 256 tries per round keep the page responsive
  function work(challenge, difficulty) {
    var enc = new TextEncoder(), next = 0;
    function round() {
      var tries = [];
      for (var i = 0; i < 256; i++) tries.push(String(next++));
      return Promise.all(tries.map(function (nonce) {
        return crypto.subtle.digest("SHA-256", enc.encode(challenge + ":" + nonce)).then(function (h) {
          return zeroBits(new Uint8Array(h)) >= difficulty ? nonce : null;
        });
      })).then(function (found) {
        var hit = found.filter(Boolean)[0];
        return hit != null ? hit : round();
      });
    }
    return round();
  }
  function post(dialog, payload, again) {
    var endpoint = (dialog.getAttribute("data-sb-feedback-endpoint") || "").replace(/\/+$/, "");
    var product = dialog.getAttribute("data-sb-feedback-product") || "";
    return fetch(endpoint + "/v1/challenge?product=" + encodeURIComponent(product)).then(function (r) {
      if (!r.ok) throw { status: r.status };
      return r.json();
    }).then(function (c) {
      return work(c.challenge, c.difficulty).then(function (nonce) {
        var data = new FormData();
        data.append("product", product);
        data.append("kind", payload.kind);
        data.append("text", payload.text);
        data.append("context", JSON.stringify(payload.context));
        payload.images.forEach(function (b, i) { data.append("image[]", b, "bild-" + (i + 1) + (b.type === "image/webp" ? ".webp" : ".png")); });
        data.append("challenge", c.challenge);
        data.append("nonce", nonce);
        return fetch(endpoint + "/v1/feedback", { method: "POST", body: data });
      });
    }).then(function (r) {
      if (r.status === 403 && !again) return post(dialog, payload, true);
      if (r.status === 201) return r.json();
      throw { status: r.status };
    });
  }
  function sent(dialog, issue) {
    busy(dialog, false);
    var p = parts(dialog);
    if (p.label && p.label.hasAttribute("data-sb-idle")) p.label.textContent = p.label.getAttribute("data-sb-idle");
    if (p.button) p.button.removeAttribute("data-sb-state");
    var form = dialog.querySelector("form"), done = dialog.querySelector(".sb-feedback__done");
    if (!done) return;
    var link = done.querySelector("[data-sb-feedback-issue]");
    if (link && issue && issue.url) link.setAttribute("href", issue.url);
    done.querySelectorAll("[data-sb-feedback-issue-number]").forEach(function (el) { el.textContent = issue && issue.issue != null ? String(issue.issue) : ""; });
    form.hidden = true;
    done.hidden = false;
    dialog.removeAttribute("data-sb-step");
    var heading = done.querySelector(".sb-feedback__done-title");
    if (heading) heading.focus();
  }
  var fails = new WeakMap();
  document.addEventListener("submit", function (e) {
    var form = e.target, dialog = form.closest && form.closest("dialog.sb-feedback");
    if (!dialog) return;
    e.preventDefault();
    var p = parts(dialog);
    if (p.button && p.button.getAttribute("aria-busy") === "true") return;
    var text = form.elements.namedItem("text");
    if (text && !text.value.trim()) { markMissing(dialog, text); return; }
    var kindInput = form.querySelector('input[name="kind"]:checked');
    var seen = pictures(dialog).filter(function (item) { return item.getAttribute("data-sb-state") === "seen" && item._sbCanvas; });
    message(dialog, null);
    busy(dialog, true);
    var ctx = context(dialog, openers.get(dialog));
    Promise.all(seen.map(function (item) { return encode(item._sbCanvas); })).then(function (images) {
      if (images.some(function (b) { return !b; })) throw { key: "big" };
      var payload = { kind: kindInput ? kindInput.value : "", text: text ? text.value.trim().slice(0, 4000) : "", context: ctx, images: images };
      var demo = dialog.getAttribute("data-sb-demo");
      if (demo) {
        var n = (fails.get(dialog) || 0);
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            if (demo === "fail" && n === 0) { fails.set(dialog, 1); reject({ status: 0 }); }
            else resolve({ issue: 212, url: "#" });
          }, 600);
        });
      }
      return post(dialog, payload, false);
    }).then(function (issue) { sent(dialog, issue); }, function (err) {
      var key = err && err.key ? err.key : !err || !err.status ? (navigator.onLine === false ? "offline" : "failed")
        : err.status === 429 ? "tooMany" : err.status === 422 || err.status === 413 ? "refused" : "failed";
      if (err && err.status === 0) key = "offline";
      failed(dialog, key);
    });
  });
})();
