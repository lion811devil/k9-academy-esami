import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../src/js/05-question-bank.js', import.meta.url),'utf8');
const extract=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const functions=[
 'function qbNorm(v){return String(v||\'\').trim().toLowerCase().replace(/\\s+/g,\' \')}',
 extract('async function fetchAllRows(', '\nasync function loadQuestionBank('),
 extract('async function qbSave()', '\nasync function qbDeleteSelected()')
].join('\n');
const fields={
 qbId:'50',qbCode:'DETE-050',qbDiscipline:'detection',qbCategory:'Fondamenti',
 qbDifficulty:'facile',qbValidation:'da_verificare',qbConcept:'',qbSource:'',
 qbQuestion:'Come individuare una traccia odorosa?',qbA:'Risposta A',qbB:'Risposta B',
 qbC:'Risposta C',qbD:'Risposta D',qbCorrect:'0',qbExplanation:'Spiegazione',qbActive:'true'
};
const elements=new Map(Object.entries(fields).map(([k,v])=>[k,{value:v}]));
elements.set('qbSave',{disabled:false});
elements.set('qbEditor',{classList:{add(){}}});
const entries=[{id:1,code:'DETE-001',question_text:'Altro quesito'}];
let writes=0, messages=[];
const makeQuery=()=>{
 const q={
   select(){return this},eq(){return this},order(){return this},
   async range(a,b){return {data:entries.slice(a,b+1),error:null}},
   update(){writes++;return {eq:async()=>({error:null})}},
   async insert(){writes++;return {error:null}}
 };return q;
};
const ctx={
 $:id=>elements.get(id), sb:{from:()=>makeQuery()},requirePermission:()=>true,
 qbPayload:()=>({discipline:fields.qbDiscipline,difficulty:fields.qbDifficulty,
  category:fields.qbCategory,question_text:fields.qbQuestion,
  explanation:fields.qbExplanation,option_a:fields.qbA,option_b:fields.qbB,
  option_c:fields.qbC,option_d:fields.qbD}),
 note:(v)=>messages.push(String(v)),saveNote:()=>{},refreshQuestionBankAfterChange:async()=>{},
 console
};
vm.createContext(ctx);vm.runInContext(functions,ctx);
await vm.runInContext('qbSave()',ctx);
assert.equal(writes,1,'Salvataggio di una domanda facile esistente');
assert.equal(messages.length,0,'Nessun errore per domanda facile');
entries.push({id:99,code:'DETE-099',question_text:'  COME   INDIVIDUARE   UNA TRACCIA ODOROSA?  '});
await vm.runInContext('qbSave()',ctx);
assert.equal(writes,1,'Il duplicato della banca completa deve essere bloccato');
assert.match(messages.at(-1),/DETE-099/);
// Difese su ruoli, dati HTML e migrazioni archiviate.
const edge=readFileSync(new URL('../supabase/functions/manage-exam-access/index.ts',import.meta.url),'utf8');
assert.match(edge,/allowedForStaff\s*=\s*\["student", "teacher", "examiner"\]/);
assert.match(edge,/restoreDatabaseStates/);
const applied=readFileSync(new URL('../docs/sql-applied/20261120_2_2_1_GIA_APPLICATO_NON_RIESEGUIRE.sql',import.meta.url),'utf8');
assert.match(applied,/CREATE OR REPLACE FUNCTION public.k9_bank_version/);
assert.match(applied,/Testo domanda duplicato/);
const users=readFileSync(new URL('../src/js/06-users-events.js',import.meta.url),'utf8');
assert.match(users,/k9EscapeHtml\(c\.password\)/);
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/id="newCandidatePassword" type="password"/);
console.log('Regressioni: editing facile, duplicati globali, ruoli e output HTML: OK');
