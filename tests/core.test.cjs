const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = vm.createContext({URL});
vm.runInContext(fs.readFileSync('linkedin extention/utils/outreach.js','utf8'),context,{filename:require('node:path').resolve('linkedin extention/utils/outreach.js')});
const O = context.Outreach;
test('notification prefixes never become a greeting', () => {
  assert.equal(O.normalizeProfile({name:'(20) Avery Demo | LinkedIn'}).firstName, 'Avery');
  assert.equal(O.cleanName('(20) LinkedIn'), '');
});
test('sparse profile has a truthful generic introduction', () => {
  const text = O.localMessage({}, 'Networking', 'Neutral', {userName:'Jordan'});
  assert.match(text, /^Hi there,/);
  assert.doesNotMatch(text, /work as your work|impressed|enjoyed your recent post/);
});
test('sender highlights and custom ask are actually included', () => {
  const text = O.localMessage({name:'Avery'}, 'Internship', 'Neutral', {
    userName:'Jordan', userBio:'CS student', senderHighlights:'Built a RAG project'
  }, 'Are there AI engineering internships on your team?');
  assert.match(text, /Built a RAG project/);
  assert.match(text, /Are there AI engineering internships on your team\?/);
});
test('headline separators do not invent employers', () => {
  const p = O.normalizeProfile({name:'Avery',headline:'Developer | Python | Open to work'});
  assert.equal(p.currentCompany, '');
});

test('headline employer excludes trailing hashtag metadata without stripping legal qualifiers',()=>{
  assert.equal(O.headlineEmployment('AI Engineer at Example Labs (#Gen AI #RAG #LLMs #Full Stack)',['Example Labs']).company,'Example Labs');
  assert.equal(O.headlineEmployment('AI Engineer at Example Labs (#RAG)').company,'Example Labs');
  assert.equal(O.headlineEmployment('Engineer at Example Labs (India)').company,'Example Labs (India)');
  assert.equal(O.headlineEmployment('Engineer | Python | RAG').company,'');
});

test('headline roles work without at-company wording and do not invent employment',()=>{
  assert.equal(O.headlineRole('AI Engineer | Python | RAG'),'AI Engineer');
  assert.equal(O.headlineRole('Senior Software Developer'),'Senior Software Developer');
  for(const text of ['Aspiring AI Engineer | Python','Former Engineer at Old Labs','Python | RAG | Open to work','Ex-Engineer at Old Labs']) {
    assert.equal(O.headlineRole(text),'');assert.equal(O.headlineEmployment(text).company,'');
  }
});
test('profile URLs reject deceptive hosts and non-profile pages', () => {
  assert.equal(O.profileUrl('https://www.linkedin.com/in/avery/?x=1'), 'https://www.linkedin.com/in/avery/');
  for (const url of ['https://linkedin.com.evil.test/in/a', 'https://www.linkedin.com/feed/', 'http://www.linkedin.com/in/a']) assert.equal(O.profileUrl(url), '');
});
