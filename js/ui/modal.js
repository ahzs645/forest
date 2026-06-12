/**
 * Modal Module
 * Handles modal dialogs, help, glossary, and settings
 */

import { displayMode } from '../displayMode.js';
import { GLOSSARY_TERMS } from '../data/glossary.js';
import { LEGACY_GLOSSARY_TERMS } from '../data/legacyGlossary.js';
import {
  ENFORCEMENT_CASEFILES,
  getRoleProfessionalContext,
} from '../data/professionalPractice.js';
import { ILLEGAL_ACTS } from '../data/illegalActs.js';

const ROLE_IDS = ['planner', 'permitter', 'recce', 'silviculture'];
const ROLE_LABELS = {
  planner: 'Planner',
  permitter: 'Permitter',
  recce: 'Recce',
  silviculture: 'Silviculture',
};

const ENFORCEMENT_CASEFILES_BY_ID = ENFORCEMENT_CASEFILES.reduce((map, item) => {
  map[item.id] = item;
  return map;
}, {});

function toRoleLabel(roleId) {
  return ROLE_LABELS[roleId] || (roleId ? roleId.replace(/[_-]+/g, ' ').trim() : 'All Roles');
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase();
}

function getEntrySourceLinks(entry) {
  const links = [];
  const seen = new Set();

  for (const url of Array.isArray(entry?.sourceUrls) ? entry.sourceUrls : []) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push({
      label: 'Official source',
      url,
    });
  }

  for (const basisId of Array.isArray(entry?.basisCatalogIds) ? entry.basisCatalogIds : []) {
    const casefile = ENFORCEMENT_CASEFILES_BY_ID[basisId];
    if (!casefile?.sourceUrl || seen.has(casefile.sourceUrl)) continue;
    seen.add(casefile.sourceUrl);
    links.push({
      label: casefile.title,
      url: casefile.sourceUrl,
    });
  }

  return links;
}

function getEntryPattern(entry) {
  const basisTitles = (Array.isArray(entry?.basisCatalogIds) ? entry.basisCatalogIds : [])
    .map((basisId) => ENFORCEMENT_CASEFILES_BY_ID[basisId]?.title)
    .filter(Boolean);

  if (basisTitles.length) {
    return basisTitles.join(' · ');
  }

  const tags = Array.isArray(entry?.tags) ? entry.tags.slice(0, 3) : [];
  return tags.length ? tags.join(' · ') : 'General compliance risk';
}

const HIGH_RISK_TAGS = new Set(['fraud', 'forgery', 'bribery', 'illegal-works', 'blatant', 'sabotage', 'coverup', 'laundering', 'noncompliance', 'deception', 'tampering']);
const ELEVATED_RISK_TAGS = new Set(['compliance', 'records', 'risk', 'ethics', 'paperwork', 'reporting', 'regulatory']);

function getEntryRisk(entry) {
  const tagsStr = normalizeSearchText((Array.isArray(entry?.tags) ? entry.tags : []).join(' '));

  let isElevated = false;
  for (const term of HIGH_RISK_TAGS) {
    if (tagsStr.includes(term)) return 'HIGH';
  }
  for (const term of ELEVATED_RISK_TAGS) {
    if (tagsStr.includes(term)) {
      isElevated = true;
      break;
    }
  }

  return isElevated ? 'ELEVATED' : 'MODERATE';
}

function getRoleFit(entry) {
  const roles = Array.isArray(entry?.roles) ? entry.roles : [];
  if (!roles.length) {
    return ['General'];
  }
  return roles.map((roleId) => toRoleLabel(roleId));
}

function matchesIntelQuery(entry, query) {
  if (!query) return true;
  const haystack = [
    entry.title,
    entry.summary,
    entry.description,
    ...(Array.isArray(entry.roles) ? entry.roles : []),
    ...(Array.isArray(entry.tags) ? entry.tags : []),
    ...(Array.isArray(entry.basisCatalogIds) ? entry.basisCatalogIds : []),
    ...(Array.isArray(entry.sourceUrls) ? entry.sourceUrls : []),
    ...getEntrySourceLinks(entry).map((link) => link.label),
  ].map(normalizeSearchText).join(' ');

  return haystack.includes(query);
}

function hasSourceLinks(entry) {
  return getEntrySourceLinks(entry).length > 0;
}

/**
 * Modal management mixin
 */
export const ModalMixin = {
  /**
   * Show a modal dialog
   * @param {Object} options - Modal options
   */
  showModal(options) {
    const { title, content, actions = [] } = options;

    if (this.modalTitle) {
      this.modalTitle.textContent = title || '';
    }

    if (this.modalBody) {
      if (typeof content === 'string') {
        this.modalBody.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = content;
        this.modalBody.appendChild(p);
      } else if (content instanceof HTMLElement) {
        this.modalBody.innerHTML = '';
        this.modalBody.appendChild(content);
      }
    }

    if (this.modalActions) {
      this.modalActions.innerHTML = '';

      const buttons = actions.length ? actions : [{ label: 'OK', primary: true }];

      for (const action of buttons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `modal-btn ${action.primary ? 'primary' : ''}`.trim();
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          this.closeModal();
          if (action.onClick) action.onClick();
        });
        this.modalActions.appendChild(btn);
      }
    }

    if (this.modal) {
      this.modal.hidden = false;
    }
  },

  /**
   * Open a modal dialog (game.js-style interface)
   * @param {Object} options - Modal options
   */
  openModal(options) {
    const { title, dismissible = false, buildContent, actions = [], onClose } = options;

    if (this.modalTitle) {
      this.modalTitle.textContent = title || '';
    }

    if (this.modalBody) {
      this.modalBody.innerHTML = '';
      if (buildContent) {
        buildContent(this.modalBody);
      }
    }

    if (this.modalActions) {
      this.modalActions.innerHTML = '';

      for (const action of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `modal-btn ${action.primary ? 'primary' : ''}`.trim();
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          if (action.onSelect) action.onSelect();
        });
        this.modalActions.appendChild(btn);
      }
    }

    this._modalOnClose = onClose;
    this._modalDismissible = dismissible;

    if (this.modal) {
      this.modal.hidden = false;
    }
  },

  /**
   * Close the modal
   */
  closeModal() {
    if (this.modal) {
      this.modal.hidden = true;
    }
    if (this._modalOnClose) {
      this._modalOnClose();
      this._modalOnClose = null;
    }
  },

  /**
   * Check if modal is currently open
   * @returns {boolean}
   */
  isModalOpen() {
    return this.modal && !this.modal.hidden;
  },

  /**
   * Show help modal
   */
  showHelp() {
    this.openModal({
      title: 'HOW TO PLAY',
      dismissible: true,
      buildContent: (container) => {
        container.innerHTML = `
          <p><strong>BC FORESTRY TRAIL</strong></p>
          <p>Guide your crew through the northern BC wilderness.</p>
          <br>
          <p><strong>Controls:</strong></p>
          <p>[1-9] - Select options</p>
          <p>[S] - Toggle status panel</p>
          <p>[L] - View journey log</p>
          <p>[P] - Open professional/compliance intel</p>
          <p>[ESC] - Close panels</p>
          <br>
          <p><strong>Field Roles:</strong></p>
          <p>Survey forest blocks during 8-9 hour shifts. Keep radio contact while managing fuel, food, and equipment.</p>
          <br>
          <p><strong>Desk Roles:</strong></p>
          <p>Process permits against a deadline. Manage budget and stakeholders.</p>
          <br>
          <p><strong>Keep your crew healthy and reach your goal!</strong></p>
        `;
      },
      actions: [{ label: 'Got it!', primary: true, onSelect: () => this.closeModal() }]
    });
  },

  /**
   * Show settings modal with display mode toggle
   */
  showSettingsModal() {
    this.openModal({
      title: 'SETTINGS',
      dismissible: true,
      buildContent: (container) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'settings-form';

        // Display Mode Section
        const displaySection = document.createElement('div');
        displaySection.className = 'settings-section';
        displaySection.innerHTML = `
          <div class="settings-label">DISPLAY MODE</div>
          <div class="settings-toggle-group">
            <button type="button" class="settings-toggle-btn ${displayMode.mode === 'classic' ? 'active' : ''}" data-mode="classic">
              <span class="toggle-icon">[T]</span>
              <span class="toggle-label">Classic</span>
              <span class="toggle-desc">Terminal style</span>
            </button>
            <button type="button" class="settings-toggle-btn ${displayMode.mode === 'modern' ? 'active' : ''}" data-mode="modern">
              <span class="toggle-icon">[C]</span>
              <span class="toggle-label">Modern</span>
              <span class="toggle-desc">Card layout</span>
            </button>
          </div>
        `;

        // Bind toggle buttons
        displaySection.querySelectorAll('.settings-toggle-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            displayMode.setMode(btn.dataset.mode);
            displaySection.querySelectorAll('.settings-toggle-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.mode === displayMode.mode);
            });
          });
        });

        wrapper.appendChild(displaySection);
        container.appendChild(wrapper);
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  },

  /**
   * Show glossary modal
   */
  showGlossary() {
    const combined = [...(Array.isArray(GLOSSARY_TERMS) ? GLOSSARY_TERMS : []), ...(Array.isArray(LEGACY_GLOSSARY_TERMS) ? LEGACY_GLOSSARY_TERMS : [])]
      .filter((t) => t && typeof t.term === 'string' && typeof t.description === 'string');

    const seen = new Set();
    const terms = combined.filter((t) => {
      const key = t.term.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.term.localeCompare(b.term));

    this.openModal({
      title: 'GLOSSARY',
      dismissible: true,
      buildContent: (container) => {
        const wrapper = document.createElement('div');

        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search terms...';
        input.className = 'text-input';
        input.style.width = '100%';
        input.style.marginBottom = '12px';

        const list = document.createElement('div');
        list.style.overflow = 'auto';

        const render = (query) => {
          const q = (query || '').trim().toLowerCase();
          const filtered = q
            ? terms.filter((t) => t.term.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
            : terms;

          list.innerHTML = '';

          if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No matches.';
            empty.className = 'term-dim';
            list.appendChild(empty);
            return;
          }

          for (const t of filtered.slice(0, 80)) {
            const row = document.createElement('div');
            row.style.marginBottom = '10px';

            const title = document.createElement('div');
            title.textContent = t.term;
            title.style.fontWeight = '700';

            const desc = document.createElement('div');
            desc.textContent = t.description;
            desc.className = 'term-dim';
            desc.style.marginTop = '2px';

            row.appendChild(title);
            row.appendChild(desc);

            if (t.sourceUrl) {
              const source = document.createElement('a');
              source.href = t.sourceUrl;
              source.target = '_blank';
              source.rel = 'noreferrer noopener';
              source.textContent = t.sourceLabel || 'Source';
              source.className = 'term-dim';
              source.style.display = 'inline-block';
              source.style.marginTop = '4px';
              row.appendChild(source);
            }

            list.appendChild(row);
          }
        };

        input.addEventListener('input', () => render(input.value));

        wrapper.appendChild(input);
        wrapper.appendChild(list);
        container.appendChild(wrapper);

        render('');
        setTimeout(() => input.focus(), 0);
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  },

  /**
   * Show professional / compliance intel modal
   */
  showProfessionalComplianceIntel() {
    const resolvedRoleId =
      this._currentJourney?.roleId ||
      this._currentJourney?.role?.id ||
      this._initState?.roleId ||
      null;
    const resolvedAreaId =
      this._currentJourney?.area?.id ||
      this._initState?.areaId ||
      null;
    const resolvedAreaName =
      this._currentJourney?.area?.name ||
      this._initAreas?.find((area) => area.id === this._initState?.areaId)?.name ||
      null;
    let selectedRoleId = ROLE_IDS.includes(resolvedRoleId) ? resolvedRoleId : 'all';
    let sourceBackedOnly = true;

    this.openModal({
      title: 'PROFESSIONAL / COMPLIANCE INTEL',
      dismissible: true,
      buildContent: (container) => {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'grid';
        wrapper.style.gap = '16px';

        const intro = document.createElement('p');
        intro.className = 'detail-note';
        intro.textContent = `Role-aware professional practice guidance, ministry process hooks, and source-backed illegal-act patterns.${resolvedRoleId ? ` Current role: ${toRoleLabel(resolvedRoleId)}.` : ''}${resolvedAreaName ? ` Current area: ${resolvedAreaName}.` : ''} Use the filters to switch between roles and surface only the entries with official citation links.`;
        wrapper.appendChild(intro);

        const controls = document.createElement('div');
        controls.style.display = 'grid';
        controls.style.gap = '10px';

        const roleRow = document.createElement('div');
        roleRow.className = 'chip-row';

        const roleButtons = new Map();
        const roleFilterIds = ['all', ...ROLE_IDS];

        const roleLabelFromId = (roleId) => (roleId === 'all' ? 'All Roles' : toRoleLabel(roleId));

        for (const roleId of roleFilterIds) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'chip';
          button.textContent = roleLabelFromId(roleId);
          button.addEventListener('click', () => {
            selectedRoleId = roleId;
            render();
          });
          roleButtons.set(roleId, button);
          roleRow.appendChild(button);
        }

        const filterRow = document.createElement('div');
        filterRow.style.display = 'flex';
        filterRow.style.flexWrap = 'wrap';
        filterRow.style.alignItems = 'center';
        filterRow.style.gap = '12px';

        const search = document.createElement('input');
        search.type = 'search';
        search.placeholder = 'Search obligations, risks, or illegal acts...';
        search.className = 'text-input';
        search.style.flex = '1 1 260px';

        const sourceOnlyLabel = document.createElement('label');
        sourceOnlyLabel.style.display = 'inline-flex';
        sourceOnlyLabel.style.alignItems = 'center';
        sourceOnlyLabel.style.gap = '8px';
        sourceOnlyLabel.className = 'detail-note';
        sourceOnlyLabel.style.margin = '0';

        const sourceOnly = document.createElement('input');
        sourceOnly.type = 'checkbox';
        sourceOnly.checked = true;
        sourceOnly.addEventListener('change', () => {
          sourceBackedOnly = sourceOnly.checked;
          render();
        });

        const sourceOnlyText = document.createElement('span');
        sourceOnlyText.textContent = 'Source-backed only';

        sourceOnlyLabel.appendChild(sourceOnly);
        sourceOnlyLabel.appendChild(sourceOnlyText);

        search.addEventListener('input', () => render());

        filterRow.appendChild(search);
        filterRow.appendChild(sourceOnlyLabel);

        controls.appendChild(roleRow);
        controls.appendChild(filterRow);
        wrapper.appendChild(controls);

        const roleOverview = document.createElement('div');
        roleOverview.style.display = 'grid';
        roleOverview.style.gap = '10px';
        wrapper.appendChild(roleOverview);

        const roleDetail = document.createElement('div');
        roleDetail.style.display = 'grid';
        roleDetail.style.gap = '10px';
        wrapper.appendChild(roleDetail);

        const catalogue = document.createElement('div');
        catalogue.style.display = 'grid';
        catalogue.style.gap = '12px';
        wrapper.appendChild(catalogue);

        const makeSourceAnchor = (link) => {
          const anchor = document.createElement('a');
          anchor.href = link.url;
          anchor.target = '_blank';
          anchor.rel = 'noreferrer noopener';
          anchor.textContent = link.label;
          anchor.className = 'term-dim';
          return anchor;
        };

        const renderSectionHeader = (label, title) => {
          const header = document.createElement('div');
          header.innerHTML = `<div class="detail-label">${label}</div>`;
          if (title) {
            const heading = document.createElement('p');
            heading.className = 'detail-note';
            heading.textContent = title;
            header.appendChild(heading);
          }
          return header;
        };

        const renderRoleOverview = () => {
          roleOverview.innerHTML = '';
          roleOverview.appendChild(renderSectionHeader('ROLE COMPARISON', 'Choose a role to inspect the full obligation, paperwork, and enforcement stack.'));

          const grid = document.createElement('div');
          grid.style.display = 'grid';
          grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
          grid.style.gap = '10px';

          for (const roleId of ROLE_IDS) {
            const context = getRoleProfessionalContext(roleId, {
              obligationCount: 1,
              paperworkCount: 1,
              enforcementCount: 1,
              breachCount: 1,
              areaId: resolvedAreaId,
            });

            const card = document.createElement('button');
            card.type = 'button';
            card.style.textAlign = 'left';
            card.style.border = '1px solid rgba(255,255,255,0.14)';
            card.style.borderRadius = '10px';
            card.style.padding = '12px';
            card.style.background = selectedRoleId === roleId ? 'rgba(120, 156, 84, 0.18)' : 'rgba(255,255,255,0.04)';
            card.style.color = 'inherit';
            card.style.cursor = 'pointer';

            const activeTag = document.createElement('div');
            activeTag.className = 'chip-row';
            const activeChip = document.createElement('span');
            activeChip.className = 'chip';
            activeChip.textContent = selectedRoleId === roleId ? 'ACTIVE' : 'ROLE';
            activeTag.appendChild(activeChip);
            card.appendChild(activeTag);

            const heading = document.createElement('div');
            heading.className = 'detail-label';
            heading.textContent = toRoleLabel(roleId);
            card.appendChild(heading);

            const stats = document.createElement('p');
            stats.className = 'detail-note';
            stats.textContent = `${context.obligations.length} obligations | ${context.paperwork.length} process hooks | ${context.enforcement.length} enforcement patterns | ${context.breaches.length} failure patterns`;
            card.appendChild(stats);

            if (context.obligations[0]) {
              const note = document.createElement('p');
              note.className = 'detail-note';
              note.textContent = context.obligations[0].summary;
              card.appendChild(note);
            }

            card.addEventListener('click', () => {
              selectedRoleId = roleId;
              render();
            });

            grid.appendChild(card);
          }

          roleOverview.appendChild(grid);
        };

        const renderRoleDetail = () => {
          roleDetail.innerHTML = '';
          roleDetail.appendChild(renderSectionHeader('ROLE SNAPSHOT', selectedRoleId === 'all' ? 'All roles are visible above. Pick one to see its compliance load and sources.' : `Focused on ${toRoleLabel(selectedRoleId)}.`));

          if (selectedRoleId === 'all') {
            const note = document.createElement('p');
            note.className = 'detail-note';
            note.textContent = 'This view stays aggregated until you choose a role.';
            roleDetail.appendChild(note);
            return;
          }

          const context = getRoleProfessionalContext(selectedRoleId, {
            obligationCount: 3,
            paperworkCount: 3,
            enforcementCount: 2,
            breachCount: 2,
            areaId: resolvedAreaId,
          });

          if (context.areaBurden) {
            const burden = document.createElement('div');
            burden.innerHTML = '<div class="detail-label">AREA BURDEN</div>';

            const note = document.createElement('p');
            note.className = 'detail-note';
            note.textContent = context.areaBurden.title;
            burden.appendChild(note);

            if (context.areaBurden.watchouts?.length) {
              const list = document.createElement('ul');
              list.className = 'intel-list';
              context.areaBurden.watchouts.slice(0, 2).forEach((item) => {
                const row = document.createElement('li');
                row.textContent = item;
                list.appendChild(row);
              });
              burden.appendChild(list);
            }

            roleDetail.appendChild(burden);
          }

          const makeListSection = (label, items, emptyMessage, formatter) => {
            const section = document.createElement('div');
            section.innerHTML = `<div class="detail-label">${label}</div>`;

            if (!items.length) {
              const empty = document.createElement('p');
              empty.className = 'detail-note';
              empty.textContent = emptyMessage;
              section.appendChild(empty);
              return section;
            }

            const list = document.createElement('ul');
            list.className = 'intel-list';
            items.forEach((item) => {
              const li = document.createElement('li');
              const row = formatter(item);
              if (row instanceof HTMLElement) {
                li.appendChild(row);
              } else {
                li.textContent = row;
              }
              list.appendChild(li);
            });
            section.appendChild(list);
            return section;
          };

          const obligationSection = makeListSection(
            'PROFESSIONAL OBLIGATIONS',
            context.obligations,
            'No obligation entries available for this role.',
            (item) => {
              const row = document.createElement('div');
              row.style.display = 'grid';
              row.style.gap = '4px';
              const title = document.createElement('strong');
              title.textContent = item.title;
              const summary = document.createElement('span');
              summary.className = 'detail-note';
              summary.textContent = item.summary;
              row.appendChild(title);
              row.appendChild(summary);
              if (item.sourceUrl) {
                const link = document.createElement('a');
                link.href = item.sourceUrl;
                link.target = '_blank';
                link.rel = 'noreferrer noopener';
                link.textContent = item.sourceLabel || 'Official source';
                link.className = 'term-dim';
                row.appendChild(link);
              }
              return row;
            }
          );

          const paperworkSection = makeListSection(
            'MINISTRY PROCESS HOOKS',
            context.paperwork,
            'No paperwork hooks available for this role.',
            (item) => {
              const row = document.createElement('div');
              row.style.display = 'grid';
              row.style.gap = '4px';
              const title = document.createElement('strong');
              title.textContent = item.title;
              const summary = document.createElement('span');
              summary.className = 'detail-note';
              summary.textContent = item.summary;
              row.appendChild(title);
              row.appendChild(summary);
              if (item.sourceUrl) {
                const link = document.createElement('a');
                link.href = item.sourceUrl;
                link.target = '_blank';
                link.rel = 'noreferrer noopener';
                link.textContent = item.sourceLabel || 'Official source';
                link.className = 'term-dim';
                row.appendChild(link);
              }
              return row;
            }
          );

          const enforcementSection = makeListSection(
            'ENFORCEMENT PATTERNS',
            context.enforcement,
            'No enforcement patterns available for this role.',
            (item) => {
              const row = document.createElement('div');
              row.style.display = 'grid';
              row.style.gap = '4px';
              const title = document.createElement('strong');
              title.textContent = item.title;
              const summary = document.createElement('span');
              summary.className = 'detail-note';
              summary.textContent = item.summary;
              row.appendChild(title);
              row.appendChild(summary);
              if (item.sourceUrl) {
                const link = document.createElement('a');
                link.href = item.sourceUrl;
                link.target = '_blank';
                link.rel = 'noreferrer noopener';
                link.textContent = item.sourceLabel || 'Official source';
                link.className = 'term-dim';
                row.appendChild(link);
              }
              return row;
            }
          );

          const breachSection = makeListSection(
            'WHAT CAN GO WRONG',
            context.breaches,
            'No failure patterns available for this role.',
            (item) => {
              const row = document.createElement('div');
              row.style.display = 'grid';
              row.style.gap = '4px';
              const title = document.createElement('strong');
              title.textContent = item.title;
              const summary = document.createElement('span');
              summary.className = 'detail-note';
              summary.textContent = item.summary;
              row.appendChild(title);
              row.appendChild(summary);
              if (item.sourceUrl) {
                const link = document.createElement('a');
                link.href = item.sourceUrl;
                link.target = '_blank';
                link.rel = 'noreferrer noopener';
                link.textContent = item.sourceLabel || 'Official source';
                link.className = 'term-dim';
                row.appendChild(link);
              }
              return row;
            }
          );

          roleDetail.appendChild(obligationSection);
          roleDetail.appendChild(paperworkSection);
          roleDetail.appendChild(enforcementSection);
          roleDetail.appendChild(breachSection);
        };

        const renderCatalogue = () => {
          const query = normalizeSearchText(search.value.trim());
          const acts = ILLEGAL_ACTS.filter((entry) => {
            if (sourceBackedOnly && !hasSourceLinks(entry)) {
              return false;
            }

            if (selectedRoleId !== 'all' && !Array.isArray(entry.roles)) {
              return false;
            }

            if (selectedRoleId !== 'all' && !entry.roles.includes(selectedRoleId)) {
              return false;
            }

            return matchesIntelQuery(entry, query);
          });

          catalogue.innerHTML = '';
          catalogue.appendChild(renderSectionHeader(
            'ILLEGAL ACTS CATALOGUE',
            `${acts.length} matching entries${sourceBackedOnly ? ' with official citation links' : ''}.`
          ));

          if (!acts.length) {
            const empty = document.createElement('p');
            empty.className = 'detail-note';
            empty.textContent = 'No catalogue entries match the current filters.';
            catalogue.appendChild(empty);
            return;
          }

          const list = document.createElement('div');
          list.style.display = 'grid';
          list.style.gap = '10px';

          acts.slice(0, 80).forEach((entry) => {
            const card = document.createElement('article');
            card.style.border = '1px solid rgba(255,255,255,0.14)';
            card.style.borderRadius = '12px';
            card.style.padding = '12px';
            card.style.background = 'rgba(255,255,255,0.04)';
            card.style.display = 'grid';
            card.style.gap = '8px';

            const heading = document.createElement('div');
            heading.style.display = 'flex';
            heading.style.flexWrap = 'wrap';
            heading.style.alignItems = 'center';
            heading.style.justifyContent = 'space-between';
            heading.style.gap = '8px';

            const title = document.createElement('strong');
            title.textContent = entry.title;
            heading.appendChild(title);

            const riskChip = document.createElement('span');
            riskChip.className = 'chip';
            riskChip.textContent = `RISK ${getEntryRisk(entry)}`;
            heading.appendChild(riskChip);
            card.appendChild(heading);

            const summary = document.createElement('p');
            summary.className = 'detail-note';
            summary.textContent = entry.description || entry.summary || '';
            card.appendChild(summary);

            const detailGrid = document.createElement('div');
            detailGrid.style.display = 'grid';
            detailGrid.style.gap = '6px';

            const patternRow = document.createElement('div');
            patternRow.className = 'detail-note';
            patternRow.textContent = `Pattern: ${getEntryPattern(entry)}`;
            detailGrid.appendChild(patternRow);

            const roleRow = document.createElement('div');
            roleRow.className = 'chip-row';
            getRoleFit(entry).forEach((label) => {
              const chip = document.createElement('span');
              chip.className = 'chip';
              chip.textContent = label;
              roleRow.appendChild(chip);
            });
            detailGrid.appendChild(roleRow);

            const sourceLinks = getEntrySourceLinks(entry);
            if (sourceLinks.length) {
              const sourceRow = document.createElement('div');
              sourceRow.style.display = 'flex';
              sourceRow.style.flexWrap = 'wrap';
              sourceRow.style.gap = '10px';
              sourceRow.className = 'detail-note';

              sourceLinks.slice(0, 3).forEach((link) => {
                sourceRow.appendChild(makeSourceAnchor(link));
              });

              if (sourceLinks.length > 3) {
                const overflow = document.createElement('span');
                overflow.textContent = `+${sourceLinks.length - 3} more`;
                overflow.className = 'term-dim';
                sourceRow.appendChild(overflow);
              }

              detailGrid.appendChild(sourceRow);
            }

            card.appendChild(detailGrid);
            list.appendChild(card);
          });

          catalogue.appendChild(list);
        };

        const render = () => {
          for (const [roleId, button] of roleButtons.entries()) {
            const isActive = roleId === selectedRoleId;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            button.style.border = isActive ? '1px solid rgba(120, 156, 84, 0.9)' : '1px solid rgba(255,255,255,0.12)';
            button.style.background = isActive ? 'rgba(120, 156, 84, 0.22)' : 'rgba(255,255,255,0.06)';
            button.style.color = 'inherit';
          }

          renderRoleOverview();
          renderRoleDetail();
          renderCatalogue();
        };

        render();
        container.appendChild(wrapper);

        setTimeout(() => search.focus(), 0);
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  },

  /**
   * Show journey log modal
   * @param {Object[]} logEntries - Formatted log entries
   */
  showLog(logEntries) {
    if (!logEntries || logEntries.length === 0) {
      this.showModal({
        title: 'JOURNEY LOG',
        content: 'No events recorded yet.',
        actions: [{ label: 'Close', primary: true }]
      });
      return;
    }

    this.openModal({
      title: 'JOURNEY LOG',
      dismissible: true,
      buildContent: (container) => {
        const list = document.createElement('div');
        list.className = 'log-list';

        for (const entry of logEntries) {
          const icon = entry.icon || '·';
          const detail = entry.detail ? ` - ${entry.detail}` : '';
          const dayLabel = entry.dayLabel || 'Day';

          const row = document.createElement('div');
          row.className = `log-entry log-${entry.type}`;

          const daySpan = document.createElement('span');
          daySpan.className = 'log-day';
          daySpan.textContent = `${dayLabel} ${entry.day}`;

          const iconSpan = document.createElement('span');
          iconSpan.className = 'log-icon';
          iconSpan.textContent = icon;

          const summarySpan = document.createElement('span');
          summarySpan.className = 'log-summary';
          summarySpan.textContent = `${entry.summary}${detail}`;

          row.appendChild(daySpan);
          row.appendChild(iconSpan);
          row.appendChild(summarySpan);
          list.appendChild(row);
        }

        container.appendChild(list);
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  },

  /**
   * Show restart confirmation
   */
  confirmRestart() {
    return new Promise((resolve) => {
      this.showModal({
        title: 'RESTART GAME?',
        content: 'Your current progress will be lost.',
        actions: [
          { label: 'Cancel', onClick: () => resolve(false) },
          { label: 'Restart', primary: true, onClick: () => resolve(true) }
        ]
      });
    });
  },

  /**
   * Open context-specific glossary
   * @private
   */
  _openContextGlossary(title, terms = []) {
    const entries = Array.isArray(terms) ? terms : [];

    if (!entries.length) {
      this.showModal({
        title,
        content: '<p>No glossary terms available yet.</p>',
        actions: [{ label: 'Close', primary: true }]
      });
      return;
    }

    this.openModal({
      title,
      dismissible: true,
      buildContent: (container) => {
        const list = document.createElement('div');
        list.className = 'modal-glossary-list';

        entries.forEach((term) => {
          const row = document.createElement('div');
          row.className = 'modal-glossary-term';

          const termTitle = document.createElement('div');
          termTitle.className = 'modal-glossary-title';
          termTitle.textContent = term.term;

          const desc = document.createElement('div');
          desc.className = 'modal-glossary-desc';
          desc.textContent = term.description;

          row.appendChild(termTitle);
          row.appendChild(desc);

          if (term.sourceUrl) {
            const source = document.createElement('a');
            source.href = term.sourceUrl;
            source.target = '_blank';
            source.rel = 'noreferrer noopener';
            source.textContent = term.sourceLabel || 'Source';
            source.className = 'modal-glossary-desc';
            row.appendChild(source);
          }

          list.appendChild(row);
        });

        container.appendChild(list);
      },
      actions: [{ label: 'Close', primary: true, onSelect: () => this.closeModal() }]
    });
  },

  /**
   * Find a glossary term by name
   * @private
   */
  _findGlossaryTerm(term) {
    return (
      GLOSSARY_TERMS.find((entry) => entry.term === term) || LEGACY_GLOSSARY_TERMS.find((entry) => entry.term === term)
    );
  }
};
