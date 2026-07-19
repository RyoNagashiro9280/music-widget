use windows::Win32::System::Com::{CoInitializeEx, CoCreateInstance, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eRender, eConsole, IMMDeviceEnumerator, MMDeviceEnumerator};

fn init_com() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

unsafe fn get_volume_endpoint() -> Result<IAudioEndpointVolume, String> {
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
    let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).map_err(|e| e.to_string())?;
    let volume = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).map_err(|e| e.to_string())?;
    Ok(volume)
}

#[tauri::command]
pub async fn get_system_volume() -> Result<f32, String> {
    init_com();
    unsafe {
        let endpoint = get_volume_endpoint()?;
        let level = endpoint.GetMasterVolumeLevelScalar().map_err(|e| e.to_string())?;
        Ok(level)
    }
}

#[tauri::command]
pub async fn set_system_volume(level: f32) -> Result<(), String> {
    init_com();
    unsafe {
        let endpoint = get_volume_endpoint()?;
        let clamped = level.clamp(0.0, 1.0);
        endpoint.SetMasterVolumeLevelScalar(clamped, std::ptr::null()).map_err(|e| e.to_string())?;
        Ok(())
    }
}
