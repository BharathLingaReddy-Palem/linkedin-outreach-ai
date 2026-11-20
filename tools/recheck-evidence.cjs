// Recompute explanatory source matches for existing fictional API results.
// Does not call an API or read credentials.
const fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({URL});
for(const file of ['outreach.js','writer.js'])vm.runInContext(fs.readFileSync('linkedin extention/utils/'+file,'utf8'),ctx);
const report=JSON.parse(fs.readFileSync('qa/nvidia-live-smoke.json','utf8'));
const context=ctx.Writer.context({name:'Avery Demo',currentTitle:'AI Engineer',currentCompany:'Example Labs',headline:'Builds retrieval products'},
  {userName:'Jordan Example',userBio:'Computing student seeking AI product engineering internships.',senderHighlights:'Built a RAG assistant with Python and FastAPI.'},'Internship','Neutral','Are there AI engineering internships on your team?');
for(const result of report.results)result.evidence=ctx.Writer.explain(result.message,context);
report.evidenceNote='Source matches recomputed with word boundaries; AI Engineer does not match AI engineering.';
fs.writeFileSync('qa/nvidia-live-smoke.json',JSON.stringify(report,null,2));
console.log('Recomputed source matches offline. No API request or credential access.');
