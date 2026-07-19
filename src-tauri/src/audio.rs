use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::{num_complex::Complex, FftPlanner};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU32, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use serde::Serialize;

pub static SENSITIVITY: AtomicU32 = AtomicU32::new(100);
pub static SMOOTHING_VAL: AtomicU32 = AtomicU32::new(60);

#[tauri::command]
pub fn set_visualizer_settings(sensitivity: u32, smoothing: u32) {
    SENSITIVITY.store(sensitivity, Ordering::Relaxed);
    SMOOTHING_VAL.store(smoothing, Ordering::Relaxed);
}

#[tauri::command]
pub fn get_visualizer_settings() -> (u32, u32) {
    (
        SENSITIVITY.load(Ordering::Relaxed),
        SMOOTHING_VAL.load(Ordering::Relaxed),
    )
}

#[derive(Clone, Serialize)]
pub struct AudioSpectrum {
    pub bands16: Vec<f32>,
    pub bands32: Vec<f32>,
}

const FFT_SIZE: usize = 2048;
const FPS: u64 = 60;

fn get_device_name(device: &cpal::Device) -> String {
    device.name().unwrap_or_else(|_| "Unknown Device".to_string())
}

fn create_stream(
    device: &cpal::Device, 
    latest_samples: Arc<Mutex<Vec<f32>>>
) -> Option<(cpal::Stream, f32, usize)> {
    let config = match device.default_output_config() {
        Ok(conf) => conf,
        Err(err) => {
            eprintln!("Failed to get default output config: {}", err);
            return None;
        }
    };

    let sample_rate = config.sample_rate().0 as f32;
    let channels = config.channels() as usize;

    let latest_samples_clone = Arc::clone(&latest_samples);
    let stream_result = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data: &[f32], _: &_| {
                let mut buffer = latest_samples_clone.lock().unwrap();
                for frame in data.chunks(channels) {
                    let mono = frame.iter().sum::<f32>() / channels as f32;
                    buffer.remove(0);
                    buffer.push(mono);
                }
            },
            |err| eprintln!("Audio stream error: {}", err),
            None,
        ),
        _ => {
            eprintln!("Unsupported sample format for loopback");
            return None;
        }
    };

    match stream_result {
        Ok(stream) => {
            if let Err(e) = stream.play() {
                eprintln!("Failed to play stream: {}", e);
                None
            } else {
                Some((stream, sample_rate, channels))
            }
        }
        Err(e) => {
            eprintln!("Failed to build input stream: {}", e);
            None
        }
    }
}

pub fn start_audio_capture(app_handle: AppHandle) {
    let latest_samples = Arc::new(Mutex::new(vec![0.0; FFT_SIZE]));
    let latest_samples_clone = Arc::clone(&latest_samples);

    thread::spawn(move || {
        let host = cpal::default_host();
        let mut _current_device = host.default_output_device();
        let mut current_device_name = _current_device.as_ref().map(|d| get_device_name(d)).unwrap_or_default();
        
        let mut active_stream_data = _current_device.as_ref().and_then(|d| create_stream(d, Arc::clone(&latest_samples_clone)));
        
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        
        let mut prev_bands32 = vec![0.0; 32];
        let mut prev_bands16 = vec![0.0; 16];
        
        let mut loop_counter = 0;

        loop {
            loop_counter += 1;
            
            // Check default audio device changed about once a second (60 loops)
            if loop_counter >= FPS {
                loop_counter = 0;
                let latest_device = host.default_output_device();
                let latest_device_name = latest_device.as_ref().map(|d| get_device_name(d)).unwrap_or_default();
                
                if latest_device_name != current_device_name {
                    println!("Default audio device changed from '{}' to '{}'. Rebuilding stream...", current_device_name, latest_device_name);
                    
                    // Explicitly drop the old stream to stop audio capturing
                    active_stream_data = None;
                    
                    if let Some(ref dev) = latest_device {
                        active_stream_data = create_stream(dev, Arc::clone(&latest_samples_clone));
                    }
                    
                    _current_device = latest_device;
                    current_device_name = latest_device_name;
                }
            }

            if active_stream_data.is_none() {
                // If no active device or stream, clear buffer to let visualizer settle down to silent
                let mut buffer = latest_samples_clone.lock().unwrap();
                buffer.fill(0.0);
            }

            let sample_rate = active_stream_data.as_ref().map(|d| d.1).unwrap_or(44100.0);
            
            let sens = SENSITIVITY.load(Ordering::Relaxed) as f32 / 100.0;
            let smoothing = SMOOTHING_VAL.load(Ordering::Relaxed) as f32 / 100.0;

            let samples: Vec<f32> = {
                let buffer = latest_samples_clone.lock().unwrap();
                buffer.clone()
            };

            let mut input: Vec<Complex<f32>> = samples
                .iter()
                .enumerate()
                .map(|(i, &s)| {
                    let multiplier = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (FFT_SIZE as f32 - 1.0)).cos());
                    Complex { re: s * multiplier, im: 0.0 }
                })
                .collect();

            fft.process(&mut input);

            let magnitudes: Vec<f32> = input
                .iter()
                .take(FFT_SIZE / 2)
                .map(|c| (c.re * c.re + c.im * c.im).sqrt())
                .collect();

            let mut bands32 = vec![0.0; 32];
            let max_freq = sample_rate / 2.0;
            
            for i in 0..32 {
                let min_f = 20.0 * (max_freq / 20.0).powf(i as f32 / 32.0);
                let max_f = 20.0 * (max_freq / 20.0).powf((i as f32 + 1.0) / 32.0);
                
                let min_idx = ((min_f / max_freq) * (FFT_SIZE as f32 / 2.0)) as usize;
                let max_idx = ((max_f / max_freq) * (FFT_SIZE as f32 / 2.0)) as usize;
                
                let mut sum = 0.0;
                let mut count = 0;
                for j in min_idx..=max_idx {
                    if j < magnitudes.len() {
                        sum += magnitudes[j];
                        count += 1;
                    }
                }
                
                let mut val = if count > 0 { sum / count as f32 } else { 0.0 };
                
                val = val * (i as f32 + 10.0) / 10.0; 
                // Apply dynamic sensitivity scaling
                val = ((val / 150.0) * sens).min(1.0); 
                
                // Apply dynamic smoothing
                bands32[i] = prev_bands32[i] * smoothing + val * (1.0 - smoothing);
            }
            prev_bands32 = bands32.clone();

            let mut bands16 = vec![0.0; 16];
            for i in 0..16 {
                let v = (bands32[i * 2] + bands32[i * 2 + 1]) / 2.0;
                // Apply dynamic smoothing
                bands16[i] = prev_bands16[i] * smoothing + v * (1.0 - smoothing);
            }
            prev_bands16 = bands16.clone();

            let spectrum = AudioSpectrum {
                bands16,
                bands32,
            };

            let _ = app_handle.emit("audio-spectrum", spectrum);
            thread::sleep(Duration::from_millis(1000 / FPS));
        }
    });
}
