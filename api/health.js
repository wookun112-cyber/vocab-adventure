export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({server:true,aiConfigured:!!process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL||'gpt-5.6-luna',storage:'supabase'});
}
