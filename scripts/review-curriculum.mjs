import {reviewBand} from './review-band.mjs';

if(!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');

const groups=[[1,4,7],[2,5,8],[3,6,9]];

await Promise.all(groups.map(async (group,i)=>{
  for(const band of group){
    console.log('worker',i+1,'review start',band);
    const n=await reviewBand(band);
    console.log('worker',i+1,'review finish',band,n);
  }
}));

console.log('CURRICULUM_REVIEW_PASS1_COMPLETE');
