import { useMemo, useState } from "react";

type SavedVideo = { id: string; title: string; videoId: string; url: string };
const STORAGE_KEY = "wmk.live-video-helper.library.v1";

/** Accepts canonical YouTube watch/short URLs. No external URLs are embedded. */
export function youtubeVideoId(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    const id =
      (host === "youtu.be" || host === "www.youtu.be")
        ? u.pathname.slice(1).split("/")[0]
        : (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com")
          ? u.pathname === "/watch" ? u.searchParams.get("v") :
            u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/live/") || u.pathname.startsWith("/embed/")
              ? u.pathname.split("/")[2] : null
          : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
function loadVideos(): SavedVideo[] {
  try {
    const obj: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(obj)) return [];
    return obj.filter((v): v is SavedVideo =>
      !!v && typeof v === "object" && typeof v.title === "string" &&
      typeof v.url === "string" && youtubeVideoId(v.url) === v.videoId).slice(0,100);
  } catch { return []; }
}

export function LiveVideoHelper() {
  const [videos, setVideos] = useState<SavedVideo[]>(loadVideos);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<SavedVideo | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const validId = youtubeVideoId(url);
  const filtered = useMemo(() => videos.filter(v =>
    (v.title + " " + v.url).toLowerCase().includes(filter.toLowerCase())), [videos,filter]);

  function save(next: SavedVideo[]) {
    setVideos(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { setFeedback("Falha ao salvar a lista localmente."); }
  }
  function add() {
    if (!validId || !title.trim()) { setFeedback("Informe um título e um link HTTPS válido do YouTube."); return; }
    if (videos.length >= 100 && !videos.some(x => x.videoId === validId)) {setFeedback("Limite de 100 vídeos na biblioteca.");return;}
    const v = { id: validId, videoId: validId, title: title.trim().slice(0,160),
      url: "https://www.youtube.com/watch?v=" + validId };
    save([v, ...videos.filter(x => x.videoId !== validId)]);
    setSelected(v); setUrl("");setTitle("");setMessage("Você perguntou sobre esse assunto? Tenho um vídeo que explica: " + v.url);
    setFeedback("Vídeo salvo. A prévia é privada e não entra automaticamente na transmissão.");
  }
  async function copyMessage() {
    try { await navigator.clipboard.writeText(message);setFeedback("Mensagem copiada. Cole no chat manualmente."); }
    catch { setFeedback("Não consegui copiar automaticamente; selecione o texto e copie."); }
  }
  const embed = selected ? "https://www.youtube-nocookie.com/embed/" + selected.videoId : null;

  return <div className="space-y-4 rounded border border-border p-4">
    <h2 className="text-lg font-semibold">WMK Live Video Helper — Meus vídeos para responder perguntas</h2>
    <p className="text-sm text-muted-foreground">Cadastre vídeos do próprio canal, pesquise por assunto e prepare o link para responder ao espectador. A prévia não é enviada automaticamente para a live.</p>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <label className="block text-xs font-semibold" htmlFor="wmk-video-title">Nome ou assunto do vídeo</label>
        <input id="wmk-video-title" className="w-full rounded border border-border bg-muted p-2 text-sm" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Como programar em Godot" />
      </div>
      <div className="space-y-2">
        <label className="block text-xs font-semibold" htmlFor="wmk-video-url">Link público do YouTube</label>
        <input id="wmk-video-url" className="w-full rounded border border-border bg-muted p-2 text-sm" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
      </div>
    </div>
    <button type="button" className="rounded bg-primary px-3 py-2 text-xs text-primary-foreground" onClick={add} disabled={!validId || !title.trim()}>Adicionar à biblioteca</button>
    <label className="block text-xs font-semibold" htmlFor="wmk-video-filter">Procurar um vídeo por assunto</label>
    <input id="wmk-video-filter" className="w-full rounded border border-border bg-muted p-2 text-sm" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Digite: instalação, jogo, programação..." />
    <div className="max-h-52 space-y-2 overflow-y-auto">
      {filtered.map(v => <div key={v.id} className="flex items-center justify-between gap-2 rounded border border-border p-2">
        <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => {
          setSelected(v);setShowPreview(false);
          setMessage("Você perguntou sobre esse assunto? Gravei este vídeo para ajudar: " + v.url);
        }}>{v.title}</button>
        <button type="button" className="rounded border border-border px-2 py-1 text-xs" onClick={() => {
          save(videos.filter(x => x.id !== v.id));if(selected?.id === v.id){setSelected(null);setShowPreview(false);}
        }}>Excluir</button>
      </div>)}
      {!filtered.length && <p className="text-xs text-muted-foreground">Nenhum vídeo cadastrado com esse assunto.</p>}
    </div>
    {selected && <div className="space-y-3 rounded border border-border p-3">
      <div className="font-semibold">{selected.title}</div>
      <div className="flex flex-wrap gap-2">
        <button className="rounded border border-border p-2 text-xs" type="button" onClick={() => setShowPreview(p => !p)}>{showPreview ? "Fechar prévia" : "Abrir prévia privada"}</button>
        <a href={selected.url} target="_blank" rel="noopener noreferrer" className="rounded border border-border p-2 text-xs">Abrir no YouTube</a>
      </div>
      {showPreview && embed && <div className="aspect-video w-full overflow-hidden rounded bg-black">
        <iframe title={"Prévia do vídeo " + selected.title} src={embed} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>
      </div>}
      <label className="block text-xs font-semibold" htmlFor="wmk-video-chat-message">Mensagem pronta para responder no chat</label>
      <textarea id="wmk-video-chat-message" className="h-24 w-full rounded border border-border bg-muted p-2 text-xs" value={message} onChange={e=>setMessage(e.target.value.slice(0,2000))}/>
      <button type="button" className="rounded bg-primary px-3 py-2 text-xs text-primary-foreground" onClick={() => void copyMessage()}>Copiar resposta com link</button>
    </div>}
    <p role="status" className="text-xs text-muted-foreground">{feedback}</p>
    <div className="rounded border-l-4 border-primary bg-muted/40 p-3 text-xs text-muted-foreground">
      <strong>Limitações:</strong> esta versão é uma biblioteca local e uma prévia opcional. O vídeo pequeno NÃO é inserido na composição exportada/transmitida; isso exige o futuro WMK Video Composer/Scene Studio. Alguns vídeos proíbem incorporação. Enviar diretamente no chat do YouTube exigirá autorização OAuth e suporte à API de chat.
    </div>
  </div>;
}
