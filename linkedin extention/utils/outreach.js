'use strict';
// Shared rules for the popup, scraper and service worker. No external service.
globalThis.Outreach = (() => {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  function cleanName(value) {
    const name = clean(value).replace(/^(?:\(\d+\)\s*)+/, '').split(/\s*[|]\s*LinkedIn\b/i)[0].trim();
    return !name || /^(?:LinkedIn|notifications?|unknown|there)$/i.test(name) || /^\(?\d+\)?$/.test(name) ? '' : name.slice(0,120);
  }
  function profileUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && /^(www\.)?linkedin\.com$/.test(url.hostname) && /^\/in\/[^/]+\/?$/.test(url.pathname)
        ? `https://www.linkedin.com${url.pathname.replace(/\/$/,'')}/` : '';
    } catch { return ''; }
  }
  function normalizeProfile(raw = {}) {
    const name = cleanName(raw.name);
    return {...raw,name,firstName:name.split(/\s+/)[0] || 'there',
      headline:clean(raw.headline).slice(0,350),currentTitle:clean(raw.currentTitle).slice(0,160),
      currentCompany:clean(raw.currentCompany).slice(0,160),about:clean(raw.about).slice(0,1200),
      skills:Array.isArray(raw.skills) ? raw.skills.map(clean).filter(Boolean).slice(0,10) : [],
      experienceEntries:Array.isArray(raw.experienceEntries) ? raw.experienceEntries.slice(0,8) : [],
      profileUrl:profileUrl(raw.profileUrl)};
  }
  function headlineEmployment(headline, companyLabels = []) {
    if (/^(?:ex[-\s]|former\b|previous\b|retired\b|aspiring\b|seeking\b|looking for\b|open to\b)/i.test(clean(headline))) return {title:'',company:''};
    const at=clean(headline).match(/^([^|]+?)\s+(?:at|@)\s+([^|·]+)(?:[|·]|$)/i);
    if (!at) return {title:'',company:''};
    const raw=clean(at[2]);
    // Cross-check a matching top-card company label when available. Otherwise
    // remove only a trailing hashtag group, not legal/local company qualifiers.
    const company=companyLabels.map(clean).filter(Boolean).find(label=>raw===label || raw.startsWith(label+' (') || raw.startsWith(label+' #'))
      || raw.replace(/\s+\(#[^)]*\)\s*$/,'').replace(/\s+#.*$/,'').trim();
    return {title:clean(at[1]),company};
  }
  function headlineRole(headline) {
    const first=clean(headline).split(/\s*[|·]\s*/)[0];
    if (!first || first.length>120 || /\b(?:aspiring|former|previous|retired|seeking|enthusiast)\b|^ex[-\s]|looking for|open to/i.test(first)) return '';
    const at=headlineEmployment(first);
    if (at.title) return at.title;
    return /\b(?:engineer|developer|designer|architect|scientist|analyst|manager|recruiter|founder|cofounder|ceo|cto|cfo|lead|director|consultant|researcher|specialist|professor|intern)\b/i.test(first) ? first : '';
  }
  const asks = {
    Networking:"I'd love to connect and exchange ideas.",
    Internship:'Are there internship opportunities on your team, or someone you would recommend I speak with?',
    Job:"I'm exploring relevant opportunities and would appreciate your guidance on any openings.",
    Referral:'Would you be open to reviewing my background and considering a referral if there is a suitable role?',
    FollowUp:'I wanted to follow up on my earlier message. Would you be open to a brief conversation?',
    Collaboration:'Would you be open to discussing a possible collaboration?'
  };
  function localMessage(raw, type, tone, settings = {}, goal = '') {
    const p = normalizeProfile(raw);
    const greeting = tone === 'Formal' ? 'Dear' : tone === 'Casual' ? 'Hey' : 'Hi';
    let opening = 'I came across your profile and wanted to connect.';
    if (p.currentTitle) opening = `Your experience as ${p.currentTitle}${p.currentCompany ? ` at ${p.currentCompany}` : ''} caught my attention.`;
    else if (p.currentCompany) opening = `I noticed your work at ${p.currentCompany} and wanted to connect.`;
    else if (p.headline) opening = `Your profile mentions “${p.headline}”, which caught my attention.`;
    const bio = clean(settings.userBio), highlight = clean(settings.senderHighlights);
    const intro = [bio ? `A little about me: ${bio}` : '',highlight ? `Relevant background: ${highlight}` : ''].filter(Boolean).join('\n');
    return [`${greeting} ${p.firstName},`,opening,intro,clean(goal) || asks[type] || asks.Networking,
      `${tone === 'Formal' ? 'Kind regards,' : tone === 'Casual' ? 'Cheers,' : 'Best,'}${clean(settings.userName) ? `\n${clean(settings.userName)}` : ''}`].filter(Boolean).join('\n\n');
  }
  return {clean,cleanName,profileUrl,normalizeProfile,headlineEmployment,headlineRole,localMessage,asks};
})();
