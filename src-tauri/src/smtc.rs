use serde::Serialize;
use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
use windows::Storage::Streams::DataReader;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
use base64::{Engine as _, engine::general_purpose};
use futures::executor::block_on;
use std::future::IntoFuture;
use std::time::Duration;
use std::sync::{Mutex, OnceLock};

static SMTC_MANAGER: OnceLock<Mutex<Option<GlobalSystemMediaTransportControlsSessionManager>>> = OnceLock::new();

fn get_cached_manager() -> Result<GlobalSystemMediaTransportControlsSessionManager, String> {
    let mutex = SMTC_MANAGER.get_or_init(|| Mutex::new(None));
    let mut lock = mutex.lock().unwrap();
    if let Some(m) = lock.as_ref() {
        return Ok(m.clone());
    }
    
    unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
    let manager_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| format!("Manager error: {}", e))?;
    let m = block_on(manager_op.into_future())
        .map_err(|e| format!("Manager await error: {}", e))?;
        
    *lock = Some(m.clone());
    Ok(m)
}

#[derive(Serialize, Default, Debug, Clone)]
pub struct MediaInfo {
    pub title: String,
    pub artist: String,
    pub source_app: String,
    pub thumbnail_base64: Option<String>,
}

#[tauri::command]
pub async fn get_current_media_info() -> Result<MediaInfo, String> {
    let task = tauri::async_runtime::spawn_blocking(|| {
        let manager = get_cached_manager()?;

        let session = match manager.GetCurrentSession() {
            Ok(s) => s,
            Err(e) => return Err(format!("No Active Session: {}", e)),
        };

        let source_app = session
            .SourceAppUserModelId()
            .map(|s| s.to_string())
            .unwrap_or_else(|e| format!("App ID Error: {}", e));

        let properties_op = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| format!("TryGetMediaPropertiesAsync Failed: {}", e))?;
            
        let properties = block_on(properties_op.into_future())
            .map_err(|e| format!("TryGetMediaPropertiesAsync Await Failed: {}", e))?;

        let title = properties.Title().map(|s| s.to_string()).unwrap_or_default();
        let artist = properties.Artist().map(|s| s.to_string()).unwrap_or_default();

        let mut thumbnail_base64 = None;
        if let Ok(thumbnail_ref) = properties.Thumbnail() {
            if let Ok(stream_op) = thumbnail_ref.OpenReadAsync() {
                if let Ok(stream) = block_on(stream_op.into_future()) {
                    if let Ok(size) = stream.Size() {
                        if size > 0 {
                            if let Ok(reader) = DataReader::CreateDataReader(&stream) {
                                if let Ok(load_op) = reader.LoadAsync(size as u32) {
                                    if block_on(load_op.into_future()).is_ok() {
                                        let mut buffer = vec![0u8; size as usize];
                                        if reader.ReadBytes(&mut buffer).is_ok() {
                                            let b64 = general_purpose::STANDARD.encode(&buffer);
                                            thumbnail_base64 = Some(format!("data:image/jpeg;base64,{}", b64));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(MediaInfo {
            title,
            artist,
            source_app,
            thumbnail_base64,
        })
    });

    match tokio::time::timeout(Duration::from_millis(500), task).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => Err(format!("Task error: {}", e)),
        Err(_) => Err("Timeout waiting for Windows SMTC (App might be hanging OS media)".into()),
    }
}

#[tauri::command]
pub async fn media_play() -> Result<(), String> {
    let _ = tokio::time::timeout(Duration::from_millis(500), tauri::async_runtime::spawn_blocking(|| {
        if let Ok(manager) = get_cached_manager() {
            if let Ok(session) = manager.GetCurrentSession() {
                let _ = session.TryPlayAsync();
            }
        }
    })).await;
    Ok(())
}

#[tauri::command]
pub async fn media_pause() -> Result<(), String> {
    let _ = tokio::time::timeout(Duration::from_millis(500), tauri::async_runtime::spawn_blocking(|| {
        if let Ok(manager) = get_cached_manager() {
            if let Ok(session) = manager.GetCurrentSession() {
                let _ = session.TryPauseAsync();
            }
        }
    })).await;
    Ok(())
}

#[tauri::command]
pub async fn media_skip_next() -> Result<(), String> {
    let _ = tokio::time::timeout(Duration::from_millis(500), tauri::async_runtime::spawn_blocking(|| {
        if let Ok(manager) = get_cached_manager() {
            if let Ok(session) = manager.GetCurrentSession() {
                let _ = session.TrySkipNextAsync();
            }
        }
    })).await;
    Ok(())
}

#[tauri::command]
pub async fn media_skip_previous() -> Result<(), String> {
    let _ = tokio::time::timeout(Duration::from_millis(500), tauri::async_runtime::spawn_blocking(|| {
        if let Ok(manager) = get_cached_manager() {
            if let Ok(session) = manager.GetCurrentSession() {
                let _ = session.TrySkipPreviousAsync();
            }
        }
    })).await;
    Ok(())
}
