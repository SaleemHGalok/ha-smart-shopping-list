const DOMAIN = 'smart_shopping_list';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class SmartShoppingCard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:'open'}); this.items = []; this.revision = -1;
    this.loading = true; this.pending = false; this.generation = 0;
  }
  setConfig(config) {
    if (!['manage','store','history','multi'].includes(config.mode ?? 'manage')) throw new Error('Mode must be manage, store, history or multi');
    if (this.config?.mode !== 'multi' || config.mode !== 'multi') this.multiMode = 'manage';
    this.config = {...config, mode:config.mode ?? 'manage'}; this.render();
  }
  set hass(hass) {
    const changed = this._hass?.connection !== hass.connection;
    this._hass = hass;
    if (changed && this.isConnected) { this.disconnect(); this.connect(); }
  }
  connectedCallback() { this.connect(); }
  disconnectedCallback() { this.disconnect(); }
  disconnect() {
    this.generation++; this.unsubscribe?.(); this.unsubscribe = undefined; this.subscribing = false;
  }
  async connect() {
    if (!this._hass || this.unsubscribe || this.subscribing || !this.isConnected) return;
    this.subscribing = true; this.loading = true; this.revision = -1; this.render();
    const generation = this.generation;
    try {
      const unsubscribe = await this._hass.connection.subscribeMessage(snapshot => {
        if (generation !== this.generation) return;
        this.accept(snapshot); this.loading = false; this.error = ''; this.render();
      }, {type:`${DOMAIN}/subscribe`});
      if (generation !== this.generation) unsubscribe(); else this.unsubscribe = unsubscribe;
    } catch (err) { if (generation === this.generation) { this.loading = false; this.error = err.message || 'Unable to connect'; this.render(); } }
    finally { if (generation === this.generation) this.subscribing = false; }
  }
  accept(snapshot) {
    if (snapshot.revision < this.revision) return;
    this.items = snapshot.items; this.revision = snapshot.revision;
  }
  async command(action, fields = {}) {
    if (this.pending) return false;
    this.pending = true; this.error = ''; this.render();
    try {
      this.accept(await this._hass.callWS({type:`${DOMAIN}/command`, action, ...fields}));
      this.dialog = undefined; return true;
    } catch (err) { this.error = err.message || 'Unable to save. Please retry.'; return false; }
    finally { this.pending = false; this.render(); }
  }
  getCardSize() { return Math.max(3, this.items.length + 1); }
  static getStubConfig() { return {mode:'manage', title:'Shopping list'}; }
  render() {
    if (!this.config) return;
    const focusedName = this.shadowRoot.activeElement?.name;
    const mode = this.config.mode === 'multi' ? this.multiMode : this.config.mode;
    const items = this.items.filter(i => i.purchased === (mode === 'history'));
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;font-family:var(--paper-font-body1_-_font-family,system-ui);color:var(--primary-text-color)}
      ha-card{display:block;padding:16px;background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,16px)}
      header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}h2{font-size:1.2rem;margin:0;flex:1}button,input{font:inherit}
      button{min-height:44px;padding:8px 14px;border-radius:12px;border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer}
      button.primary{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:transparent}.actions button.primary{min-height:52px;min-width:90px}button:disabled{opacity:.5;cursor:wait}
      button:focus-visible,input:focus-visible{outline:3px solid var(--primary-color);outline-offset:2px}
      ul{list-style:none;padding:0;margin:0}li{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--divider-color)}
      .description{flex:1;min-width:0;overflow-wrap:anywhere}.quantity{display:block;color:var(--secondary-text-color);font-size:.9rem;margin-top:4px}.actions{display:flex;gap:6px;flex-wrap:wrap}
      .error{color:var(--error-color);overflow-wrap:anywhere}.muted{color:var(--secondary-text-color)}
      .overlay{position:fixed;inset:0;z-index:1000;background:#0008;display:grid;place-items:center;padding:16px}.modal{box-sizing:border-box;background:var(--card-background-color);border-radius:16px;padding:24px;width:min(100%,400px);max-height:90vh;overflow:auto}
      label{display:block;margin:16px 0}input{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:12px;border:1px solid var(--divider-color);border-radius:8px;color:var(--primary-text-color);background:var(--secondary-background-color)}footer{display:flex;gap:8px;justify-content:flex-end}
      @media(max-width:420px){li{flex-wrap:wrap}.actions{margin-inline-start:auto}ha-card{padding:12px}}
    </style><ha-card><header>${mode === 'manage' ? '<button class="primary" data-action="add">＋ Add Item</button>' : ''}<h2>${escape(this.config.title ?? ({manage:'Shopping list',store:'At the store',history:'Purchase history'}[mode]))}</h2>${this.config.mode === 'multi' ? `<button data-action="switch-mode">${mode === 'manage' ? 'Store mode' : 'Back to manage mode'}</button>` : ''}${mode === 'history'  && items.length && !this.loading ? '<button data-action="clear-history">Clear History</button>' : ''}</header>
    ${this.error ? `<p class="error" role="alert">${escape(this.error)}</p><button data-action="retry">Retry connection</button>` : ''}
    ${this.loading ? '<p class="muted" role="status">Loading shopping list…</p>' : !items.length ? `<p class="muted">${mode === 'history' ? 'No purchased items yet.' : 'Your shopping list is empty.'}</p>` : `<ul>${items.map(i => `<li><div class="description">${escape(i.name)}<span class="quantity">${escape(i.quantity)} ${escape(i.unit)}${mode === 'history' && i.purchased_at ? ` · ${escape(new Date(i.purchased_at).toLocaleString())}` : ''}</span></div><div class="actions">${mode === 'manage' ? `<button data-action="edit" data-id="${escape(i.id)}" aria-label="Edit quantity for ${escape(i.name)}">Edit</button><button data-action="delete" data-id="${escape(i.id)}" aria-label="Delete ${escape(i.name)}">Delete</button>` : `<button class="primary" data-action="${mode === 'store' ? 'purchase' : 'restore'}" data-id="${escape(i.id)}">${mode === 'store' ? 'Got It' : 'Restore'}</button>`}</div></li>`).join('')}</ul>`}
    ${this.dialog ? this.renderDialog() : ''}</ha-card>`;
    this.shadowRoot.querySelectorAll('button[data-action]').forEach(button => {
      button.disabled = this.pending;
      button.onclick = () => this.handle(button.dataset.action, button.dataset.id);
    });
    if (focusedName) this.shadowRoot.querySelector(`[name="${focusedName}"]`)?.focus();
    const form = this.shadowRoot.querySelector('form');
    if (form) {
      form.querySelectorAll("input").forEach(input => { input.disabled = this.pending; });
      form.onsubmit = event => { event.preventDefault(); const data = new FormData(form); this.command(this.dialog.action, this.dialog.action === 'add' ? {name:data.get('name'), quantity:Number(data.get('quantity')), unit:data.get('unit') || null} : {item_id:this.dialog.item.id, quantity:Number(data.get('quantity'))}); };
      form.oninput = () => { this.dialog.draft = Object.fromEntries(new FormData(form)); };
    }
    const modal = this.shadowRoot.querySelector('.modal');
    if (modal) {
      modal.onkeydown = event => {
        if (event.key === 'Escape' && !this.pending) this.handle('cancel');
        if (event.key === 'Tab') {
          const controls = [...modal.querySelectorAll('input,button')].filter(e => !e.disabled);
          const first = controls[0], last = controls.at(-1), active = this.shadowRoot.activeElement;
          if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
        }
      };
    }
  }
  renderDialog() {
    const {action, item, draft = {}} = this.dialog;
    if (action === 'clear-history') {
      return `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">Clear history?</h2><p>Permanently delete all purchased items? Active shopping items will be kept. This cannot be undone.</p>${this.error ? `<p class="error" role="alert">${escape(this.error)}</p>` : ''}<footer><button data-action="cancel">Cancel</button><button class="primary" data-action="confirm-clear-history">Clear History</button></footer></section></div>`;
    }
    return `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${this.error ? `<p class="error" role="alert">${escape(this.error)}</p>` : ''}<h2 id="dialog-title">${action === 'add' ? 'Add item' : action === 'edit' ? 'Edit quantity' : 'Delete item?'}</h2>${action === 'delete' ? `<p>Permanently delete ${escape(item.name)}?</p><footer><button data-action="cancel">Cancel</button><button class="primary" data-action="confirm-delete" data-id="${escape(item.id)}">Delete</button></footer>` : `<form>${action === 'add' ? `<label>Item name<input name="name" maxlength="200" required value="${escape(draft.name)}"></label>` : `<p>${escape(item.name)}</p>`}<label>Quantity<input name="quantity" type="number" min="5e-324" step="any" required value="${escape(draft.quantity ?? item?.quantity ?? 1)}"></label>${action === 'add' ? `<label>Unit (optional)<input name="unit" maxlength="40" value="${escape(draft.unit)}"></label>` : ''}<footer><button type="button" data-action="cancel">Cancel</button><button class="primary" type="submit" ${this.pending ? 'disabled' : ''}>${action === 'add' ? 'Add' : 'Save'}</button></footer></form>`}</section></div>`;
  }
  handle(action, id) {
    if (action === 'switch-mode') {
      if (this.config.mode !== 'multi' || this.pending) return;
      this.multiMode = this.multiMode === 'manage' ? 'store' : 'manage';
      this.dialog = undefined;
      this.render();
      this.shadowRoot.querySelector('[data-action="switch-mode"]')?.focus();
      return;
    }
    if (action === 'retry') { this.disconnect(); this.connect(); return; }
    if (action === 'cancel') { this.dialog = undefined; this.render(); return; }
    if (action === 'confirm-clear-history') { this.command('clear_history'); return; }
    if (['add','edit','delete','clear-history'].includes(action)) {
      this.dialog = {action, item:this.items.find(i => i.id === id)}; this.render();
      this.shadowRoot.querySelector('.modal input,.modal button')?.focus(); return;
    }
    this.command(action === 'confirm-delete' ? 'delete' : action, {item_id:id});
  }
}
if (!customElements.get('smart-shopping-card')) customElements.define('smart-shopping-card', SmartShoppingCard);
window.customCards = window.customCards || [];
window.customCards.push({type:'smart-shopping-card', name:'Smart Shopping List', description:'Shared management, store and history views'});
