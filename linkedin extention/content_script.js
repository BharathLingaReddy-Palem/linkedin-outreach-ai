'use strict';
(() => {
  if (globalThis.__outreachScraperInstalled) return;
  globalThis.__outreachScraperInstalled = true;
  const clean = value => String(value || '').replace(/\s+/g,' ').trim();
  const text = element => clean(element?.innerText || element?.textContent);
  const visible = element => !!element && !element.closest('[aria-hidden="true"]') && element.getClientRects().length > 0;
  function lines(root) {
    if (!root) return [];
    return [...new Set(Array.from(root.querySelectorAll('p, span[aria-hidden="true"], .t-bold, .t-normal, [data-field]'))
      .filter(e=>!e.querySelector('p, .t-bold, .t-normal') && (visible(e) || e.getAttribute('aria-hidden') === 'true'))
      .map(text).filter(Boolean))];
  }
  function section(main,name) {
    const heading = Array.from(main.querySelectorAll('h2,h3')).find(h=>text(h).replace(/\s*\(\d+\)$/,'').toLowerCase() === name.toLowerCase());
    if (!heading) return null;
    const card = heading.closest('[componentkey*="profile.card"], [id*="profile.card"], section');
    if (card && card !== main && card.getAttribute('aria-label') !== 'Primary content' && (name!=='Experience' || card.querySelector('li,[role="listitem"],[componentkey^="entity-collection-item"]'))) return card;
    let node = heading.parentElement;
    for (let depth=0;node && node!==main && depth<6;depth++,node=node.parentElement) {
      if (node.querySelector(name==='Experience'?'li,[role="listitem"],[componentkey^="entity-collection-item"]':'li,[role="listitem"],p')) return node;
    }
    return null;
  }
  function scrapeProfile() {
    const main = document.querySelector('main') || document.querySelector('[role="main"]');
    if (!main) throw new Error('Profile content is not ready. Wait for LinkedIn to load, then refresh, or enter details manually.');
    const topCard = main.querySelector('[componentkey$="Topcard"], [id$="Topcard"], .pv-top-card, .ph5') || main;
    const heading = Array.from(topCard.querySelectorAll('h1,h2')).find(e=>visible(e) && !/notifications?|profile language|public profile|people you|about|experience/i.test(text(e)));
    const titleName = document.title.replace(/^(?:\(\d+\)\s*)+/,'').split('|')[0].trim();
    const name = Outreach.cleanName(text(heading) || titleName);
    const noise = /^(?:verify|contact info|\d+ (?:connections|followers)|open to|add section|enhance profile|resources|show details|get started|share that|showcase your|tell non-profits)/i;
    const topLines = lines(topCard).filter(t=>t!==name && !noise.test(t) && t.length>3);
    const explicitHeadline = topCard.querySelector('.text-body-medium, [data-generated-suggestion-target="urn:li:fsu_profileActionDelegate:headline"]');
    // Short headlines are valid. SDUI puts pronouns/connection degree before
    // the headline and company/school buttons after it; never choose the longest
    // label or require >12 characters ("AI Engineer" is only 11).
    const metadata = /^(?:(?:he|she|they|him|her|them|his|hers|their)(?:\s*\/\s*(?:he|she|they|him|her|them|his|hers|their))+|[·•]?\s*(?:1st|2nd|3rd\+?)|[·•])$/i;
    const locationLike = value=>/^(?:Greater .+ (?:Area|Region)|.+ Metropolitan Area)$/i.test(value) || /,\s*(?:India|United States|United Kingdom|Canada|Australia|Germany|Singapore)\s*$/i.test(value);
    const headlineLine = value=>value!==name && value.length>1 && !noise.test(value) && !metadata.test(value) && !locationLike(value);
    const paragraphs=Array.from(topCard.querySelectorAll('p')).filter(e=>visible(e) && !e.closest('button,[role="button"]') && (!heading || !!(heading.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING))).map(text);
    const headline = text(explicitHeadline) || (paragraphs.length ? paragraphs.find(headlineLine) : topLines.find(headlineLine)) || '';
    const location = text(topCard.querySelector('.text-body-small.inline.t-black--light')) || topLines.find(t=>t!==headline && t.includes(',') && t.length<90 && !t.includes('|') && !/university|institute|education|college/i.test(t)) || '';
    const experienceEntries = [];
    const exp = section(main,'Experience');
    if (exp) {
      const rowSelector='li.artdeco-list__item, [role="listitem"], li, [componentkey^="entity-collection-item"]';
      const rows = Array.from(exp.querySelectorAll(rowSelector)).filter(e=>!e.querySelector(rowSelector));
      for (const row of rows) {
        const entries = lines(row).filter(t=>!/^experience$|^show all/i.test(t));
        const durationIndex = entries.findIndex(t=>/\b(?:19|20)\d{2}\b/.test(t) && /[-–·]|present/i.test(t));
        if (durationIndex<1) continue;
        const title=entries[0];
        let company=durationIndex>=2 ? entries[1].split('·')[0].trim() : '';
        if (/^(?:Full-time|Part-time|Contract|Freelance|Self-employed|Internship|Temporary)$/i.test(company)) company='';
        // Grouped jobs omit the company in each child row. Accept a unique
        // company link in the enclosing group, not a guess from nearby text.
        if (!company) {
          let group=row;
          for(let depth=0;group && group!==exp && depth<5;depth++,group=group.parentElement) {
            const links=Array.from(group.querySelectorAll('a[href*="/company/"]')).filter(visible);
            const labels=[...new Set(links.map(text).filter(Boolean))];
            if (labels.length===1) {company=labels[0].split('·')[0].trim();break;}
            if (labels.length>1) break;
          }
        }
        if (title && title!==company) experienceEntries.push({title,company,duration:entries[durationIndex],isCurrent:/\b(?:Present|Current)\b/i.test(entries[durationIndex])});
      }
    }
    const current = experienceEntries.find(e=>e.isCurrent);
    // Pipes separate interests too. Only explicit 'at/@' establishes an employer.
    const companyLabels=Array.from(topCard.querySelectorAll('button,[role="button"]')).filter(visible).map(text);
    const at = Outreach.headlineEmployment(headline,companyLabels);
    const linkedCompanies=[...new Set(Array.from(topCard.querySelectorAll('a[href*="/company/"]')).filter(visible).map(e=>text(e) || clean(e.getAttribute('aria-label')).replace(/^(?:View company:?|Current company:?)\s*/i,'')).filter(t=>t && t.length<=160))];
    const currentTitle=current?.title || at.title || Outreach.headlineRole(headline);
    const currentCompany=current?.company || at.company || (linkedCompanies.length===1?linkedCompanies[0]:'');
    const fieldSources={role:current?.title?'Current experience':currentTitle?'Headline':'',company:current?.company?'Current experience':at.company?'Headline':currentCompany?'Profile company link':''};
    const companyCandidates=[...new Set(companyLabels)].filter(t=>t && t.length<160 && t!==name && t!==headline && !noise.test(t) && !/^(?:follow|message|connect|more|portfolio|visit|view|save|send|share|\d)|connections|followers/i.test(t)).slice(0,4);
    const skills = lines(section(main,'Skills')).filter(t=>t.length<70 && !/skills|endorse|show all|experience|\d{4}/i.test(t)).slice(0,10);
    const about = lines(section(main,'About')).filter(t=>t.length>50).join(' ').slice(0,1200);
    const profile = Outreach.normalizeProfile({name,headline,location,about,skills,experienceEntries,
      currentTitle,currentCompany,fieldSources,companyCandidates,
      employmentLinked:!!(current?.title && current?.company || at.title && at.company),profileUrl:window.location.href});
    profile.warnings = [!name && 'Name not found.',!headline && 'Headline not found.',!profile.currentTitle && 'Current role not verified.',!profile.currentCompany && 'Company not verified.'].filter(Boolean);
    profile.nameSource = heading ? 'Profile heading' : 'Page title (review carefully)';
    return profile;
  }
  async function scrapeWithScroll() {
    const x=window.scrollX,y=window.scrollY;
    try {
      for (const offset of [700,1600,2800,4000,0]) {window.scrollTo(0,offset);await new Promise(r=>setTimeout(r,220));}
      return scrapeProfile();
    } finally {window.scrollTo(x,y);}
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if (message.action!=='scrapeProfile') return;
    scrapeWithScroll().then(data=>reply({success:true,data})).catch(error=>reply({success:false,error:error.message}));
    return true;
  });
})();
