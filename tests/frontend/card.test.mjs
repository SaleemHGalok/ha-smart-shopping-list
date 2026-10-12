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
