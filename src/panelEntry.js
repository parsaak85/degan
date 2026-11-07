// A successful legacy login may land on /index.rose instead of the requested
// reservation URL. Recover once during startup, never while browsing manually.
export function createPanelEntry() {
  let complete = false;
  let redirectedFrom = '';
  let failed = false;
  let recoveryFrom='';
  return {
    observe(snapshot,{home=false}={}) {
      if (snapshot.kind === 'login') { complete = false; redirectedFrom = ''; failed = false; return ''; }
      if (snapshot.kind === 'panel') { complete = true; recoveryFrom=''; return ''; }
      if(complete&&home&&snapshot.kind==='website'){
        if(!snapshot.authenticated)return 'failed';
        if(!recoveryFrom){recoveryFrom=snapshot.pageId;return 'open-panel';}
        return snapshot.pageId!==recoveryFrom?'failed':'';
      }
      if (complete || failed || snapshot.kind !== 'website' || !snapshot.authenticated) return '';
      if (!redirectedFrom) { redirectedFrom = snapshot.pageId; return 'open-panel'; }
      if (snapshot.pageId !== redirectedFrom) { failed = true; return 'failed'; }
      return '';
    },
  };
}
