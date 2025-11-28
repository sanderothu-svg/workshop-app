// Workshop Collage – clean fresh build
console.log("WorkshopCollage app.js loaded");

// ---------- STATE ----------
const state = {
  slideCount: 1,
  gridCols: 3,
  showNames: false,
  categories: {},          // slideIndex -> label
  photographers: [],       // {id, name, allPhotos, photosByIndex}
  randomizedOrders: {},    // slideIndex -> [photogId,...]
  slidePicks: {},          // slideIndex -> photogId (stjerne)
  exportWidth: 1600,
  currentSlide: 1,
  currentSortSlide: 1,
  tempChoices: {},         // { [photogId]: { [slideIdx]: choiceIndex } }
  sorterConfirmed: {}      // { [slideIdx]: true } når bekreftet
};

// ---------- UTILS ----------
const uid = () => Math.random().toString(36).slice(2, 10);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const on = (sel, ev, fn) => {
  const el = document.querySelector(sel);
  if (!el) {
    console.warn("Element not found for selector:", sel);
    return;
  }
  el.addEventListener(ev, fn);
};

function ensureCategories() {
  for (let i = 1; i <= state.slideCount; i++) {
    if (!state.categories[i]) state.categories[i] = `#${i}`;
  }
  Object.keys(state.categories).forEach(k => {
    const n = parseInt(k, 10);
    if (n > state.slideCount) delete state.categories[n];
  });
}

function reshuffleAll() {
  const ids = state.photographers.map(p => p.id);
  for (let s = 1; s <= state.slideCount; s++) {
    if (state.sorterConfirmed[s]) continue; // ikke rør bekreftede slides
    state.randomizedOrders[s] = shuffle(ids);
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Leser fil og skalerer ned for å holde .wsc-filer små
function readFileAsDataURL(file, maxDim = 2000, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        let scale = 1;
        if (width > height && width > maxDim) {
          scale = maxDim / width;
        } else if (height >= width && height > maxDim) {
          scale = maxDim / height;
        }
        if (scale >= 1) return resolve(reader.result);

        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        } catch (e) {
          console.warn("Kunne ikke komprimere bilde, bruker original", e);
          resolve(reader.result);
        }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function photogById(id) {
  return state.photographers.find(p => p.id === id);
}

// ---------- NAV / VIEWS ----------
function setView(view) {
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach(v => v.classList.remove("visible"));
  const section = document.querySelector(`#view-${view}`);
  if (section) section.classList.add("visible");

  if (view === "dashboard") renderDashboard();
  if (view === "sorter") renderSorterView();
  if (view === "compare") renderCompare();
  if (view === "ultimate") renderUltimate();
  if (view === "perphotog") renderPerPhotog();
}

// ---------- DASHBOARD ----------
function renderDashboard() {
  const toggleNamesEl = $("#toggleNames");
  if (toggleNamesEl) toggleNamesEl.checked = state.showNames;
  renderPhotographers();
}

function renderPhotographers() {
  const list = $("#photogList");
  if (!list) return;
  list.innerHTML = "";

  for (const p of state.photographers) {
    const card = document.createElement("div");
    card.className = "photog-card";

    const meta = document.createElement("div");
    meta.className = "photog-meta";

    const name = document.createElement("input");
    name.type = "text";
    name.value = p.name;
    name.placeholder = "Navn (vises kun når slått på)";
    name.addEventListener("input", () => {
      p.name = name.value;
      renderCompare();
      renderUltimate();
      renderPerPhotogList();
    });

    const remove = document.createElement("button");
    remove.className = "remove-btn";
    remove.textContent = "Fjern";
    remove.addEventListener("click", () => {
      state.photographers = state.photographers.filter(x => x.id !== p.id);
      reshuffleAll();
      renderDashboard();
      renderPerPhotog();
      renderCompare();
      renderUltimate();
    });

    meta.append(name, remove);

    const drop = document.createElement("div");
    drop.className = "dropzone";
    drop.textContent = "Dra & slipp bilder her (vilkårlige filnavn)";

    ["dragenter", "dragover"].forEach(evt =>
      drop.addEventListener(evt, e => {
        e.preventDefault();
        drop.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach(evt =>
      drop.addEventListener(evt, e => {
        e.preventDefault();
        drop.classList.remove("dragover");
      })
    );

    drop.addEventListener("drop", async e => {
      const files = Array.from(e.dataTransfer.files || []);
      for (const f of files) {
        const dataUrl = await readFileAsDataURL(f);
        if (!p.allPhotos) p.allPhotos = [];
        if (!p.photosByIndex) p.photosByIndex = {};
        p.allPhotos.push({
          dataUrl,
          originalName: f.name
        });
      }
      renderDashboard();
    });

    const status = document.createElement("div");
    status.className = "upload-status";
    const totalUploaded = (p.allPhotos && p.allPhotos.length) ? p.allPhotos.length : 0;
    status.textContent = totalUploaded === 0
      ? "Ingen bilder lastet ennå"
      : `Importert: ${totalUploaded} bilde${totalUploaded === 1 ? "" : "r"}`;

    const right = document.createElement("div");
    right.append(drop, status);

    card.append(meta, right);
    list.appendChild(card);
  }
}

// ---------- SORTER ----------
// ---------- SORTER ----------
function renderSorterView() {
  if (state.currentSortSlide < 1) state.currentSortSlide = 1;
  const slideIdx = state.currentSortSlide;

  // Topptekst
  $("#sorterSlideNumber").textContent = slideIdx;

  // Kategorinavn for sliden
  const catInput = $("#sorterCategoryInput");
  catInput.value = state.categories[slideIdx] || `#${slideIdx}`;

  // Bekreft-knapp
  const confirmBtn = $("#sorterApplySlide");
  const isConfirmed = !!state.sorterConfirmed[slideIdx];
  if (isConfirmed) {
    confirmBtn.disabled = true;
    confirmBtn.classList.add("disabled");
    confirmBtn.textContent = "Bekreftet ✅";
  } else {
    confirmBtn.disabled = false;
    confirmBtn.classList.remove("disabled");
    confirmBtn.textContent = "Bekreft denne sliden";
  }

  const wrap = $("#sorterPhotogRows");
  wrap.innerHTML = "";

  for (const p of state.photographers) {
    const allPhotos = p.allPhotos || [];
    if (!allPhotos.length) {
      const row = document.createElement("div");
      row.className = "sorter-card sorter-card-empty";
      row.textContent = `${p.name || "Uten navn"}: Ingen bilder lastet`;
      wrap.appendChild(row);
      continue;
    }

    if (!state.tempChoices[p.id]) state.tempChoices[p.id] = {};

    // --- 1) Finn hvilket bilde som er "valgt" for denne sliden ---
    // Prioritet:
    //  a) Lagret i photosByIndex (bekreftet slide)
    //  b) Lagret index i tempChoices (arbeidsvalg)
    let chosenOriginalIndex = null;
    const byIndex = (p.photosByIndex || {})[slideIdx];
    if (byIndex && byIndex.dataUrl) {
      const matchIdx = allPhotos.findIndex(ph => ph.dataUrl === byIndex.dataUrl);
      if (matchIdx >= 0) chosenOriginalIndex = matchIdx;
    } else if (state.tempChoices[p.id][slideIdx] !== undefined) {
      chosenOriginalIndex = state.tempChoices[p.id][slideIdx];
    }

    if (chosenOriginalIndex == null) chosenOriginalIndex = 0;
    if (chosenOriginalIndex < 0 || chosenOriginalIndex >= allPhotos.length) {
      chosenOriginalIndex = 0;
    }

    // --- 2) Bygg liste over "brukte" bilder på ANDRE slides ---
    const usedDataUrls = new Set(
      Object.entries(p.photosByIndex || {})
        .filter(([i]) => parseInt(i, 10) !== slideIdx)
        .map(([, it]) => it && it.dataUrl)
        .filter(Boolean)
    );

    // --- 3) Tilgjengelige bilder: alle som ikke er brukt på andre slides ---
    // MEN: vi må ALLTID inkludere det valgte bildet for denne sliden
    const decoratedAll = allPhotos.map((ph, idx) => ({ photo: ph, originalIndex: idx }));

    let availableDecorated = decoratedAll.filter(
      d => !usedDataUrls.has(d.photo.dataUrl)
    );

    const alreadyInAvailable = availableDecorated.some(
      d => d.originalIndex === chosenOriginalIndex
    );
    if (!alreadyInAvailable) {
      const chosenDecorated = decoratedAll[chosenOriginalIndex];
      if (chosenDecorinated) {
        availableDecorated = [chosenDecorinated, ...availableDecorated];
      }
    }

    if (!availableDecorated.length) {
      const row = document.createElement("div");
      row.className = "sorter-card sorter-card-empty";
      row.textContent = `${p.name || "Uten navn"}: Ingen bilder igjen å velge`;
      wrap.appendChild(row);
      continue;
    }

    // --- 4) Finn hva som faktisk skal vises nå ---
    let selIdx = availableDecorated.findIndex(
      d => d.originalIndex === chosenOriginalIndex
    );
    if (selIdx < 0) selIdx = 0;

    const currentDecorated = availableDecorated[selIdx];
    const currentPhoto = currentDecorated.photo;

    // Lagre valgt bilde (som index i allPhotos) i tempChoices
    state.tempChoices[p.id][slideIdx] = currentDecorated.originalIndex;

    // === KORT-UI ===
    const card = document.createElement("div");
    card.className = "sorter-card";

    const imgWrap = document.createElement("div");
    imgWrap.className = "sorter-card-imgwrap";

    const prevBtn = document.createElement("button");
    prevBtn.className = "sorter-card-prev";
    prevBtn.textContent = "‹";
    prevBtn.disabled = availableDecorated.length <= 1;

    const nextBtn = document.createElement("button");
    nextBtn.className = "sorter-card-next";
    nextBtn.textContent = "›";
    nextBtn.disabled = availableDecorated.length <= 1;

    const thumb = document.createElement("img");
    thumb.className = "sorter-card-thumb";
    thumb.src = currentPhoto.dataUrl;
    thumb.alt = currentPhoto.originalName || "";

    // Fullscreen: bla i samme "available"-liste + ENTER for å velge
    thumb.addEventListener("click", () => {
      const dataUrls = availableDecorated.map(d => d.photo.dataUrl);
      const startIndex = dataUrls.indexOf(currentPhoto.dataUrl);

      openSingleFullscreen(
        dataUrls,
        startIndex,
        p.name,
        (newDataUrl) => {
          const decorated = decoratedAll.find(d => d.photo.dataUrl === newDataUrl);
          if (decorated) {
            state.tempChoices[p.id][slideIdx] = decorated.originalIndex;
            state.sorterConfirmed[slideIdx] = false; // må bekreftes på nytt
            renderSorterView();
          }
        }
      );
    });

    const len = availableDecorated.length;

    prevBtn.addEventListener("click", () => {
      if (!len) return;
      selIdx = (selIdx - 1 + len) % len;
      const chosen = availableDecorated[selIdx];
      state.tempChoices[p.id][slideIdx] = chosen.originalIndex;
      state.sorterConfirmed[slideIdx] = false;
      renderSorterView();
    });

    nextBtn.addEventListener("click", () => {
      if (!len) return;
      selIdx = (selIdx + 1) % len;
      const chosen = availableDecorated[selIdx];
      state.tempChoices[p.id][slideIdx] = chosen.originalIndex;
      state.sorterConfirmed[slideIdx] = false;
      renderSorterView();
    });

    imgWrap.append(prevBtn, thumb, nextBtn);

    const nameEl = document.createElement("div");
    nameEl.className = "sorter-card-name";
    nameEl.textContent = p.name || "Uten navn";

    card.append(imgWrap, nameEl);
    wrap.appendChild(card);
  }

  catInput.addEventListener(
    "input",
    () => {
      state.sorterConfirmed[slideIdx] = false;
      const confirmBtn2 = $("#sorterApplySlide");
      confirmBtn2.disabled = false;
      confirmBtn2.classList.remove("disabled");
      confirmBtn2.textContent = "Bekreft denne sliden";
    },
    { once: true }
  );
}

function applySorterSlide() {
  const slideIdx = state.currentSortSlide;

  // 1. lagre kategorinavn
  const newLabel = $("#sorterCategoryInput").value.trim();
  if (newLabel) {
    state.categories[slideIdx] = newLabel;
  }

  // 2. for hver fotograf: bruk valgt index i allPhotos
  for (const p of state.photographers) {
    const allPhotos = p.allPhotos || [];
    if (!allPhotos.length) continue;

    const choiceMap = state.tempChoices[p.id] || {};
    const originalIndex = choiceMap[slideIdx];

    if (originalIndex == null || originalIndex < 0 || originalIndex >= allPhotos.length) {
      continue;
    }

    const chosen = allPhotos[originalIndex];
    if (!chosen) continue;

    if (!p.photosByIndex) p.photosByIndex = {};
    p.photosByIndex[slideIdx] = {
      dataUrl: chosen.dataUrl,
      originalName: chosen.originalName,
      index: slideIdx
    };
  }

  // 3. oppdatér slideCount hvis vi nå bekrefter en høyere slide
  if (slideIdx > state.slideCount) {
    state.slideCount = slideIdx;
    ensureCategories();
    reshuffleAll();
  }

  // 4. marker denne sliden som BEKREFTET / låst
  state.sorterConfirmed[slideIdx] = true;

  // 5. re-render alt relevant
  renderSorterView();
  reshuffleAll();
  renderCompare();
  renderUltimate();
}

// ---------- COMPARE ----------
function renderCompare() {
  if (!state.slideCount) return;

  const s = Math.min(Math.max(1, state.currentSlide || 1), state.slideCount);
  state.currentSlide = s;

  $("#compareLabel").textContent = state.categories[s] || `#${s}`;
  $("#toggleNamesCompare").checked = state.showNames;

  const grid = $("#compareGrid");
  grid.dataset.cols = String(state.gridCols);
  grid.innerHTML = "";

  const currentIds = state.photographers.map(p => p.id);

  if (!state.randomizedOrders[s]) {
    state.randomizedOrders[s] = shuffle(currentIds);
  } else if (!sameSet(state.randomizedOrders[s], currentIds) && !state.sorterConfirmed[s]) {
    state.randomizedOrders[s] = shuffle(currentIds);
  }

  for (const id of state.randomizedOrders[s] || []) {
    const p = photogById(id);
    if (!p) continue;
    const item = (p.photosByIndex || {})[s];
    if (!item) continue;

    const card = document.createElement("div");
    card.className = "card";
    if (state.slidePicks[s] === p.id) card.classList.add("starred");

    const thumb = document.createElement("div");
    thumb.className = "thumb-wrap";

    const img = document.createElement("img");
    img.src = item.dataUrl;
    img.addEventListener("click", () => openFullscreenForSlide(s, p.id));
    thumb.appendChild(img);

    const starWrap = document.createElement("div");
    starWrap.className = "star";
    const star = document.createElement("button");
    star.textContent = state.slidePicks[s] === p.id ? "★" : "☆";
    star.addEventListener("click", () => {
      state.slidePicks[s] = (state.slidePicks[s] === p.id) ? undefined : p.id;
      renderCompare();
      renderUltimate();
    });
    starWrap.appendChild(star);
    thumb.appendChild(starWrap);

    const meta = document.createElement("div");
    meta.className = "meta";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = state.showNames ? (p.name || "(uten navn)") : " ";
    if (!state.showNames) name.classList.add("hidden");

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = state.categories[s] || `#${s}`;

    meta.append(name, label);

    card.append(thumb, meta);
    grid.appendChild(card);
  }
}

function sameSet(a, b) {
  const A = new Set(a), B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
}

// ---------- ULTIMATE ----------
function renderUltimate() {
  const wrap = $("#ultimateList");
  wrap.innerHTML = "";
  for (let s = 1; s <= state.slideCount; s++) {
    const pickedId = state.slidePicks[s];
    if (!pickedId) continue;
    const p = photogById(pickedId);
    if (!p) continue;
    const item = (p.photosByIndex || {})[s];
    if (!item) continue;

    const box = document.createElement("div");
    box.className = "ultimate-item";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${s}. ${(state.categories[s] || "#" + s)} — ${p.name || "Anonym"}`;
    const img = document.createElement("img");
    img.src = item.dataUrl;
    box.append(title, img);
    wrap.appendChild(box);
  }
}

async function exportUltimatePNG() {
  const picks = [];
  for (let s = 1; s <= state.slideCount; s++) {
    const pid = state.slidePicks[s];
    if (!pid) continue;
    const p = photogById(pid);
    const item = p && (p.photosByIndex || {})[s];
    if (!p || !item) continue;
    picks.push({ s, p, item });
  }
  if (!picks.length) {
    alert("Ingen stjerner valgt.");
    return;
  }

  const images = await Promise.all(picks.map(loadImage));

  const W = state.exportWidth;
  const gap = 20;
  let totalH = 0;
  const dims = images.map(img => {
    const scale = W / img.width;
    const h = Math.round(img.height * scale);
    totalH += h + gap + 28;
    return { w: W, h };
  });
  totalH -= gap;
  const canvas = $("#exportCanvas");
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, totalH);

  let y = 0;
  ctx.font = "700 16px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#111111";
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const { h } = dims[i];
    const title = `${picks[i].s}. ${(state.categories[picks[i].s] || "#" + picks[i].s)} — ${picks[i].p.name || "Anonym"}`;
    ctx.fillText(title, 12, y + 20);
    y += 28;
    ctx.drawImage(img, 0, y, W, h);
    y += h;
    if (i !== images.length - 1) y += gap;
  }

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ultimate-annonce.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function loadImage(pick) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = pick.item.dataUrl;
  });
}

// ---------- RESET ----------
function resetAll() {
  if (!confirm("Vil du nullstille alt? Dette fjerner alle fotografer, bilder og valg.")) return;

  state.slideCount = 1;
  state.gridCols = 3;
  state.showNames = false;
  state.categories = {};
  state.photographers = [];
  state.randomizedOrders = {};
  state.slidePicks = {};
  state.exportWidth = 1600;
  state.currentSlide = 1;
  state.currentSortSlide = 1;
  state.tempChoices = {};
  state.sorterConfirmed = {};

  ensureCategories();
  reshuffleAll();
  setView("dashboard");
}

// ---------- EXPORT / IMPORT ----------
async function exportProject() {
  const out = {
    version: 3,
    slideCount: state.slideCount,
    gridCols: state.gridCols,
    showNames: state.showNames,
    categories: state.categories,
    slidePicks: state.slidePicks,
    photographers: state.photographers.map(p => {
      const images = [];
      const indexByDataUrl = new Map();

      function getImageIndex(dataUrl, originalName) {
        if (indexByDataUrl.has(dataUrl)) return indexByDataUrl.get(dataUrl);
        const idx = images.length;
        images.push({ dataUrl, originalName: originalName || "" });
        indexByDataUrl.set(dataUrl, idx);
        return idx;
      }

      (p.allPhotos || []).forEach(ph => {
        if (!ph || !ph.dataUrl) return;
        getImageIndex(ph.dataUrl, ph.originalName);
      });

      const photosByIndex = {};
      Object.entries(p.photosByIndex || {}).forEach(([slideIdx, it]) => {
        if (!it || !it.dataUrl) return;
        const imageIndex = getImageIndex(it.dataUrl, it.originalName);
        photosByIndex[slideIdx] = { imageIndex };
      });

      return {
        id: p.id,
        name: p.name,
        images,
        photosByIndex
      };
    })
  };

  let json;
  try {
    json = JSON.stringify(out);
  } catch (err) {
    console.error("JSON eksport feilet", err);
    alert("Eksport feilet: Prosjektet er for stort eller inneholder noe rart.");
    return;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "workshop.wsc";
  a.click();
  URL.revokeObjectURL(url);
}

async function importProjectFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  state.slideCount = data.slideCount || 1;
  state.gridCols = data.gridCols || 3;
  state.showNames = !!data.showNames;
  state.categories = data.categories || {};
  state.slidePicks = data.slidePicks || {};
  state.randomizedOrders = {};
  state.currentSlide = 1;
  state.currentSortSlide = 1;
  state.tempChoices = {};
  state.sorterConfirmed = {};

  state.photographers = (data.photographers || []).map(p => {
    if (p.images && !p.allPhotos) {
      const allPhotos = (p.images || []).map(img => ({
        dataUrl: img.dataUrl,
        originalName: img.originalName || ""
      }));

      const photosByIndex = {};
      Object.entries(p.photosByIndex || {}).forEach(([slideIdx, it]) => {
        const img = allPhotos[it.imageIndex];
        if (!img) return;
        photosByIndex[slideIdx] = {
          dataUrl: img.dataUrl,
          originalName: img.originalName,
          index: parseInt(slideIdx, 10)
        };
      });

      return {
        id: p.id,
        name: p.name,
        allPhotos,
        photosByIndex
      };
    }

    const allPhotos = (p.allPhotos || []).map(ph => ({
      dataUrl: ph.dataUrl,
      originalName: ph.originalName || ""
    }));
    const photosByIndex = {};
    Object.entries(p.photosByIndex || {}).forEach(([slideIdx, it]) => {
      if (!it || !it.dataUrl) return;
      photosByIndex[slideIdx] = {
        dataUrl: it.dataUrl,
        originalName: it.originalName,
        index: parseInt(slideIdx, 10)
      };
    });
    return {
      id: p.id,
      name: p.name,
      allPhotos,
      photosByIndex
    };
  });

  ensureCategories();
  reshuffleAll();
  renderDashboard();
  renderPerPhotog();
  renderCompare();
  renderUltimate();
}

// ---------- PER PHOTOGRAPHER ----------
function renderPerPhotog() {
  const sel = $("#photogSelect");
  sel.innerHTML = "";
  for (const p of state.photographers) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.text = p.name || "Uten navn";
    sel.appendChild(opt);
  }
  renderPerPhotogList();
}

function renderPerPhotogList() {
  const wrap = $("#perPhotogList");
  wrap.innerHTML = "";
  const sel = $("#photogSelect");
  const id = sel.value;
  const p = photogById(id);
  if (!p) return;
  for (let s = 1; s <= state.slideCount; s++) {
    const item = (p.photosByIndex || {})[s];
    if (!item) continue;
    const box = document.createElement("div");
    box.className = "ultimate-item";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${s}. ${(state.categories[s] || "#" + s)} — ${p.name || "Anonym"}`;
    const img = document.createElement("img");
    img.src = item.dataUrl;
    box.append(title, img);
    wrap.appendChild(box);
  }
}

// Fullscreen for ett eller flere bilder fra Sorter (pil taster + ESC)
// Fullscreen for ett eller flere bilder fra Sorter (piltaster + ESC + ENTER)
function openSingleFullscreen(dataUrls, startIndex, name, onSelect) {
  // Støtt både gammel bruk (enkelt dataUrl) og ny (liste)
  if (!Array.isArray(dataUrls)) {
    dataUrls = [dataUrls];
  }
  if (dataUrls.length === 0) return;

  let index = typeof startIndex === "number"
    ? Math.max(0, Math.min(startIndex, dataUrls.length - 1))
    : 0;

  const overlay = document.createElement("div");
  overlay.className = "fullscreen-overlay";

  const img = document.createElement("img");
  const caption = document.createElement("div");
  caption.className = "caption";

  const close = document.createElement("button");
  close.className = "fs-close";
  close.textContent = "×";

  function render() {
    img.src = dataUrls[index];
    caption.textContent = name || "Uten navn";
  }

  function closeAll() {
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  function confirmSelectionAndClose() {
    if (typeof onSelect === "function") {
      onSelect(dataUrls[index]);
    }
    closeAll();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      // ESC = bare lukk, ikke endre valget
      closeAll();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      index = (index - 1 + dataUrls.length) % dataUrls.length;
      render();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      index = (index + 1) % dataUrls.length;
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      // ENTER = velg dette bildet og lukk
      confirmSelectionAndClose();
    }
  }

  close.addEventListener("click", closeAll);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeAll();
  });

  overlay.append(img, caption, close);
  document.body.appendChild(overlay);

  window.addEventListener("keydown", onKey);
  render();
}




function openFullscreenForSlide(slideIndex, startPhotogId) {
  const order = state.randomizedOrders[slideIndex] || [];
  const items = order
    .map(id => {
      const p = photogById(id);
      const it = p && (p.photosByIndex || {})[slideIndex];
      return it ? { id, dataUrl: it.dataUrl, name: p.name || "Anonym" } : null;
    })
    .filter(Boolean);
  if (!items.length) return;

  let idx = Math.max(0, items.findIndex(x => x.id === startPhotogId));
  if (idx === -1) idx = 0;

  const overlay = document.createElement("div");
  overlay.className = "fullscreen-overlay";

  const img = document.createElement("img");
  const caption = document.createElement("div");
  caption.className = "caption";

  const prev = document.createElement("button");
  prev.className = "fs-prev";
  prev.textContent = "←";

  const next = document.createElement("button");
  next.className = "fs-next";
  next.textContent = "→";

  const close = document.createElement("button");
  close.className = "fs-close";
  close.textContent = "×";

  const starBtn = document.createElement("button");
  starBtn.className = "fs-star";
  starBtn.textContent = "☆";

  function isStarredCurrent() {
    const currentId = items[idx].id;
    return state.slidePicks[slideIndex] === currentId;
  }
  function updateStarVisual() {
    const active = isStarredCurrent();
    starBtn.textContent = active ? "★" : "☆";
    starBtn.classList.toggle("active", active);
  }
  function toggleStar() {
    const currentId = items[idx].id;
    state.slidePicks[slideIndex] =
      (state.slidePicks[slideIndex] === currentId) ? undefined : currentId;
    updateStarVisual();
    renderCompare();
    renderUltimate();
  }

  function renderFS() {
    img.src = items[idx].dataUrl;
    const label = state.categories[slideIndex] || `#${slideIndex}`;
    caption.textContent = state.showNames ? `${label} — ${items[idx].name}` : `${label}`;
    updateStarVisual();
  }

  function go(delta) {
    idx = (idx + delta + items.length) % items.length;
    renderFS();
  }

  prev.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
  starBtn.addEventListener("click", toggleStar);

  function onKey(e) {
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "Escape") close.click();
    else if (e.key.toLowerCase() === "s") toggleStar();
  }

  close.addEventListener("click", () => {
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  });

  overlay.addEventListener("click", e => {
    if (e.target === overlay) {
      window.removeEventListener("keydown", onKey);
      overlay.remove();
    }
  });
  img.addEventListener("click", e => e.stopPropagation());
  caption.addEventListener("click", e => e.stopPropagation());

  overlay.append(img, caption, prev, next, close, starBtn);
  document.body.appendChild(overlay);
  window.addEventListener("keydown", onKey);

  renderFS();
}

// ---------- INIT ----------
function init() {
  console.log("init() starting");

  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  on("#toggleNames", "change", e => {
    state.showNames = !!e.target.checked;
    renderCompare();
  });

  on("#addPhotog", "click", () => {
    const name = ($("#newPhotogName").value || "").trim();
    const id = uid();
    state.photographers.push({
      id,
      name,
      photosByIndex: {},
      allPhotos: []
    });
    $("#newPhotogName").value = "";
    reshuffleAll();
    renderDashboard();
    renderPerPhotog();
  });

  on("#exportProject", "click", exportProject);

  on("#importProject", "click", () => {
    const f = $("#importProjectFile");
    if (f) f.click();
  });
  on("#importProjectFile", "change", e => {
    const file = e.target.files && e.target.files[0];
    if (file) importProjectFile(file);
    e.target.value = "";
  });

  on("#startPresentation", "click", () => {
    state.currentSlide = 1;
    setView("compare");
    renderCompare();
  });

  on("#resetAll", "click", resetAll);
  on("#reshuffleAll", "click", () => {
    reshuffleAll();
    renderCompare();
  });
  on("#clearStars", "click", () => {
    state.slidePicks = {};
    renderCompare();
    renderUltimate();
  });

  on("#prevSlide", "click", () => {
    state.currentSlide = Math.max(1, (state.currentSlide || 1) - 1);
    renderCompare();
  });
  on("#nextSlide", "click", () => {
    state.currentSlide = Math.min(state.slideCount, (state.currentSlide || 1) + 1);
    renderCompare();
  });

  on("#reshuffleThis", "click", () => {
    const s = state.currentSlide || 1;
    const ids = state.photographers.map(p => p.id);
    state.randomizedOrders[s] = shuffle(ids);
    renderCompare();
  });
  on("#toggleNamesCompare", "change", e => {
    state.showNames = !!e.target.checked;
    renderCompare();
  });

  on("#applyExportWidth", "click", () => {
    const v = parseInt($("#exportWidth").value, 10);
    state.exportWidth = Math.max(400, Math.min(4000, v || 1600));
  });
  on("#exportUltimate", "click", exportUltimatePNG);

  on("#photogSelect", "change", renderPerPhotogList);

  on("#sorterPrevSlide", "click", () => {
    state.currentSortSlide = Math.max(1, (state.currentSortSlide || 1) - 1);
    renderSorterView();
  });
  on("#sorterNextSlide", "click", () => {
    const current = state.currentSortSlide || 1;
    if (current >= state.slideCount) {
      state.slideCount += 1;
      ensureCategories();
      reshuffleAll();
    }
    state.currentSortSlide = current + 1;
    renderSorterView();
  });
  on("#sorterApplySlide", "click", applySorterSlide);

  ensureCategories();
  reshuffleAll();
  renderDashboard();

 // Globale shortcuts: CMD+E = eksport, CMD+I = import
document.addEventListener("keydown", (e) => {
  // Ikke trigge i inputfelter
  const target = e.target;
  const tag = (target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || target.isContentEditable) return;

  // Må holde inne CMD/CTRL
  if (!e.metaKey && !e.ctrlKey) return;

  const k = e.key.toLowerCase();

  if (k === "e") {
    e.preventDefault();
    exportProject();
  } else if (k === "i") {
    e.preventDefault();
    const f = document.querySelector("#importProjectFile");
    if (f) f.click();
  }
});



  console.log("init() complete");
}

document.addEventListener("DOMContentLoaded", init);
