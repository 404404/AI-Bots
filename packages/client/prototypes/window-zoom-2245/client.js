// THROWAWAY #2245. Public DSH registration + document presentation only.
// No upstream mutation, Electron imports, foreign registration removal or persistence.
window.__ModuleLoader__.load({ id: '@botharness/zoom-prototype', factory: () => ({
  inject: ['shortcuts'],
  apply(ctx) {
    const state = { level: 0, mode: 'off', recording: false, composing: false, actions: [], errors: [] };
    const oldZoom = document.documentElement.style.zoom;
    const root = document.createElement('section'); root.id = 'zoom-prototype';
    root.style.cssText = 'position:fixed;right:12px;top:75px;width:300px;max-height:70vh;overflow:auto;z-index:99999;padding:12px;background:var(--dsw-alias-bg-base,#222);color:var(--dsw-alias-fg-base,#eee);border:1px solid currentColor;font:12px sans-serif';
    root.innerHTML = '<b>THROWAWAY #2245 · 整页缩放机制实验</b><p>只验证运行边界；关闭原型即可撤销。</p><div id="zoom-ruler" style="width:200px;height:16px;background:currentColor"></div><p id="zoom-state"></p><button id="zoom-minus">−</button> <button id="zoom-plus">+</button> <button id="zoom-reset">100%</button><input id="zoom-edit" aria-label="Prototype input" value="保留这段输入"><div id="zoom-embeds"></div>';
    document.body.append(root);
    const render=()=>root.querySelector('#zoom-state').textContent=`${Math.round(1.2**state.level*100)}% · ${state.mode} · actions ${state.actions.length}`;
    const set=(level,source='control')=>{state.level=Math.max(-8,Math.min(8,level));document.documentElement.style.zoom=String(1.2**state.level);state.actions.push({source,level:state.level});render();};
    root.querySelector('#zoom-minus').onclick=()=>set(state.level-1);
    root.querySelector('#zoom-plus').onclick=()=>set(state.level+1);
    root.querySelector('#zoom-reset').onclick=()=>set(0);
    const disposers=[];
    for(const [id,code,delta] of [['increase','Equal',1],['decrease','Minus',-1],['bridgeControl','KeyY',1]]) {
      try { disposers.push(ctx.shortcuts.register({id:`zoomPrototype.${id}`,label:()=>`ZOOM PROTOTYPE ${id}`,aliases:[],defaults:{[`${ctx.shortcuts.runtime}:${ctx.shortcuts.platform}`]:{code,modifiers:['primary']}},regions:['page','editable','terminal'],modals:['other'],resolve(context){return {status:'handled',run(){set(state.level+delta,`registry:${context.source??'keyboard'}`);}}}})); }
      catch(error){state.errors.push(String(error));}
    }
    const start=()=>state.composing=true, end=()=>state.composing=false;
    document.addEventListener('compositionstart',start,true);document.addEventListener('compositionend',end,true);
    const capture=event=>{
      if(state.mode!=='capture'||state.recording||state.composing||event.isComposing||event.repeat||event.defaultPrevented||event.altKey) return;
      const primary=ctx.shortcuts.platform==='macos'?event.metaKey&&!event.ctrlKey:event.ctrlKey&&!event.metaKey;
      if(!primary)return;
      const delta=['Equal','NumpadAdd'].includes(event.code)?1:['Minus','NumpadSubtract'].includes(event.code)?-1:0;
      if(!delta)return;
      event.preventDefault();event.stopImmediatePropagation();set(state.level+delta,'capture');
    };
    window.addEventListener('keydown',capture,true);
    window.__zoomProbe={state,set,mode(value){state.mode=value;render();},snapshot(){return {state:structuredClone(state),catalog:ctx.shortcuts.catalog.getSnapshot().filter(x=>x.id.startsWith('zoomPrototype.')),fixed:ctx.shortcuts.fixedCatalog.getSnapshot().filter(x=>x.id.startsWith('fontSize.')),config:ctx.shortcuts.config.getSnapshot().status};},async recording(value){await ctx.shortcuts.recording(value);state.recording=value;},async embeds(url){
      const box=root.querySelector('#zoom-embeds');
      const local=document.createElement('iframe');local.name='zoom-prototype-local';local.dataset.htmlPreview='';local.id='zoom-local';local.style.cssText='width:260px;height:100px';local.srcdoc='<body style="margin:8px"><div style="width:100px;height:15px;background:teal" id="ruler"></div><input id="edit" value="same-origin iframe"></body>';box.append(local);
      const cross=document.createElement('iframe');cross.name='zoom-prototype-cross';cross.dataset.htmlPreview='';cross.id='zoom-cross';cross.style.cssText='width:260px;height:100px';cross.src=url;box.append(cross);
      const grant=await window.dshDesktop.browser.acquire('zoom-prototype-scratch');
      const guest=document.createElement('webview');guest.id='zoom-guest';guest.setAttribute('name',grant.lease);guest.setAttribute('partition',grant.partition);guest.dataset.sidebarBrowserFrame='';guest.style.cssText='width:260px;height:100px;display:flex';guest.src=`about:blank#${grant.lease}`;guest.addEventListener('dom-ready',()=>{if(guest.getURL().startsWith('about:blank#')){setTimeout(()=>guest.loadURL(url),0);}else{state.guestReady=true;render();}});box.append(guest);
      disposers.push(()=>window.dshDesktop.browser.release(grant.lease));
      guest.addEventListener('did-fail-load',e=>state.errors.push(`guest-load:${e.errorCode}:${e.errorDescription}`));
    }};
    render();
    ctx.effect(()=>()=>{for(const dispose of disposers)dispose();window.removeEventListener('keydown',capture,true);document.removeEventListener('compositionstart',start,true);document.removeEventListener('compositionend',end,true);document.documentElement.style.zoom=oldZoom;root.remove();delete window.__zoomProbe;});
  }
})});
