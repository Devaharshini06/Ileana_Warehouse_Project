const STORAGE_KEY = "pastel-project-warehouse";
const TABS_KEY = "pastel-project-warehouse-tabs";
const MEDIA_DB = "pastel-project-media";
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const MEDIA_ACCEPT = "image/*,video/*,.mp4,.m4v,.webm,.mov,.qt,.ogv,.ogg,.avi,.mkv,.3gp";
const mediaUrlCache = {};
const DEFAULT_CATEGORIES = [
  { id: "crochet", label: "Crochet", description: "Yarn projects, amigurumi, and stitch diaries.", icon: "🧶", color: "#ff9ac8", builtIn: true },
  { id: "squishy", label: "Squishy", description: "Soft, squeeze-able, and slow-rise favorites.", icon: "🫧", color: "#ffc07a", builtIn: true },
  { id: "lego", label: "Lego", description: "Builds, MOCs, and brick sets of every size.", icon: "🧱", color: "#c9a8ff", builtIn: true },
  { id: "cardboard", label: "Cardboard", description: "Paper crafts, boxes, and handmade structures.", icon: "📦", color: "#ffe066", builtIn: true },
  { id: "extra", label: "Extra", description: "Anything that does not belong in the other shelves.", icon: "✨", color: "#7eefc0", builtIn: true },
];
const TAB_COLORS = ["#ff9ac8", "#ffc07a", "#c9a8ff", "#ffe066", "#7eefc0", "#7ed8ff", "#ff8a9b", "#d4ff8a", "#ffb3f0"];
const TAB_EMOJIS = ["♡", "🎀", "🎨", "🧸", "✂️", "📚", "🌸", "⭐", "🧁", "🧩"];

const state = {
  categories: DEFAULT_CATEGORIES.concat(loadCustomTabs()),
  projects: loadProjects(),
  query: "",
  drafts: {},
  editingId: null,
  pendingImage: null,
  pendingMedia: null,
  editingTabId: null,
  pendingTabColor: TAB_COLORS[0],
  newTabColor: TAB_COLORS[5],
};

ensureDrafts();

function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function loadCustomTabs() {
  try {
    const tabs = JSON.parse(localStorage.getItem(TABS_KEY)) || [];
    if (!Array.isArray(tabs)) return [];
    return tabs.filter(function (tab) {
      return tab && tab.id && tab.label;
    }).map(function (tab) {
      return {
        id: String(tab.id),
        label: String(tab.label),
        description: tab.description ? String(tab.description) : "",
        icon: tab.icon ? String(tab.icon) : "♡",
        color: tab.color ? String(tab.color) : TAB_COLORS[0],
        builtIn: false,
      };
    });
  } catch (error) {
    return [];
  }
}

function saveProjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
}

function saveCustomTabs() {
  const custom = state.categories.filter(function (tab) { return !tab.builtIn; });
  localStorage.setItem(TABS_KEY, JSON.stringify(custom));
}

function ensureDrafts() {
  state.categories.forEach(function (tab) {
    if (!state.drafts[tab.id]) {
      state.drafts[tab.id] = { preview: "", mediaType: "", file: null, label: "", notes: "", error: "", fileName: "", busy: false };
    }
  });
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "p-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function categoryById(id) {
  return state.categories.find(function (tab) { return tab.id === id; });
}

function categoryLabel(id) {
  const tab = categoryById(id);
  return tab ? tab.label : id;
}

function escapeAttr(value) {
  return String(value)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;");
}

function selectorForCategory(id) {
  return '[data-category="' + String(id).split('"').join('\\"') + '"]';
}

function openMediaDb() {
  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(MEDIA_DB, 1);
    request.onupgradeneeded = function () {
      if (!request.result.objectStoreNames.contains("files")) {
        request.result.createObjectStore("files");
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

function putMedia(id, blob) {
  return openMediaDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(blob, id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function getMedia(id) {
  return openMediaDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction("files", "readonly");
      const request = tx.objectStore("files").get(id);
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { reject(request.error); };
    });
  }).catch(function () { return null; });
}

function deleteMedia(id) {
  return openMediaDb().then(function (db) {
    return new Promise(function (resolve) {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); };
    });
  }).catch(function () {});
}

function isVideoFile(file) {
  if (!file) return false;
  if (file.type && file.type.indexOf("video/") === 0) return true;
  return /\.(mp4|m4v|webm|mov|qt|ogv|ogg|avi|mkv|3gp)$/i.test(file.name || "");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function mediaErrorNote(kind) {
  if (kind === "size") return "That video is too large. Please use a file under 2 GB (5–10 minute clips are fine).";
  if (kind === "type") return "Please choose a photo or video. Best playback: MP4 or WebM. Also saved: MOV, M4V, OGV, AVI, MKV.";
  if (kind === "save") return "Could not save that video on this device. Try a smaller MP4, or free some disk space.";
  return kind;
}

function attachVideoFallback(video) {
  video.addEventListener("error", function () {
    if (video.parentNode && !video.parentNode.querySelector(".media-note")) {
      const note = document.createElement("p");
      note.className = "media-note";
      note.textContent = "Saved, but this browser may not play this format. MP4 or WebM plays most reliably.";
      video.parentNode.insertBefore(note, video.nextSibling);
    }
  });
}

function isImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.indexOf("image/") === 0) return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(file.name || "");
}

function readImage(file) {
  return new Promise(function (resolve, reject) {
    if (!isImageFile(file)) {
      reject(new Error("Please choose a photo or video."));
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        const max = 900;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readMedia(file) {
  if (isImageFile(file)) {
    return readImage(file).then(function (preview) {
      return { mediaType: "image", preview: preview, file: null };
    });
  }
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_BYTES) {
      return Promise.reject(new Error(mediaErrorNote("size")));
    }
    return Promise.resolve({
      mediaType: "video",
      preview: URL.createObjectURL(file),
      file: file,
    });
  }
  return Promise.reject(new Error(mediaErrorNote("type")));
}

function loadVideoSrc(project, videoEl) {
  if (mediaUrlCache[project.id]) {
    videoEl.src = mediaUrlCache[project.id];
    return;
  }
  getMedia(project.id).then(function (blob) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    mediaUrlCache[project.id] = url;
    videoEl.src = url;
  });
}

function createMediaNode(project) {
  if (project.mediaType === "video") {
    const video = document.createElement("video");
    video.controls = true;
    video.setAttribute("playsinline", "");
    video.preload = "metadata";
    attachVideoFallback(video);
    loadVideoSrc(project, video);
    return video;
  }
  if (project.image) {
    const img = document.createElement("img");
    img.src = project.image;
    img.alt = project.label || "";
    return img;
  }
  const fallback = document.createElement("div");
  fallback.className = "photo-fallback";
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = "♡";
  return fallback;
}

function matchesQuery(project, query) {
  if (!query) return true;
  const haystack = (project.label + " " + project.notes + " " + categoryLabel(project.category)).toLowerCase();
  return haystack.indexOf(query) !== -1;
}

function render() {
  ensureDrafts();
  renderNav();
  renderCustomSections();

  const query = state.query.trim().toLowerCase();
  let visibleCount = 0;

  state.categories.forEach(function (tab) {
    const section = document.querySelector(selectorForCategory(tab.id));
    if (!section) return;
    const grid = section.querySelector("[data-grid]");
    const countEl = section.querySelector("[data-count]");
    if (!grid || !countEl) return;
    const inCategory = state.projects.filter(function (project) { return project.category === tab.id; });
    const visible = inCategory.filter(function (project) { return matchesQuery(project, query); });
    visibleCount += visible.length;
    countEl.textContent = String(inCategory.length);
    grid.innerHTML = "";
    grid.appendChild(makeUploadCard(tab.id));
    visible.forEach(function (project) { grid.appendChild(makeProjectCard(project)); });
    if (query && visible.length === 0) section.classList.add("hidden-by-search");
    else section.classList.remove("hidden-by-search");
  });

  const status = document.getElementById("search-status");
  if (!status) return;
  if (query) {
    status.hidden = false;
    status.textContent = visibleCount
      ? "Showing " + visibleCount + " match" + (visibleCount === 1 ? "" : "es") + " for “" + state.query.trim() + "”."
      : "No projects match “" + state.query.trim() + "”. Try another label.";
  } else {
    status.hidden = true;
  }
}

function renderNav() {
  const nav = document.getElementById("category-nav");
  const addBtn = document.getElementById("add-category-btn");
  if (!nav || !addBtn) return;
  const extras = nav.querySelectorAll("[data-custom-nav]");
  for (let i = 0; i < extras.length; i += 1) extras[i].remove();
  state.categories.forEach(function (tab) {
    if (tab.builtIn) return;
    const link = document.createElement("a");
    link.href = "#" + tab.id;
    link.textContent = tab.label;
    link.setAttribute("data-custom-nav", "true");
    nav.insertBefore(link, addBtn);
  });
}

function renderCustomSections() {
  const list = document.getElementById("custom-list");
  if (!list) return;
  list.innerHTML = "";
  state.categories.forEach(function (tab) {
    if (!tab.builtIn) list.appendChild(makeSection(tab));
  });
}

function makeSection(tab) {
  const section = document.createElement("section");
  section.id = tab.id;
  section.className = "category-section";
  section.setAttribute("data-category", tab.id);
  section.style.setProperty("--tint", tab.color);

  const heading = document.createElement("header");
  heading.className = "section-heading";

  const icon = document.createElement("span");
  icon.className = "section-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = tab.icon || "♡";

  const titles = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = tab.label;
  const desc = document.createElement("p");
  desc.textContent = tab.description || "Your custom shelf.";
  titles.appendChild(title);
  titles.appendChild(desc);

  const actions = document.createElement("div");
  actions.className = "heading-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "btn tiny ghost";
  editBtn.type = "button";
  editBtn.textContent = "Edit category";
  editBtn.addEventListener("click", function () { openTabEditor(tab.id); });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn tiny danger";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete category";
  deleteBtn.addEventListener("click", function () { deleteCategory(tab.id); });

  const count = document.createElement("span");
  count.className = "count";
  count.setAttribute("data-count", "");
  count.textContent = "0";

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  actions.appendChild(count);
  heading.appendChild(icon);
  heading.appendChild(titles);
  heading.appendChild(actions);

  const grid = document.createElement("div");
  grid.className = "project-grid";
  grid.setAttribute("data-grid", "");

  section.appendChild(heading);
  section.appendChild(grid);
  return section;
}

function deleteCategory(id) {
  const tab = categoryById(id);
  if (!tab || tab.builtIn) return;
  const count = state.projects.filter(function (project) { return project.category === id; }).length;
  const warning = count
    ? "Delete the “" + tab.label + "” category and its " + count + " project" + (count === 1 ? "" : "s") + "?"
    : "Delete the “" + tab.label + "” category?";
  if (!confirm(warning)) return;
  state.projects.filter(function (project) { return project.category === id; }).forEach(function (project) {
    deleteMedia(project.id);
    if (mediaUrlCache[project.id]) {
      URL.revokeObjectURL(mediaUrlCache[project.id]);
      delete mediaUrlCache[project.id];
    }
  });
  state.projects = state.projects.filter(function (project) { return project.category !== id; });
  state.categories = state.categories.filter(function (item) { return item.id !== id; });
  delete state.drafts[id];
  saveProjects();
  saveCustomTabs();
  render();
}

function makeUploadCard(category) {
  const draft = state.drafts[category] || { preview: "", mediaType: "", file: null, label: "", notes: "", error: "", fileName: "", busy: false };
  const name = categoryLabel(category);
  const card = document.createElement("article");
  card.className = "upload-card";
  const previewHtml = draft.preview
    ? (draft.mediaType === "video"
      ? '<video src="' + draft.preview + '" controls playsinline preload="metadata"></video>'
      : '<img src="' + draft.preview + '" alt="New ' + escapeAttr(name) + ' preview" />')
    : "";
  const statusText = draft.error
    ? draft.error
    : draft.busy
      ? "Saving video…"
      : draft.fileName
        ? (draft.mediaType === "video" ? "Video ready: " : "Photo ready: ") + draft.fileName + ". Add a label, then click Add."
        : "";
  card.innerHTML =
    '<div class="upload-box">' +
      '<input type="file" accept="' + MEDIA_ACCEPT + '" hidden />' +
      previewHtml +
      '<span class="upload-hint"' + (draft.preview ? " hidden" : "") + ">" +
        "<strong>Upload a photo or video</strong>" +
        "<em>MP4 or WebM works best · 5–10 min clips are OK</em>" +
      "</span>" +
    "</div>" +
    (statusText ? '<p class="upload-status' + (draft.error ? " error" : "") + '"></p>' : "") +
    '<input class="label-input" type="text" maxlength="80" placeholder="Label this ' + escapeAttr(name.toLowerCase()) + ' project" />' +
    '<textarea class="notes-input" rows="3" maxlength="600" placeholder="Optional notes"></textarea>' +
    '<button class="btn" type="button"' + (draft.busy ? " disabled" : "") + ">" +
      (draft.busy ? "Saving video…" : "Add to " + escapeAttr(name)) +
    "</button>";

  const box = card.querySelector(".upload-box");
  const fileInput = card.querySelector('input[type="file"]');
  const labelInput = card.querySelector(".label-input");
  const notesInput = card.querySelector(".notes-input");
  const statusEl = card.querySelector(".upload-status");
  const addBtn = card.querySelector(".btn");
  if (statusEl) statusEl.textContent = statusText;
  const videoPreview = card.querySelector("video");
  if (videoPreview) {
    videoPreview.addEventListener("click", function (event) { event.stopPropagation(); });
    attachVideoFallback(videoPreview);
  }
  labelInput.value = draft.label;
  notesInput.value = draft.notes;
  labelInput.addEventListener("input", function () { draft.label = labelInput.value; });
  notesInput.addEventListener("input", function () { draft.notes = notesInput.value; });

  function acceptFile(file) {
    draft.error = "";
    readMedia(file).then(function (media) {
      if (draft.preview && draft.mediaType === "video" && draft.preview !== media.preview) {
        URL.revokeObjectURL(draft.preview);
      }
      draft.preview = media.preview;
      draft.mediaType = media.mediaType;
      draft.file = media.file;
      draft.fileName = file.name + " (" + formatBytes(file.size) + ")";
      draft.error = "";
      render();
    }).catch(function (error) {
      draft.error = error.message || mediaErrorNote("type");
      render();
    });
  }

  box.addEventListener("click", function (event) {
    if (event.target.closest("video")) return;
    if (event.target === fileInput) return;
    fileInput.click();
  });
  fileInput.addEventListener("change", function () {
    if (fileInput.files[0]) acceptFile(fileInput.files[0]);
  });
  ["dragenter", "dragover"].forEach(function (eventName) {
    box.addEventListener(eventName, function (event) {
      event.preventDefault();
      box.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (eventName) {
    box.addEventListener(eventName, function (event) {
      event.preventDefault();
      box.classList.remove("dragover");
    });
  });
  box.addEventListener("drop", function (event) {
    const file = event.dataTransfer.files[0];
    if (file) acceptFile(file);
  });

  addBtn.addEventListener("click", function () {
    const label = labelInput.value.trim();
    if (!label) {
      labelInput.focus();
      draft.error = "Add a label so this " + (draft.mediaType === "video" ? "video" : "project") + " can be saved.";
      render();
      return;
    }
    const id = uid();
    const project = {
      id: id,
      category: category,
      label: label,
      notes: notesInput.value.trim(),
      image: draft.mediaType === "image" ? (draft.preview || "") : "",
      mediaType: draft.mediaType || "",
      createdAt: Date.now(),
    };
    function finishAdd() {
      state.projects.unshift(project);
      state.drafts[category] = { preview: "", mediaType: "", file: null, label: "", notes: "", error: "", fileName: "", busy: false };
      saveProjects();
      render();
    }
    if (draft.mediaType === "video" && draft.file) {
      if (draft.preview) mediaUrlCache[id] = draft.preview;
      else mediaUrlCache[id] = URL.createObjectURL(draft.file);
      draft.preview = "";
      draft.busy = true;
      draft.error = "";
      render();
      window.setTimeout(function () {
        putMedia(id, draft.file).then(finishAdd).catch(function () {
          draft.busy = false;
          draft.error = mediaErrorNote("save");
          render();
        });
      }, 40);
      return;
    }
    finishAdd();
  });

  return card;
}

function makeProjectCard(project) {
  const card = document.createElement("article");
  card.className = "project-card";
  card.innerHTML =
    "<h3></h3><p></p>" +
    '<div class="card-actions">' +
      '<button class="btn tiny" type="button">Edit</button>' +
      '<button class="btn tiny danger" type="button">Delete</button>' +
    "</div>";
  card.insertBefore(createMediaNode(project), card.firstChild);
  card.querySelector("h3").textContent = project.label;
  card.querySelector("p").textContent = project.notes || "No notes yet.";
  card.querySelector(".btn").addEventListener("click", function () { openEditor(project.id); });
  card.querySelector(".danger").addEventListener("click", function () {
    if (confirm("Delete “" + project.label + "” from " + categoryLabel(project.category) + "?")) {
      deleteMedia(project.id);
      if (mediaUrlCache[project.id]) {
        URL.revokeObjectURL(mediaUrlCache[project.id]);
        delete mediaUrlCache[project.id];
      }
      state.projects = state.projects.filter(function (item) { return item.id !== project.id; });
      saveProjects();
      render();
    }
  });
  return card;
}

function showEditorPreview(project) {
  const img = document.getElementById("editor-preview");
  const video = document.getElementById("editor-video-preview");
  const hint = document.getElementById("editor-upload-hint");
  const pending = state.pendingMedia;
  img.hidden = true;
  video.hidden = true;
  img.removeAttribute("src");
  video.removeAttribute("src");

  if (pending && pending.mediaType === "video" && pending.preview) {
    video.src = pending.preview;
    video.hidden = false;
    hint.hidden = true;
    video.addEventListener("click", function (event) { event.stopPropagation(); });
    return;
  }
  if (pending && pending.mediaType === "image" && pending.preview) {
    img.src = pending.preview;
    img.hidden = false;
    hint.hidden = true;
    return;
  }
  if (project.mediaType === "video") {
    video.hidden = false;
    hint.hidden = true;
    video.addEventListener("click", function (event) { event.stopPropagation(); });
    loadVideoSrc(project, video);
    return;
  }
  if (project.image) {
    img.src = project.image;
    img.hidden = false;
    hint.hidden = true;
    return;
  }
  hint.hidden = false;
}

function setEditorMediaError(message) {
  const el = document.getElementById("editor-media-error");
  if (!el) return;
  if (message) {
    el.hidden = false;
    el.textContent = message;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

function openEditor(id) {
  const project = state.projects.find(function (item) { return item.id === id; });
  if (!project) return;
  state.editingId = id;
  state.pendingImage = null;
  state.pendingMedia = null;
  document.getElementById("editor-category").textContent = "Stays in " + categoryLabel(project.category);
  document.getElementById("editor-label").value = project.label;
  document.getElementById("editor-notes").value = project.notes;
  document.getElementById("editor-photo").value = "";
  setEditorMediaError("");
  showEditorPreview(project);
  document.getElementById("editor").showModal();
}

function setEditorImage(file) {
  if (!file || !state.editingId) return;
  setEditorMediaError("");
  readMedia(file).then(function (media) {
    if (state.pendingMedia && state.pendingMedia.mediaType === "video" && state.pendingMedia.preview) {
      URL.revokeObjectURL(state.pendingMedia.preview);
    }
    state.pendingMedia = media;
    const project = state.projects.find(function (item) { return item.id === state.editingId; });
    if (project) showEditorPreview(project);
  }).catch(function (error) {
    setEditorMediaError(error.message || mediaErrorNote("type"));
  });
}

function closeEditor(keepVideoUrl) {
  const pending = state.pendingMedia;
  const keep = keepVideoUrl && pending && pending.preview && state.editingId && mediaUrlCache[state.editingId] === pending.preview;
  if (pending && pending.mediaType === "video" && pending.preview && !keep) {
    URL.revokeObjectURL(pending.preview);
  }
  state.editingId = null;
  state.pendingImage = null;
  state.pendingMedia = null;
  const dialog = document.getElementById("editor");
  if (dialog && dialog.open) dialog.close();
}

function paintChoices(emojiRowId, colorRowId, selectedEmoji, selectedColor, onEmoji, onColor) {
  const emojiRow = document.getElementById(emojiRowId);
  const colorRow = document.getElementById(colorRowId);
  if (!emojiRow || !colorRow) return;
  emojiRow.innerHTML = "";
  colorRow.innerHTML = "";
  TAB_EMOJIS.forEach(function (emoji) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "emoji-chip" + (emoji === selectedEmoji ? " active" : "");
    chip.textContent = emoji;
    chip.addEventListener("click", function () { onEmoji(emoji); });
    emojiRow.appendChild(chip);
  });
  TAB_COLORS.forEach(function (color) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch" + (color === selectedColor ? " selected" : "");
    swatch.style.background = color;
    swatch.setAttribute("aria-label", "Choose color");
    swatch.addEventListener("click", function () { onColor(color); });
    colorRow.appendChild(swatch);
  });
}

function paintNewCategoryChoices() {
  const iconInput = document.getElementById("new-cat-icon");
  paintChoices(
    "new-emoji-row",
    "new-color-row",
    iconInput ? iconInput.value.trim() : "♡",
    state.newTabColor,
    function (emoji) {
      if (iconInput) iconInput.value = emoji;
      paintNewCategoryChoices();
    },
    function (color) {
      state.newTabColor = color;
      paintNewCategoryChoices();
    }
  );
}

function paintEditCategoryChoices() {
  const iconInput = document.getElementById("tab-icon");
  paintChoices(
    "emoji-row",
    "color-row",
    iconInput ? iconInput.value.trim() : "♡",
    state.pendingTabColor,
    function (emoji) {
      if (iconInput) iconInput.value = emoji;
      paintEditCategoryChoices();
    },
    function (color) {
      state.pendingTabColor = color;
      paintEditCategoryChoices();
    }
  );
}

function createCategoryFromForm() {
  const nameInput = document.getElementById("new-cat-name");
  const descInput = document.getElementById("new-cat-description");
  const iconInput = document.getElementById("new-cat-icon");
  const label = nameInput ? nameInput.value.trim() : "";
  if (!label) {
    if (nameInput) nameInput.focus();
    return;
  }
  const id = "tab-" + uid();
  state.categories.push({
    id: id,
    label: label,
    description: descInput ? descInput.value.trim() : "",
    icon: iconInput && iconInput.value.trim() ? iconInput.value.trim() : "♡",
    color: state.newTabColor,
    builtIn: false,
  });
  if (nameInput) nameInput.value = "";
  if (descInput) descInput.value = "";
  if (iconInput) iconInput.value = "♡";
  saveCustomTabs();
  render();
  const created = document.getElementById(id);
  if (created && created.scrollIntoView) created.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openTabEditor(id) {
  const tab = categoryById(id);
  if (!tab || tab.builtIn) return;
  state.editingTabId = id;
  document.getElementById("tab-editor-title").textContent = "Edit category";
  document.getElementById("tab-name").value = tab.label;
  document.getElementById("tab-description").value = tab.description || "";
  document.getElementById("tab-icon").value = tab.icon || "♡";
  state.pendingTabColor = tab.color || TAB_COLORS[0];
  paintEditCategoryChoices();
  document.getElementById("tab-editor").showModal();
}

function closeTabEditor() {
  state.editingTabId = null;
  const dialog = document.getElementById("tab-editor");
  if (dialog && dialog.open) dialog.close();
}

function listen(id, eventName, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(eventName, handler);
}

listen("search", "input", function (event) {
  state.query = event.target.value;
  render();
});

listen("add-category-btn", "click", function () {
  const panel = document.getElementById("new-category-panel");
  if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  const nameInput = document.getElementById("new-cat-name");
  if (nameInput) nameInput.focus();
});

listen("create-category-btn", "click", createCategoryFromForm);
listen("new-cat-name", "keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    createCategoryFromForm();
  }
});

const editorPhoto = document.getElementById("editor-photo");
const editorBox = document.querySelector(".editor-upload");
if (editorPhoto) editorPhoto.addEventListener("change", function () { setEditorImage(editorPhoto.files[0]); });
if (editorBox) {
  editorBox.addEventListener("click", function (event) {
    if (event.target.closest("video")) return;
    if (event.target === editorPhoto) return;
    if (editorPhoto) editorPhoto.click();
  });
  ["dragenter", "dragover"].forEach(function (eventName) {
    editorBox.addEventListener(eventName, function (event) {
      event.preventDefault();
      editorBox.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (eventName) {
    editorBox.addEventListener(eventName, function (event) {
      event.preventDefault();
      editorBox.classList.remove("dragover");
    });
  });
  editorBox.addEventListener("drop", function (event) { setEditorImage(event.dataTransfer.files[0]); });
}

listen("editor-cancel", "click", closeEditor);
listen("editor-form", "submit", function (event) {
  event.preventDefault();
  const project = state.projects.find(function (item) { return item.id === state.editingId; });
  if (!project) return;
  project.label = document.getElementById("editor-label").value.trim();
  project.notes = document.getElementById("editor-notes").value.trim();
  if (!project.label) return;
  const pending = state.pendingMedia;
  function finishSave() {
    saveProjects();
    closeEditor();
    render();
  }
  if (pending && pending.mediaType === "image") {
    project.image = pending.preview || "";
    project.mediaType = "image";
    deleteMedia(project.id);
    if (mediaUrlCache[project.id]) {
      URL.revokeObjectURL(mediaUrlCache[project.id]);
      delete mediaUrlCache[project.id];
    }
    finishSave();
    return;
  }
  if (pending && pending.mediaType === "video" && pending.file) {
    if (pending.preview) mediaUrlCache[project.id] = pending.preview;
    else mediaUrlCache[project.id] = URL.createObjectURL(pending.file);
    putMedia(project.id, pending.file).then(function () {
      project.image = "";
      project.mediaType = "video";
      saveProjects();
      closeEditor(true);
      render();
    }).catch(function () {
      setEditorMediaError(mediaErrorNote("save"));
    });
    return;
  }
  finishSave();
});

listen("tab-cancel", "click", closeTabEditor);
listen("tab-editor-form", "submit", function (event) {
  event.preventDefault();
  const tab = categoryById(state.editingTabId);
  if (!tab || tab.builtIn) return;
  const label = document.getElementById("tab-name").value.trim();
  if (!label) return;
  tab.label = label;
  tab.description = document.getElementById("tab-description").value.trim();
  tab.icon = document.getElementById("tab-icon").value.trim() || "♡";
  tab.color = state.pendingTabColor;
  saveCustomTabs();
  closeTabEditor();
  render();
});

paintNewCategoryChoices();
render();
