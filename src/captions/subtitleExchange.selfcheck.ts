import { strict as assert } from "node:assert";
import { parseSubtitleFile, serializeSubtitleFile, inspectCaptions } from "./subtitleExchange.ts";

const srt = "1\n00:00:01,000 --> 00:00:03,200\nOlá, mundo!\n\n2\n00:00:03,500 --> 00:00:05,000\nSegunda linha\n";
const cues = parseSubtitleFile(srt, "srt");
assert.equal(cues.length, 2);
assert.equal(cues[0]?.startMs, 1000);
assert.equal(cues[0]?.endMs, 3200);
assert.equal(cues[1]?.text, "Segunda linha");
const vtt = serializeSubtitleFile(cues, "vtt");
assert.ok(vtt.startsWith("WEBVTT"));
assert.equal(parseSubtitleFile(vtt, "vtt").length, 2);
assert.equal(parseSubtitleFile(serializeSubtitleFile(cues,"srt"),"srt")[0]?.text,"Olá, mundo!");
assert.throws(()=>parseSubtitleFile("1\n00:00:05,000 --> 00:00:01,000\nErro", "srt"), /anterior ao início/);
assert.throws(()=>parseSubtitleFile("WEBVTT\n\n00:61:00.000 --> 00:62:00.000\nErro","vtt"), /fora da faixa/);
const warnings = inspectCaptions([
{ id:"a", startMs:0, endMs:500, text:"Uma frase muito grande para meio segundo" },
{ id:"b", startMs:300, endMs:800, text:"Outra frase" }
]);
assert.ok(warnings.some(x=>x.message.includes("Sobreposição")));
assert.ok(warnings.some(x=>x.message.includes("rápido")));
console.log("subtitleExchange.selfcheck: ok");
