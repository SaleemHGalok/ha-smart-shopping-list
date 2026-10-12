import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const window = new Window();
for (const key of ['HTMLElement','customElements','document','FormData']) globalThis[key] = window[key];
globalThis.window = window;
await import('../../frontend/src/smart-shopping-card.js');
afterEach(() => {document.body.replaceChildren();});
const item = {id:'00000000-0000-0000-0000-000000000001',name:'Milk',quantity:2,unit:'L',purchased:false};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(mode='manage') {
  let emit, unsubscribed=0;
  const calls=[];
  const card = document.createElement('smart-shopping-card');
  card.setConfig({mode});
  card.hass = {
    connection:{subscribeMessage:async (callback, request) => {
      assert.equal(request.type,'smart_shopping_list/subscribe'); emit=callback;
      callback({revision:0,items:[{...item}]}); return () => {unsubscribed++;};
    }},
    callWS:async request => {
      calls.push(request);
      return {revision:1,items:request.action === 'delete' ? [] : [{...item,purchased:request.action === 'purchase'}]};
    }
  };
  document.body.append(card);
  return {card,calls,emit:(data)=>emit(data),unsubscribed:()=>unsubscribed};
}
test('management shows active items and add dialog', async () => {
  const {card,calls}=setup(); await tick();
  assert.match(card.shadowRoot.textContent,/Milk/);
  card.shadowRoot.querySelector('[data-action="add"]').click();
  const form=card.shadowRoot.querySelector('form');
  form.elements.name.value='Bread'; form.elements.quantity.value='3'; form.elements.unit.value='loaves';
  form.dispatchEvent(new window.Event('submit',{cancelable:true})); await tick();
  assert.deepEqual(calls[0],{type:'smart_shopping_list/command',action:'add',name:'Bread',quantity:3,unit:'loaves'});
  assert.equal(card.dialog,undefined);
});
test('edit only exposes quantity; cancel sends nothing',async()=>{
  const {card,calls}=setup(); await tick(); card.handle('edit',item.id);
  assert.equal(card.shadowRoot.querySelector('[name="name"]'),null);
  card.handle('cancel'); assert.equal(calls.length,0);
  card.handle('edit',item.id); const form=card.shadowRoot.querySelector('form');
  form.elements.quantity.value='4'; form.dispatchEvent(new window.Event('submit',{cancelable:true})); await tick();
  assert.equal(calls[0].action,'edit'); assert.equal(calls[0].quantity,4);
});
test('delete requires confirmation',async()=>{
  const {card,calls}=setup(); await tick(); card.handle('delete',item.id);
  assert.equal(calls.length,0);
  card.shadowRoot.querySelector('[data-action="confirm-delete"]').click(); await tick();
  assert.equal(calls[0].action,'delete'); assert.equal(card.items.length,0);
});
test('store purchase hides item after successful write',async()=>{
  const {card,calls}=setup('store'); await tick();
  card.shadowRoot.querySelector('[data-action="purchase"]').click(); await tick();
  assert.equal(calls[0].action,'purchase'); assert.equal(card.shadowRoot.querySelector('li'),null);
});
test('history restores purchased item',async()=>{
  const context=setup('history'); await tick();
  context.emit({revision:1,items:[{...item,purchased:true}]});
  context.card._hass.callWS=async request=>{context.calls.push(request);return {revision:2,items:[item]};};
  context.card.shadowRoot.querySelector('[data-action="restore"]').click(); await tick();
  assert.equal(context.calls[0].action,'restore'); assert.equal(context.card.shadowRoot.querySelector('li'),null);
});
test('snapshots synchronize and stale responses are ignored',async()=>{
  const first=setup(),second=setup('store'); await tick();
  const snapshot={revision:5,items:[{...item,purchased:true}]}; first.emit(snapshot);second.emit(snapshot);
  first.emit({revision:3,items:[item]});
  assert.equal(first.card.revision,5);assert.equal(second.card.shadowRoot.querySelector('li'),null);
});
test('error state retains dialog draft and successful retry clears it',async()=>{
  const {card}=setup();await tick();card.handle('add');
  const form=card.shadowRoot.querySelector('form');form.elements.name.value='Bread';
  form.dispatchEvent(new window.Event('input',{bubbles:true}));
  card._hass.callWS=async()=>{throw new Error('disk full');};
  await card.command('add',{name:'Bread',quantity:1});
  assert.match(card.shadowRoot.querySelector('[role="alert"]').textContent,/disk full/);
  assert.equal(card.shadowRoot.querySelector('[name="name"]').value,'Bread');
  assert.equal(card.pending,false);
  card._hass.callWS=async()=>({revision:2,items:[item]});
  await card.command('add',{name:'Bread',quantity:1});
  assert.equal(card.dialog,undefined);assert.equal(card.shadowRoot.querySelector('[role="alert"]'),null);
});
test('item text is escaped and subscription is cleaned up',async()=>{
  const context=setup();await tick();context.emit({revision:1,items:[{...item,name:'<img src=x onerror=alert(1)>'}]});
  assert.equal(context.card.shadowRoot.querySelector('img'),null);
  context.card.remove();assert.equal(context.unsubscribed(),1);
});
test('loading, empty, configuration validation and title',()=>{
  const card=document.createElement('smart-shopping-card');card.setConfig({title:'Groceries'});
  assert.match(card.shadowRoot.textContent,/Loading/);assert.match(card.shadowRoot.textContent,/Groceries/);
  card.loading=false;card.render();assert.match(card.shadowRoot.textContent,/empty/);
  assert.throws(()=>card.setConfig({mode:'invalid'}));
});
test('late subscription is disposed after card detaches',async()=>{
  const card=document.createElement('smart-shopping-card');card.setConfig({});
  let resolve,disposed=false;
  card.hass={connection:{subscribeMessage:()=>new Promise(r=>{resolve=r;})}};
  document.body.append(card);card.remove();resolve(()=>{disposed=true;});await tick();
  assert.equal(disposed,true);
});

test('clear history requires confirmation and preserves active items',async()=>{
  const {card,calls,emit}=setup('history');await tick();
  assert.equal(card.shadowRoot.querySelector('[data-action="clear-history"]'),null);
  emit({revision:1,items:[item,{...item,id:'history-item',purchased:true}]});
  card.shadowRoot.querySelector('[data-action="clear-history"]').click();
  assert.equal(calls.length,0);assert.match(card.shadowRoot.querySelector('[role="dialog"]').textContent,/cannot be undone/);
  card.shadowRoot.querySelector('[data-action="cancel"]').click();assert.equal(calls.length,0);
  card.handle('clear-history');
  card._hass.callWS=async request=>{calls.push(request);return {revision:2,items:[item]};};
  card.shadowRoot.querySelector('[data-action="confirm-clear-history"]').click();await tick();
  assert.deepEqual(calls,[{type:'smart_shopping_list/command',action:'clear_history'}]);
  assert.deepEqual(card.items,[item]);assert.equal(card.dialog,undefined);
  assert.equal(card.shadowRoot.querySelector('[data-action="clear-history"]'),null);
});
test('failed history clear retains history and allows retry',async()=>{
  const {card,emit}=setup('history');await tick();
  emit({revision:1,items:[{...item,purchased:true}]});card.handle('clear-history');
  card._hass.callWS=async()=>{throw new Error('disk full');};
  card.shadowRoot.querySelector('[data-action="confirm-clear-history"]').click();await tick();
  assert.equal(card.items.length,1);assert.equal(card.dialog.action,'clear-history');
  assert.match(card.shadowRoot.querySelector('[role="dialog"] [role="alert"]').textContent,/disk full/);
  assert.equal(card.shadowRoot.querySelector('[data-action="confirm-clear-history"]').disabled,false);
});
test('clear history is not offered in manage or store modes',async()=>{
  for(const mode of ['manage','store']) {
    const {card,emit}=setup(mode);await tick();emit({revision:1,items:[{...item,purchased:true}]});
    assert.equal(card.shadowRoot.querySelector('[data-action="clear-history"]'),null);
  }
});

test('multi mode defaults to manage and switches back without API calls',async()=>{
  const {card,calls}=setup('multi');await tick();
  assert.ok(card.shadowRoot.querySelector('[data-action="add"]'));
  assert.ok(card.shadowRoot.querySelector('[data-action="edit"]'));
  assert.equal(card.shadowRoot.querySelector('[data-action="switch-mode"]').textContent,'Store mode');
  card.shadowRoot.querySelector('[data-action="switch-mode"]').click();
  assert.equal(card.shadowRoot.querySelector('[data-action="add"]'),null);
  assert.ok(card.shadowRoot.querySelector('[data-action="purchase"]'));
  assert.equal(card.shadowRoot.querySelector('[data-action="switch-mode"]').textContent,'Back to manage mode');
  card.shadowRoot.querySelector('[data-action="switch-mode"]').click();
  assert.ok(card.shadowRoot.querySelector('[data-action="add"]'));
  assert.equal(calls.length,0);
});
test('multi mode purchase uses the same API and keeps store view on updates',async()=>{
  const {card,calls,emit}=setup('multi');await tick();
  card.handle('switch-mode');
  card.shadowRoot.querySelector('[data-action="purchase"]').click();await tick();
  assert.equal(calls[0].action,'purchase');assert.equal(card.shadowRoot.querySelector('li'),null);
  emit({revision:2,items:[item]});card.setConfig({mode:'multi',title:'Groceries'});
  assert.ok(card.shadowRoot.querySelector('[data-action="purchase"]'));
  assert.match(card.shadowRoot.querySelector('h2').textContent,/Groceries/);
  assert.equal(card.shadowRoot.querySelector('[data-action="restore"]'),null);
  assert.equal(card.shadowRoot.querySelector('[data-action="clear-history"]'),null);
});
test('fixed modes have no switch button and multi selection is local',async()=>{
  for(const mode of ['manage','store','history']) {
    const {card}=setup(mode);await tick();
    assert.equal(card.shadowRoot.querySelector('[data-action="switch-mode"]'),null);
  }
  const first=setup('multi'),second=setup('multi');await tick();first.card.handle('switch-mode');
  assert.ok(second.card.shadowRoot.querySelector('[data-action="add"]'));
  first.card.setConfig({mode:'manage'});first.card.setConfig({mode:'multi'});
  assert.ok(first.card.shadowRoot.querySelector('[data-action="add"]'));
});
test('multi switch is disabled during a pending save',async()=>{
  const {card}=setup('multi');await tick();
  let resolve;
  card._hass.callWS=()=>new Promise(r=>{resolve=r;});
  const saving=card.command('add',{name:'Bread',quantity:1});
  assert.equal(card.shadowRoot.querySelector('[data-action="switch-mode"]').disabled,true);
  card.handle('switch-mode');assert.equal(card.multiMode,'manage');
  resolve({revision:1,items:[item]});await saving;
  assert.equal(card.shadowRoot.querySelector('[data-action="switch-mode"]').disabled,false);
});
