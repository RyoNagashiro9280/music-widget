mod audio;
mod smtc;
mod volume;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            audio::start_audio_capture(app_handle);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            smtc::get_current_media_info,
            smtc::media_play,
            smtc::media_pause,
            smtc::media_skip_next,
            smtc::media_skip_previous,
            volume::get_system_volume,
            volume::set_system_volume,
            audio::get_visualizer_settings,
            audio::set_visualizer_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
