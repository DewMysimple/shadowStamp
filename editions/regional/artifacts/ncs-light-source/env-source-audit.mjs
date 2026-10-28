import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out='artifacts/ncs-light-source';
const index=JSON.parse(await readFile(`${out}/script-index.json`,'utf8'));
const names={17:'1tsv4_hr1pvu5.js',18:'2dfwuczh65qab.js',19:'1jwzz__q8k_t6.js',20:'4579-lwkikfr3.js'};
const code={};const sources=[];
for(const [id,name] of Object.entries(names)){
 const metadata=index.scripts.find(script=>script.url.endsWith(name));
 try { code[id]=await readFile(`.sites-runtime/ncs-source/bundle-${id}.js`,'utf8'); }
 catch { const response=await fetch(metadata.url);assert.equal(response.status,200);code[id]=await response.text(); }
 const sha256=createHash('sha256').update(code[id]).digest('hex');assert.equal(sha256,metadata.sha256,'The public source must match the captured immutable chunk');
 sources.push({url:metadata.url,sha256,chars:code[id].length,offsetUnit:'zero-based JavaScript UTF-16 character offset in the shipped minified chunk',storedFullBundle:false});
}
const locate=(id,term)=>({source:names[id],offset:code[id].indexOf(term),term});
const runtime=JSON.parse(await readFile(`${out}/env-runtime.json`,'utf8'));
const live=runtime.captures.find(capture=>capture.name==='upperRight');
const [programId,program]=Object.entries(live.programs).find(([,program])=>program.uniforms.normalScale&&program.uniforms.metalness===0);
const uniforms=program.uniforms;
const linear=hex=>[1,3,5].map(offset=>{const channel=Number.parseInt(hex.slice(offset,offset+2),16)/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;});
for(const [name,hex,intensity] of [['pointLights[0].color','#FFE0B0',.65],['directionalLights[0].color','#fff4e6',1.6],['hemisphereLights[0].groundColor','#9a8f7d',.32]])assert.ok(uniforms[name].every((value,index)=>Math.abs(value-linear(hex)[index]*intensity)<1e-7),name);
assert.equal(uniforms['pointLights[0].distance'],0);assert.equal(uniforms['pointLights[0].decay'],2);assert.equal(uniforms.toneMappingExposure,.57);assert.equal(uniforms.envMapIntensity,1);assert.deepEqual(uniforms.envMapRotation,[false,[1,0,0,0,1,0,0,0,1]]);assert.deepEqual(runtime.errors,[]);
const result={
 result:'passed',observedAt:new Date().toISOString(),scope:'Read-only source and real WebGL verification of the shipped NCS environment and lights. This is research evidence, not imported application code.',sources,
 sourceLocations:[locate(17,'c=p.fromScene(new l,.04).texture'),locate(17,'new t.DirectionalLight'),locate(17,'new t.HemisphereLight'),locate(17,'new t.PointLight'),locate(17,'n.colorSpace=a'),locate(17,'s.toneMapping=el['),locate(17,'envMode'),locate(17,'M.intensity='),locate(17,'u.position.set'),locate(20,'RoomEnvironment'),locate(20,'new e.PointLight'),locate(20,'function i(t)'),locate(18,'_outputColorSpace'),locate(18,'float getDistanceAttenuation'),locate(18,'vec3 NeutralToneMapping'),locate(18,'sRGBTransferOETF')],
 defaultNcsEnvironment:{generator:'PMREMGenerator.fromScene(RoomEnvironment, sigma=0.04)',rotation:'No environmentRotation/envMapRotation assignments in the dedicated engine; runtime identity matrix',intensity:1,roomLights:{point:{color:'#ffffff',intensity:900,distance:28,decay:2,position:[.418,16.199,.3]},emissiveBoxIntensities:[50,50,17,43,20,100],emissiveColor:'#ffffff'},ncsEnvMode:'No studio override in NCS buildPreset; room selected (verified independently by material audit)'},
 directLights:{directional:{color:'#fff4e6',intensity:1.6,positionFormula:'normalize(-0.3 + lx, 0.45 - ly, 0.4)'},point:{color:'#FFE0B0',intensity:.65,z:.45,distance:0,decay:2,positionFormula:'(lx, -ly, 0.45)',falloff:'1 / max(distance^2, 0.01); cutoff disabled because distance=0'},hemisphere:{sky:'#ffffff',ground:'#9a8f7d',intensity:.32}},
 optionalStudioEnvironment:{activeForDefaultNcs:false,sigma:.08,panels:[{size:[1.4,4.5],emissiveIntensity:18,position:[-2.2,3.2,5],rotationZDegrees:-15,color:'#ffffff'},{size:[1,3],emissiveIntensity:5,position:[2.8,-1.8,4.5],rotationZDegrees:-15,color:'#ffffff'},{size:[6,3],emissiveIntensity:1.5,position:[0,5.5,2],rotationZDegrees:90,color:'#ffffff'},{size:[6,3],emissiveIntensity:.7,position:[0,-5,2.5],rotationZDegrees:90,color:'#f3eadb'}],sphere:{radius:20,emissiveColor:'#ffffff',emissiveIntensity:.02}},
 colorPipeline:{artwork:'SRGBColorSpace',normalAndHeight:'NoColorSpace',colorConstructor:'THREE.Color converts hex lights to linear working color',physicalLighting:true,toneMapping:'NeutralToneMapping',exposure:.57,output:'SRGBColorSpace; sRGB OETF after tone mapping',defaultNcsDappleCoupling:0,defaultNcsDappleComposite:'A separate RGB dapple multiply at tint 0.26 (material audit owns that source trace)'},
 runtimeEvidence:{file:'env-runtime.json',programId,capture:live.name,uniforms,viewSpacePositionNote:'pointLights position is in camera view space, not behind the stamp. With camera z=0.5/tan(9deg)=3.156875757..., viewZ=-2.706875757... corresponds to world lamp z=0.45.',checks:['Live point RGB matches linear(#FFE0B0) × 0.65','Live directional RGB matches linear(#fff4e6) × 1.6','Live hemi ground RGB matches linear(#9a8f7d) × 0.32','Neutral exposure=0.57, env intensity=1, env rotation identity','No page errors']}
};
assert.ok(result.sourceLocations.every(location=>location.offset>=0));
await writeFile(`${out}/env-source-audit.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({result:result.result,sources:result.sources.map(source=>({url:source.url,sha256:source.sha256})),sourceLocations:result.sourceLocations,runtimeChecks:result.runtimeEvidence.checks},null,2));
