const STORAGE_KEY = "pastel-project-warehouse";
const CATEGORIES = ["crochet", "squishy", "lego", "cardboard", "extra"];
const LABELS = {
  crochet: "Crochet",
  squishy: "Squishy",
  lego: "Lego",
  cardboard: "Cardboard",
  extra: "Extra",
};

const state = {
  projects: loadProjects(),
  query: "",
  drafts: Object.fromEntries(CATEGORIES.map((id) => [id, { preview: "", label: "", notes: "" }])),
  editingId: null,
  pendingImage: null,
};

function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveProjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Please choose a picture."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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
  const haystack = `${project.label} ${project.notes} ${LABELS[project.category]}`.toLowerCase();
  return haystack.includes(query);
}

function render() {
  const query = state.query.trim().toLowerCase();
  let visibleCount = 0;

  CATEGORIES.forEach((category) => {
    const section = document.querySelector(`[data-category="${category}"]`);
    const grid = section.querySelector("[data-grid]");
    const countEl = section.querySelector("[data-count]");
    const inCategory = state.projects.filter((project) => project.category === category);
    const visible = inCategory.filter((project) => matchesQuery(project, query));
    visibleCount += visible.length;
    countEl.textContent = inCategory.length;
    grid.innerHTML = "";
    grid.append(makeUploadCard(category));
    visible.forEach((project) => grid.append(makeProjectCard(project)));
    section.classList.toggle("hidden-by-search", Boolean(query) && visible.length === 0);
  });

  const status = document.getElementById("search-status");
  if (query) {
    status.hidden = false;
    status.textContent = visibleCount
      ? `Showing ${visibleCount} match${visibleCount === 1 ? "" : "es"} for “${state.query.trim()}”.`
      : `No projects match “${state.query.trim()}”. Try another label.`;
  } else {
    status.hidden = true;
  }
}

function makeUploadCard(category) {
  const draft = state.drafts[category];
  const card = document.createElement("article");
  card.className = "upload-card";
  card.innerHTML = `
    <label class="upload-box">
      <input type="file" accept="image/*" hidden />
      ${draft.preview ? `<img src="${draft.preview}" alt="New ${LABELS[category]} preview" />` : ""}
      <span class="upload-hint" ${draft.preview ? "hidden" : ""}>
        <strong>Upload a picture</strong>
        <em>Click or drop a photo here</em>
      </span>
    </label>
    <input class="label-input" type="text" maxlength="80" placeholder="Label this ${LABELS[category].toLowerCase()} project" />
    <textarea class="notes-input" rows="3" maxlength="600" placeholder="Optional notes"></textarea>
    <button class="btn" type="button">Add to ${LABELS[category]}</button>
  `;

  const box = card.querySelector(".upload-box");
  const fileInput = card.querySelector('input[type="file"]');
  const labelInput = card.querySelector(".label-input");
  const notesInput = card.querySelector(".notes-input");
  labelInput.value = draft.label;
  notesInput.value = draft.notes;
  labelInput.addEventListener("input", () => { draft.label = labelInput.value; });
  notesInput.addEventListener("input", () => { draft.notes = notesInput.value; });

  async function acceptFile(file) {
    try {
      draft.preview = await readImage(file);
      render();
    } catch (error) {
      alert(error.message || "Could not read that picture.");
    }
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) acceptFile(fileInput.files[0]);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    box.addEventListener(eventName, (event) => {
      event.preventDefault();
      box.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    box.addEventListener(eventName, (event) => {
      event.preventDefault();
      box.classList.remove("dragover");
    });
  });
  box.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) acceptFile(file);
  });

  card.querySelector(".btn").addEventListener("click", async () => {
    const label = labelInput.value.trim();
    if (!label) {
      labelInput.focus();
      return;
    }
    state.projects.unshift({
      id: uid(),
      category,
      label,
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
  card.innerHTML = `
    ${project.image
      ? `<img src="${project.image}" alt="${escapeHtml(project.label)}" />`
      : `<div class="photo-fallback" aria-hidden="true">♡</div>`}
    <h3></h3>
    <p></p>
    <div class="card-actions">
      <button class="btn tiny" type="button">Edit</button>
      <button class="btn tiny danger" type="button">Delete</button>
    </div>
  `;
  card.querySelector("h3").textContent = project.label;
  card.querySelector("p").textContent = project.notes || "No notes yet.";
  card.querySelector(".btn").addEventListener("click", () => openEditor(project.id));
  card.querySelector(".danger").addEventListener("click", () => {
    if (confirm(`Delete “${project.label}” from ${LABELS[project.category]}?`)) {
      state.projects = state.projects.filter((item) => item.id !== project.id);
      saveProjects();
      render();
    }
  });
  return card;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function openEditor(id) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  state.editingId = id;
  state.pendingImage = null;
  document.getElementById("editor-category").textContent = `Stays in ${LABELS[project.category]}`;
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

async function setEditorImage(file) {
  if (!file || !state.editingId) return;
  state.pendingImage = await readImage(file);
  const preview = document.getElementById("editor-preview");
  preview.src = state.pendingImage;
  preview.hidden = false;
  document.getElementById("editor-upload-hint").hidden = true;
}

function closeEditor() {
  state.editingId = null;
  state.pendingImage = null;
  document.getElementById("editor").close();
}

document.getElementById("search").addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

const editorPhoto = document.getElementById("editor-photo");
const editorBox = document.querySelector(".editor-upload");

editorPhoto.addEventListener("change", () => setEditorImage(editorPhoto.files[0]));

["dragenter", "dragover"].forEach((eventName) => {
  editorBox.addEventListener(eventName, (event) => {
    event.preventDefault();
    editorBox.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  editorBox.addEventListener(eventName, (event) => {
    event.preventDefault();
    editorBox.classList.remove("dragover");
  });
});
editorBox.addEventListener("drop", (event) => setEditorImage(event.dataTransfer.files[0]));

document.getElementById("editor-cancel").addEventListener("click", closeEditor);
document.getElementById("editor-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const project = state.projects.find((item) => item.id === state.editingId);
  if (!project) return;
  project.label = document.getElementById("editor-label").value.trim();
  project.notes = document.getElementById("editor-notes").value.trim();
  if (state.pendingImage) project.image = state.pendingImage;
  if (!project.label) return;
  saveProjects();
  closeEditor();
  render();
});

render();
