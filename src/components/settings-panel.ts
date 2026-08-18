import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { consume } from "@lit/context";
import {
  llmConfigHostContext,
  type CatalogProvider,
  type ConfigEntry,
  type LLMProfile,
  type LlmConfigHost,
  type LocalEndpoint,
} from "../host.js";
import * as settings from "../lib/settings.js";
import {
  buildAvailabilityContext,
  formatSources,
  providerSources,
  isProviderAvailable,
  isLocalhostURL,
  hostOf,
} from "../lib/catalog.js";
import "./combobox.js";
import "./connection-wizard.js";
import "./loading-indicator.js";
import type { ComboboxOption } from "./combobox.js";
import { browserStyles } from "../styles.js";

@customElement("cw-settings-panel")
export class GcSettingsPanel extends LitElement {
  @consume({ context: llmConfigHostContext, subscribe: true })
  private llmConfigHost!: LlmConfigHost;

  @property({ type: Boolean }) open = false;
  /** Prefix stripped from config keys when rendered as human labels.
   * E.g. with "GITCHAT_" set, "GITCHAT_SESSION_MAX_COST_USD" displays
   * as "session max cost usd". Empty string disables the stripping. */
  @property({ type: String }) configKeyPrefix = "GITCHAT_";

  @state() private configEntries: ConfigEntry[] = [];
  @state() private configLoading = false;
  @state() private settingsSection = "layout";
  private configDebounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  @state() private profiles: LLMProfile[] = [];
  @state() private activeProfileId = "";
  @state() private editingProfile: Partial<LLMProfile> | null = null;
  @state() private catalog: CatalogProvider[] = [];
  @state() private catalogLoading = false;
  @state() private localEndpoints: LocalEndpoint[] = [];
  @state() private localDiscovering = false;

  // Models discovered by hitting /v1/models (or similar) on a specific
  // base URL entered in advanced-config. Keyed by URL so that switching
  // between providers re-uses cached results.
  @state() private discoveredModelsByUrl: Map<string, string[]> = new Map();
  @state() private discoveringModelsForUrl = "";
  private discoverModelsDebounce: ReturnType<typeof setTimeout> | null = null;

  override disconnectedCallback() {
    super.disconnectedCallback();
    for (const t of this.configDebounceTimers.values()) clearTimeout(t);
    this.configDebounceTimers.clear();
    if (this.discoverModelsDebounce) {
      clearTimeout(this.discoverModelsDebounce);
      this.discoverModelsDebounce = null;
    }
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has("open") && this.open) this.scheduleOpenLoad();
  }

  private scheduleOpenLoad() {
    queueMicrotask(() => {
      if (!this.isConnected || !this.open) return;
      void this.loadConfig().then(() => this.discoverModelsForCurrentBaseUrl());
      void this.loadProfiles();
      void this.loadCatalog();
    });
  }

  // Let the parent's handleOverlay focus the panel without knowing about
  // the internal modal inside our shadow root.
  override focus() {
    const modal = this.renderRoot.querySelector<HTMLElement>(".modal");
    modal?.focus();
  }

  private requestClose() {
    this.dispatchEvent(new CustomEvent("gc:close", { bubbles: true, composed: true }));
  }

  private trapFocus = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const modal = e.currentTarget as HTMLElement;
    const focusable = modal.querySelectorAll<HTMLElement>("button, input, select, [tabindex]");
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = (this.renderRoot as ShadowRoot).activeElement ?? document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  private async loadConfig() {
    this.configLoading = true;
    try {
      const resp = await this.llmConfigHost.getConfig({});
      this.configEntries = resp.entries ?? [];
    } catch {
      this.configEntries = [];
    } finally {
      this.configLoading = false;
    }
  }

  private async loadProfiles() {
    try {
      const resp = await this.llmConfigHost.listProfiles({});
      this.profiles = resp.profiles ?? [];
      this.activeProfileId = resp.activeProfileId ?? "";
    } catch {
      this.profiles = [];
    }
  }

  /** Dispatch a gc:toast with the given kind + message. Factored out
   * so every mutation path in this panel surfaces failures the same
   * way — silent catches are how safe-config guarantees quietly drift. */
  private toast(kind: "info" | "success" | "warn" | "error", message: string) {
    this.dispatchEvent(
      new CustomEvent("gc:toast", {
        bubbles: true,
        composed: true,
        detail: { kind, message },
      }),
    );
  }

  private errorMessage(e: unknown, fallback: string): string {
    if (e instanceof Error && e.message) return `${fallback}: ${e.message}`;
    return fallback;
  }

  private async saveProfile(profile: any) {
    try {
      const resp = await this.llmConfigHost.saveProfile({ profile });
      if (!profile.id) profile.id = resp.id;
      await this.loadProfiles();
      this.editingProfile = null;
      this.toast("success", `profile "${profile.name}" saved`);
    } catch (e) {
      this.toast("error", this.errorMessage(e, "could not save profile"));
    }
  }

  private async deleteProfile(id: string) {
    try {
      await this.llmConfigHost.deleteProfile({ id });
      await this.loadProfiles();
      await this.loadConfig();
      this.editingProfile = null;
    } catch (e) {
      this.toast("error", this.errorMessage(e, "could not delete profile"));
    }
  }

  private async loadCatalog() {
    try {
      const resp = await this.llmConfigHost.getProviderCatalog({});
      this.catalog = resp.providers ?? [];
    } catch {
      // Initial load is silent — the user hasn't asked for anything yet.
      // Refresh path (below) surfaces errors.
      this.catalog = [];
    }
  }

  private async refreshCatalog() {
    this.catalogLoading = true;
    try {
      const resp = await this.llmConfigHost.refreshProviderCatalog({});
      this.catalog = resp.providers ?? [];
      this.toast("success", `catalog refreshed · ${this.catalog.length} providers`);
    } catch (e) {
      this.toast("error", this.errorMessage(e, "catalog refresh failed"));
    } finally {
      this.catalogLoading = false;
    }
  }

  private async discoverLocal() {
    this.localDiscovering = true;
    try {
      const resp = await this.llmConfigHost.discoverLocalEndpoints({});
      this.localEndpoints = resp.endpoints ?? [];
      if (this.localEndpoints.length === 0) {
        this.toast("info", "no local endpoints detected on the usual ports");
      }
    } catch (e) {
      this.localEndpoints = [];
      this.toast("error", this.errorMessage(e, "local endpoint discovery failed"));
    } finally {
      this.localDiscovering = false;
    }
  }

  private async activateProfile(id: string) {
    try {
      await this.llmConfigHost.activateProfile({ id });
      await this.loadProfiles();
      await this.loadConfig();
    } catch (e) {
      this.toast("error", this.errorMessage(e, "could not activate profile"));
    }
  }

  private updateConfigEntry(key: string, value: string) {
    // Capture prior value BEFORE the optimistic mutation below so we
    // can detect provider-identity changes and warn about stale keys.
    const priorValue = this.configEntries.find((e) => e.key === key)?.value ?? "";

    this.configEntries = this.configEntries.map((e) => (e.key === key ? { ...e, value } : e));
    const existing = this.configDebounceTimers.get(key);
    if (existing) clearTimeout(existing);
    this.configDebounceTimers.set(
      key,
      setTimeout(async () => {
        try {
          await this.llmConfigHost.updateConfig({ key, value });
        } catch (e) {
          this.toast("error", this.errorMessage(e, `could not save ${key}`));
        }
        this.configDebounceTimers.delete(key);
      }, 300),
    );
    // Any change to LLM_BASE_URL (or the API key used with it) kicks a
    // model discovery against the new endpoint so the model combobox
    // below populates automatically — mirrors what the connection wizard
    // does for saved profiles, but works for one-off ad-hoc providers.
    if (key === "LLM_BASE_URL" || key === "LLM_API_KEY") {
      this.scheduleModelDiscovery();
    }
    // Key-leak guard: if the user pivoted LLM_BASE_URL to a different
    // provider while LLM_API_KEY is still set, the old provider's key
    // will fly to the new endpoint on the next turn. Warn loudly —
    // "unexpected money leaks" is the specific failure mode we're
    // trying to eliminate in this section.
    this.maybeWarnKeyReuse(key, priorValue, value);
  }

  private maybeWarnKeyReuse(key: string, priorValue: string, newValue: string) {
    if (key !== "LLM_BASE_URL") return;
    if (priorValue === newValue) return;
    // Only fire on a *real* provider identity change. If the user is
    // still typing (short prefix) or simply fixing a typo, don't nag.
    const priorHost = hostOf(priorValue);
    const newHost = hostOf(newValue);
    if (priorHost && priorHost === newHost) return;

    const apiKey = this.configEntries.find((e) => e.key === "LLM_API_KEY")?.value ?? "";
    if (!apiKey) return;

    // Local endpoints don't use the key — no leak risk, skip the warn.
    if (isLocalhostURL(newValue)) return;

    this.toast(
      "warn",
      "LLM_BASE_URL changed but LLM_API_KEY is still set. " +
        "If the new provider differs, update or clear the key before sending.",
    );
  }

  private scheduleModelDiscovery() {
    if (this.discoverModelsDebounce) clearTimeout(this.discoverModelsDebounce);
    this.discoverModelsDebounce = setTimeout(() => {
      void this.discoverModelsForCurrentBaseUrl();
    }, 400);
  }

  private async discoverModelsForCurrentBaseUrl(opts: { force?: boolean } = {}) {
    const baseUrl = this.configEntries.find((e) => e.key === "LLM_BASE_URL")?.value?.trim() ?? "";
    if (!baseUrl) return;
    // Silent remote probes are banned (see PATTERNS.md §7): auto-fire
    // only for loopback URLs, otherwise require an explicit user click
    // to avoid leaking presence + API key to third-party providers.
    // force=true bypasses the gate for the in-panel "discover models"
    // button.
    if (!opts.force && !isLocalhostURL(baseUrl)) return;
    // Skip catalog/local — those already populate suggestions.
    const inCatalog = this.catalog.some(
      (c) => c.defaultBaseUrl && baseUrl.startsWith(c.defaultBaseUrl),
    );
    const inLocal = this.localEndpoints.some((ep) => ep.url === baseUrl);
    if (inCatalog || inLocal) return;
    if (!opts.force && this.discoveredModelsByUrl.has(baseUrl)) return;
    const apiKey = this.configEntries.find((e) => e.key === "LLM_API_KEY")?.value ?? "";
    this.discoveringModelsForUrl = baseUrl;
    try {
      const resp = await this.llmConfigHost.discoverModels({ baseUrl, apiKey });
      if (!resp.error && resp.modelIds?.length) {
        this.discoveredModelsByUrl = new Map(this.discoveredModelsByUrl).set(
          baseUrl,
          resp.modelIds,
        );
      } else {
        // Cache the empty result so we don't retry on every keystroke —
        // user gets "no suggestions" until they change the URL or key.
        this.discoveredModelsByUrl = new Map(this.discoveredModelsByUrl).set(baseUrl, []);
      }
    } catch {
      this.discoveredModelsByUrl = new Map(this.discoveredModelsByUrl).set(baseUrl, []);
    } finally {
      if (this.discoveringModelsForUrl === baseUrl) this.discoveringModelsForUrl = "";
    }
  }

  private async resetConfigEntry(entry: ConfigEntry) {
    this.updateConfigEntry(entry.key, entry.defaultValue);
  }

  private humanizeKey(key: string): string {
    const stripped =
      this.configKeyPrefix && key.startsWith(this.configKeyPrefix)
        ? key.slice(this.configKeyPrefix.length)
        : key;
    return stripped.toLowerCase().replace(/_/g, " ");
  }

  private isSecretEntry(entry: ConfigEntry): boolean {
    return !!entry.secret;
  }

  private static readonly STATIC_SUGGESTIONS: Record<string, ComboboxOption[]> = {
    LLM_BACKEND: [
      { value: "openai", label: "openai" },
      { value: "anthropic", label: "anthropic" },
    ],
    LLM_TEMPERATURE: [
      { value: "0", label: "0 (deterministic)" },
      { value: "0.3", label: "0.3 (focused)" },
      { value: "0.7", label: "0.7 (balanced)" },
      { value: "1.0", label: "1.0 (creative)" },
    ],
    LLM_MAX_TOKENS: [
      { value: "0", label: "0 (provider default)" },
      { value: "2048", label: "2048" },
      { value: "4096", label: "4096" },
      { value: "8192", label: "8192" },
    ],
  };

  /** Per-entry action row — currently only LLM_MODEL uses this, to
   * surface a "discover models" button when the configured base URL
   * is a remote endpoint. Auto-discover fires silently for loopback
   * URLs (PATTERNS.md §7); for remote ones the user explicitly opts
   * in so we don't leak presence + API key on every settings open. */
  private renderEntryAction(entry: ConfigEntry) {
    if (entry.key !== "LLM_MODEL") return nothing;
    const baseUrl = this.configEntries.find((e) => e.key === "LLM_BASE_URL")?.value?.trim() ?? "";
    if (!baseUrl || isLocalhostURL(baseUrl)) return nothing;
    const inCatalog = this.catalog.some(
      (c) => c.defaultBaseUrl && baseUrl.startsWith(c.defaultBaseUrl),
    );
    if (inCatalog) return nothing; // catalog already seeds the combobox
    const discovering = this.discoveringModelsForUrl === baseUrl;
    const discovered = this.discoveredModelsByUrl.get(baseUrl);
    return html`<div class="config-entry-action" part="config-entry-action">
      <button
        class="config-action-btn"
        part="config-action-btn"
        ?disabled=${discovering}
        @click=${() => void this.discoverModelsForCurrentBaseUrl({ force: true })}
        title="Query ${hostOf(baseUrl) || baseUrl} for its model list"
      >
        ${discovering
          ? "discovering…"
          : discovered
            ? `\u21BB ${discovered.length} models`
            : "discover models"}
      </button>
      <span class="config-action-hint" part="config-action-hint">
        Remote probe — click to query the endpoint with your API key.
      </span>
    </div>`;
  }

  /** Pick a contextual empty-hint for the combobox. LLM_MODEL surfaces
   * the discovery state so the user knows why the dropdown is empty
   * (fetching vs genuinely no matches). */
  private comboboxEmptyHint(key: string): string {
    if (key !== "LLM_MODEL") return "type a value or fetch the catalog";
    const baseUrl = this.configEntries.find((e) => e.key === "LLM_BASE_URL")?.value ?? "";
    if (this.discoveringModelsForUrl && this.discoveringModelsForUrl === baseUrl) {
      return "discovering models…";
    }
    if (baseUrl && this.discoveredModelsByUrl.get(baseUrl)?.length === 0) {
      return "no models found at this base URL — type a model ID manually";
    }
    return "type a model ID or fetch the catalog";
  }

  /** Snapshot of what the user can currently call. Used by the model
   * fallback combobox so we don't surface providers the user has no
   * route to. State is already loaded on panel open, so this is a
   * pure read over component fields fed into the shared helper. */
  private availabilityContext() {
    return buildAvailabilityContext(this.localEndpoints, this.profiles, this.configEntries);
  }

  /** Build combobox suggestions for a config key from catalog + local discovery. */
  private configSuggestionsFor(key: string): ComboboxOption[] {
    const s = (this.constructor as typeof GcSettingsPanel).STATIC_SUGGESTIONS[key];
    if (s) return s;

    if (key === "LLM_ACTIVE_PROFILE") {
      // Saved profiles are the only valid values — the config field
      // otherwise accepts an opaque ID string the user would have to
      // memorize. Listing them here makes the field self-documenting.
      return this.profiles.map((p) => ({
        value: p.id,
        label: p.name || p.id,
        description: [p.backend, p.model || "backend default"].filter(Boolean).join(" · "),
      }));
    }

    if (key === "LLM_BASE_URL") {
      const local: ComboboxOption[] = this.localEndpoints.map((ep) => ({
        value: ep.url,
        label: ep.name,
        description: ep.models?.length ? `${ep.models.length} models · local` : "local",
      }));
      const catalog: ComboboxOption[] = this.catalog
        .filter((c) => c.defaultBaseUrl)
        .map((c) => ({
          value: c.defaultBaseUrl,
          label: c.name,
          description: [
            c.type,
            c.models?.length ? `${c.models.length} models` : "",
            formatSources(providerSources(c)),
          ]
            .filter(Boolean)
            .join(" · "),
        }));
      const seen = new Set<string>();
      return [...local, ...catalog].filter((o) => {
        if (seen.has(o.value)) return false;
        seen.add(o.value);
        return true;
      });
    }

    if (key === "LLM_MODEL") {
      const backend = this.configEntries.find((e) => e.key === "LLM_BACKEND")?.value;
      const baseUrl = this.configEntries.find((e) => e.key === "LLM_BASE_URL")?.value;

      // 1. Local models for the currently configured base URL.
      const localEp = this.localEndpoints.find((ep) => ep.url === baseUrl);
      if (localEp?.models?.length) {
        return localEp.models.map((id: string) => ({
          value: id,
          label: id,
          description: `${localEp.name} (local)`,
        }));
      }

      // 2. Catalog provider matching by base URL — most specific.
      const byUrl = this.catalog.find(
        (c) => c.defaultBaseUrl && baseUrl?.startsWith(c.defaultBaseUrl),
      );
      if (byUrl?.models?.length) {
        return byUrl.models.map((m) => ({
          value: m.id,
          label: m.name,
          description: [
            byUrl.name,
            m.contextWindow ? `${Math.round(Number(m.contextWindow) / 1000)}K` : "",
            formatSources(m.sources),
          ]
            .filter(Boolean)
            .join(" · "),
        }));
      }

      // 3. Live-discovered models for an ad-hoc base URL (not in the
      //    catalog, not a known local endpoint). The user gets the
      //    same dynamic /v1/models-style discovery that the connection
      //    wizard does for saved profiles.
      if (baseUrl) {
        const discovered = this.discoveredModelsByUrl.get(baseUrl);
        if (discovered && discovered.length > 0) {
          return discovered.map((id) => ({
            value: id,
            label: id,
            description: "discovered",
          }));
        }
        // Base URL set but unrecognised and no discovery hits — don't
        // show misleading models from other providers.
        return [];
      }
      // Fallback: no base URL configured. Show models from catalog
      // providers that are *callable* (have a key configured or are
      // local). This avoids listing, say, Claude models when the user
      // has no Anthropic key — picking one would just break.
      const availCtx = this.availabilityContext();
      return this.catalog
        .filter((c) => c.type === backend && isProviderAvailable(c, availCtx))
        .flatMap((c) =>
          (c.models ?? []).map((m) => ({
            value: m.id,
            label: m.name,
            description: [
              c.name,
              m.contextWindow ? `${Math.round(Number(m.contextWindow) / 1000)}K` : "",
              formatSources(m.sources),
            ]
              .filter(Boolean)
              .join(" · "),
          })),
        );
    }

    return [];
  }

  private static readonly SETTINGS_SECTIONS = [
    { id: "layout", label: "Layout" },
    { id: "llm", label: "LLM" },
    { id: "chat", label: "Chat" },
    { id: "session", label: "Session" },
  ] as const;

  private configGroupEntries(group: string): ConfigEntry[] {
    return this.configEntries.filter((e) => (e.group || "other") === group);
  }

  private configGroupModifiedCount(group: string): number {
    return this.configGroupEntries(group).filter((e) => e.value !== e.defaultValue).length;
  }

  private renderConfigGroup(group: string) {
    const entries = this.configGroupEntries(group);
    if (this.configLoading) {
      return html`<cw-spinner></cw-spinner><span>loading…</span>`;
    }
    if (entries.length === 0) {
      return html`<p class="config-empty" part="config-empty">no entries</p>`;
    }
    return html`
      <div class="config-group-body" part="config-group-body">
        ${entries.map((entry) => {
          const isSecret = this.isSecretEntry(entry);
          const modified = entry.value !== entry.defaultValue;
          const suggestions = this.configSuggestionsFor(entry.key);
          return html`
            <div class="config-entry" part="config-entry">
              <div class="config-entry-header" part="config-entry-header">
                <label
                  class="config-key ${modified ? "config-modified" : ""}"
                  part="config-key ${modified ? "config-modified" : ""}"
                  for="cfg-${entry.key}"
                  >${this.humanizeKey(entry.key)}</label
                >
                ${modified
                  ? html`<button
                      class="config-reset-btn"
                      part="config-reset-btn"
                      @click=${() => this.resetConfigEntry(entry)}
                      title="Reset to default"
                      aria-label="Reset ${this.humanizeKey(entry.key)} to default"
                    >
                      reset
                    </button>`
                  : nothing}
              </div>
              ${isSecret
                ? html`<input
                    id="cfg-${entry.key}"
                    class="config-input"
                    part="config-input"
                    type="password"
                    autocomplete="off"
                    placeholder=${entry.value || "not set"}
                    .value=${""}
                    @change=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      if (v) this.updateConfigEntry(entry.key, v);
                    }}
                  />`
                : suggestions.length > 0 || this.comboboxEmptyHint(entry.key)
                  ? html`<cw-combobox
                      part="combobox"
                      exportparts="combobox-wrap, input, listbox, empty-hint, option, active, option-label, option-desc"
                      .options=${suggestions}
                      .value=${entry.value}
                      .label=${this.humanizeKey(entry.key)}
                      empty-hint=${this.comboboxEmptyHint(entry.key)}
                      @gc-select=${(e: CustomEvent) => {
                        this.updateConfigEntry(entry.key, e.detail.value);
                      }}
                      @gc-input=${(e: CustomEvent) => {
                        this.updateConfigEntry(entry.key, e.detail);
                      }}
                    ></cw-combobox>`
                  : html`<input
                      id="cfg-${entry.key}"
                      class="config-input"
                      part="config-input"
                      type="text"
                      autocomplete="off"
                      .value=${entry.value}
                      @input=${(e: Event) => {
                        this.updateConfigEntry(entry.key, (e.target as HTMLInputElement).value);
                      }}
                    />`}
              ${this.renderEntryAction(entry)}
              ${entry.description
                ? html`<span id="cfg-desc-${entry.key}" class="config-desc" part="config-desc"
                    >${entry.description}</span
                  >`
                : nothing}
            </div>
          `;
        })}
      </div>
    `;
  }

  private renderLayout() {
    const sidebarW = parseInt(settings.get("sidebar-width"));
    const contentW = parseInt(settings.get("content-max-width"));
    const fontSize = parseFloat(settings.get("font-size")) * 100;
    return html`
      <label class="setting-row" part="setting-row">
        <span class="setting-label" part="setting-label">Sidebar width</span>
        <div class="setting-control" part="setting-control">
          <input
            type="range"
            min="180"
            max="450"
            .value=${String(sidebarW)}
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              settings.set("sidebar-width", v + "px");
              this.requestUpdate();
            }}
          />
          <span class="setting-value" part="setting-value">${sidebarW}px</span>
        </div>
      </label>

      <label class="setting-row" part="setting-row">
        <span class="setting-label" part="setting-label">Content max width</span>
        <div class="setting-control" part="setting-control">
          <input
            type="range"
            min="600"
            max="1400"
            step="20"
            .value=${String(contentW)}
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              settings.set("content-max-width", v + "px");
              this.requestUpdate();
            }}
          />
          <span class="setting-value" part="setting-value">${contentW}px</span>
        </div>
      </label>

      <label class="setting-row" part="setting-row">
        <span class="setting-label" part="setting-label">Font size</span>
        <div class="setting-control" part="setting-control">
          <input
            type="range"
            min="60"
            max="120"
            .value=${String(Math.round(fontSize))}
            @input=${(e: Event) => {
              const v = parseInt((e.target as HTMLInputElement).value);
              settings.set("font-size", (v / 100).toFixed(2) + "rem");
              this.requestUpdate();
            }}
          />
          <span class="setting-value" part="setting-value">${Math.round(fontSize)}%</span>
        </div>
      </label>
    `;
  }

  private renderSettingsSection() {
    switch (this.settingsSection) {
      case "layout":
        return this.renderLayout();
      case "llm":
        return this.renderLLMSection();
      default:
        return this.renderConfigGroup(this.settingsSection);
    }
  }

  /** Resolve what LLM is actually in effect, tracing through: active
   * profile (with its model/backend) → config override on LLM_MODEL/
   * LLM_BACKEND → compiled defaults. A profile with an empty `model`
   * field intentionally falls back to the config override, so we note
   * that explicitly rather than just showing "(default)". */
  private effectiveLLMStatus() {
    const activeProfile = this.profiles.find((p) => p.id === this.activeProfileId);
    const modelEntry = this.configEntries.find((e) => e.key === "LLM_MODEL");
    const backendEntry = this.configEntries.find((e) => e.key === "LLM_BACKEND");
    const modelOverride = modelEntry?.value || "";
    const modelDefault = modelEntry?.defaultValue || "";
    const backendOverride = backendEntry?.value || "";
    const backendDefault = backendEntry?.defaultValue || "";

    // Model resolution: profile.model > LLM_MODEL override > LLM_MODEL compiled default.
    // Backend resolution: profile.backend > LLM_BACKEND override > LLM_BACKEND compiled default.
    const model = activeProfile?.model || modelOverride || modelDefault || "(backend default)";
    const backend = activeProfile?.backend || backendOverride || backendDefault || "(unset)";

    let source: string;
    if (activeProfile) {
      source = activeProfile.model
        ? `profile "${activeProfile.name}"`
        : `profile "${activeProfile.name}" (no model saved; falls back to config)`;
    } else if (modelOverride && modelOverride !== modelDefault) {
      source = "LLM_MODEL override (no profile active)";
    } else if (modelOverride) {
      source = "LLM_MODEL (matches compiled default)";
    } else {
      source = "compiled default";
    }

    return { model, backend, source, modelDefault };
  }

  private renderLLMSection() {
    const status = this.effectiveLLMStatus();
    return html`
      <div class="llm-status" part="llm-status">
        <div class="llm-status-row" part="llm-status-row">
          <span class="llm-status-label" part="llm-status-label">Active model</span>
          <span class="llm-status-value" part="llm-status-value">${status.model}</span>
        </div>
        <div class="llm-status-row" part="llm-status-row">
          <span class="llm-status-label" part="llm-status-label">Backend</span>
          <span class="llm-status-value" part="llm-status-value">${status.backend}</span>
        </div>
        <div class="llm-status-row" part="llm-status-row">
          <span class="llm-status-label" part="llm-status-label">Source</span>
          <span class="llm-status-value llm-status-source" part="llm-status-value llm-status-source"
            >${status.source}</span
          >
        </div>
        ${status.modelDefault && status.modelDefault !== status.model
          ? html`<div
              class="llm-status-row llm-status-subtle"
              part="llm-status-row llm-status-subtle"
            >
              <span class="llm-status-label" part="llm-status-label">Compiled default</span>
              <span class="llm-status-value" part="llm-status-value">${status.modelDefault}</span>
            </div>`
          : nothing}
      </div>
      <div class="profiles-section" part="profiles-section">
        <div class="profiles-header" part="profiles-header">
          <span class="profiles-label" part="profiles-label">Profiles</span>
          <div class="profiles-header-actions" part="profiles-header-actions">
            <button
              class="action-btn"
              part="action-btn"
              ?disabled=${this.catalogLoading}
              @click=${() => this.refreshCatalog()}
              title="Fetch latest provider/model catalog. Sources: catwalk.charm.sh (curated), openrouter.ai (aggregator), models.dev (long-tail providers). Models show their source after the context window size."
            >
              ${this.catalogLoading
                ? "fetching…"
                : this.catalog.length > 0
                  ? `\u21BB ${this.catalog.length} providers`
                  : "fetch catalog"}
            </button>
            <button
              class="action-btn"
              part="action-btn"
              ?disabled=${this.localDiscovering}
              @click=${() => this.discoverLocal()}
              title="Detect LM Studio, Ollama, and other local endpoints"
            >
              ${this.localDiscovering
                ? "scanning…"
                : this.localEndpoints.length > 0
                  ? `${this.localEndpoints.length} local`
                  : "detect local"}
            </button>
            <button
              class="action-btn"
              part="action-btn"
              @click=${() => {
                this.editingProfile = null;
                this.editingProfile = {};
              }}
            >
              + new connection
            </button>
          </div>
        </div>
        <div class="profiles-list" part="profiles-list">
          ${this.profiles.length === 0
            ? html`<p class="config-empty" part="config-empty">
                no profiles yet — click "+ new connection" to get started
              </p>`
            : this.profiles.map(
                (p) => html`
                  <div
                    class="profile-item ${this.activeProfileId === p.id ? "active" : ""}"
                    part="profile-item ${this.activeProfileId === p.id ? "active" : ""}"
                  >
                    <button
                      class="profile-name"
                      part="profile-name"
                      @click=${() => {
                        this.editingProfile = { ...p };
                      }}
                    >
                      ${p.name}
                      <span class="profile-meta" part="profile-meta"
                        >${p.backend} · ${p.model || "uses LLM_MODEL / backend default"}</span
                      >
                    </button>
                    <div class="profile-actions" part="profile-actions">
                      ${this.activeProfileId === p.id
                        ? html`<span class="profile-active-badge" part="profile-active-badge"
                            >active</span
                          >`
                        : html`<button
                            class="action-btn"
                            part="action-btn"
                            @click=${() => this.activateProfile(p.id)}
                          >
                            activate
                          </button>`}
                      <button
                        class="action-btn danger"
                        part="action-btn danger"
                        @click=${() => {
                          if (confirm(`Delete profile "${p.name}"?`)) this.deleteProfile(p.id);
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                `,
              )}
        </div>
        ${this.activeProfileId
          ? html`<button
              class="action-btn profile-deactivate"
              part="action-btn profile-deactivate"
              @click=${() => this.activateProfile("")}
            >
              use manual settings
            </button>`
          : nothing}
      </div>

      ${this.editingProfile
        ? html`<cw-connection-wizard
            part="connection-wizard"
            exportparts="wizard, wizard-header, wizard-title, mode-toggle, steps, step-dot, done, active, step-line, step-content, step-body, step-desc, field, field-hint, input, textarea, quick-connect, quick-label, quick-btn, connection-info, info-label, error, success, warn, advanced, btn, primary, secondary, auth-actions, wizard-footer, spacer, save-actions"
            .catalog=${this.catalog}
            .localEndpoints=${this.localEndpoints}
            .profile=${this.editingProfile.id ? this.editingProfile : null}
            @gc-profile-save=${async (e: CustomEvent) => {
              const { profile, activate } = e.detail;
              await this.saveProfile(profile);
              if (activate) {
                const saved = this.profiles.find((p) => p.name === profile.name);
                if (saved) await this.activateProfile(saved.id);
              }
              this.editingProfile = null;
            }}
            @gc-profile-cancel=${() => {
              this.editingProfile = null;
            }}
          ></cw-connection-wizard>`
        : nothing}

      <details class="advanced-config" part="advanced-config">
        <summary>Advanced — raw config entries</summary>
        ${this.renderConfigGroup("llm")}
      </details>
    `;
  }

  private settingsSectionLabel(id: string): string {
    const sections = (this.constructor as typeof GcSettingsPanel).SETTINGS_SECTIONS;
    return sections.find((s) => s.id === id)?.label ?? id;
  }

  override render() {
    if (!this.open) return nothing;
    const sections = (this.constructor as typeof GcSettingsPanel).SETTINGS_SECTIONS;
    return html`
      <div class="modal-backdrop" part="modal-backdrop" @click=${() => this.requestClose()}>
        <div
          class="modal settings-modal"
          part="modal settings-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          tabindex="-1"
          @click=${(e: Event) => e.stopPropagation()}
          @keydown=${this.trapFocus}
        >
          <nav class="settings-sidebar" part="settings-sidebar">
            <h2 class="settings-title" part="settings-title">Settings</h2>
            ${sections.map((s) => {
              const mod = s.id !== "layout" ? this.configGroupModifiedCount(s.id) : 0;
              return html`
                <button
                  class="settings-nav-item ${this.settingsSection === s.id ? "active" : ""}"
                  part="settings-nav-item ${this.settingsSection === s.id ? "active" : ""}"
                  @click=${() => {
                    this.settingsSection = s.id;
                  }}
                >
                  ${s.label}
                  ${mod > 0
                    ? html`<span class="config-modified-badge" part="config-modified-badge"
                        >${mod}</span
                      >`
                    : nothing}
                </button>
              `;
            })}
            <div class="settings-sidebar-footer" part="settings-sidebar-footer">
              <button
                class="action-btn"
                part="action-btn"
                @click=${async () => {
                  if (!confirm("Reset all settings to defaults? This cannot be undone.")) return;
                  for (const k of settings.allKeys()) settings.reset(k);
                  for (const entry of this.configEntries) {
                    if (entry.value !== entry.defaultValue) {
                      await this.resetConfigEntry(entry);
                    }
                  }
                  this.requestUpdate();
                }}
              >
                reset defaults
              </button>
            </div>
          </nav>
          <div class="settings-content" part="settings-content">
            <h3 class="settings-section-title" part="settings-section-title">
              ${this.settingsSectionLabel(this.settingsSection)}
            </h3>
            ${this.renderSettingsSection()}
            <p class="modal-hint" part="modal-hint">
              changes apply immediately and persist across sessions
            </p>
          </div>
        </div>
      </div>
    `;
  }

  static override styles = css`
    ${browserStyles}
    .settings-modal,
      .settings-modal *,
      .settings-modal *::before,
      .settings-modal *::after {
      box-sizing: border-box;
    }

    /* ── Modal chrome (duplicated from gc-app since shadow DOM walls off parent CSS) ── */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 50;
      background: color-mix(in srgb, CanvasText 36%, transparent);
    }
    .modal {
      position: fixed;
      top: 60px;
      left: 0;
      right: 0;
      margin-left: auto;
      margin-right: auto;
      padding: var(--space-6, 1.5rem) var(--space-7, 2rem);
      max-width: 720px;
      width: 90vw;
      max-height: calc(100vh - 120px);
      overflow-y: auto;
      border: 1px solid var(--cw-border-color);
      border-radius: 0.75rem;
      background: Canvas;
      box-shadow: 0 1rem 3rem color-mix(in srgb, CanvasText 24%, transparent);
      z-index: 51;
    }
    @keyframes panel-in {
      from {
        transform: translateY(-8px);
      }
    }
    .modal-hint {
      margin: var(--space-4, 1rem) 0 0;
      text-align: center;
    }

    :focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }

    /* ── Settings modal (sidebar layout) ─────────────────────── */
    .settings-modal {
      max-width: min(1100px, 92vw);
      width: 92vw;
      top: 24px;
      max-height: calc(100vh - 48px);
      display: flex;
      padding: 0;
      overflow: hidden;
    }
    .settings-sidebar {
      width: 200px;
      flex-shrink: 0;
      padding: var(--space-4, 1rem);
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 0.25rem);
      border-inline-end: 1px solid var(--cw-border-color);
      background: ButtonFace;
    }
    .settings-title {
      margin: 0 0 var(--space-3, 0.75rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    }
    .settings-nav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border: 1px solid transparent;
      border-radius: 0.375rem;
      color: inherit;
      background: transparent;
      text-align: left;
      cursor: pointer;
    }
    .settings-nav-item.active {
      color: HighlightText;
      background: Highlight;
    }
    .settings-sidebar-footer {
      margin-top: auto;
      padding-top: var(--space-3, 0.75rem);
    }
    .settings-content {
      flex: 1;
      min-width: 0;
      min-height: 0;
      padding: var(--space-6, 1.5rem) var(--space-7, 2rem);
      overflow-y: auto;
    }
    .settings-section-title {
      margin: 0 0 var(--space-4, 1rem);
      font-size: 1.25rem;
    }
    @media (max-width: 640px) {
      .settings-modal {
        flex-direction: column;
        top: 0;
        max-height: 100vh;
        height: 100vh;
        width: 100vw;
        max-width: 100vw;
      }
      .settings-sidebar {
        width: 100%;
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--space-1, 0.25rem);
        padding: var(--space-3, 0.75rem);
      }
      .settings-title {
        display: none;
      }
      .settings-sidebar-footer {
        display: none;
      }
      .settings-content {
        max-height: none;
        flex: 1;
      }
    }

    /* ── Layout settings ──────────────────────────────────────── */
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-2, 0.5rem) 0;
    }
    .setting-control {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }
    .setting-control input[type="range"] {
      width: 140px;
    }
    .setting-value {
      min-width: 4.5em;
      text-align: right;
    }
    .config-group-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2, 0.5rem) var(--space-4, 1rem);
    }
    @media (max-width: 640px) {
      .config-group-body {
        grid-template-columns: 1fr;
      }
    }
    .config-entry {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-2, 0.5rem) 0;
    }
    .config-entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .config-reset-btn {
      padding: 0.05rem 0.35rem;
      cursor: pointer;
    }
    .config-input {
      width: 100%;
      box-sizing: border-box;
      padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
    }
    select.config-input {
      cursor: pointer;
    }
    .config-entry-action {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      margin-top: var(--space-1, 0.25rem);
    }
    .config-action-btn {
      padding: 0.15rem var(--space-2, 0.5rem);
      cursor: pointer;
    }
    .config-action-btn:disabled {
      cursor: default;
    }

    /* ── Advanced config collapsible ─────────────────────────── */
    .advanced-config {
      margin-top: var(--space-4, 1rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    }
    .advanced-config summary {
      cursor: pointer;
    }
    .advanced-config[open] summary {
      margin-bottom: var(--space-3, 0.75rem);
    }

    /* ── LLM Active status ───────────────────────────────────── */
    .llm-status {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 0.25rem);
      margin-bottom: var(--space-4, 1rem);
      padding: var(--space-3, 0.75rem);
    }
    .llm-status-row {
      display: grid;
      grid-template-columns: 8em 1fr;
      align-items: baseline;
      column-gap: var(--space-3, 0.75rem);
    }

    /* ── LLM Profiles ────────────────────────────────────────── */
    .profiles-section {
      margin-bottom: var(--space-4, 1rem);
      padding-bottom: var(--space-4, 1rem);
    }
    .profiles-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-3, 0.75rem);
    }
    .profiles-header-actions {
      display: flex;
      gap: var(--space-2, 0.5rem);
    }
    .profiles-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 0.25rem);
    }
    .profile-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    }
    .profile-name {
      cursor: pointer;
      text-align: left;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .profile-deactivate {
      margin-top: var(--space-2, 0.5rem);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-settings-panel": GcSettingsPanel;
  }
}
