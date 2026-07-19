use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::{num_complex::Complex, FftPlanner};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct AudioSpectrum {
    pub bands16: Vec<f32>,
    pub bands32: Vec<f32>,
}

const FFT_SIZE: usize = 2048;
const FPS: u64 = 60;
const SMOOTHING: f32 = 0.6;

pub fn start_audio_capture(app_handle: AppHandle) {
    let host = cpal::default_host();
    
    let device = match host.default_output_device() {
        Some(dev) => dev,
        None => {
            eprintln!("No default output device available.");
            return;
        }
    };

    let config = match device.default_output_config() {
        Ok(conf) => conf,
        Err(err) => {
            eprintln!("Failed to get default output config: {}", err);
            return;
        }
    };

    let sample_rate = config.sample_rate().0 as f32;
    let channels = config.channels() as usize;

    let latest_samples = Arc::new(Mutex::new(vec![0.0; FFT_SIZE]));
    let latest_samples_clone = Arc::clone(&latest_samples);

    let stream = match config.sample_format() {
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
            return;
        }
    };

    let stream = match stream {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to build input stream: {}", e);
            return;
        }
    };

    stream.play().unwrap();
    Box::leak(Box::new(stream));

    thread::spawn(move || {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        
        let mut prev_bands32 = vec![0.0; 32];
        let mut prev_bands16 = vec![0.0; 16];

        loop {
            let samples: Vec<f32> = {
                let buffer = latest_samples.lock().unwrap();
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
                val = (val / 150.0).min(1.0); 
                
                bands32[i] = prev_bands32[i] * SMOOTHING + val * (1.0 - SMOOTHING);
            }
            prev_bands32 = bands32.clone();

            let mut bands16 = vec![0.0; 16];
            for i in 0..16 {
                let v = (bands32[i * 2] + bands32[i * 2 + 1]) / 2.0;
                bands16[i] = prev_bands16[i] * SMOOTHING + v * (1.0 - SMOOTHING);
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
