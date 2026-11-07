(() => {
  const showFailure=()=>{
    const panel=document.getElementById('startup-error');
    if(!panel)return;
    panel.hidden=false;
    document.getElementById('startup-retry').href=location.href;
    document.querySelector('.loading-message')?.setAttribute('hidden','');
  };
  window.addEventListener('error',event=>{
    if(event.target?.matches?.('script[data-app]')||(!document.documentElement.dataset.appReady&&event instanceof ErrorEvent))showFailure();
  },true);
  const timeout=setTimeout(()=>{if(!document.documentElement.dataset.appReady)showFailure();},12000);
  window.addEventListener('review:ready',()=>{clearTimeout(timeout);document.getElementById('startup-error').hidden=true;},{once:true});
})();
