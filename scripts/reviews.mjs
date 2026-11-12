import {readFileSync,writeFileSync} from 'node:fs';
import {canonicalSource,validateReview} from '../discovery-logic.mjs';
import {reviewDigest} from './discovery-policy.mjs';
const file=new URL('../data/discovery-registry.json',import.meta.url),registry=JSON.parse(readFileSync(file));
const [command,id,status,...args]=process.argv.slice(2);
const today=()=>new Date().toISOString().slice(0,10);
function save(){registry.updatedAt=today();writeFileSync(file,JSON.stringify(registry,null,2)+'\n');}
function option(name){const at=args.indexOf(name);return at>=0?args[at+1]:null;}
try{
 if(command==='list')console.table(registry.reviews.map(r=>({id:r.id,status:r.review.status,active:r.active,author:r.author,format:r.format,lastCheck:r.link?.checkedAt})));
 else if(command==='add'){
  const record=JSON.parse(readFileSync(id)),source=canonicalSource(record.url);
  if(registry.reviews.some(r=>r.id===record.id||canonicalSource(r.url).key===source.key))throw Error('이미 등록된 ID 또는 원문입니다.');
  if(!record.id||!registry.products.some(p=>p.id===record.productId))throw Error('ID와 등록된 제품 ID가 필요합니다.');
  registry.reviews.push({...record,...source,active:false,review:{status:'candidate',reason:'원문과 광고 표기 검토 대기'}});save();console.log('후보로 등록했습니다. 공개되지 않습니다.');
 }else if(command==='status'){
  const record=registry.reviews.find(r=>r.id===id);if(!record)throw Error('등록되지 않은 후기 ID');
  if(!['approved','held','excluded','inactive'].includes(status))throw Error('approved / held / excluded / inactive 중 선택하세요.');
  const reviewer=option('--reviewer'),reason=option('--reason');if(!reviewer||!reason)throw Error('--reviewer와 --reason이 필요합니다.');
  record.review={status,reviewedAt:today(),reviewedBy:reviewer,reason};record.active=status==='approved';
  if(status==='approved'){validateReview(record,registry.products);record.review.contentSha256=reviewDigest(record);}
  save();console.log(`${id}: ${status}. 공개 반영에는 npm run build와 배포가 필요합니다.`);
 }else if(command==='check-links'){
  const records=registry.reviews.filter(r=>!id||r.id===id).slice(0,10);
  for(const r of records){
   const source=canonicalSource(r.url),url=source.platform==='youtube'?`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(r.url)}`:source.platform==='naver'?r.url.replace('blog.naver.com','m.blog.naver.com'):r.url;
   try{
    const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'ReviewMagnifier source availability check'}});
    const body=await response.text();
    if(!response.ok||body.length<40)throw Error(`HTTP ${response.status}`);
    if(source.platform==='youtube'){const meta=JSON.parse(body);if(meta.type!=='video'||!meta.title||!meta.author_name)throw Error('영상 메타데이터 확인 불가');}
    if(source.platform==='naver'&&!/se-main-container|postViewArea/.test(body))throw Error('블로그 본문 확인 불가');
    if(source.platform==='instagram')throw Error('릴스는 로그인 안내가 아닌 실제 원문을 수동 확인해야 합니다.');
    r.link={status:'available',checkedAt:today(),httpStatus:response.status};console.log(r.id,'available');
   }catch(error){r.link={status:'unavailable',checkedAt:today(),reason:error.message};r.active=false;r.review={...r.review,status:'held',reason:'원문 접근 재확인 필요: '+error.message};console.log(r.id,'held',error.message);}
   await new Promise(resolve=>setTimeout(resolve,700));
  }
  save();
 }else console.log('사용법:\nnode scripts/reviews.mjs list\nnode scripts/reviews.mjs add /절대경로/후보.json\nnode scripts/reviews.mjs status ID approved|held|excluded|inactive --reviewer 이름 --reason 검토사유\nnode scripts/reviews.mjs check-links [ID]');
}catch(error){console.error(error.message);process.exitCode=1;}
