pub mod commands;
pub mod export;
pub mod heic;
pub mod processing;
pub mod transform;

/// アプリケーションのエントリポイント（Tauri ランタイムの配線のみ）
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::process_image,
            commands::image_info,
            commands::preview_original,
            commands::export_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
