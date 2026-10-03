import { Env } from "./types";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";
const SYSTEM_PROMPT = `You are Tess, Brady Johnson's personal AI assistant. You are female, calm, capable, concise, and naturally conversational, inspired by a polished JARVIS-style assistant without pretending to be Marvel's JARVIS. Address Brady by name when natural. Help with his projects, truck, work, plans, technology, and everyday questions. Be honest when you do not know something. When current information is supplied from web search, use it and make clear when information is from the web. Never invent memories or facts.`;

export default {
 async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/" || !url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (url.pathname === "/api/chat" && request.method === "POST") return handleChat(request, env);
  if (url.pathname === "/api/tts" && request.method === "POST") return handleTTS(request, env);
  return new Response("Not found", {status:404});
 }
} satisfies ExportedHandler<Env>;

async function handleTTS(request: Request, env: Env): Promise<Response> {
 try {
  const body = await request.json() as {text?:string};
  const text=(body.text||"").trim().slice(0,3000);
  if(!text) return new Response("No text",{status:400});
  const audio=await fetch("https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=mp3_44100_128",{
   method:"POST",
   headers:{"xi-api-key":env.ELEVENLABS_API_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({text,model_id:"eleven_turbo_v2_5",voice_settings:{stability:0.48,similarity_boost:0.82,style:0.22,use_speaker_boost:true}})
  });
  return audio as Response;
 } catch(error){ console.error(error); return new Response("TTS failed",{status:500}); }
}

async function handleChat(request: Request, env: Env): Promise<Response> {
 try {
  const body = await request.json() as {message?:string;history?:Array<{role:string;content:string}>;memory?:string[]};
  const message=(body.message||"").trim();
  if(!message) return json({reply:"I'm listening."});
  let memory=Array.isArray(body.memory)?body.memory.filter(x=>typeof x==="string").slice(-30):[];
  const remember=message.match(/^remember(?: that)?[:\s]+(.+)/i);
  if(remember){const item=remember[1].trim();if(item&&!memory.includes(item))memory.push(item);return json({reply:"I'll remember that, Brady.",memory});}
  const needsWeb=/\b(latest|today|tomorrow|current|right now|news|weather|price|how much|when is|score|stock)\b/i.test(message);
  let web="";
  if(needsWeb) web=await searchWeb(message);
  const history=Array.isArray(body.history)?body.history.filter(m=>m&&typeof m.content==="string").slice(-12):[];
  const messages:any[]=[{role:"system",content:SYSTEM_PROMPT+"\n\nSaved memory:\n"+(memory.length?memory.map(x=>"- "+x).join("\n"):"None")+(web?"\n\nCurrent web search results:\n"+web:"")}];
  for(const m of history) if(m.role==="user"||m.role==="assistant") messages.push({role:m.role,content:m.content});
  messages.push({role:"user",content:message});
  const result=await env.AI.run(MODEL_ID,{messages,max_tokens:512});
  const reply=typeof result==="object"&&result!==null&&"response" in result?String((result as any).response||""):String(result||"");
  return json({reply:reply.trim()||"I'm here, Brady.",memory});
 }catch(error){console.error(error);return json({reply:"I couldn't process that right now."},500)}
}

async function searchWeb(query:string):Promise<string>{
 try{
  const r=await fetch("https://html.duckduckgo.com/html/?q="+encodeURIComponent(query),{headers:{"User-Agent":"Mozilla/5.0"}});
  const html=await r.text();
  const blocks=[...html.matchAll(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].slice(0,5);
  return blocks.map(m=>clean(m[1])+": "+clean(m[2])).join("\n");
 }catch{return ""}
}
function clean(s:string){return s.replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/\s+/g," ").trim()}
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8"}})}
