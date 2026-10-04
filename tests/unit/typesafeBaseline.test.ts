import { test, expect } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { createFillPlan } from '@/background/mappingEngine';
import type { Profile, FieldDescriptor } from '@/shared/types';
const profile: Profile = {
 version:1, identity:{givenName:'Ada',familyName:'Example',dateOfBirth:'1992-01-02',nationality:'US'},
 contact:{emails:[{label:'primary',value:'synthetic@example.invalid',primary:true}],phones:[{label:'mobile',countryCode:'+1',number:'2025550100',primary:true}]},
 addresses:[{label:'home',street:'Example Road',streetNumber:'12',city:'Example City',region:'CA',postalCode:'90000',country:'US',primary:true}],
 documents:{taxId:'SYNTHETIC'},work:{company:'Example Ltd',jobTitle:'Researcher'},custom:[]
};
test('export the actual local mapper baseline without a cloud model',async()=>{
 const fixtures=JSON.parse(readFileSync('scripts/typesafe/fixtures.json','utf8'));
 const rows=[];
 for(const f of fixtures){
  const field:FieldDescriptor={id:f.id,frameId:0,tag:'input',nearbyText:'',sectionHeading:null,bbox:{x:0,y:0,w:100,h:20},...f.field};
  const start=performance.now();
  const plan=await createFillPlan({fields:[field],profile,url:'https://example.invalid/synthetic/'+f.id,pageLang:'en',pageTitle:'Synthetic evaluation'});
  const entry=plan.entries[0]!;
  rows.push({id:f.id,choice:entry.status!=='ready'||!entry.profileKey?'SKIP':entry.profileKey,status:entry.status,latencyMs:performance.now()-start});
  expect(plan.visionUsed).toBe(false);
 }
 writeFileSync('scripts/typesafe/baseline.json',JSON.stringify({rows,method:'Existing createFillPlan, synthetic profile, browser Prompt API unavailable in test environment. Measures local fallback, not on-device Gemini.'},null,2));
});
