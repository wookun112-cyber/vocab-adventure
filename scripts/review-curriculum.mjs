import {reviewBand} from './review-band.mjs';

if(!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');

for(let band=1;band<=9;band++){
  console.log('review start',band);
  const n=await reviewBand(band);
  console.log('review finish',band,n);
}

console.log('CURRICULUM_REVIEW_PASS1_COMPLETE');
