const STORAGE_KEY = "pastel-project-warehouse";
const TABS_KEY = "pastel-project-warehouse-tabs";
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
    if (!state.drafts[tab.id]) state.drafts[tab.id] = { preview: "", label: "", notes: "" };
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

function readImage(file) {
  return new Promise(function (resolve, reject) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) {
      reject(new Error("Please choose a picture."));
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
  state.projects = state.projects.filter(function (project) { return project.category !== id; });
  state.categories = state.categories.filter(function (item) { return item.id !== id; });
  delete state.drafts[id];
  saveProjects();
  saveCustomTabs();
  render();
}

function makeUploadCard(category) {
  const draft = state.drafts[category] || { preview: "", label: "", notes: "" };
  const name = categoryLabel(category);
  const card = document.createElement("article");
  card.className = "upload-card";
  card.innerHTML =
    '<label class="upload-box">' +
      '<input type="file" accept="image/*" hidden />' +
      (draft.preview ? '<img src="' + draft.preview + '" alt="New ' + escapeAttr(name) + ' preview" />' : "") +
      '<span class="upload-hint"' + (draft.preview ? " hidden" : "") + ">" +
        "<strong>Upload a picture</strong>" +
        "<em>Click or drop a photo here</em>" +
      "</span>" +
    "</label>" +
    '<input class="label-input" type="text" maxlength="80" placeholder="Label this ' + escapeAttr(name.toLowerCase()) + ' project" />' +
    '<textarea class="notes-input" rows="3" maxlength="600" placeholder="Optional notes"></textarea>' +
    '<button class="btn" type="button">Add to ' + escapeAttr(name) + "</button>";

  const box = card.querySelector(".upload-box");
  const fileInput = card.querySelector('input[type="file"]');
  const labelInput = card.querySelector(".label-input");
  const notesInput = card.querySelector(".notes-input");
  labelInput.value = draft.label;
  notesInput.value = draft.notes;
  labelInput.addEventListener("input", function () { draft.label = labelInput.value; });
  notesInput.addEventListener("input", function () { draft.notes = notesInput.value; });

  function acceptFile(file) {
    readImage(file).then(function (preview) {
      draft.preview = preview;
      render();
    }).catch(function (error) {
      alert(error.message || "Could not read that picture.");
    });
  }

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

  card.querySelector(".btn").addEventListener("click", function () {
    const label = labelInput.value.trim();
    if (!label) {
      labelInput.focus();
      return;
    }
    state.projects.unshift({
      id: uid(),
      category: category,
      label: label,
      notes: notesInput.value.trim(),
      image: draft.preview || "",
      createdAt: Date.now(),
    });
    state.drafts[category] = { preview: "", label: "", notes: "" };
    saveProjects();
    render();
  });

  return card;
}

function makeProjectCard(project) {
  const card = document.createElement("article");
  card.className = "project-card";
  card.innerHTML =
    (project.image
      ? '<img src="' + project.image + '" alt="' + escapeAttr(project.label) + '" />'
      : '<div class="photo-fallback" aria-hidden="true">♡</div>') +
    "<h3></h3><p></p>" +
    '<div class="card-actions">' +
      '<button class="btn tiny" type="button">Edit</button>' +
      '<button class="btn tiny danger" type="button">Delete</button>' +
    "</div>";
  card.querySelector("h3").textContent = project.label;
  card.querySelector("p").textContent = project.notes || "No notes yet.";
  card.querySelector(".btn").addEventListener("click", function () { openEditor(project.id); });
  card.querySelector(".danger").addEventListener("click", function () {
    if (confirm("Delete “" + project.label + "” from " + categoryLabel(project.category) + "?")) {
      state.projects = state.projects.filter(function (item) { return item.id !== project.id; });
      saveProjects();
      render();
    }
  });
  return card;
}

function openEditor(id) {
  const project = state.projects.find(function (item) { return item.id === id; });
  if (!project) return;
  state.editingId = id;
  state.pendingImage = null;
  document.getElementById("editor-category").textContent = "Stays in " + categoryLabel(project.category);
  document.getElementById("editor-label").value = project.label;
  document.getElementById("editor-notes").value = project.notes;
  const preview = document.getElementById("editor-preview");
  const hint = document.getElementById("editor-upload-hint");
  if (project.image) {
    preview.src = project.image;
    preview.hidden = false;
    hint.hidden = true;
  } else {
    preview.removeAttribute("src");
    preview.hidden = true;
    hint.hidden = false;
  }
  document.getElementById("editor-photo").value = "";
  document.getElementById("editor").showModal();
}

function setEditorImage(file) {
  if (!file || !state.editingId) return;
  readImage(file).then(function (image) {
    state.pendingImage = image;
    const preview = document.getElementById("editor-preview");
    preview.src = image;
    preview.hidden = false;
    document.getElementById("editor-upload-hint").hidden = true;
  });
}

function closeEditor() {
  state.editingId = null;
  state.pendingImage = null;
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
  if (state.pendingImage) project.image = state.pendingImage;
  if (!project.label) return;
  saveProjects();
  closeEditor();
  render();
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
