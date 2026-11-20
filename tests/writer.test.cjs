const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const ctx=vm.createContext({URL});
vm.runInContext(fs.readFileSync('linkedin extention/utils/outreach.js','utf8'),ctx,{filename:require('node:path').resolve('linkedin extention/utils/outreach.js')});
vm.runInContext(fs.readFileSync('linkedin extention/utils/writer.js','utf8'),ctx,{filename:require('node:path').resolve('linkedin extention/utils/writer.js')});
const W=ctx.Writer;
const context={recipient:{name:'Avery Demo',currentTitle:'AI Engineer',currentCompany:'Example Labs',headline:'AI Engineer at Example Labs'},sender:{name:'Jordan Example',bio:'CS student',highlights:'Built a RAG assistant with Python and FastAPI.'},purpose:'Internship',tone:'Neutral',ask:'Are there AI engineering internships on your team?'};

test('reviewed highlight choices preserve whole source facts and qualifiers, without duplicates',()=>{
  const choices=W.highlightChoices('Built a RAG prototype.\nContributed to a React dashboard.\nBuilt a RAG prototype.');
  assert.equal(choices.length,2);assert.equal(choices[0],'Built a RAG prototype.');assert.equal(choices[1],'Contributed to a React dashboard.');
});
test('explicit project selection and bio-only mode do not mutate saved context',()=>{
  const settings={userName:'Jordan',userBio:'CS student',senderHighlights:'Built a RAG prototype. Created a React dashboard.'};
  assert.equal(W.selectHighlights(settings,'selected','Created a React dashboard.').senderHighlights,'Created a React dashboard.');
  assert.equal(W.selectHighlights(settings,'bio').senderHighlights,'');assert.match(settings.senderHighlights,/RAG/);
  assert.throws(()=>W.selectHighlights(settings,'selected','Unreviewed claim'),/selected.*(?:changed|available|reviewed)/i);
});
test('connection-note budget is respected without clipping the ask',()=>{
  const out=W.localDraft(context,{format:'connection',budget:200});
  assert.ok(out.message.length<=200);assert.ok(out.message.includes(context.ask));
});

test('local regeneration gives a distinct fitting alternative with the complete ask',()=>{
  for(const opts of [{format:'connection',budget:200},{format:'direct',budget:700}]) {
    const first=W.localDraft(context,opts).message;
    const next=W.localDraft(context,opts,first).message;
    assert.notEqual(next,first);assert.ok(next.includes(context.ask));assert.ok(W.count(next)<=opts.budget);
  }
});
test('impossibly small budget fails clearly rather than truncating facts',()=>{
  assert.throws(()=>W.localDraft({...context,ask:'A'.repeat(500)},{format:'connection',budget:100}),/budget|ask/i);
});
test('evidence is matched against actual draft wording and disappears after edits',()=>{
  const result=W.explain('Hi Avery, your AI Engineer role stood out. I built a RAG assistant with Python and FastAPI.',context);
  assert.ok(result.some(item=>item.id==='recipient-role'));assert.ok(result.some(item=>item.id==='sender-highlights'));
  assert.equal(W.explain('Hi there. Can we connect?',context).length,0);
  assert.equal(W.explain('Are there AI engineering internships?',context).some(item=>item.id==='recipient-role'),false);
});
test('local rewriting changes the current edited draft and can be undone by the caller',()=>{
  const source='Hi Avery,\n\nI came across your profile and wanted to connect.\n\nA little about me: CS student.\n\nAre there AI internships?\n\nBest,\nJordan';
  const shorter=W.localRewrite(source,'shorter',700);
  const warmer=W.localRewrite(source,'warmer',700);
  const direct=W.localRewrite(source,'direct',700);
  for(const output of [shorter,warmer,direct]) {assert.notEqual(output,source);assert.match(output,/AI internships/);}
  assert.ok(shorter.length<source.length);assert.ok(direct.indexOf('AI internships')<direct.indexOf('CS student'));
});
test('formats and budgets are validated centrally',()=>{
  assert.throws(()=>W.options({format:'bad',budget:300}),/format/i);
  assert.throws(()=>W.options({format:'connection',budget:20}),/budget/i);
  assert.equal(W.options({format:'direct',budget:700}).budget,700);
});

test('offline tones change structure, retain ask and use one relevant evidence sentence',()=>{
  const messages=['Formal','Neutral','Casual','Warm','Direct'].map(tone=>W.localDraft({...context,tone},{format:'direct',budget:700}).message);
  assert.equal(new Set(messages).size,5);
  for(const text of messages) {assert.ok(text.includes(context.ask));assert.match(text,/RAG assistant/);assert.doesNotMatch(text,/impressed|shared interest|your work as your work/i);}
  assert.match(messages[3],/Hope your week/);
  assert.ok(messages[4].indexOf(context.ask)<messages[4].indexOf('RAG assistant'));
});

test('headline-only role is described as a headline, not a verified job relationship',()=>{
  const c=W.context({name:'Avery',headline:'AI Engineer | Python',currentTitle:'AI Engineer',currentCompany:'Example Labs',fieldSources:{role:'Headline',company:'Profile company link'},employmentLinked:false},{userName:'Jordan'},'Networking','Neutral','Can we connect?');
  const text=W.localDraft(c,{format:'direct',budget:700}).message;
  assert.match(text,/headline/i);assert.doesNotMatch(text,/AI Engineer at Example Labs/);
});

test('local shortening retains an explicitly supplied ask even when it looks like a context sentence',()=>{
  const ask='Your headline mentions RAG; I would appreciate internship advice.';
  const text=W.localRewrite('Hi Avery,\n\nHope your week is going well.\n\n'+ask+'\n\nBest,\nJordan','shorter',700,ask);
  assert.ok(text.includes(ask));assert.doesNotMatch(text,/Hope your week/);
});
