/**
 * Captions inspector — local Whisper + web-matching style controls.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseSubtitleFile, serializeSubtitleFile, inspectCaptions } from "@/captions/subtitleExchange";
import { listen } from "@tauri-apps/api/event";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldLabelWithHint } from "@/components/ui/field-label-with-hint";
import { commands } from "@/ipc/bindings";
import { captionsHaveWordTimings } from "@/captions/captionTiming";
import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/settings";
import { useEditorStore } from "../store";
import { cn } from "../lib/cn";
import { SectionLabel } from "./ui";
import { CaptionStyleControls } from "./CaptionStyleControls";
import { CaptionEditSheet } from "./CaptionEditSheet";

/** Speech languages for Whisper — curated list, not tied to UI locale. Default stays `auto`. */
const WHISPER_LANGUAGES: { value: string; labelKey: TranslationKey }[] = [
  { value: "auto", labelKey: "captions.lang.auto" },
  { value: "en", labelKey: "captions.lang.en" },
  { value: "fr", labelKey: "captions.lang.fr" },
  { value: "es", labelKey: "captions.lang.es" },
  { value: "it", labelKey: "captions.lang.it" },
  { value: "de", labelKey: "captions.lang.de" },
  { value: "pt", labelKey: "captions.lang.pt" },
  { value: "ru", labelKey: "captions.lang.ru" },
  { value: "ja", labelKey: "captions.lang.ja" },
  { value: "ko", labelKey: "captions.lang.ko" },
  { value: "zh", labelKey: "captions.lang.zh" },
  { value: "ar", labelKey: "captions.lang.ar" },
];

export function CaptionsPanel({ visible }: { visible: boolean }) {
  const { t } = useI18n();
  const captionSettings = useEditorStore((s) => s.captionSettings);
  const captions = useEditorStore((s) => s.captions);
  const captionGenerating = useEditorStore((s) => s.captionGenerating);
  const captionError = useEditorStore((s) => s.captionError);
  const setCaptionSettings = useEditorStore((s) => s.setCaptionSettings);
  const generateCaptions = useEditorStore((s) => s.generateCaptions);
  const clearCaptions = useEditorStore((s) => s.clearCaptions);
  const importCaptions = useEditorStore((s) => s.importCaptions);
  const updateCaptionTexts = useEditorStore((s) => s.updateCaptionTexts);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setPlaying = useEditorStore((s) => s.setPlaying);

  const [modelReady, setModelReady] = useState(false);
  const [downloadPct, setDownloadPct] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [genPhase, setGenPhase] = useState<string | null>(null);
  const [fileMessage, setFileMessage] = useState("");
  const captionIssues = useMemo(() => inspectCaptions(captions), [captions]);
  async function loadSubtitles(file?: File) {
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error("Tamanho máximo: 4 MB");
      const kind = file.name.toLowerCase().endsWith(".vtt") ? "vtt" : "srt";
      const cues = parseSubtitleFile(await file.text(), kind);
      importCaptions(cues);
      setFileMessage(`${cues.length} legendas importadas. Revise sincronização e texto.`);
    } catch (error) { setFileMessage(error instanceof Error ? error.message : "Erro ao importar."); }
  }
  function saveSubtitles(kind: "srt"|"vtt") {
    if (!captions.length) return;
    const blob = new Blob([serializeSubtitleFile(captions, kind)], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "wmk-legendas." + kind; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const refreshModel = useCallback(async () => {
    try {
      const st = await commands.getWhisperModelStatus();
      setModelReady(st.exists);
    } catch {
      setModelReady(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void refreshModel();
  }, [visible, refreshModel]);

  useEffect(() => {
    const un = listen<{
      status: string;
      progress: number;
      path?: string | null;
    }>("captions://model-download", (e) => {
      const { status, progress } = e.payload;
      if (status === "downloading") {
        setDownloading(true);
        setDownloadPct(progress);
      } else if (status === "downloaded") {
        setDownloading(false);
        setDownloadPct(100);
        setModelReady(true);
      } else if (status === "idle" || status === "error") {
        setDownloading(false);
        if (status === "idle") {
          setModelReady(false);
        }
      }
    });
    return () => {
      void un.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const un = listen<{ phase?: string }>("captions://progress", (e) => {
      setGenPhase(e.payload.phase ?? null);
    });
    return () => {
      void un.then((fn) => fn());
    };
  }, []);

  const cueCount = captions.length;
  const wordTimingsAvailable = captionsHaveWordTimings(captions);

  return (
    <div className={cn("flex flex-col gap-4", !visible && "hidden")}>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t("captions.desc")}
      </p>

      <section className="space-y-2">
        <SectionLabel>{t("captions.language")}</SectionLabel>
        <Select
          value={captionSettings.language}
          onValueChange={(v) => setCaptionSettings({ language: v })}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WHISPER_LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {t(l.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-2">
        <FieldLabelWithHint className="text-xs" hint={t("captions.model.hint")}>
          {t("captions.model")}
        </FieldLabelWithHint>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={downloading || modelReady}
            onClick={() => void commands.downloadWhisperModel().then(() => refreshModel())}
          >
            {downloading
              ? t("captions.model.downloading", { percent: downloadPct })
              : modelReady
                ? t("captions.model.ready")
                : t("captions.model.download")}
          </Button>
          {modelReady ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void commands.deleteWhisperModel().then(() => refreshModel())}
            >
              {t("captions.model.remove")}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="min-w-0 flex-1"
            disabled={!modelReady || captionGenerating}
            onClick={() => void generateCaptions()}
          >
            {captionGenerating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {genPhase === "transcribing"
                  ? t("captions.transcribing")
                  : t("captions.preparing")}
              </>
            ) : cueCount > 0 ? (
              t("captions.regenerate")
            ) : (
              t("captions.generate")
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={cueCount === 0 || captionGenerating}
            onClick={() => clearCaptions()}
          >
            {t("captions.clear")}
          </Button>
        </div>
        {captionError ? (
          <p className="text-xs text-amber-600 dark:text-amber-400" role="alert">
            {captionError}
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border border-border p-3">
        <SectionLabel>WMK — Arquivos de legendas</SectionLabel>
        <p className="text-xs text-muted-foreground">Importe SRT ou VTT, edite e exporte. A importação substitui as legendas atuais do projeto. Salve uma cópia antes se necessário.</p>
        <label className="block cursor-pointer rounded-md border border-border p-2 text-center text-xs hover:bg-muted">
          Importar SRT / VTT
          <input type="file" accept=".srt,.vtt,text/vtt" className="sr-only"
            onChange={(e) => { void loadSubtitles(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!captions.length} onClick={() => saveSubtitles("srt")}>Exportar SRT</Button>
          <Button type="button" variant="outline" size="sm" disabled={!captions.length} onClick={() => saveSubtitles("vtt")}>Exportar VTT</Button>
        </div>
        {fileMessage && <p role="status" className="text-xs text-muted-foreground">{fileMessage}</p>}
      </section>
      <section className="space-y-2 rounded-lg border border-border p-3">
        <SectionLabel>Diagnóstico de leitura e sincronização</SectionLabel>
        <p className="text-xs text-muted-foreground">Análise automática, sem IA: intervalos sobrepostos, linhas longas e leitura muito rápida. Alertas não alteram o vídeo.</p>
        <p className="text-xs">{captions.length} legendas · {captionIssues.length} aviso(s)</p>
        {captionIssues.slice(0,12).map((issue,i) => (
          <p key={i} className="text-xs text-amber-600 dark:text-amber-400">Legenda {issue.index}: {issue.message}</p>
        ))}
        {captionIssues.length > 12 && <p className="text-xs text-muted-foreground">Mais {captionIssues.length - 12} avisos; reduza a velocidade ou revise as legendas.</p>}
      </section>

      <CaptionEditSheet
        captions={captions}
        onSubmit={updateCaptionTexts}
        onSeek={(timeSec) => {
          setPlaying(false);
          setCurrentTime(timeSec);
        }}
      />

      <CaptionStyleControls
        hasCaptions={cueCount > 0}
        wordTimingsAvailable={wordTimingsAvailable}
        captionSettings={captionSettings}
        onChange={(patch) => setCaptionSettings(patch)}
      />
    </div>
  );
}
