#!/usr/bin/env python3
"""WMK Audience Intelligence API — biblioteca padrão Python, SQLite, MIT."""
import argparse
import csv
import hmac
import html
import json
import os
import re
import secrets
import sqlite3
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "data" / "audience.sqlite3"
MAX_BYTES = 10 * 1024 * 1024
TOPICS = {
    "Instalação": ("instala", "download", "configura", "requisito", "pc fraco"),
    "Exportação": ("export", "publicar", "compilar", "android", "apk"),
    "Animação": ("animac", "animar", "sprite", "animado"),
    "Programação": ("codigo", "programar", "script", "movimento", "personagem"),
    "Áudio e vídeo": ("audio", "microfone", "gravacao", "camera", "webcam"),
    "Lives": ("live", "transmissao", "chat", "proxima live"),
}
QUESTION_START = re.compile(r"^(como|qual|quando|porque|por que|onde|quem|quanto|sera|tem como|pode|alguem|me ajuda)\b")
QUESTION_WORDS = ("ensina", "tutorial", "explica", "ajuda", "faz um video", "queria aprender")

def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()

def classify(message):
    n = norm(message)
    question = "?" in message or bool(QUESTION_START.search(n)) or any(x in n for x in QUESTION_WORDS)
    topic = next((name for name, words in TOPICS.items() if any(w in n for w in words)), "Outros")
    return int(question), topic

def connect(path=DEFAULT_DB):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=15000")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS lives(
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'import',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages(
      id INTEGER PRIMARY KEY, live_id INTEGER NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
      author TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT '',
      question INTEGER NOT NULL CHECK(question IN (0,1)), topic TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_live ON messages(live_id,id);
    CREATE INDEX IF NOT EXISTS idx_questions_live ON messages(live_id,question,topic);
    """)
    return db

def parse_input(path):
    path = Path(path)
    if not path.is_file() or path.stat().st_size > MAX_BYTES:
        raise ValueError("Arquivo inexistente ou maior que 10 MB")
    if path.suffix.lower() == ".json":
        obj = json.loads(path.read_text(encoding="utf-8-sig"))
        entries = obj if isinstance(obj, list) else obj.get("messages", obj.get("mensagens", []))
        if not isinstance(entries, list):
            raise ValueError("JSON deve conter uma lista de mensagens")
        for m in entries:
            if isinstance(m, str):
                yield ("", m, "")
            elif isinstance(m, dict):
                yield (str(m.get("author", m.get("autor", m.get("user", "")))),
                       str(m.get("message", m.get("mensagem", m.get("text", m.get("texto", ""))))),
                       str(m.get("timestamp", m.get("time", m.get("data", "")))))
    elif path.suffix.lower() in (".csv", ".tsv"):
        with path.open("r", encoding="utf-8-sig", newline="") as fp:
            sample = fp.read(4096)
            fp.seek(0)
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t") if sample.strip() else csv.excel
            reader = csv.DictReader(fp, dialect=dialect)
            for row in reader:
                row = {norm(k): v for k, v in row.items() if k is not None}
                yield (str(row.get("author", row.get("autor", row.get("user", ""))) or ""),
                       str(row.get("message", row.get("mensagem", row.get("text", row.get("texto", "")))) or ""),
                       str(row.get("timestamp", row.get("time", row.get("data", ""))) or ""))
    else:
        raise ValueError("Formato aceito: .csv, .tsv ou .json")

def import_live(db, title, path):
    if not title.strip():
        raise ValueError("Título obrigatório")
    values = []
    seen = set()
    for author, body, sent_at in parse_input(path):
        if not body.strip():
            continue
        signature = (norm(author), norm(body))
        if signature in seen:
            continue
        seen.add(signature)
        q, topic = classify(body)
        values.append((author[:300], body[:10000], sent_at[:100], q, topic))
        if len(values) > 30000:
            raise ValueError("Máximo de 30 mil mensagens por importação")
    with db:
        cur = db.execute("INSERT INTO lives(title,source,created_at) VALUES(?,?,?)",
                         (title.strip()[:200], "arquivo", datetime.now(timezone.utc).isoformat()))
        live_id = cur.lastrowid
        db.executemany("INSERT INTO messages(live_id,author,body,sent_at,question,topic) VALUES(?,?,?,?,?,?)",
                       [(live_id, *v) for v in values])
    return live_id, len(values)

def statistics(db, live_id):
    live = db.execute("SELECT * FROM lives WHERE id=?", (live_id,)).fetchone()
    if live is None:
        return None
    a = db.execute("""SELECT COUNT(*) total, COUNT(DISTINCT NULLIF(author,'')) authors,
                    COALESCE(SUM(question),0) questions FROM messages WHERE live_id=?""", (live_id,)).fetchone()
    topics = db.execute("""SELECT topic,COUNT(*) count FROM messages
               WHERE live_id=? AND question=1 GROUP BY topic ORDER BY count DESC,topic""", (live_id,)).fetchall()
    summary = {"live": dict(live), "messages": a["total"], "authors": a["authors"],
               "questions": a["questions"], "topics": [dict(x) for x in topics],
               "method": "Regras por palavras-chave; resultados aproximados, sem IA"}
    return summary

def suggestions(summary):
    return [{"topic": t["topic"], "question_count": t["count"],
             "title": ("Perguntas frequentes da comunidade" if t["topic"] == "Outros"
                       else "Tutorial para iniciantes: " + t["topic"]),
             "note": "Sugestão heurística para revisão humana"}
            for t in summary["topics"]]

def report_html(summary):
    title = html.escape(summary["live"]["title"])
    bars = "".join('<div class="line"><strong>' + html.escape(t["topic"]) + '</strong>'
                   + '<div class="bar"><div style="width:' +
                   str(round(t["count"] * 100 / max(1, summary["questions"]))) +
                   '%"></div></div><span>' + str(t["count"]) + '</span></div>'
                   for t in summary["topics"])
    ideas = "".join("<li>" + html.escape(x["title"]) + " — " + str(x["question_count"]) +
                    " pergunta(s)</li>" for x in suggestions(summary))
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WMK Audience — {title}</title><style>
body{{font:16px/1.6 system-ui;background:#0a0d1a;color:#f5f4ff;margin:0}}
main{{max-width:980px;margin:auto;padding:28px}}
section{{background:#191a32;border:1px solid #3b3d5b;border-radius:16px;padding:23px;margin:18px 0}}
h1{{color:#bb8dff}}h2{{color:#6dd7fa}}.cards{{display:flex;flex-wrap:wrap;gap:14px}}
.card{{padding:12px 24px;border:1px solid #555578;border-radius:10px}}
.card b{{font-size:28px;display:block}}.line{{display:flex;gap:12px;align-items:center;margin:12px 0}}
.line strong{{min-width:150px}}.bar{{flex:1;background:#30324d;height:15px;border-radius:9px;overflow:hidden}}
.bar div{{height:100%;background:linear-gradient(90deg,#a759ff,#26d3f2)}}
small{{color:#aab1c8}}@media print{{body{{background:white;color:black}}
section{{background:white;border-color:#aaa}}h1,h2{{color:#353063}}}}
</style></head><body><main><h1>WMK Audience Intelligence</h1><h2>{title}</h2>
<p>Relatório gerado localmente. Não representa a audiência total do YouTube,
apenas as mensagens importadas.</p><section class="cards">
<div class="card"><b>{summary["messages"]}</b>Mensagens</div>
<div class="card"><b>{summary["questions"]}</b>Possíveis perguntas</div>
<div class="card"><b>{summary["authors"]}</b>Autores identificados</div></section>
<section><h2>Assuntos das perguntas</h2>{bars or "<p>Nenhuma pergunta identificada.</p>"}</section>
<section><h2>Ideias de vídeos</h2><ol>{ideas}</ol></section>
<small>Análise heurística, com classificação aproximada. Nenhuma API de IA ou cobrança.
Gerado por WMK Screen Studio · Walney Moreira Klein · walneyk@hotmail.com.
Código principal MIT; Capptivo © 2026 idboussadel.</small></main></body></html>"""

class Handler(BaseHTTPRequestHandler):
    server_version = "WMKAudience/0.1"
    def send(self, status, payload, content_type="application/json; charset=utf-8"):
        raw = (json.dumps(payload, ensure_ascii=False).encode("utf-8") if not isinstance(payload, str)
               else payload.encode("utf-8"))
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(raw)
    def do_GET(self):
        route = urlsplit(self.path)
        if route.path == "/health":
            return self.send(200, {"status":"ok","service":"wmk-audience-api","version":"0.1"})
        key = self.headers.get("X-API-Key", "")
        if not key or not hmac.compare_digest(key, self.server.api_key):
            return self.send(401, {"error":"Chave de API ausente ou inválida"})
        parts = route.path.strip("/").split("/")
        if parts[:2] == ["v1", "lives"] and len(parts) == 2:
            rows = self.server.db.execute("SELECT id,title,created_at,source FROM lives ORDER BY id DESC").fetchall()
            return self.send(200, {"items":[dict(x) for x in rows],"count":len(rows)})
        if parts[:2] == ["v1", "lives"] and len(parts) >= 3:
            if not parts[2].isdigit():
                return self.send(400, {"error":"ID inválido"})
            live_id = int(parts[2])
            summary = statistics(self.server.db, live_id)
            if summary is None:
                return self.send(404, {"error":"Live não encontrada"})
            suffix = "/".join(parts[3:])
            if suffix in ("", "summary"):
                return self.send(200, summary)
            if suffix == "topics":
                return self.send(200, {"items":summary["topics"]})
            if suffix == "suggestions":
                return self.send(200, {"items":suggestions(summary),"method":summary["method"]})
            if suffix in ("messages", "questions"):
                args = parse_qs(route.query)
                try:
                    limit = max(1, min(200, int(args.get("limit",["50"])[0])))
                    offset = max(0, int(args.get("offset",["0"])[0]))
                except ValueError:
                    return self.send(400, {"error":"Paginação inválida"})
                only = " AND question=1" if suffix == "questions" else ""
                rows = self.server.db.execute(
                    "SELECT id,author,body,sent_at,question,topic FROM messages WHERE live_id=?"
                    + only + " ORDER BY id LIMIT ? OFFSET ?", (live_id,limit,offset)).fetchall()
                total = self.server.db.execute("SELECT COUNT(*) FROM messages WHERE live_id=?"
                                               + only, (live_id,)).fetchone()[0]
                return self.send(200, {"items":[dict(x) for x in rows],
                                       "total":total,"limit":limit,"offset":offset})
            if suffix == "report.html":
                return self.send(200, report_html(summary), "text/html; charset=utf-8")
        return self.send(404, {"error":"Rota inexistente"})
    def do_POST(self):
        return self.send(405, {"error":"API de leitura: importações são feitas pelo terminal"})
    def do_OPTIONS(self):
        return self.send(405, {"error":"CORS desativado por padrão"})
    def log_message(self, fmt, *args):
        # Não registrar o caminho completo nem cabeçalhos; dados podem ser sensíveis.
        print("[WMK API]", self.address_string(), args[1] if len(args)>1 else "", file=sys.stderr)

def main(argv=None):
    parser = argparse.ArgumentParser(description="WMK Audience Intelligence API local")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    sub = parser.add_subparsers(dest="command", required=True)
    importer = sub.add_parser("import", help="Importa mensagens CSV/JSON")
    importer.add_argument("--title", required=True)
    importer.add_argument("--file", type=Path, required=True)
    serve = sub.add_parser("serve", help="Executa API de leitura")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8767)
    serve.add_argument("--key-file", type=Path, default=None)
    args = parser.parse_args(argv)
    if args.command == "import":
        with connect(args.db) as db:
            idx,count = import_live(db,args.title,args.file)
        print(json.dumps({"live_id":idx,"imported":count},ensure_ascii=False))
    elif args.command == "serve":
        key = os.environ.get("WMK_AUDIENCE_API_KEY","")
        if args.key_file is not None:
            key = args.key_file.read_text(encoding="utf-8").strip()
        if len(key) < 24:
            parser.error("Defina WMK_AUDIENCE_API_KEY (mínimo 24 caracteres) ou --key-file. Nunca coloque credenciais no código.")
        if args.host not in ("127.0.0.1","localhost","::1"):
            parser.error("Por segurança, esta versão aceita somente loopback; use uma VPN/proxy HTTPS autenticado em outra etapa.")
        db = connect(args.db)
        server = HTTPServer((args.host,args.port),Handler)
        server.db = db
        server.api_key = key
        print(f"WMK Audience API em http://{args.host}:{args.port}; dados em {args.db}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
            db.close()
if __name__ == "__main__":
    main()
