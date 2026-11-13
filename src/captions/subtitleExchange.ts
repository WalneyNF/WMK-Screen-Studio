/** WMK Caption Exchange — SRT/VTT import/export and offline checks (MIT).
 * No network, no AI and no external dependencies. Imported cues do not
 * invent word-level timings: karaoke requires Whisper token timestamps.
 */
import type { CaptionCue } from "./types";

const CLOCK = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/;
function parseClock(input: string): number {
  const m = input.trim().match(CLOCK);
  if (!m) throw new Error("Horário inválido: " + input);
  const h = Number(m[1] ?? 0), mins = Number(m[2]), sec = Number(m[3]);
  const ms = Number(m[4].padEnd(3,"0"));
  if (mins > 59 || sec > 59 || ms > 999) throw new Error("Horário fora da faixa: " + input);
  return ((h * 60 + mins) * 60 + sec) * 1000 + ms;
}
function formatClock(ms: number, vtt: boolean): string {
  const n = Math.max(0, Math.round(ms));
  const h = Math.floor(n / 3600000), m = Math.floor(n / 60000) % 60;
  const s = Math.floor(n / 1000) % 60, fraction = n % 1000;
  return [h,m,s].map(x=>String(x).padStart(2,"0")).join(":")+
    (vtt?".":",")+String(fraction).padStart(3,"0");
}
export function parseSubtitleFile(raw: string, kind: "srt"|"vtt"): CaptionCue[] {
  if (raw.length > 4_000_000) throw new Error("Arquivo de legenda maior que 4 MB.");
  let text = raw.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
  if (kind === "vtt") {
    if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(text)) throw new Error("Cabeçalho WEBVTT ausente.");
    text = text.replace(/^WEBVTT[^\n]*\n/,"");
    text = text.replace(/^NOTE(?:[ \t].*)?\n(?:(?!\n\n)[\s\S])*(?:\n\n|$)/gm,"\n");
  }
  const blocks = text.trim().split(/\n\s*\n/);
  const output: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map(x=>x.trimEnd()).filter(x=>x.length>0);
    if (!lines.length || /^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0]!)) continue;
    const idx = lines.findIndex(x=>x.includes("-->"));
    if (idx < 0) continue;
    const arrow = lines[idx]!.split(/\s+-->\s+/);
    if (arrow.length !== 2) throw new Error("Intervalo inválido no bloco "+(output.length+1));
    const startMs = parseClock(arrow[0]!);
    const endMs = parseClock(arrow[1]!.trim().split(/\s+/)[0]!);
    const content = lines.slice(idx+1).join("\n").trim();
    if (!content) continue;
    if (startMs >= endMs) throw new Error("Fim anterior ao início na legenda "+(output.length+1));
    if (output.length >= 20000) throw new Error("Máximo de 20 mil legendas.");
    output.push({id:"wmk-import-"+output.length,startMs,endMs,text:content});
  }
  if (!output.length) throw new Error("Nenhuma legenda válida encontrada.");
  return output.sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
}
export function serializeSubtitleFile(cues: CaptionCue[], kind: "srt"|"vtt"): string {
  const ordered = [...cues].sort((a,b)=>a.startMs-b.startMs);
  return (kind==="vtt"?"WEBVTT\n\n":"")+ordered.map((c,i)=>{
    const range = formatClock(c.startMs,kind==="vtt")+" --> "+formatClock(c.endMs,kind==="vtt");
    const text = c.text.replace(/-->/g,"→").replace(/\r\n?/g,"\n");
    return (kind==="srt"?(i+1)+"\n":"")+range+"\n"+text;
  }).join("\n\n")+"\n";
}
export type CaptionIssue = { index:number; kind:"error"|"warning"; message:string };
export function inspectCaptions(cues: CaptionCue[], maxCharsPerLine=42, maxCps=20): CaptionIssue[] {
  const sorted = [...cues].sort((a,b)=>a.startMs-b.startMs);
  const issues: CaptionIssue[] = [];
  for (let i=0;i<sorted.length;i++){
    const c=sorted[i]!, duration=(c.endMs-c.startMs)/1000;
    const index=i+1;
    if (!Number.isFinite(duration)||duration<=0) issues.push({index,kind:"error",message:"Intervalo de tempo inválido."});
    if (i>0 && c.startMs<sorted[i-1]!.endMs)
      issues.push({index,kind:"warning",message:"Sobreposição com a legenda anterior."});
    if (duration>0 && c.text.replace(/\s/g,"").length/duration>maxCps)
      issues.push({index,kind:"warning",message:"Texto rápido para leitura (mais de "+maxCps+" caracteres/s)."});
    if (c.text.split("\n").some(line=>line.length>maxCharsPerLine))
      issues.push({index,kind:"warning",message:"Linha longa (mais de "+maxCharsPerLine+" caracteres)."});
    if (duration>7) issues.push({index,kind:"warning",message:"Legenda exibida por mais de 7 segundos."});
  }
  return issues;
}
