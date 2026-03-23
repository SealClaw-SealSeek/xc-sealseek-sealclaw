#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod runtime;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_platform_info,
            commands::get_app_data_dir,
            runtime::get_runtime_status,
            runtime::start_runtime,
            runtime::stop_runtime,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let main_window = app.get_webview_window("main").unwrap();
                main_window.open_devtools();
            }
            Ok(())
        })
        .on_window_event(|_window, event| {
            // 应用退出时清理 Python 子进程，防止孤儿进程
            if let tauri::WindowEvent::Destroyed = event {
                runtime::cleanup_runtime();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running sealClaw desktop");
}
