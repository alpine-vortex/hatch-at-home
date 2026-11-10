// The card editor: pick which pets the shelf shows (none picked shows all).
class HatchPetCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
  }

  // Older cards name one entity per pet; show those as their devices.
  _devicesOf(config) {
    if (config.devices) return config.devices;
    const ids = [].concat(config.entities || [], config.entity || []);
    const devices = ids.map((id) => this._hass?.entities?.[id]?.device_id).filter(Boolean);
    return [...new Set(devices)];
  }

  async _render() {
    if (!this._form) {
      // ha-form loads with the frontend's own card editors; make sure it's there.
      if (!customElements.get("ha-form")) {
        const helpers = await window.loadCardHelpers?.();
        const entities = await helpers?.createCardElement({ type: "entities", entities: [] });
        await entities?.constructor?.getConfigElement?.();
      }
      if (this._form) return this._render(); // a second call got here first: just update its data
      this._form = document.createElement("ha-form");
      const LABELS = { devices: "Pets on this shelf", seasonal: "Seasonal decorations" };
      const HELPERS = {
        devices: "Leave empty to show every pet. The shelf shows them in this order.",
        // gaps-seams 7a: the YAML `seasonal: false`, in the editor.
        seasonal: "Halloween, Thanksgiving and winter lights on this card. Off hides them on this card only.",
      };
      this._form.computeLabel = (field) => LABELS[field.name];
      this._form.computeHelper = (field) => HELPERS[field.name];
      this._form.schema = [{
        name: "devices",
        selector: { device: { multiple: true, filter: { integration: "virtual_pet" } } },
      }, { name: "seasonal", selector: { boolean: {} } }];
      this._form.addEventListener("value-changed", (e) => this._changed(e.detail.value));
      this.append(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { devices: this._devicesOf(this._config), seasonal: this._config.seasonal !== false };
  }

  _changed(value) {
    const config = { ...this._config };
    delete config.entities;
    delete config.entity;
    if (value.devices?.length) config.devices = value.devices;
    else delete config.devices;
    // Off is `seasonal: false`; on drops the key, but keeps a preview (`seasonal: "winter"`).
    if (value.seasonal === false) config.seasonal = false;
    else if (typeof config.seasonal !== "string") delete config.seasonal;
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config }, bubbles: true, composed: true,
    }));
  }
}

