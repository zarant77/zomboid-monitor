(() => {
  const storageKey='zomboid-monitor.language', supported=['en','uk'];
  let dictionaries={},language=(navigator.language || navigator.languages?.[0] || '').toLowerCase().startsWith('uk')?'uk':'en';
  try { const saved=localStorage.getItem(storageKey);if(supported.includes(saved))language=saved; } catch {}
  const t=(key,params={})=>String(dictionaries[language]?.[key] ?? dictionaries.en?.[key] ?? key).replace(/\{(\w+)\}/g,(match,name)=>params[name] ?? match);
  function applyTranslations() {
    document.documentElement.lang=language;
    document.querySelectorAll('[data-i18n]').forEach(node=>{node.textContent=t(node.dataset.i18n,node.dataset.i18nDefaultPeriod?{period:t(node.dataset.i18nDefaultPeriod)}:{});});
    for(const attribute of ['aria-label','title','content']) document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(node=>node.setAttribute(attribute,t(node.getAttribute(`data-i18n-${attribute}`))));
    document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
    document.querySelector('meta[property="og:locale"]')?.setAttribute('content',language==='uk'?'uk_UA':'en_US');
  }
  function setLanguage(next,persist=true) {
    if(!supported.includes(next))return;
    language=next;
    if(persist)try{localStorage.setItem(storageKey,next);}catch{}
    applyTranslations();document.dispatchEvent(new CustomEvent('languagechange',{detail:{language}}));
  }
  function relativeAge(seconds) {
    if(seconds<2)return t('just now');
    const unit=seconds<60?'second':seconds<3600?'minute':'hour',count=Math.floor(seconds/(unit==='second'?1:unit==='minute'?60:3600));
    const index=language==='uk'?(count%100>=11&&count%100<=14?2:count%10===1?0:count%10>=2&&count%10<=4?1:2):count===1?0:2;
    const word=(dictionaries[language]?.units ?? dictionaries.en?.units)?.[unit]?.[index] ?? unit;
    return t(unit==='second'?'agoSeconds':unit==='minute'?'agoMinutes':'agoHours',{count,unit:word});
  }
  const i18nReady=Promise.all(supported.map(async code=>{
    const response=await fetch(`/locales/${code}.json`);if(!response.ok)throw new Error(`Locale ${code}: HTTP ${response.status}`);
    dictionaries[code]=await response.json();
  })).then(()=>{
    applyTranslations();
    document.getElementById('language-switcher')?.addEventListener('click',event=>{const button=event.target.closest('[data-language]');if(button)setLanguage(button.dataset.language);});
    window.addEventListener('storage',event=>{if(event.key===storageKey&&supported.includes(event.newValue))setLanguage(event.newValue,false);});
  });
  Object.assign(ZM,{t,locale:()=>language==='uk'?'uk-UA':'en-GB',setLanguage,relativeAge,i18nReady});
})();
