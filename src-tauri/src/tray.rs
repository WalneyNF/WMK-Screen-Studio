//! The macOS menubar tray (`NSStatusItem`). Left-click toggles the recorder
//! popover; right-click shows a native menu that swaps with recorder state
//! (idle setup items ↔ live pause / stop / annotate).
//!
//! macOS uses a dedicated monochrome Capptivo glyph as a template image (tints
//! with the menubar). Windows keeps the full-color app icon.

use crate::recorder::types::RecorderState;
use crate::state::AppState;
use crate::windows;
#[cfg(target_os = "macos")]
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

pub const TRAY_ID: &str = "wmk-screen-studio-tray";

/// Flat mark for NSStatusItem — black + alpha only (`icon_as_template`).
#[cfg(target_os = "macos")]
const TRAY_TEMPLATE_PNG: &[u8] = include_bytes!("../icons/tray-template@2x.png");

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let menu = idle_menu(app)?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        // Left-click drives the popover ourselves; the menu is right-click only.
        .show_menu_on_left_click(false)
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(on_tray_icon_event);

    builder = apply_tray_icon(app, builder)?;
    builder.build(app)?;
    Ok(())
}

/// Rebuild the tray menu when the recorder state machine changes.
/// Cheap: only runs on start / pause / resume / stop (not on elapsed ticks).
pub fn sync_for_state(app: &AppHandle, state: &RecorderState) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let menu = match menu_for_state(app, state) {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!(%e, "failed to build tray menu");
            return;
        }
    };
    if let Err(e) = tray.set_menu(Some(menu)) {
        tracing::warn!(%e, "failed to update tray menu");
    }
}

fn menu_for_state(app: &AppHandle, state: &RecorderState) -> tauri::Result<Menu<tauri::Wry>> {
    match tray_kind(state) {
        TrayKind::Idle => idle_menu(app),
        TrayKind::Live { paused } => live_menu(app, paused),
        TrayKind::Finalizing => finalizing_menu(app),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrayKind {
    Idle,
    Live { paused: bool },
    Finalizing,
}

fn tray_kind(state: &RecorderState) -> TrayKind {
    match state {
        RecorderState::Recording | RecorderState::Countdown { .. } => {
            TrayKind::Live { paused: false }
        }
        RecorderState::Paused => TrayKind::Live { paused: true },
        RecorderState::Finalizing => TrayKind::Finalizing,
        RecorderState::Idle | RecorderState::Error { .. } => TrayKind::Idle,
    }
}

fn idle_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // "Abrir gravador" first: on most Linux DEs (appindicator) tray left-click
    // never fires, so the popover must be reachable from the menu. It's also a
    // discoverable fallback on Windows for users who expect click = menu.
    let open_main = MenuItem::with_id(
        app, "open_main", "Abrir WMK Screen Studio", true, None::<&str>,
    )?;
    let open_recorder =
        MenuItem::with_id(app, "open_recorder", "Abrir gravador", true, None::<&str>)?;
    let annotate = MenuItem::with_id(app, "annotate", "Anotar tela…", true, None::<&str>)?;
    let open_library = MenuItem::with_id(app, "open_library", "Biblioteca de gravações…", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Configurações do gravador…", true, None::<&str>)?;
    let open_diagnostics = MenuItem::with_id(
        app,
        "open_diagnostics",
        "Abrir diagnósticos…",
        true,
        None::<&str>,
    )?;
    let clear_diagnostics = MenuItem::with_id(
        app,
        "clear_diagnostics",
        "Limpar diagnósticos",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Sair do WMK Screen Studio", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &open_main,
            &open_recorder,
            &annotate,
            &open_library,
            &settings,
            &separator,
            &open_diagnostics,
            &clear_diagnostics,
            &separator,
            &quit,
        ],
    )
}

/// In-session menu: pause/resume + stop first, then annotate / HUD / library.
fn live_menu(app: &AppHandle, paused: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let pause_or_resume = if paused {
        MenuItem::with_id(app, "resume", "Retomar gravação", true, None::<&str>)?
    } else {
        MenuItem::with_id(app, "pause", "Pausar gravação", true, None::<&str>)?
    };
    let stop = MenuItem::with_id(app, "stop", "Parar gravação", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let annotate = MenuItem::with_id(app, "annotate", "Abrir anotações", true, None::<&str>)?;
    let open_recorder =
        MenuItem::with_id(app, "open_recorder", "Mostrar gravador", true, None::<&str>)?;
    let open_library = MenuItem::with_id(app, "open_library", "Biblioteca de gravações…", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    // Quit while recording would leave a half-written project on disk — stop first.
    Menu::with_items(
        app,
        &[
            &pause_or_resume,
            &stop,
            &sep1,
            &annotate,
            &open_recorder,
            &open_library,
            &sep2,
        ],
    )
}

fn finalizing_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let status = MenuItem::with_id(app, "finalizing", "Finalizando gravação…", false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let open_library = MenuItem::with_id(app, "open_library", "Biblioteca de gravações…", true, None::<&str>)?;
    // No Quit while a take is being finalized — same data-loss risk as mid-record quit.
    Menu::with_items(app, &[&status, &separator, &open_library])
}

#[cfg(target_os = "macos")]
fn apply_tray_icon(
    _app: &AppHandle,
    builder: TrayIconBuilder<tauri::Wry>,
) -> tauri::Result<TrayIconBuilder<tauri::Wry>> {
    let icon = Image::from_bytes(TRAY_TEMPLATE_PNG)?;
    Ok(builder.icon(icon).icon_as_template(true))
}

#[cfg(not(target_os = "macos"))]
fn apply_tray_icon(
    app: &AppHandle,
    mut builder: TrayIconBuilder<tauri::Wry>,
) -> tauri::Result<TrayIconBuilder<tauri::Wry>> {
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    Ok(builder)
}

fn on_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id.as_ref() {
        "quit" => {
            if recording_active(app) {
                tracing::warn!("tray quit ignored while a recording is active");
                return;
            }
            app.exit(0);
        }
        "open_main" => {
            if let Err(e) = windows::open_library(app.clone()) {
                tracing::warn!(%e, "failed to open WMK main window");
            }
        }
        "open_recorder" => {
            if let Err(e) = windows::show_recorder_popover(app) {
                tracing::warn!(%e, "failed to open recorder popover from menu");
            }
        }
        "annotate" => {
            if let Err(e) = windows::toggle_annotation_overlay(app) {
                tracing::warn!(%e, "failed to toggle annotation overlay from menu");
            }
        }
        "open_library" => {
            if let Err(e) = windows::open_library(app.clone()) {
                tracing::warn!(%e, "failed to open recordings library");
            }
        }
        "open_diagnostics" => {
            if crate::error_log::reveal().is_err() {
                app.dialog()
                    .message("Não foi possível abrir os diagnósticos locais")
                    .kind(MessageDialogKind::Error)
                    .show(|_| {});
            }
        }
        "clear_diagnostics" => {
            if crate::error_log::clear().is_err() {
                app.dialog()
                    .message("Não foi possível limpar os diagnósticos locais")
                    .kind(MessageDialogKind::Error)
                    .show(|_| {});
            }
        }
        "settings" => {
            // Settings window is a Phase 5 item; open the popover for now.
            let _ = windows::show_recorder_popover(app);
        }
        "pause" => {
            if let Some(state) = app.try_state::<AppState>() {
                if let Err(e) = state.recorder.pause() {
                    tracing::warn!(%e, "tray pause failed");
                }
            }
        }
        "resume" => {
            if let Some(state) = app.try_state::<AppState>() {
                if let Err(e) = state.recorder.resume() {
                    tracing::warn!(%e, "tray resume failed");
                }
            }
        }
        "stop" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let Some(state) = app.try_state::<AppState>() else {
                    return;
                };
                if let Err(e) = crate::commands::recording::stop_recording(app.clone(), state).await
                {
                    tracing::warn!(%e, "tray stop failed");
                }
            });
        }
        other => tracing::debug!(id = other, "unhandled tray menu item"),
    }
}

fn recording_active(app: &AppHandle) -> bool {
    app.try_state::<AppState>()
        .map(|s| s.current_project.lock().is_some())
        .unwrap_or(false)
}

fn on_tray_icon_event(tray: &tauri::tray::TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        // On desktop, tray left-click returns to the main application.
        // Recorder stays available through Alt+Shift+R and menu.
        if let Err(e) = windows::open_library(tray.app_handle().clone()) {
            tracing::warn!(%e, "failed to open WMK main window from tray");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_kind_follows_recorder_state() {
        assert_eq!(tray_kind(&RecorderState::Idle), TrayKind::Idle);
        assert_eq!(
            tray_kind(&RecorderState::Recording),
            TrayKind::Live { paused: false }
        );
        assert_eq!(
            tray_kind(&RecorderState::Paused),
            TrayKind::Live { paused: true }
        );
        assert_eq!(tray_kind(&RecorderState::Finalizing), TrayKind::Finalizing);
        assert_eq!(
            tray_kind(&RecorderState::Error {
                message: "x".into(),
                fatal: false
            }),
            TrayKind::Idle
        );
    }
}
