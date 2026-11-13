#!/usr/bin/env python3
"""WMK Video Doctor v0.1 — inspeção local de arquivos de vídeo. MIT.

Exige ffmpeg + ffprobe instalados/acessíveis ou passados por parâmetro.
Não grava ou modifica o vídeo original.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

def probe(video, ffprobe):
    command = [ffprobe, "-v", "error", "-show_entries",
        "format=duration,size,format_name:stream=index,codec_type,codec_name,width,height,avg_frame_rate",
        "-of", "json", str(video)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=40, check=True)
    return json.loads(result.stdout)

def black_intervals(video, ffmpeg, min_seconds=2):
    command = [ffmpeg, "-hide_banner", "-nostdin", "-i", str(video),
        "-vf", f"blackdetect=d={min_seconds}:pix_th=0.10",
        "-an", "-f", "null", "-"]
    result = subprocess.run(command, capture_output=True, text=True, timeout=900)
    if result.returncode != 0:
        raise RuntimeError("FFmpeg falhou no exame de quadros. Confira codec e arquivo.")
    found = []
    for line in result.stderr.splitlines():
        match = re.search(r"black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)", line)
        if match:
            found.append({"start_s": float(match[1]), "end_s": float(match[2]), "duration_s": float(match[3])})
    return found

def analyze(video, ffmpeg="ffmpeg", ffprobe="ffprobe", scan_black=True):
    video = Path(video).expanduser().resolve(strict=True)
    if not video.is_file():
        raise ValueError("É necessário informar um arquivo de vídeo.")
    info = probe(video, ffprobe)
    streams = info.get("streams", [])
    videos = [s for s in streams if s.get("codec_type") == "video"]
    audios = [s for s in streams if s.get("codec_type") == "audio"]
    duration = float(info.get("format", {}).get("duration", 0) or 0)
    issues = []
    if not videos:
        issues.append({"severity":"error","code":"NO_VIDEO","message":"Arquivo sem faixa de vídeo."})
    if duration <= 0:
        issues.append({"severity":"warning","code":"NO_DURATION","message":"Não foi possível confirmar duração maior que zero."})
    if not audios:
        issues.append({"severity":"warning","code":"NO_AUDIO","message":"Nenhuma faixa de áudio detectada. Pode ser intencional."})
    black = black_intervals(video, ffmpeg) if videos and scan_black else []
    if black:
        issues.append({"severity":"warning","code":"BLACK_INTERVALS","message":f"{len(black)} trecho(s) quase preto(s) detectado(s). Revise: podem ser cenas intencionais."})
    return {"schema_version":1,"file":str(video),"duration_s":duration,
        "bytes":video.stat().st_size,
        "video_streams":[{"codec":s.get("codec_name"),"width":s.get("width"),"height":s.get("height"),"fps":s.get("avg_frame_rate")} for s in videos],
        "audio_streams":[{"codec":s.get("codec_name")} for s in audios],
        "black_intervals":black,"issues":issues,
        "notes":["Detecção de preto não garante que a captura esteja correta.",
                 "Sem faixa de áudio não significa ausência de áudio esperada ou defeito em todo caso.",
                 "Esta versão não verifica silêncio, congelamento, sincronismo A/V ou todos os tipos de corrupção."]}
def main():
    p = argparse.ArgumentParser(description="Diagnóstico local de exportações WMK")
    p.add_argument("arquivo", help="MP4, WebM ou outro formato compatível com FFmpeg")
    p.add_argument("--ffmpeg",default="ffmpeg")
    p.add_argument("--ffprobe",default="ffprobe")
    p.add_argument("--sem-teste-preto",action="store_true")
    p.add_argument("--saida",type=Path,help="Arquivo JSON do relatório (opcional)")
    a=p.parse_args()
    try:
        result=analyze(a.arquivo, a.ffmpeg,a.ffprobe,not a.sem_teste_preto)
    except (OSError,ValueError,RuntimeError,subprocess.CalledProcessError,subprocess.TimeoutExpired,json.JSONDecodeError) as e:
        p.exit(2,"WMK Video Doctor: "+str(e)+"\n")
    raw=json.dumps(result,ensure_ascii=False,indent=2)
    if a.saida:
        a.saida.parent.mkdir(parents=True,exist_ok=True)
        a.saida.write_text(raw+"\n",encoding="utf-8")
        print("Relatório: "+str(a.saida))
    else:
        print(raw)
if __name__=="__main__":
    main()
