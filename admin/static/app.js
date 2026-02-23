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

function showToast(message, timeout = 2600) {
  if (!message) return;
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, timeout);
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


function personSidebarLabel(person) {
  const names = person.names || {};
  const surname = (names.surname || "").trim();
  const given = (names.given || "").trim();
  const middle = (names.middle || "").trim();

  let fallback = (person.display_name || person.title || "").trim();
  let fallbackGiven = "";
  let fallbackSurname = "";
  if (fallback) {
    const bits = fallback.split(/\s+/);
    fallbackGiven = bits[0] || "";
    fallbackSurname = bits.length > 1 ? bits[bits.length - 1] : fallbackGiven;
  }

  const first = given || fallbackGiven || "Unknown";
  const last = surname || fallbackSurname || "Unknown";
  const mid = middle ? `${middle[0].toUpperCase()}.` : "";

  const bornYear = String(person.born || "").slice(0, 4) || "????";
  const diedYear = String(person.died || "").slice(0, 4) || "????";
  const years = `${bornYear || "????"}-${diedYear || "????"}`;

  return `${last}, ${first}${mid ? `, ${mid}` : ""} - ${years}`;
}

function renderPeopleList() {
  const notice = sessionStorage.getItem("people_notice") || "";
  if (notice) {
    sessionStorage.removeItem("people_notice");
    showToast(notice);
  }

  layout(`
    <h2>People</h2>
    <p class="muted">Use the left sidebar to search and open a person record.</p>
  `);

  mountPeopleWorkspace("list");
}

function peopleLinkTarget(person) {
  return `/people/${encodeURIComponent(person.slug || person.person_id)}`;
}

function buildPeopleSidebar(activeKey = "") {
  const people = [...(state.people || [])].sort((a, b) =>
    personSidebarLabel(a).localeCompare(personSidebarLabel(b))
  );

  const items = people
    .map((p) => {
      const label = personSidebarLabel(p);
      const key = p.slug || p.person_id;
      const active = key === activeKey ? "active" : "";
      const tags = (p.tags || []).map((t) => String(t || "").toLowerCase()).filter(Boolean);
      return `<a class="people-nav-link ${active}" data-person-label="${escapeHtml(label.toLowerCase())}" data-tags="${escapeHtml(tags.join("|"))}" href="${peopleLinkTarget(p)}">${escapeHtml(label)}</a>`;
    })
    .join("");

  const tagCounts = new Map();
  people.forEach((p) => {
    (p.tags || []).forEach((tag) => {
      const t = String(tag || "").toLowerCase().trim();
      if (!t) return;
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    });
  });

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 16)
    .map(([tag, count]) => `<a href="#" class="people-tag-link" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} <span>${count}</span></a>`)
    .join("");

  return `
    <aside class="people-nav">
      <a href="/people/new" class="people-add-btn">New Person</a>
      <div class="people-filter-wrap">
        <input id="people-nav-filter" type="search" placeholder="Filter name or tag..." autocomplete="off" />
        <div id="people-tag-cloud" class="people-tag-cloud">
          <a href="#" class="people-tag-link active" data-tag="">all</a>
          ${topTags}
        </div>
      </div>
      <nav id="people-nav-links" class="people-nav-links">${items || '<p class="muted">No people found.</p>'}</nav>
    </aside>
  `;
}


function mountPeopleWorkspace(activeKey = "") {
  const panel = app.querySelector(":scope > .panel");
  if (!panel) return;

  const wrapper = document.createElement("div");
  wrapper.className = "people-workspace";

  const sidebarHost = document.createElement("div");
  sidebarHost.innerHTML = buildPeopleSidebar(activeKey).trim();
  const sidebar = sidebarHost.firstElementChild;

  const main = document.createElement("section");
  main.className = "people-content";
  main.appendChild(panel);

  wrapper.appendChild(sidebar);
  wrapper.appendChild(main);

  app.innerHTML = "";
  app.appendChild(wrapper);

  const filterInput = document.getElementById("people-nav-filter");
  const links = Array.from(document.querySelectorAll("#people-nav-links .people-nav-link"));
  const tagButtons = Array.from(document.querySelectorAll("#people-tag-cloud .people-tag-link"));
  let activeTag = "";

  function applyPeopleFilter() {
    const q = (filterInput?.value || "").trim().toLowerCase();
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];
    links.forEach((link) => {
      const label = (link.textContent || "").toLowerCase();
      const tags = (link.getAttribute("data-tags") || "")
        .toLowerCase()
        .split("|")
        .map((x) => x.trim())
        .filter(Boolean);
      const tagMatch = !activeTag || tags.includes(activeTag);
      const textMatch =
        terms.length === 0 || terms.every((term) => label.includes(term) || tags.some((t) => t.includes(term)));
      link.style.display = tagMatch && textMatch ? "" : "none";
    });
  }

  if (filterInput) {
    filterInput.addEventListener("input", applyPeopleFilter);
    filterInput.addEventListener("keyup", applyPeopleFilter);
  }

  tagButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const tag = (btn.getAttribute("data-tag") || "").toLowerCase();
      activeTag = activeTag === tag ? "" : tag;
      tagButtons.forEach((b) => {
        const bt = (b.getAttribute("data-tag") || "").toLowerCase();
        b.classList.toggle("active", bt === activeTag || (activeTag === "" && bt === ""));
      });
      applyPeopleFilter();
    });
  });

  applyPeopleFilter();
}


function ensureDefaults(person) {
  const story = person?.story_md || person?.body || "";
  return {
    title: "",
    date: "",
    draft: false,
    person_id: "",
    slug: "",
    aliases: [],
    tags: [],
    names: {
      full: "",
      given: "",
      middle: "",
      surname: "",
      suffix: "",
      maiden: "",
      married: [],
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
    story_md: story,
    timeline: [],
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


function normalizeDateForSort(value) {
  if (!value) return "9999-99-99";
  if (/^\d{4}$/.test(value)) return `${value}-99-99`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-99`;
  return value;
}

function sortTimelineEvents(events) {
  return [...(events || [])].sort((a, b) => {
    const keyA = [
      normalizeDateForSort(a.start_date || ""),
      normalizeDateForSort(a.end_date || ""),
      String(a.sort_weight || 0).padStart(8, "0"),
      (a.title || "").toLowerCase(),
    ];
    const keyB = [
      normalizeDateForSort(b.start_date || ""),
      normalizeDateForSort(b.end_date || ""),
      String(b.sort_weight || 0).padStart(8, "0"),
      (b.title || "").toLowerCase(),
    ];
    return keyA.join("|").localeCompare(keyB.join("|"));
  });
}

function eventDateRange(start, end) {
  const s = (start || "").trim();
  const e = (end || "").trim();
  if (!s && !e) return "undated";
  if (!e || s === e) return s || e;
  return `${s} -> ${e}`;
}

function eventSummaryRows(events) {
  const sorted = sortTimelineEvents(events);
  if (!sorted.length) return `<li class="muted">No events added.</li>`;
  return sorted
    .map((event) => {
      const title = event.title || "(Untitled event)";
      const location = event.location ? ` - ${event.location}` : "";
      const kind = event.event_type ? ` [${event.event_type}]` : "";
      return `<li><strong>${escapeHtml(eventDateRange(event.start_date, event.end_date))}</strong> ${escapeHtml(
        title
      )}${escapeHtml(location)}${escapeHtml(kind)}</li>`;
    })
    .join("");
}

function renderEventMediaRows(event, idx) {
  const mediaItems = Array.isArray(event.media) ? event.media : [];
  if (!mediaItems.length) {
    return `<p class="muted">No event images yet.</p>`;
  }
  return mediaItems
    .map((m, mIdx) => {
      return `
        <div class="event-media-row" data-media-index="${mIdx}">
          <div class="row-3">
            <div>
              <label>Image Path</label>
              <input type="text" name="timeline_media_file_${idx}_${mIdx}" value="${escapeHtml(m.file || "")}" placeholder="gallery/event-photo.jpg" />
            </div>
            <div>
              <label>Type</label>
              <select name="timeline_media_type_${idx}_${mIdx}">
                ${["photo", "document", "census", "map", "grave", "other"]
                  .map((opt) => `<option value="${opt}" ${m.type === opt ? "selected" : ""}>${opt}</option>`)
                  .join("")}
              </select>
            </div>
            <div>
              <label>Title</label>
              <input type="text" name="timeline_media_title_${idx}_${mIdx}" value="${escapeHtml(m.title || "")}" />
            </div>
          </div>
          <div class="row">
            <div>
              <label>Caption</label>
              <input type="text" name="timeline_media_caption_${idx}_${mIdx}" value="${escapeHtml(m.caption || "")}" />
            </div>
            <div class="event-media-remove-wrap">
              <button type="button" class="secondary" data-remove-event-media="${idx}:${mIdx}">Remove Image</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}


function renderPersonForm(person, mode) {
  let isEdit = mode === "edit";
  let record = ensureDefaults(person);
  const isoPartial = (value) => !value || /^\d{4}(-\d{2})?(-\d{2})?$/.test(value);

  let timelineData = sortTimelineEvents(record.timeline || []).map((event, idx) => ({
    _id: event._id || `evt-${Date.now()}-${idx}`,
    start_date: event.start_date || "",
    end_date: event.end_date || "",
    title: event.title || "",
    event_type: event.event_type || "",
    location: event.location || "",
    story_md: event.story_md || "",
    media: Array.isArray(event.media) ? event.media.map((m) => ({
      file: m.file || "",
      type: m.type || "photo",
      title: m.title || "",
      caption: m.caption || "",
    })) : [],
    source_refs: Array.isArray(event.source_refs) ? event.source_refs : [],
    related_people: Array.isArray(event.related_people) ? event.related_people : [],
    sort_weight: Number(event.sort_weight || 0),
  }));
  let editingEventId = null;

  const spouseRows = (record.relations.spouses || [])
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

  const galleryRows = (record.media.gallery || [])
    .map(
      (g, idx) => `
      <div class="gallery-row" data-index="${idx}">
        <div class="row">
          <div>
            <label>File</label>
            <input type="text" name="gallery_file_${idx}" value="${escapeHtml(g.file || "")}" />
          </div>
          <div>
            <label>Type</label>
            <select name="gallery_type_${idx}">
              ${["photo", "document", "census", "map", "grave", "other"]
                .map((opt) => `<option value="${opt}" ${g.type === opt ? "selected" : ""}>${opt}</option>`)
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

  const sourceRows = (record.sources || [])
    .map(
      (s, idx) => `
      <div class="source-row" data-index="${idx}">
        <div class="row">
          <div>
            <label>Key</label>
            <input type="text" name="source_key_${idx}" value="${escapeHtml(s.key || "")}" />
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

  layout(`
    <h2>${isEdit ? "Edit Person" : "New Person"}</h2>
    <div id="error-box" class="error-box" hidden></div>
    <div id="notice-box" class="notice-box" hidden></div>
    <div class="tabbar" role="tablist" aria-label="Person Editor Tabs">
      <button type="button" class="tab active" data-tab="identity">Identity</button>
      <button type="button" class="tab" data-tab="story">Story</button>
      <button type="button" class="tab" data-tab="events">Events</button>
      <button type="button" class="tab" data-tab="sources">Sources</button>
      <button type="button" class="tab" data-tab="gallery">Gallery</button>
      <button type="button" class="tab" data-tab="advanced">Advanced</button>
    </div>

    <form id="person-form">
      <input type="hidden" id="timeline-state" name="timeline_state" value="" />

      <section class="tab-panel active" data-panel="identity">
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
            <div><label>Given</label><input type="text" name="names_given" value="${escapeHtml(record.names.given)}" /></div>
            <div><label>Middle</label><input type="text" name="names_middle" value="${escapeHtml(record.names.middle)}" /></div>
            <div><label>Surname</label><input type="text" name="names_surname" value="${escapeHtml(record.names.surname)}" /></div>
          </div>
          <div class="row-3">
            <div><label>Suffix</label><input type="text" name="names_suffix" value="${escapeHtml(record.names.suffix)}" /></div>
            <div><label>Maiden</label><input type="text" name="names_maiden" value="${escapeHtml(record.names.maiden)}" /></div>
            <div><label>Married Names (one per line)</label><textarea name="names_married">${escapeHtml(listToTextarea(record.names.married))}</textarea></div>
          </div>
          <div class="row">
            <div><label>Also Known As (one per line)</label><textarea name="names_aka">${escapeHtml(listToTextarea(record.names.also_known_as))}</textarea></div>
            <div><label>Tags (one per line)</label><textarea name="tags">${escapeHtml(listToTextarea(record.tags))}</textarea></div>
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
            <div><label>Born</label><input type="text" name="vitals_born" value="${escapeHtml(record.vitals.born)}" /></div>
            <div><label>Died</label><input type="text" name="vitals_died" value="${escapeHtml(record.vitals.died)}" /></div>
            <div><label>Cause of Death</label><input type="text" name="vitals_cause" value="${escapeHtml(record.vitals.cause_of_death)}" /></div>
          </div>
          <div class="row-3">
            <div><label>Birth Place</label><input type="text" name="vitals_birth_place" value="${escapeHtml(record.vitals.birth_place)}" /></div>
            <div><label>Death Place</label><input type="text" name="vitals_death_place" value="${escapeHtml(record.vitals.death_place)}" /></div>
            <div><label>Burial Place</label><input type="text" name="vitals_burial_place" value="${escapeHtml(record.vitals.burial_place)}" /></div>
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
              <select name="father"><option value=""></option>${optionsForRelations([record.relations.parents.father], { sex: ["M", "U"], exclude: record.person_id })}</select>
              <button type="button" class="link-button" data-quick-add="father">Quick Add</button>
            </div>
            <div>
              <label>Mother</label>
              <input type="text" class="search-input" data-filter="mother" placeholder="Search people..." />
              <select name="mother"><option value=""></option>${optionsForRelations([record.relations.parents.mother], { sex: ["F", "U"], exclude: record.person_id })}</select>
              <button type="button" class="link-button" data-quick-add="mother">Quick Add</button>
            </div>
          </div>
          <div class="row">
            <div>
              <label>Children</label>
              <input type="text" class="search-input" data-filter="children" placeholder="Search people..." />
              <select name="children" multiple size="6">${optionsForRelations(record.relations.children, { exclude: record.person_id })}</select>
              <div class="relation-actions">
                <button type="button" class="link-button" data-quick-add="children">Quick Add Child</button>
                <button type="button" class="link-button" data-remove-related="children">Remove Selected</button>
                <button type="button" class="link-button" data-clear-related="children">Clear All</button>
              </div>
            </div>
            <div>
              <label>Siblings</label>
              <input type="text" class="search-input" data-filter="siblings" placeholder="Search people..." />
              <select name="siblings" multiple size="6">${optionsForRelations(record.relations.siblings, { exclude: record.person_id })}</select>
              <div class="relation-actions">
                <button type="button" class="link-button" data-quick-add="siblings">Quick Add Sibling</button>
                <button type="button" class="link-button" data-remove-related="siblings">Remove Selected</button>
                <button type="button" class="link-button" data-clear-related="siblings">Clear All</button>
              </div>
            </div>
          </div>
          <div class="subsection" id="spouse-rows">
            <div class="subheader"><h4>Spouses</h4><button type="button" id="add-spouse">Add Spouse</button></div>
            ${spouseRows || '<p class="muted">No spouses added.</p>'}
          </div>
          `
        )}

        ${renderSection(
          "Record Settings",
          `
          <div class="row-3">
            <div><label>Slug</label><input type="text" name="slug" value="${escapeHtml(record.slug)}" /></div>
            <div><label>Date</label><input type="text" name="date" value="${escapeHtml(record.date)}" placeholder="YYYY-MM-DDTHH:MM:SSZ" /></div>
            <div><label>Draft</label><div><input type="checkbox" name="draft" ${record.draft ? "checked" : ""} /> Draft</div></div>
          </div>
          `
        )}
      </section>

      <section class="tab-panel" data-panel="story">
        ${renderSection(
          "Story",
          `
          <div>
            <label>Person Story</label>
            <div class="editor-tools">
              <label for="story-height" class="muted">Editor Height</label>
              <input type="range" id="story-height" min="240" max="900" step="20" value="360" />
              <span id="story-height-value" class="muted">360px</span>
            </div>
            <div id="story-editor" class="story-editor"></div>
            <textarea id="story-md-input" class="md-source-hidden" name="story_md">${escapeHtml(record.story_md || "")}</textarea>
          </div>
          `
        )}
      </section>

      <section class="tab-panel" data-panel="events">
        ${renderSection(
          "Events",
          `
          <div class="subsection">
            <div class="subheader">
              <h4 id="event-editor-title">Add New Event</h4>
              <div class="actions compact-actions">
                <button type="button" id="new-event">New Event</button>
                <button type="button" id="save-event">Save Event</button>
              </div>
            </div>
            <div class="row-3">
              <div><label>Start Date</label><input type="text" id="event-start" placeholder="YYYY or YYYY-MM or YYYY-MM-DD" /></div>
              <div><label>End Date</label><input type="text" id="event-end" placeholder="Optional; defaults to start" /></div>
              <div><label>Type</label><input type="text" id="event-type" placeholder="birth, marriage, residence..." /></div>
            </div>
            <div class="row">
              <div><label>Title</label><input type="text" id="event-title" /></div>
              <div><label>Location</label><input type="text" id="event-location" /></div>
            </div>
            <div>
              <label>Story</label>
              <textarea id="event-story"></textarea>
            </div>
            <div class="row">
              <div>
                <label>Related People</label>
                <input type="text" class="search-input" data-filter="event-related" placeholder="Search people..." />
                <select id="event-related" multiple size="5">${optionsForRelations([], { exclude: record.person_id })}</select>
              </div>
              <div>
                <label>Source Refs (comma separated keys)</label>
                <input type="text" id="event-source-refs" />
              </div>
            </div>
            <div class="subsection event-media-subsection">
              <div class="subheader">
                <h5>Event Images</h5>
                <button type="button" class="secondary" id="add-event-media">Add Image Row</button>
              </div>
              <div id="event-media-list" class="event-media-list"><p class="muted">No event images yet.</p></div>
              <label>Upload Event Images</label>
              <input type="file" id="event-media-upload" multiple />
              <p class="muted">Uploads are stored in this person bundle under <code>gallery/</code>.</p>
            </div>
          </div>

          <div class="subsection">
            <div class="subheader">
              <h4>Date-Ordered Event List</h4>
            </div>
            <div id="event-list"></div>
          </div>
          `
        )}
      </section>

      <section class="tab-panel" data-panel="sources">
        ${renderSection(
          "Evidence / Sources",
          `
          <div class="subsection" id="source-entries">
            <div class="subheader"><h4>Sources</h4><button type="button" id="add-source">Add Source</button></div>
            ${sourceRows || '<p class="muted">No sources added.</p>'}
          </div>
          `
        )}

        ${renderSection(
          "Confidence",
          `
          <div class="row-3">
            <div><label>Identity</label><select name="conf_identity">${["", "high", "medium", "low"].map((v) => `<option value="${v}" ${record.confidence.identity === v ? "selected" : ""}>${v || "-"}</option>`).join("")}</select></div>
            <div><label>Vitals</label><select name="conf_vitals">${["", "high", "medium", "low"].map((v) => `<option value="${v}" ${record.confidence.vitals === v ? "selected" : ""}>${v || "-"}</option>`).join("")}</select></div>
            <div><label>Parents</label><select name="conf_parents">${["", "high", "medium", "low"].map((v) => `<option value="${v}" ${record.confidence.parents === v ? "selected" : ""}>${v || "-"}</option>`).join("")}</select></div>
          </div>
          <div><label>Notes</label><textarea name="conf_notes">${escapeHtml(record.confidence.notes)}</textarea></div>
          `
        )}

        ${renderSection(
          "External IDs",
          `
          <div class="row-3">
            <div><label>Find a Grave</label><input type="text" name="ids_findagrave" value="${escapeHtml(record.ids.findagrave)}" /></div>
            <div><label>FamilySearch</label><input type="text" name="ids_familysearch" value="${escapeHtml(record.ids.familysearch)}" /></div>
            <div><label>WikiTree</label><input type="text" name="ids_wikitree" value="${escapeHtml(record.ids.wikitree)}" /></div>
          </div>
          <div class="row-3">
            <div><label>Geni</label><input type="text" name="ids_geni" value="${escapeHtml(record.ids.geni)}" /></div>
            <div><label>Ancestry</label><input type="text" name="ids_ancestry" value="${escapeHtml(record.ids.ancestry)}" /></div>
          </div>
          `
        )}
      </section>

      <section class="tab-panel" data-panel="gallery">
        ${renderSection(
          "Gallery",
          `
          <div class="row">
            <div>
              <label>Primary Portrait / Featured Image (path)</label>
              <input type="text" name="media_featured" value="${escapeHtml(record.media.featured)}" />
              <input type="file" id="featured-upload" />
            </div>
            <div>
              <label>Gallery Upload</label>
              <input type="file" id="gallery-upload" multiple />
            </div>
          </div>
          <div class="subsection" id="gallery-entries">
            <div class="subheader"><h4>Gallery Entries</h4><button type="button" id="add-gallery">Add Media Entry</button></div>
            ${galleryRows || '<p class="muted">No media entries.</p>'}
          </div>
          `
        )}
      </section>

      <section class="tab-panel" data-panel="advanced">
        ${renderSection(
          "Provenance (Advanced)",
          `
          <details>
            <summary>Show provenance fields</summary>
            <div class="row-3">
              <div><label>Imported From</label><input type="text" name="prov_imported" value="${escapeHtml(record.provenance.imported_from)}" /></div>
              <div><label>WP Slug</label><input type="text" name="prov_wp_slug" value="${escapeHtml(record.provenance.wp_slug)}" /></div>
              <div><label>WP Type</label><input type="text" name="prov_wp_type" value="${escapeHtml(record.provenance.wp_type)}" /></div>
            </div>
          </details>
          `
        )}

        ${renderSection(
          "Markdown Body (Advanced)",
          `
          <details>
            <summary>Show raw markdown body</summary>
            <div><label>Markdown Body</label><textarea name="body">${escapeHtml(record.body)}</textarea></div>
          </details>
          `
        )}
      </section>

      <div class="actions">
        <button type="submit">${isEdit ? "Save" : "Create"}</button>
        <a href="/people"><button type="button" class="secondary">Back</button></a>
        ${isEdit ? '<button type="button" class="danger" id="delete-person">Delete Person</button>' : ''}
      </div>
    </form>
  `);

  mountPeopleWorkspace(record.slug || record.person_id || (isEdit ? "" : "new"));

  const form = document.getElementById("person-form");
  const errorBox = document.getElementById("error-box");
  const noticeBox = document.getElementById("notice-box");

  function showNotice(message) {
    if (noticeBox) noticeBox.hidden = true;
    showToast(message);
  }

  const deleteBtn = document.getElementById("delete-person");
  if (deleteBtn && isEdit && record.person_id) {
    deleteBtn.addEventListener("click", async () => {
      const ok = window.confirm("Delete this person record? This will remove relationship references from other records. This cannot be undone.");
      if (!ok) return;
      try {
        await fetchJson(`/people/${encodeURIComponent(record.person_id)}`, { method: "DELETE" });
        localStorage.removeItem(draftKey);
        sessionStorage.setItem("people_notice", "Person deleted.");
        sessionStorage.setItem("deleted_person_id", record.person_id);
        window.location.href = "/people";
      } catch (err) {
        errorBox.hidden = false;
        errorBox.textContent = err.message || "Failed to delete person.";
      }
    });
  }

  const timelineStateInput = document.getElementById("timeline-state");
  const eventListEl = document.getElementById("event-list");
  const eventEditorTitle = document.getElementById("event-editor-title");
  const storySource = document.getElementById("story-md-input");
  const storyMount = document.getElementById("story-editor");
  const storyHeight = document.getElementById("story-height");
  const storyHeightValue = document.getElementById("story-height-value");
  let storyEditor = null;

  async function ensurePersonForUploads() {
    if (record.person_id) return record.person_id;

    const fullName = (form.querySelector("[name='names_full']")?.value || "").trim();
    if (!fullName) {
      alert("Enter a full name first so the person record can be created.");
      openTab("identity");
      return "";
    }

    const payload = {
      title: fullName,
      names: {
        full: fullName,
        given: form.querySelector("[name='names_given']")?.value || "",
        middle: form.querySelector("[name='names_middle']")?.value || "",
        surname: form.querySelector("[name='names_surname']")?.value || "",
        suffix: form.querySelector("[name='names_suffix']")?.value || "",
        maiden: form.querySelector("[name='names_maiden']")?.value || "",
      },
      sex: form.querySelector("[name='sex']")?.value || "U",
      story_md: storyEditor ? storyEditor.getMarkdown() : (storySource?.value || ""),
      slug: form.querySelector("[name='slug']")?.value || "",
      date: form.querySelector("[name='date']")?.value || "",
      draft: form.querySelector("[name='draft']")?.checked || false,
    };

    try {
      const created = await fetchJson("/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      record.person_id = created.person_id;
      record.slug = created.slug || record.slug || "";
      isEdit = true;
      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.textContent = "Save";
      const newPath = created.slug || created.person_id;
      if (newPath) {
        window.history.replaceState({}, "", `/people/${encodeURIComponent(newPath)}`);
      }
      return record.person_id;
    } catch (err) {
      alert(err.message || "Failed to auto-create person record before upload.");
      return "";
    }
  }

  if (storyMount && storySource && window.toastui && window.toastui.Editor) {
    const initialHeight = Number(storyHeight?.value || 360);
    const plugins = [];
    if (window.toastui.Editor.plugin?.colorSyntax) {
      plugins.push([
        window.toastui.Editor.plugin.colorSyntax,
        {
          preset: [
            "#181818", "#444444", "#666666", "#999999", "#e53935", "#fb8c00",
            "#fdd835", "#43a047", "#00897b", "#1e88e5", "#3949ab", "#8e24aa",
          ],
        },
      ]);
    }
    if (window.toastui.Editor.plugin?.tableMergedCell) {
      plugins.push(window.toastui.Editor.plugin.tableMergedCell);
    }

    storyEditor = new window.toastui.Editor({
      el: storyMount,
      initialEditType: "wysiwyg",
      previewStyle: "vertical",
      height: `${initialHeight}px`,
      initialValue: storySource.value || "",
      hideModeSwitch: false,
      usageStatistics: false,
      plugins,
      hooks: {
        addImageBlobHook: async (blob, callback) => {
          const personId = await ensurePersonForUploads();
          if (!personId) return false;
          const formData = new FormData();
          formData.append("file", blob);
          formData.append("kind", "gallery");
          try {
            const uploaded = await fetchJson(`/api/people/${personId}/media`, {
              method: "POST",
              body: formData,
            });
            callback(uploaded.path || "", blob.name || "image");
            return false;
          } catch (err) {
            alert(err.message || "Failed to upload image");
            return false;
          }
        },
      },
    });
    storyEditor.on("change", () => {
      storySource.value = storyEditor.getMarkdown();
    });

    if (window.toastui.Editor.plugin?.tableMergedCell && typeof storyEditor.insertToolbarItem === "function") {
      try {
        storyEditor.insertToolbarItem(
          { groupIndex: 3, itemIndex: 1 },
          {
            name: "mergeCells",
            tooltip: "Merge cells",
            command: "mergeCells",
            text: "Merge",
            className: "toastui-editor-toolbar-icons",
          }
        );
        storyEditor.insertToolbarItem(
          { groupIndex: 3, itemIndex: 2 },
          {
            name: "splitCells",
            tooltip: "Split cells",
            command: "splitCells",
            text: "Split",
            className: "toastui-editor-toolbar-icons",
          }
        );
      } catch (_err) {
        // Keep editor usable even if toolbar injection shape changes by version.
      }
    }
    if (storyHeight && storyHeightValue) {
      storyHeight.addEventListener("input", () => {
        const h = Number(storyHeight.value || 360);
        storyHeightValue.textContent = `${h}px`;
        storyEditor.setHeight(`${h}px`);
      });
    }
  } else if (storySource) {
    storySource.classList.remove("md-source-hidden");
    storySource.style.minHeight = "220px";
  }

  function syncStoryEditor() {
    if (storyEditor && storySource) {
      storySource.value = storyEditor.getMarkdown();
    }
  }

  function openTab(tab) {
    document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("active", btn.getAttribute("data-tab") === tab));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.getAttribute("data-panel") === tab));
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => openTab(btn.getAttribute("data-tab")));
  });

  function attachSearchFilters(root) {
    root.querySelectorAll("input[data-filter]").forEach((input) => {
      input.addEventListener("input", () => {
        const targetName = input.getAttribute("data-filter");
        const select = form.querySelector(`select[name='${targetName}']`) || document.getElementById(targetName);
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

  function timelineForSave() {
    return sortTimelineEvents(timelineData).map((event) => ({
      start_date: event.start_date || "",
      end_date: event.end_date || "",
      title: event.title || "",
      event_type: event.event_type || "",
      location: event.location || "",
      story_md: event.story_md || "",
      media: (event.media || []).filter((m) => m.file).map((m) => ({
        file: m.file,
        type: m.type || "photo",
        title: m.title || "",
        caption: m.caption || "",
      })),
      source_refs: (event.source_refs || []).filter(Boolean),
      related_people: (event.related_people || []).filter(Boolean),
      sort_weight: Number(event.sort_weight || 0),
    }));
  }

  function updateTimelineStateInput() {
    timelineStateInput.value = JSON.stringify(timelineForSave());
  }

  function renderEventMediaEditor(mediaList) {
    const media = mediaList || [];
    const list = document.getElementById("event-media-list");
    if (!list) return;
    if (!media.length) {
      list.innerHTML = '<p class="muted">No event images yet.</p>';
      return;
    }
    list.innerHTML = media
      .map((m, idx) => `
        <div class="event-media-row" data-media-index="${idx}">
          <div class="row-3">
            <div><label>Image Path</label><input type="text" data-event-media="file" value="${escapeHtml(m.file || "")}" placeholder="gallery/event-photo.jpg" /></div>
            <div><label>Type</label><select data-event-media="type">${["photo", "document", "census", "map", "grave", "other"].map((opt) => `<option value="${opt}" ${m.type === opt ? "selected" : ""}>${opt}</option>`).join("")}</select></div>
            <div><label>Title</label><input type="text" data-event-media="title" value="${escapeHtml(m.title || "")}" /></div>
          </div>
          <div class="row">
            <div><label>Caption</label><input type="text" data-event-media="caption" value="${escapeHtml(m.caption || "")}" /></div>
            <div class="event-media-remove-wrap"><button type="button" class="secondary" data-remove-event-media="${idx}">Remove Image</button></div>
          </div>
        </div>
      `)
      .join("");
  }

  function readEventEditor() {
    const startDate = (document.getElementById("event-start")?.value || "").trim();
    const endRaw = (document.getElementById("event-end")?.value || "").trim();
    const endDate = endRaw || startDate;
    const title = (document.getElementById("event-title")?.value || "").trim();
    const eventType = (document.getElementById("event-type")?.value || "").trim();
    const location = (document.getElementById("event-location")?.value || "").trim();
    const storyMd = document.getElementById("event-story")?.value || "";
    const refs = (document.getElementById("event-source-refs")?.value || "")
      .split(/\n|,/) 
      .map((v) => v.trim())
      .filter(Boolean);
    const relatedSelect = document.getElementById("event-related");
    const related = relatedSelect ? Array.from(relatedSelect.selectedOptions).map((o) => o.value).filter(Boolean) : [];

    const media = [];
    document.querySelectorAll("#event-media-list .event-media-row").forEach((row) => {
      const file = row.querySelector("[data-event-media='file']")?.value?.trim() || "";
      if (!file) return;
      media.push({
        file,
        type: row.querySelector("[data-event-media='type']")?.value || "photo",
        title: row.querySelector("[data-event-media='title']")?.value || title,
        caption: row.querySelector("[data-event-media='caption']")?.value || "",
      });
    });

    return {
      _id: editingEventId || `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      start_date: startDate,
      end_date: endDate,
      title,
      event_type: eventType,
      location,
      story_md: storyMd,
      media,
      source_refs: refs,
      related_people: related,
      sort_weight: 0,
    };
  }

  function clearEventEditor() {
    editingEventId = null;
    eventEditorTitle.textContent = "Add New Event";
    ["event-start", "event-end", "event-title", "event-type", "event-location", "event-story", "event-source-refs"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const related = document.getElementById("event-related");
    if (related) Array.from(related.options).forEach((opt) => { opt.selected = false; opt.hidden = false; });
    renderEventMediaEditor([]);
  }

  function loadEventIntoEditor(id) {
    const event = timelineData.find((e) => e._id === id);
    if (!event) return;
    editingEventId = id;
    eventEditorTitle.textContent = "Edit Event";
    document.getElementById("event-start").value = event.start_date || "";
    document.getElementById("event-end").value = event.end_date || "";
    document.getElementById("event-title").value = event.title || "";
    document.getElementById("event-type").value = event.event_type || "";
    document.getElementById("event-location").value = event.location || "";
    document.getElementById("event-story").value = event.story_md || "";
    document.getElementById("event-source-refs").value = (event.source_refs || []).join(", ");
    const related = document.getElementById("event-related");
    if (related) {
      const set = new Set(event.related_people || []);
      Array.from(related.options).forEach((opt) => {
        opt.selected = set.has(opt.value);
      });
    }
    renderEventMediaEditor(event.media || []);
  }

  function renderEventList() {
    const rows = sortTimelineEvents(timelineData);
    if (!rows.length) {
      eventListEl.innerHTML = '<p class="muted">No events added.</p>';
      updateTimelineStateInput();
      return;
    }
    eventListEl.innerHTML = rows
      .map((event) => {
        const dateLabel = eventDateRange(event.start_date, event.end_date);
        const mediaCount = (event.media || []).filter((m) => m.file).length;
        return `
          <article class="event-list-item" data-event-id="${event._id}">
            <div class="event-list-head">
              <div>
                <strong>${escapeHtml(dateLabel)}</strong> - ${escapeHtml(event.title || "(Untitled event)")}
                <div class="muted">${escapeHtml(event.event_type || "event")} ${event.location ? `- ${escapeHtml(event.location)}` : ""} - ${mediaCount} image(s)</div>
              </div>
              <div class="actions compact-actions">
                <button type="button" class="secondary" data-edit-event="${event._id}">Edit</button>
                <button type="button" class="secondary" data-delete-event="${event._id}">Delete</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
    updateTimelineStateInput();
  }

  function refreshRelationSelects() {
    const fatherSelect = form.querySelector("select[name='father']");
    if (fatherSelect) {
      const current = fatherSelect.value;
      fatherSelect.innerHTML = `<option value=""></option>` + optionsForRelations([current], { sex: ["M", "U"], exclude: record.person_id });
      fatherSelect.value = current;
    }

    const motherSelect = form.querySelector("select[name='mother']");
    if (motherSelect) {
      const current = motherSelect.value;
      motherSelect.innerHTML = `<option value=""></option>` + optionsForRelations([current], { sex: ["F", "U"], exclude: record.person_id });
      motherSelect.value = current;
    }

    const childrenSelect = form.querySelector("select[name='children']");
    if (childrenSelect) {
      const selected = Array.from(childrenSelect.selectedOptions).map((o) => o.value);
      childrenSelect.innerHTML = optionsForRelations(selected, { exclude: record.person_id });
      Array.from(childrenSelect.options).forEach((opt) => { opt.selected = selected.includes(opt.value); });
    }

    const siblingsSelect = form.querySelector("select[name='siblings']");
    if (siblingsSelect) {
      const selected = Array.from(siblingsSelect.selectedOptions).map((o) => o.value);
      siblingsSelect.innerHTML = optionsForRelations(selected, { exclude: record.person_id });
      Array.from(siblingsSelect.options).forEach((opt) => { opt.selected = selected.includes(opt.value); });
    }

    const eventRelated = document.getElementById("event-related");
    if (eventRelated) {
      const selected = Array.from(eventRelated.selectedOptions).map((o) => o.value);
      eventRelated.innerHTML = optionsForRelations(selected, { exclude: record.person_id });
      Array.from(eventRelated.options).forEach((opt) => { opt.selected = selected.includes(opt.value); });
    }

    form.querySelectorAll(".spouse-row").forEach((row) => {
      const select = row.querySelector("select[name^='spouse_person']");
      if (!select) return;
      const current = select.value;
      select.innerHTML = `<option value=""></option>` + optionsForRelations([current], { exclude: record.person_id });
      select.value = current;
    });
  }

  function saveEventFromEditor() {
    const event = readEventEditor();
    if (event.start_date && !isoPartial(event.start_date)) throw new Error("Invalid event start date. Use YYYY, YYYY-MM, or YYYY-MM-DD.");
    if (event.end_date && !isoPartial(event.end_date)) throw new Error("Invalid event end date. Use YYYY, YYYY-MM, or YYYY-MM-DD.");
    if (!event.start_date && !event.title && !event.location && !event.story_md && !(event.media || []).length) {
      throw new Error("Event is empty. Add at least a date, title, story, location, or image.");
    }

    const idx = timelineData.findIndex((e) => e._id === event._id);
    if (idx >= 0) timelineData[idx] = event;
    else timelineData.push(event);

    timelineData = sortTimelineEvents(timelineData);
    renderEventList();
    loadEventIntoEditor(event._id);
  }

  async function uploadEventMedia(files) {
    if (!record.person_id) {
      const personId = await ensurePersonForUploads();
      if (!personId) return;
    }
    if (!files || !files.length) return;

    const list = document.getElementById("event-media-list");
    const existingRows = Array.from(list.querySelectorAll(".event-media-row"));
    const currentMedia = existingRows
      .map((row) => ({
        file: row.querySelector("[data-event-media='file']")?.value?.trim() || "",
        type: row.querySelector("[data-event-media='type']")?.value || "photo",
        title: row.querySelector("[data-event-media='title']")?.value || "",
        caption: row.querySelector("[data-event-media='caption']")?.value || "",
      }))
      .filter((m) => m.file);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "gallery");
      try {
        const uploaded = await fetchJson(`/api/people/${record.person_id}/media`, {
          method: "POST",
          body: formData,
        });
        currentMedia.push({
          file: uploaded.path || "",
          type: "photo",
          title: document.getElementById("event-title")?.value || "",
          caption: "",
        });
      } catch (err) {
        alert(err.message);
        break;
      }
    }
    renderEventMediaEditor(currentMedia);
  }

  const draftKey = isEdit ? `draft:${record.person_id}` : "draft:new";
  const savedDraft = localStorage.getItem(draftKey);
  if (savedDraft && confirm("A saved draft exists. Restore it?")) {
    const draft = JSON.parse(savedDraft);
    Object.entries(draft).forEach(([name, value]) => {
      const field = form.querySelector(`[name='${name}']`);
      if (!field) return;
      if (field.tagName === "SELECT" && field.multiple && Array.isArray(value)) {
        Array.from(field.options).forEach((opt) => { opt.selected = value.includes(opt.value); });
      } else if (field.type === "checkbox") {
        field.checked = !!value;
      } else {
        field.value = value;
      }
    });
    try {
      const parsed = JSON.parse(draft.timeline_state || "[]");
      if (Array.isArray(parsed)) {
        timelineData = sortTimelineEvents(parsed).map((event, idx) => ({
          _id: event._id || `evt-${Date.now()}-${idx}`,
          ...event,
          media: Array.isArray(event.media) ? event.media : [],
          source_refs: Array.isArray(event.source_refs) ? event.source_refs : [],
          related_people: Array.isArray(event.related_people) ? event.related_people : [],
        }));
      }
    } catch (_err) {
      // Ignore invalid timeline draft payload.
    }
  }

  document.getElementById("new-event").addEventListener("click", () => {
    clearEventEditor();
  });

  document.getElementById("save-event").addEventListener("click", () => {
    try {
      saveEventFromEditor();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message;
      openTab("events");
    }
  });

  document.getElementById("add-event-media").addEventListener("click", () => {
    const list = document.getElementById("event-media-list");
    if (list.querySelector("p.muted")) {
      list.innerHTML = "";
    }
    const idx = list.querySelectorAll(".event-media-row").length;
    const wrap = document.createElement("div");
    wrap.className = "event-media-row";
    wrap.setAttribute("data-media-index", String(idx));
    wrap.innerHTML = `
      <div class="row-3">
        <div><label>Image Path</label><input type="text" data-event-media="file" placeholder="gallery/event-photo.jpg" /></div>
        <div><label>Type</label><select data-event-media="type">${["photo", "document", "census", "map", "grave", "other"].map((opt) => `<option value="${opt}">${opt}</option>`).join("")}</select></div>
        <div><label>Title</label><input type="text" data-event-media="title" /></div>
      </div>
      <div class="row">
        <div><label>Caption</label><input type="text" data-event-media="caption" /></div>
        <div class="event-media-remove-wrap"><button type="button" class="secondary" data-remove-event-media="${idx}">Remove Image</button></div>
      </div>
    `;
    list.appendChild(wrap);
  });

  document.getElementById("event-media-upload").addEventListener("change", async (event) => {
    await uploadEventMedia(event.target.files || []);
    event.target.value = "";
  });

  form.addEventListener("click", async (event) => {
    const target = event.target;

    if (target.matches("[data-edit-event]")) {
      loadEventIntoEditor(target.getAttribute("data-edit-event"));
      openTab("events");
      return;
    }

    if (target.matches("[data-delete-event]")) {
      const id = target.getAttribute("data-delete-event");
      timelineData = timelineData.filter((e) => e._id !== id);
      if (editingEventId === id) clearEventEditor();
      renderEventList();
      return;
    }

    if (target.matches("[data-remove-event-media]")) {
      target.closest(".event-media-row")?.remove();
      const list = document.getElementById("event-media-list");
      if (list && !list.querySelector(".event-media-row")) {
        list.innerHTML = '<p class="muted">No event images yet.</p>';
      }
      return;
    }

    if (target.matches("[data-remove-spouse]")) {
      const idx = target.getAttribute("data-remove-spouse");
      form.querySelector(`.spouse-row[data-index='${idx}']`)?.remove();
    }
    if (target.matches("[data-remove-gallery]")) {
      const idx = target.getAttribute("data-remove-gallery");
      form.querySelector(`.gallery-row[data-index='${idx}']`)?.remove();
    }
    if (target.matches("[data-remove-source]")) {
      const idx = target.getAttribute("data-remove-source");
      form.querySelector(`.source-row[data-index='${idx}']`)?.remove();
    }

    const removeRelatedBtn = target.closest("[data-remove-related]");
    if (removeRelatedBtn) {
      const field = removeRelatedBtn.getAttribute("data-remove-related");
      const select = form.querySelector(`select[name='${field}']`);
      const selected = select ? Array.from(select.selectedOptions) : [];
      selected.forEach((opt) => opt.remove());
      showNotice(selected.length > 0 ? `Removed ${selected.length} ${field} link(s). Click Save to persist.` : `No ${field} selected.`);
      return;
    }

    const clearRelatedBtn = target.closest("[data-clear-related]");
    if (clearRelatedBtn) {
      const field = clearRelatedBtn.getAttribute("data-clear-related");
      const select = form.querySelector(`select[name='${field}']`);
      const count = select ? Array.from(select.options).length : 0;
      if (select) {
        select.innerHTML = "";
      }
      showNotice(count > 0 ? `Cleared all ${field} links. Click Save to persist.` : `No ${field} links to clear.`);
      return;
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
          body: JSON.stringify({ title: fullName, names: { full: fullName, given, surname } }),
        });
        await loadPeople();
        refreshRelationSelects();
        const personId = created.person_id;
        const input = form.querySelector(`[name='${field}']`);
        if (input && input.tagName === "SELECT") {
          let option = Array.from(input.options).find((opt) => opt.value === personId);
          if (!option) {
            option = new Option(fullName, personId, true, true);
            input.add(option);
          } else {
            option.selected = true;
          }
        }
      } catch (err) {
        alert(err.message);
      }
      return;
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
          body: JSON.stringify({ title: fullName, names: { full: fullName, given, surname } }),
        });
        await loadPeople();
        refreshRelationSelects();
        const personId = created.person_id;
        const row = target.closest(".spouse-row");
        const input = row ? row.querySelector("[name^='spouse_person']") : null;
        if (input) input.value = personId;
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
            <select name="spouse_person_new_${id}"><option value=""></option>${optionsForRelations([], { exclude: record.person_id })}</select>
            <button type="button" class="link-button" data-quick-add-spouse="new">Quick Add Spouse</button>
          </div>
          <div><label>From</label><input type="text" name="spouse_from_new" /></div>
          <div><label>To</label><input type="text" name="spouse_to_new" /></div>
        </div>
        <div class="row">
          <div><label>Place</label><input type="text" name="spouse_place_new" /></div>
          <div><label>Notes</label><input type="text" name="spouse_notes_new" /></div>
        </div>
        <button type="button" class="secondary" data-remove-spouse="new-${id}">Remove Spouse</button>
      </div>
    `;
    const row = container.firstElementChild;
    document.getElementById("spouse-rows").appendChild(row);
    attachSearchFilters(row);
  });

  document.getElementById("add-gallery").addEventListener("click", () => {
    const id = Date.now();
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="gallery-row" data-index="new-${id}">
        <div class="row">
          <div><label>File</label><input type="text" name="gallery_file_new" /></div>
          <div><label>Type</label><select name="gallery_type_new">${["photo", "document", "census", "map", "grave", "other"].map((opt) => `<option value="${opt}">${opt}</option>`).join("")}</select></div>
        </div>
        <div class="row">
          <div><label>Title</label><input type="text" name="gallery_title_new" /></div>
          <div><label>Caption</label><input type="text" name="gallery_caption_new" /></div>
        </div>
        <div class="row">
          <div><label>Date</label><input type="text" name="gallery_date_new" /></div>
          <div><label>Source Key</label><input type="text" name="gallery_source_new" /></div>
        </div>
        <button type="button" class="secondary" data-remove-gallery="new-${id}">Remove Media</button>
      </div>
    `;
    document.getElementById("gallery-entries").appendChild(container.firstElementChild);
  });

  document.getElementById("add-source").addEventListener("click", () => {
    const id = Date.now();
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="source-row" data-index="new-${id}">
        <div class="row">
          <div><label>Key</label><input type="text" name="source_key_new" /></div>
          <div><label>Title</label><input type="text" name="source_title_new" /></div>
        </div>
        <div class="row">
          <div><label>URL</label><input type="text" name="source_url_new" /></div>
          <div><label>Accessed</label><input type="text" name="source_accessed_new" /></div>
        </div>
        <div><label>Notes</label><input type="text" name="source_notes_new" /></div>
        <button type="button" class="secondary" data-remove-source="new-${id}">Remove Source</button>
      </div>
    `;
    document.getElementById("source-entries").appendChild(container.firstElementChild);
  });

  const featuredUpload = document.getElementById("featured-upload");
  const galleryUpload = document.getElementById("gallery-upload");

  if (featuredUpload) {
    featuredUpload.addEventListener("change", async () => {
      const file = featuredUpload.files[0];
      if (!file) return;
      if (!record.person_id) {
        const personId = await ensurePersonForUploads();
        if (!personId) return;
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "featured");
      try {
        const res = await fetchJson(`/api/people/${record.person_id}/media`, { method: "POST", body: formData });
        form.querySelector("[name='media_featured']").value = res.path || "";
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (galleryUpload) {
    galleryUpload.addEventListener("change", async () => {
      const files = Array.from(galleryUpload.files || []);
      if (!files.length) return;
      if (!record.person_id) {
        const personId = await ensurePersonForUploads();
        if (!personId) return;
      }
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", "gallery");
        try {
          await fetchJson(`/api/people/${record.person_id}/media`, { method: "POST", body: formData });
        } catch (err) {
          alert(err.message);
          break;
        }
      }
      alert("Uploaded. Reload to edit metadata.");
    });
  }

  form.addEventListener("input", () => {
    syncStoryEditor();
    updateTimelineStateInput();
    const draft = {};
    form.querySelectorAll("[name]").forEach((field) => {
      if (field.tagName === "SELECT" && field.multiple) draft[field.name] = Array.from(field.selectedOptions).map((o) => o.value);
      else if (field.type === "checkbox") draft[field.name] = field.checked;
      else draft[field.name] = field.value;
    });
    localStorage.setItem(draftKey, JSON.stringify(draft));
  });

  renderEventList();
  clearEventEditor();
  refreshRelationSelects();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    errorBox.textContent = "";
    if (noticeBox) noticeBox.hidden = true;

    syncStoryEditor();
    updateTimelineStateInput();

    try {
      const timeline = JSON.parse(timelineStateInput.value || "[]");
      for (const item of timeline) {
        if (item.start_date && !isoPartial(item.start_date)) throw new Error("Invalid event start date. Use YYYY, YYYY-MM, or YYYY-MM-DD.");
        if (item.end_date && !isoPartial(item.end_date)) throw new Error("Invalid event end date. Use YYYY, YYYY-MM, or YYYY-MM-DD.");
      }
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message || "Invalid timeline data";
      openTab("events");
      return;
    }

    const invalidDates = [];
    ["vitals_born", "vitals_died"].forEach((name) => {
      const field = form.querySelector(`[name='${name}']`);
      if (field && field.value && !isoPartial(field.value)) invalidDates.push(name);
    });
    form.querySelectorAll("input[name^='gallery_date_'], input[name^='source_accessed_']").forEach((field) => {
      if (field.value && !isoPartial(field.value)) invalidDates.push(field.name);
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
        married: textareaToList(data.get("names_married")),
        also_known_as: textareaToList(data.get("names_aka")),
      },
      tags: textareaToList(data.get("tags")),
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
        parents: { father: data.get("father"), mother: data.get("mother") },
        spouses: [],
        children: Array.from(form.querySelector("select[name='children']")?.selectedOptions || []).map((o) => o.value),
        siblings: Array.from(form.querySelector("select[name='siblings']")?.selectedOptions || []).map((o) => o.value),
      },
      media: { featured: data.get("media_featured"), gallery: [] },
      ids: {
        findagrave: data.get("ids_findagrave"),
        familysearch: data.get("ids_familysearch"),
        wikitree: data.get("ids_wikitree"),
        geni: data.get("ids_geni"),
        ancestry: data.get("ids_ancestry"),
      },
      sources: [],
      story_md: data.get("story_md") || "",
      timeline: JSON.parse(data.get("timeline_state") || "[]"),
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
        const saved = await fetchJson(`/people/${encodeURIComponent(record.person_id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        localStorage.removeItem(draftKey);
        const refreshed = await fetchJson(`/api/people/${encodeURIComponent(saved.person_id || record.person_id)}`);
        renderPersonForm(refreshed.person, "edit");
        showNotice("Record saved.");
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

    const deletedPersonId = sessionStorage.getItem("deleted_person_id") || "";
    if (deletedPersonId) {
      state.people = (state.people || []).filter((p) => p.person_id !== deletedPersonId);
      state.peopleIndex = new Map(state.people.map((p) => [p.person_id, p]));
      sessionStorage.removeItem("deleted_person_id");
    }

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
