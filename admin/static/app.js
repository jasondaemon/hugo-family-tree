const app = document.getElementById("app");

const state = {
  people: [],
  peopleIndex: new Map(),
};

function escapeHtml(value) {
  return (value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || data.error || res.statusText;
    const msg = typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
    throw new Error(msg);
  }
  return data;
}

async function loadPeople() {
  const data = await fetchJson("/people/list");
  state.people = data.people || [];
  state.peopleIndex = new Map(state.people.map((p) => [p.person_id, p]));
}

async function updatePeopleDatalist(query) {
  const data = await fetchJson(`/people/search?q=${encodeURIComponent(query || "")}`);
  const list = document.getElementById("people-datalist");
  if (!list) return;
  list.innerHTML = (data.people || [])
    .map(
      (p) =>
        `<option value="${escapeHtml(p.person_id)}" label="${escapeHtml(
          p.display_name || p.title
        )}"></option>`
    )
    .join("");
}

function layout(html) {
  app.innerHTML = `<div class="panel">${html}</div>`;
}

async function renderHome() {
  let status = { configured: true, theme_id: "" };
  let themes = [];
  try {
    status = await fetchJson("/api/setup/status");
  } catch (err) {
    status = { configured: true };
  }
  try {
    const themeData = await fetchJson("/api/setup/themes");
    themes = themeData.themes || [];
    if (!status.theme_id) status.theme_id = themeData.current_theme_id || "";
  } catch (err) {
    themes = [];
  }

  const selectableThemes = themes.filter((t) => t.selectable === "true");
  const referenceThemes = themes.filter((t) => t.selectable !== "true");

  const themeOptions = selectableThemes
    .map((t) => {
      const selected = t.id === status.theme_id ? "selected" : "";
      return `<option value="${escapeHtml(t.id)}" ${selected}>${escapeHtml(t.name)}</option>`;
    })
    .join("");

  const renderThemeLink = (t) => {
    const links = [];
    if (t.demo_url) {
      links.push(`<a href="${escapeHtml(t.demo_url)}" target="_blank" rel="noopener noreferrer">Demo</a>`);
    }
    if (t.repo_url) {
      links.push(`<a href="${escapeHtml(t.repo_url)}" target="_blank" rel="noopener noreferrer">Repository</a>`);
    }
    return links.join(" | ");
  };

  const themeHelp = selectableThemes
    .map((t) => {
      return `
        <article class="theme-card compact">
          <div class="theme-head">
            <strong>${escapeHtml(t.name)}</strong>
            <span class="theme-badge">Starter</span>
          </div>
          <p>${escapeHtml(t.description)}</p>
          <div class="theme-meta">License: ${escapeHtml(t.license)}</div>
          <div class="theme-links">${renderThemeLink(t)}</div>
        </article>
      `;
    })
    .join("");

  const referenceHelp = referenceThemes
    .map((t) => {
      const installBtn =
        t.installable === "true"
          ? ` <button type="button" class="secondary" data-install-theme="${escapeHtml(
              t.id
            )}">Install Theme</button>`
          : "";
      return `
        <article class="theme-card">
          <div class="theme-head">
            <strong>${escapeHtml(t.name)}</strong>
            <span class="theme-badge muted-badge">Reference</span>
          </div>
          <p>${escapeHtml(t.description)}</p>
          <div class="theme-meta">License: ${escapeHtml(t.license || "unknown")}</div>
          <div class="theme-actions">
            <span class="theme-links">${renderThemeLink(t)}</span>
            ${installBtn}
          </div>
        </article>
      `;
    })
    .join("");

  const setupPanel = status.configured
    ? `
      <p class="muted">Hugo config detected.</p>
      <div class="setup-grid">
        <section class="theme-section">
          <label>Starter Theme</label>
          <select id="theme-select">${themeOptions}</select>
          <div class="theme-grid compact-grid">${themeHelp}</div>
          <div class="actions">
            <button id="theme-apply-btn">Apply Theme</button>
          </div>
        </section>
        <section class="theme-section">
          <h5>External Themes</h5>
          <p class="muted">Installable allowlist with quick links to demos and repositories.</p>
          <div class="theme-grid">${referenceHelp}</div>
          <p class="muted">Theme licenses are set by their authors. Review each license before use.</p>
        </section>
      </div>
    `
    : `
      <p class="muted">No Hugo config found. Initialize the site to create a minimal config and content folders.</p>
      <div class="setup-grid">
        <section class="theme-section">
          <label>Starter Theme</label>
          <select id="theme-select">${themeOptions}</select>
          <div class="theme-grid compact-grid">${themeHelp}</div>
        </section>
        <section class="theme-section">
          <h5>External Themes</h5>
          <p class="muted">Installable allowlist with quick links to demos and repositories.</p>
          <div class="theme-grid">${referenceHelp}</div>
          <p class="muted">Theme licenses are set by their authors. Review each license before use.</p>
        </section>
      </div>
      <div class="actions">
        <button id="setup-btn">Initialize Site</button>
      </div>
    `;

  layout(`
    <h2>Welcome</h2>
    <p class="muted">Manage family records and trigger Hugo builds.</p>
    <div class="actions">
      <a href="/people"><button>People</button></a>
      <a href="/people/new"><button class="secondary">Add Person</button></a>
      <a href="/build"><button>Build Site</button></a>
    </div>
    <div class="subsection">
      <h4>Site Setup</h4>
      ${setupPanel}
      <pre id="setup-out" class="panel" hidden></pre>
    </div>
  `);

  const setupBtn = document.getElementById("setup-btn");
  if (setupBtn) {
    setupBtn.addEventListener("click", async () => {
      const out = document.getElementById("setup-out");
      const themeSelect = document.getElementById("theme-select");
      const selectedTheme = themeSelect ? themeSelect.value : "";
      out.hidden = false;
      out.textContent = "Initializing...";
      try {
        const result = await fetchJson("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme_id: selectedTheme }),
        });
        out.textContent = JSON.stringify(result, null, 2);
      } catch (err) {
        out.textContent = err.message;
      }
    });
  }

  const themeApplyBtn = document.getElementById("theme-apply-btn");
  if (themeApplyBtn) {
    themeApplyBtn.addEventListener("click", async () => {
      const out = document.getElementById("setup-out");
      const themeSelect = document.getElementById("theme-select");
      const selectedTheme = themeSelect ? themeSelect.value : "";
      out.hidden = false;
      out.textContent = "Applying theme...";
      try {
        const result = await fetchJson("/api/setup/theme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme_id: selectedTheme }),
        });
        out.textContent = JSON.stringify(result, null, 2);
      } catch (err) {
        out.textContent = err.message;
      }
    });
  }

  const installButtons = document.querySelectorAll("[data-install-theme]");
  installButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const out = document.getElementById("setup-out");
      const themeId = btn.getAttribute("data-install-theme");
      out.hidden = false;
      out.textContent = `Installing theme ${themeId}...`;
      try {
        const result = await fetchJson("/api/setup/theme/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme_id: themeId }),
        });
        out.textContent = JSON.stringify(result, null, 2);
      } catch (err) {
        out.textContent = err.message;
      }
    });
  });
}

function renderPeopleList() {
  const items = state.people
    .map(
      (p) => `
    <div class="list-item">
      <div>
        <div><strong>${escapeHtml(p.display_name || p.title)}</strong></div>
      </div>
      <div>
        <a href="/people/${encodeURIComponent(p.slug || p.person_id)}">Edit</a>
      </div>
    </div>`
    )
    .join("");

  layout(`
    <h2>People</h2>
    <div class="actions">
      <a href="/people/new"><button>Add Person</button></a>
    </div>
    <div class="list">${items || "<p>No people found.</p>"}</div>
  `);
}

function ensureDefaults(person) {
  return {
    title: "",
    date: "",
    draft: false,
    person_id: "",
    slug: "",
    aliases: [],
    names: {
      full: "",
      given: "",
      middle: "",
      surname: "",
      suffix: "",
      maiden: "",
      also_known_as: [],
    },
    sex: "U",
    vitals: {
      born: "",
      died: "",
      birth_place: "",
      death_place: "",
      burial_place: "",
      cause_of_death: "",
    },
    relations: {
      parents: { father: "", mother: "" },
      spouses: [],
      children: [],
      siblings: [],
    },
    media: {
      featured: "",
      gallery: [],
    },
    ids: {
      findagrave: "",
      familysearch: "",
      wikitree: "",
      geni: "",
      ancestry: "",
    },
    sources: [],
    confidence: {
      identity: "",
      vitals: "",
      parents: "",
      notes: "",
    },
    provenance: {
      imported_from: "",
      wp_slug: "",
      wp_type: "",
    },
    body: "",
    ...person,
  };
}

function renderSection(title, content) {
  return `
    <section class="section">
      <h3>${title}</h3>
      ${content}
    </section>
  `;
}

function optionsForRelations(selected, opts = {}) {
  const selectedSet = new Set(selected || []);
  const exclude = opts.exclude || "";
  const allowedSex = opts.sex || null;
  return (state.people || [])
    .filter((p) => !exclude || p.person_id !== exclude)
    .filter((p) => {
      if (!allowedSex) return true;
      return allowedSex.includes(p.sex || "U");
    })
    .map((p) => {
      const sel = selectedSet.has(p.person_id) ? "selected" : "";
      const label = p.display_name || p.title || "Unknown";
      return `<option value="${escapeHtml(p.person_id)}" ${sel}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function listToTextarea(list) {
  return (list || []).join("\n");
}

function textareaToList(value) {
  return (value || "")
    .split(/\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function renderPersonForm(person, mode) {
  const isEdit = mode === "edit";
  const record = ensureDefaults(person);

  const spouseRows = record.relations.spouses
    .map(
      (s, idx) => `
      <div class="spouse-row" data-index="${idx}">
        <div class="row-3">
          <div>
            <label>Spouse</label>
            <input type="text" class="search-input" data-filter="spouse_person_${idx}" placeholder="Search people..." />
            <select name="spouse_person_${idx}">
              <option value=""></option>
              ${optionsForRelations([s.person], { exclude: record.person_id })}
            </select>
            <button type="button" class="link-button" data-quick-add-spouse="${idx}">Quick Add Spouse</button>
          </div>
          <div>
            <label>From</label>
            <input type="text" name="spouse_from_${idx}" value="${escapeHtml(s.from || s.from_ || "")}" />
          </div>
          <div>
            <label>To</label>
            <input type="text" name="spouse_to_${idx}" value="${escapeHtml(s.to || "")}" />
          </div>
        </div>
        <div class="row">
          <div>
            <label>Place</label>
            <input type="text" name="spouse_place_${idx}" value="${escapeHtml(s.place || "")}" />
          </div>
          <div>
            <label>Notes</label>
            <input type="text" name="spouse_notes_${idx}" value="${escapeHtml(s.notes || "")}" />
          </div>
        </div>
        <button type="button" class="secondary" data-remove-spouse="${idx}">Remove Spouse</button>
      </div>
    `
    )
    .join("");

  const galleryRows = record.media.gallery
    .map(
      (g, idx) => `
      <div class="gallery-row" data-index="${idx}">
        <div class="row">
          <div>
            <label>File</label>
            <input type="text" name="gallery_file_${idx}" value="${escapeHtml(g.file)}" />
          </div>
          <div>
            <label>Type</label>
            <select name="gallery_type_${idx}">
              ${["photo", "document", "census", "map", "grave", "other"]
                .map((t) => `<option value="${t}" ${g.type === t ? "selected" : ""}>${t}</option>`)
                .join("")}
            </select>
          </div>
        </div>
        <div class="row">
          <div>
            <label>Title</label>
            <input type="text" name="gallery_title_${idx}" value="${escapeHtml(g.title || "")}" />
          </div>
          <div>
            <label>Caption</label>
            <input type="text" name="gallery_caption_${idx}" value="${escapeHtml(g.caption || "")}" />
          </div>
        </div>
        <div class="row">
          <div>
            <label>Date</label>
            <input type="text" name="gallery_date_${idx}" value="${escapeHtml(g.date || "")}" />
          </div>
          <div>
            <label>Source Key</label>
            <input type="text" name="gallery_source_${idx}" value="${escapeHtml(g.source_key || "")}" />
          </div>
        </div>
        <button type="button" class="secondary" data-remove-gallery="${idx}">Remove Media</button>
      </div>
    `
    )
    .join("");

  const sourceRows = record.sources
    .map(
      (s, idx) => `
      <div class="source-row" data-index="${idx}">
        <div class="row">
          <div>
            <label>Key</label>
            <input type="text" name="source_key_${idx}" value="${escapeHtml(s.key)}" />
          </div>
          <div>
            <label>Title</label>
            <input type="text" name="source_title_${idx}" value="${escapeHtml(s.title || "")}" />
          </div>
        </div>
        <div class="row">
          <div>
            <label>URL</label>
            <input type="text" name="source_url_${idx}" value="${escapeHtml(s.url || "")}" />
          </div>
          <div>
            <label>Accessed</label>
            <input type="text" name="source_accessed_${idx}" value="${escapeHtml(s.accessed || "")}" />
          </div>
        </div>
        <div>
          <label>Notes</label>
          <input type="text" name="source_notes_${idx}" value="${escapeHtml(s.notes || "")}" />
        </div>
        <button type="button" class="secondary" data-remove-source="${idx}">Remove Source</button>
      </div>
    `
    )
    .join("");

  const content = `
    <h2>${isEdit ? "Edit Person" : "New Person"}</h2>
    <div id="error-box" class="error-box" hidden></div>
    <form id="person-form">
      ${renderSection(
        "Identity",
        `
        <div class="row">
          <div>
            <label>Full Name</label>
            <input type="text" name="names_full" value="${escapeHtml(record.names.full)}" required />
          </div>
          <div>
            <label>Record</label>
            <div class="muted">System-managed ID</div>
          </div>
        </div>
        <div class="row-3">
          <div>
            <label>Given</label>
            <input type="text" name="names_given" value="${escapeHtml(record.names.given)}" />
          </div>
          <div>
            <label>Middle</label>
            <input type="text" name="names_middle" value="${escapeHtml(record.names.middle)}" />
          </div>
          <div>
            <label>Surname</label>
            <input type="text" name="names_surname" value="${escapeHtml(record.names.surname)}" />
          </div>
        </div>
        <div class="row-3">
          <div>
            <label>Suffix</label>
            <input type="text" name="names_suffix" value="${escapeHtml(record.names.suffix)}" />
          </div>
          <div>
            <label>Maiden</label>
            <input type="text" name="names_maiden" value="${escapeHtml(record.names.maiden)}" />
          </div>
          <div>
            <label>Also Known As (one per line)</label>
            <textarea name="names_aka">${escapeHtml(listToTextarea(record.names.also_known_as))}</textarea>
          </div>
        </div>
        <div class="row">
          <div>
            <label>Sex</label>
            <select name="sex">
              <option value="U" ${record.sex === "U" ? "selected" : ""}>U</option>
              <option value="M" ${record.sex === "M" ? "selected" : ""}>M</option>
              <option value="F" ${record.sex === "F" ? "selected" : ""}>F</option>
            </select>
          </div>
          <div>
            <label>Aliases (legacy URLs)</label>
            <textarea name="aliases">${escapeHtml(listToTextarea(record.aliases))}</textarea>
          </div>
        </div>
      `
      )}

      ${renderSection(
        "Vital Facts",
        `
        <div class="row-3">
          <div>
            <label>Born</label>
            <input type="text" name="vitals_born" value="${escapeHtml(record.vitals.born)}" />
          </div>
          <div>
            <label>Died</label>
            <input type="text" name="vitals_died" value="${escapeHtml(record.vitals.died)}" />
          </div>
          <div>
            <label>Cause of Death</label>
            <input type="text" name="vitals_cause" value="${escapeHtml(record.vitals.cause_of_death)}" />
          </div>
        </div>
        <div class="row-3">
          <div>
            <label>Birth Place</label>
            <input type="text" name="vitals_birth_place" value="${escapeHtml(record.vitals.birth_place)}" />
          </div>
          <div>
            <label>Death Place</label>
            <input type="text" name="vitals_death_place" value="${escapeHtml(record.vitals.death_place)}" />
          </div>
          <div>
            <label>Burial Place</label>
            <input type="text" name="vitals_burial_place" value="${escapeHtml(record.vitals.burial_place)}" />
          </div>
        </div>
      `
      )}

      ${renderSection(
        "Relationships",
        `
        <div class="row">
          <div>
            <label>Father</label>
            <input type="text" class="search-input" data-filter="father" placeholder="Search people..." />
            <select name="father">
              <option value=""></option>
              ${optionsForRelations([record.relations.parents.father], {
                sex: ["M", "U"],
                exclude: record.person_id,
              })}
            </select>
            <button type="button" class="link-button" data-quick-add="father">Quick Add</button>
          </div>
          <div>
            <label>Mother</label>
            <input type="text" class="search-input" data-filter="mother" placeholder="Search people..." />
            <select name="mother">
              <option value=""></option>
              ${optionsForRelations([record.relations.parents.mother], {
                sex: ["F", "U"],
                exclude: record.person_id,
              })}
            </select>
            <button type="button" class="link-button" data-quick-add="mother">Quick Add</button>
          </div>
        </div>
        <div class="row">
          <div>
            <label>Children</label>
            <input type="text" class="search-input" data-filter="children" placeholder="Search people..." />
            <select name="children" multiple size="6">${optionsForRelations(record.relations.children, {
              exclude: record.person_id,
            })}</select>
            <button type="button" class="link-button" data-quick-add="children">Quick Add Child</button>
          </div>
          <div>
            <label>Siblings</label>
            <input type="text" class="search-input" data-filter="siblings" placeholder="Search people..." />
            <select name="siblings" multiple size="6">${optionsForRelations(record.relations.siblings, {
              exclude: record.person_id,
            })}</select>
            <button type="button" class="link-button" data-quick-add="siblings">Quick Add Sibling</button>
          </div>
        </div>
        <div class="subsection">
          <div class="subheader">
            <h4>Spouses</h4>
            <button type="button" id="add-spouse">Add Spouse</button>
          </div>
          ${spouseRows || "<p class=\"muted\">No spouses added.</p>"}
        </div>
      `
      )}

      ${renderSection(
        "Media",
        `
        <div class="row">
          <div>
            <label>Featured (path)</label>
            <input type="text" name="media_featured" value="${escapeHtml(record.media.featured)}" />
            <input type="file" id="featured-upload" />
          </div>
          <div>
            <label>Gallery Upload</label>
            <input type="file" id="gallery-upload" multiple />
          </div>
        </div>
        <div class="subsection">
          <div class="subheader">
            <h4>Gallery Entries</h4>
            <button type="button" id="add-gallery">Add Media Entry</button>
          </div>
          ${galleryRows || "<p class=\"muted\">No media entries.</p>"}
        </div>
      `
      )}

      ${renderSection(
        "External IDs",
        `
        <div class="row-3">
          <div>
            <label>Find a Grave</label>
            <input type="text" name="ids_findagrave" value="${escapeHtml(record.ids.findagrave)}" />
          </div>
          <div>
            <label>FamilySearch</label>
            <input type="text" name="ids_familysearch" value="${escapeHtml(record.ids.familysearch)}" />
          </div>
          <div>
            <label>WikiTree</label>
            <input type="text" name="ids_wikitree" value="${escapeHtml(record.ids.wikitree)}" />
          </div>
        </div>
        <div class="row-3">
          <div>
            <label>Geni</label>
            <input type="text" name="ids_geni" value="${escapeHtml(record.ids.geni)}" />
          </div>
          <div>
            <label>Ancestry</label>
            <input type="text" name="ids_ancestry" value="${escapeHtml(record.ids.ancestry)}" />
          </div>
        </div>
      `
      )}

      ${renderSection(
        "Evidence / Sources",
        `
        <div class="subsection">
          <div class="subheader">
            <h4>Sources</h4>
            <button type="button" id="add-source">Add Source</button>
          </div>
          ${sourceRows || "<p class=\"muted\">No sources added.</p>"}
        </div>
      `
      )}

      ${renderSection(
        "Confidence",
        `
        <div class="row-3">
          <div>
            <label>Identity</label>
            <select name="conf_identity">
              ${["", "high", "medium", "low"]
                .map((v) => `<option value="${v}" ${record.confidence.identity === v ? "selected" : ""}>${v || "-"}</option>`)
                .join("")}
            </select>
          </div>
          <div>
            <label>Vitals</label>
            <select name="conf_vitals">
              ${["", "high", "medium", "low"]
                .map((v) => `<option value="${v}" ${record.confidence.vitals === v ? "selected" : ""}>${v || "-"}</option>`)
                .join("")}
            </select>
          </div>
          <div>
            <label>Parents</label>
            <select name="conf_parents">
              ${["", "high", "medium", "low"]
                .map((v) => `<option value="${v}" ${record.confidence.parents === v ? "selected" : ""}>${v || "-"}</option>`)
                .join("")}
            </select>
          </div>
        </div>
        <div>
          <label>Notes</label>
          <textarea name="conf_notes">${escapeHtml(record.confidence.notes)}</textarea>
        </div>
      `
      )}

      ${renderSection(
        "Provenance (Advanced)",
        `
        <details>
          <summary>Show provenance fields</summary>
          <div class="row-3">
            <div>
              <label>Imported From</label>
              <input type="text" name="prov_imported" value="${escapeHtml(record.provenance.imported_from)}" />
            </div>
            <div>
              <label>WP Slug</label>
              <input type="text" name="prov_wp_slug" value="${escapeHtml(record.provenance.wp_slug)}" />
            </div>
            <div>
              <label>WP Type</label>
              <input type="text" name="prov_wp_type" value="${escapeHtml(record.provenance.wp_type)}" />
            </div>
          </div>
        </details>
      `
      )}

      ${renderSection(
        "Record Settings",
        `
        <div class="row-3">
          <div>
            <label>Slug</label>
            <input type="text" name="slug" value="${escapeHtml(record.slug)}" />
          </div>
          <div>
            <label>Date</label>
            <input type="text" name="date" value="${escapeHtml(record.date)}" placeholder="YYYY-MM-DDTHH:MM:SSZ" />
          </div>
          <div>
            <label>Draft</label>
            <div>
              <input type="checkbox" name="draft" ${record.draft ? "checked" : ""} /> Draft
            </div>
          </div>
        </div>
      `
      )}

      ${renderSection(
        "Body",
        `
        <div>
          <label>Markdown Body</label>
          <textarea name="body">${escapeHtml(record.body)}</textarea>
        </div>
      `
      )}

      <datalist id="people-datalist">
        ${(state.people || [])
          .map(
            (p) =>
              `<option value="${escapeHtml(p.person_id)}" label="${escapeHtml(
                p.display_name || p.title
              )}"></option>`
          )
          .join("")}
      </datalist>

      <div class="actions">
        <button type="submit">${isEdit ? "Save" : "Create"}</button>
        <a href="/people"><button type="button" class="secondary">Back</button></a>
      </div>
    </form>
  `;

  layout(content);

  const form = document.getElementById("person-form");
  const errorBox = document.getElementById("error-box");

  function attachSearchFilters(root) {
    root.querySelectorAll("input[list='people-datalist']").forEach((input) => {
      input.addEventListener("input", () => {
        updatePeopleDatalist(input.value);
      });
    });

    root.querySelectorAll("input[data-filter]").forEach((input) => {
      input.addEventListener("input", () => {
        const targetName = input.getAttribute("data-filter");
        const select = form.querySelector(`select[name='${targetName}']`);
        if (!select) return;
        const q = input.value.toLowerCase();
        Array.from(select.options).forEach((opt) => {
          const hay = `${opt.text} ${opt.value}`.toLowerCase();
          opt.hidden = q ? !hay.includes(q) : false;
        });
      });
    });
  }

  attachSearchFilters(form);

  function refreshRelationSelects() {
    const fatherSelect = form.querySelector("select[name='father']");
    if (fatherSelect) {
      const current = fatherSelect.value;
      fatherSelect.innerHTML =
        `<option value=\"\"></option>` +
        optionsForRelations([current], { sex: ["M", "U"], exclude: record.person_id });
      fatherSelect.value = current;
    }

    const motherSelect = form.querySelector("select[name='mother']");
    if (motherSelect) {
      const current = motherSelect.value;
      motherSelect.innerHTML =
        `<option value=\"\"></option>` +
        optionsForRelations([current], { sex: ["F", "U"], exclude: record.person_id });
      motherSelect.value = current;
    }

    const childrenSelect = form.querySelector("select[name='children']");
    if (childrenSelect) {
      const selected = Array.from(childrenSelect.selectedOptions).map((o) => o.value);
      childrenSelect.innerHTML = optionsForRelations(selected, { exclude: record.person_id });
      Array.from(childrenSelect.options).forEach((opt) => {
        opt.selected = selected.includes(opt.value);
      });
    }

    const siblingsSelect = form.querySelector("select[name='siblings']");
    if (siblingsSelect) {
      const selected = Array.from(siblingsSelect.selectedOptions).map((o) => o.value);
      siblingsSelect.innerHTML = optionsForRelations(selected, { exclude: record.person_id });
      Array.from(siblingsSelect.options).forEach((opt) => {
        opt.selected = selected.includes(opt.value);
      });
    }

    form.querySelectorAll(".spouse-row").forEach((row) => {
      const select = row.querySelector("select[name^='spouse_person']");
      if (!select) return;
      const current = select.value;
      select.innerHTML =
        `<option value=\"\"></option>` +
        optionsForRelations([current], { exclude: record.person_id });
      select.value = current;
    });
  }


  const draftKey = isEdit ? `draft:${record.person_id}` : "draft:new";
  const savedDraft = localStorage.getItem(draftKey);
  if (savedDraft && confirm("A saved draft exists. Restore it?")) {
    const draft = JSON.parse(savedDraft);
    Object.entries(draft).forEach(([name, value]) => {
      const field = form.querySelector(`[name='${name}']`);
      if (!field) return;
      if (field.tagName === "SELECT" && field.multiple && Array.isArray(value)) {
        Array.from(field.options).forEach((opt) => {
          opt.selected = value.includes(opt.value);
        });
      } else if (field.type === "checkbox") {
        field.checked = !!value;
      } else {
        field.value = value;
      }
    });
  }

  form.addEventListener("input", () => {
    const draft = {};
    form.querySelectorAll("[name]").forEach((field) => {
      if (field.tagName === "SELECT" && field.multiple) {
        draft[field.name] = Array.from(field.selectedOptions).map((o) => o.value);
      } else if (field.type === "checkbox") {
        draft[field.name] = field.checked;
      } else {
        draft[field.name] = field.value;
      }
    });
    localStorage.setItem(draftKey, JSON.stringify(draft));
  });

  form.addEventListener("click", async (event) => {
    const target = event.target;
    if (target.matches("[data-remove-spouse]")) {
      const idx = target.getAttribute("data-remove-spouse");
      form.querySelector(`.spouse-row[data-index='${idx}']`).remove();
    }
    if (target.matches("[data-remove-gallery]")) {
      const idx = target.getAttribute("data-remove-gallery");
      form.querySelector(`.gallery-row[data-index='${idx}']`).remove();
    }
    if (target.matches("[data-remove-source]")) {
      const idx = target.getAttribute("data-remove-source");
      form.querySelector(`.source-row[data-index='${idx}']`).remove();
    }
    if (target.matches("[data-quick-add]")) {
      const field = target.getAttribute("data-quick-add");
      const fullName = prompt("Full name for new person?");
      if (!fullName) return;
      const parts = fullName.trim().split(/\s+/);
      const given = parts[0] || "";
      const surname = parts.length > 1 ? parts[parts.length - 1] : "";
      try {
        const created = await fetchJson("/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: fullName,
            names: { full: fullName, given, surname },
          }),
        });
        await loadPeople();
        refreshRelationSelects();
        const personId = created.person_id;
        const input = form.querySelector(`[name='${field}']`);
        if (input) {
          if (input.tagName === "SELECT") {
            let option = Array.from(input.options).find((opt) => opt.value === personId);
            if (!option) {
              option = new Option(fullName, personId, true, true);
              input.add(option);
            } else {
              option.selected = true;
            }
          } else {
            input.value = personId;
          }
        }
        alert("Created person and added to field.");
      } catch (err) {
        alert(err.message);
      }
    }
    if (target.matches("[data-quick-add-spouse]")) {
      const fullName = prompt("Full name for new spouse?");
      if (!fullName) return;
      const parts = fullName.trim().split(/\s+/);
      const given = parts[0] || "";
      const surname = parts.length > 1 ? parts[parts.length - 1] : "";
      try {
        const created = await fetchJson("/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: fullName,
            names: { full: fullName, given, surname },
          }),
        });
        await loadPeople();
        refreshRelationSelects();
        const personId = created.person_id;
        const row = target.closest(".spouse-row");
        const input = row ? row.querySelector("[name^='spouse_person']") : null;
        if (input) input.value = personId;
        alert("Created spouse and added to field.");
      } catch (err) {
        alert(err.message);
      }
    }
  });

  document.getElementById("add-spouse").addEventListener("click", () => {
    const id = Date.now();
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="spouse-row" data-index="new-${id}">
        <div class="row-3">
          <div>
            <label>Spouse</label>
            <input type="text" class="search-input" data-filter="spouse_person_new_${id}" placeholder="Search people..." />
            <select name="spouse_person_new_${id}">
              <option value=""></option>
              ${optionsForRelations([], { exclude: record.person_id })}
            </select>
            <button type="button" class="link-button" data-quick-add-spouse="new">Quick Add Spouse</button>
          </div>
          <div>
            <label>From</label>
            <input type="text" name="spouse_from_new" />
          </div>
          <div>
            <label>To</label>
            <input type="text" name="spouse_to_new" />
          </div>
        </div>
        <div class="row">
          <div>
            <label>Place</label>
            <input type="text" name="spouse_place_new" />
          </div>
          <div>
            <label>Notes</label>
            <input type="text" name="spouse_notes_new" />
          </div>
        </div>
        <button type="button" class="secondary" data-remove-spouse="new-${id}">Remove Spouse</button>
      </div>
    `;
    const row = container.firstElementChild;
    form.querySelector(".subsection").appendChild(row);
    attachSearchFilters(row);
  });

  document.getElementById("add-gallery").addEventListener("click", () => {
    const id = Date.now();
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="gallery-row" data-index="new-${id}">
        <div class="row">
          <div>
            <label>File</label>
            <input type="text" name="gallery_file_new" />
          </div>
          <div>
            <label>Type</label>
            <select name="gallery_type_new">
              ${["photo", "document", "census", "map", "grave", "other"].map((t) => `<option value="${t}">${t}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="row">
          <div>
            <label>Title</label>
            <input type="text" name="gallery_title_new" />
          </div>
          <div>
            <label>Caption</label>
            <input type="text" name="gallery_caption_new" />
          </div>
        </div>
        <div class="row">
          <div>
            <label>Date</label>
            <input type="text" name="gallery_date_new" />
          </div>
          <div>
            <label>Source Key</label>
            <input type="text" name="gallery_source_new" />
          </div>
        </div>
        <button type="button" class="secondary" data-remove-gallery="new-${id}">Remove Media</button>
      </div>
    `;
    form.querySelectorAll(".subsection")[1].appendChild(container.firstElementChild);
  });

  document.getElementById("add-source").addEventListener("click", () => {
    const id = Date.now();
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="source-row" data-index="new-${id}">
        <div class="row">
          <div>
            <label>Key</label>
            <input type="text" name="source_key_new" />
          </div>
          <div>
            <label>Title</label>
            <input type="text" name="source_title_new" />
          </div>
        </div>
        <div class="row">
          <div>
            <label>URL</label>
            <input type="text" name="source_url_new" />
          </div>
          <div>
            <label>Accessed</label>
            <input type="text" name="source_accessed_new" />
          </div>
        </div>
        <div>
          <label>Notes</label>
          <input type="text" name="source_notes_new" />
        </div>
        <button type="button" class="secondary" data-remove-source="new-${id}">Remove Source</button>
      </div>
    `;
    form.querySelectorAll(".subsection")[2].appendChild(container.firstElementChild);
  });

  const featuredUpload = document.getElementById("featured-upload");
  const galleryUpload = document.getElementById("gallery-upload");

  if (featuredUpload) {
    featuredUpload.addEventListener("change", async () => {
      const file = featuredUpload.files[0];
      if (!file || !record.person_id) return;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "featured");
      try {
        const res = await fetchJson(`/api/people/${record.person_id}/media`, {
          method: "POST",
          body: formData,
        });
        form.querySelector("[name='media_featured']").value = res.path || "";
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (galleryUpload) {
    galleryUpload.addEventListener("change", async () => {
      const files = Array.from(galleryUpload.files || []);
      if (!files.length || !record.person_id) return;
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", "gallery");
        try {
          await fetchJson(`/api/people/${record.person_id}/media`, {
            method: "POST",
            body: formData,
          });
        } catch (err) {
          alert(err.message);
          break;
        }
      }
      alert("Uploaded. Reload to edit metadata.");
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    errorBox.textContent = "";

    const invalidDates = [];
    const dateFields = [
      "vitals_born",
      "vitals_died",
      "gallery_date_new",
      "source_accessed_new",
    ];
    const isoPartial = (value) => !value || /^\d{4}(-\d{2})?(-\d{2})?$/.test(value);
    dateFields.forEach((name) => {
      const field = form.querySelector(`[name='${name}']`);
      if (field && field.value && !isoPartial(field.value)) invalidDates.push(name);
    });
    if (invalidDates.length) {
      errorBox.hidden = false;
      errorBox.textContent = `Invalid date format. Use YYYY, YYYY-MM, or YYYY-MM-DD. Fields: ${invalidDates.join(", ")}`;
      return;
    }

    const data = new FormData(form);
    const payload = {
      title: data.get("names_full"),
      slug: data.get("slug"),
      date: data.get("date"),
      draft: data.get("draft") === "on",
      aliases: textareaToList(data.get("aliases")),
      names: {
        full: data.get("names_full"),
        given: data.get("names_given"),
        middle: data.get("names_middle"),
        surname: data.get("names_surname"),
        suffix: data.get("names_suffix"),
        maiden: data.get("names_maiden"),
        also_known_as: textareaToList(data.get("names_aka")),
      },
      sex: data.get("sex"),
      vitals: {
        born: data.get("vitals_born"),
        died: data.get("vitals_died"),
        birth_place: data.get("vitals_birth_place"),
        death_place: data.get("vitals_death_place"),
        burial_place: data.get("vitals_burial_place"),
        cause_of_death: data.get("vitals_cause"),
      },
      relations: {
        parents: {
          father: data.get("father"),
          mother: data.get("mother"),
        },
        spouses: [],
        children: Array.from(form.children.selectedOptions).map((o) => o.value),
        siblings: Array.from(form.siblings.selectedOptions).map((o) => o.value),
      },
      media: {
        featured: data.get("media_featured"),
        gallery: [],
      },
      ids: {
        findagrave: data.get("ids_findagrave"),
        familysearch: data.get("ids_familysearch"),
        wikitree: data.get("ids_wikitree"),
        geni: data.get("ids_geni"),
        ancestry: data.get("ids_ancestry"),
      },
      sources: [],
      confidence: {
        identity: data.get("conf_identity"),
        vitals: data.get("conf_vitals"),
        parents: data.get("conf_parents"),
        notes: data.get("conf_notes"),
      },
      provenance: {
        imported_from: data.get("prov_imported"),
        wp_slug: data.get("prov_wp_slug"),
        wp_type: data.get("prov_wp_type"),
      },
      body: data.get("body"),
    };

    // spouses
    form.querySelectorAll(".spouse-row").forEach((row) => {
      const personId = row.querySelector("[name^='spouse_person']")?.value;
      if (!personId) return;
      payload.relations.spouses.push({
        person: personId,
        from: row.querySelector("[name^='spouse_from']")?.value || "",
        to: row.querySelector("[name^='spouse_to']")?.value || "",
        place: row.querySelector("[name^='spouse_place']")?.value || "",
        notes: row.querySelector("[name^='spouse_notes']")?.value || "",
      });
    });

    // gallery
    form.querySelectorAll(".gallery-row").forEach((row) => {
      const file = row.querySelector("[name^='gallery_file']")?.value;
      if (!file) return;
      payload.media.gallery.push({
        file,
        type: row.querySelector("[name^='gallery_type']")?.value || "photo",
        title: row.querySelector("[name^='gallery_title']")?.value || "",
        caption: row.querySelector("[name^='gallery_caption']")?.value || "",
        date: row.querySelector("[name^='gallery_date']")?.value || "",
        source_key: row.querySelector("[name^='gallery_source']")?.value || "",
      });
    });

    // sources
    form.querySelectorAll(".source-row").forEach((row) => {
      const key = row.querySelector("[name^='source_key']")?.value;
      if (!key) return;
      payload.sources.push({
        key,
        title: row.querySelector("[name^='source_title']")?.value || "",
        url: row.querySelector("[name^='source_url']")?.value || "",
        accessed: row.querySelector("[name^='source_accessed']")?.value || "",
        notes: row.querySelector("[name^='source_notes']")?.value || "",
      });
    });

    try {
      if (isEdit) {
        await fetchJson(`/people/${encodeURIComponent(record.person_id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        localStorage.removeItem(draftKey);
        alert("Saved.");
      } else {
        const created = await fetchJson("/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        localStorage.removeItem(draftKey);
        window.location.href = `/people/${encodeURIComponent(created.slug || created.person_id)}`;
      }
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message;
    }
  });
}

function renderBuild() {
  layout(`
    <h2>Build Site</h2>
    <p class="muted">Trigger Hugo build and swap to /public.</p>
    <div class="actions">
      <button id="build-btn">Run Build</button>
    </div>
    <pre id="build-out" class="panel"></pre>
  `);

  document.getElementById("build-btn").addEventListener("click", async () => {
    const out = document.getElementById("build-out");
    out.textContent = "Running build...";
    try {
      const data = await fetchJson("/api/build", { method: "POST" });
      out.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      out.textContent = err.message;
    }
  });
}

async function render() {
  const path = window.location.pathname;
  if (path.startsWith("/people")) {
    await loadPeople();
    if (path === "/people") {
      renderPeopleList();
      return;
    }
    if (path === "/people/new") {
      renderPersonForm({}, "new");
      return;
    }
    const personSlug = decodeURIComponent(path.replace("/people/", ""));
    try {
      const data = await fetchJson(`/api/people/by-slug/${encodeURIComponent(personSlug)}`);
      renderPersonForm(data.person, "edit");
    } catch (err) {
      layout(`<h2>Not Found</h2><p>${escapeHtml(err.message)}</p>`);
    }
    return;
  }

  if (path === "/build") {
    renderBuild();
    return;
  }

  await renderHome();
}

render().catch((err) => {
  layout(`<h2>Error</h2><pre>${escapeHtml(err.message)}</pre>`);
});
