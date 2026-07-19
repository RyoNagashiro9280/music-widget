# Music Widget Development Plan (Retro + Modern Hybrid)

This document outlines the updated implementation plan for the Windows 11 Music Widget, focusing on adding real hardware functionality (Volume, Power, Audio Visualizer).

## Goal Description

We are moving past the UI prototype phase into hardware integration. 
- The **Power Button** will now close the widget.
- The **Volume Knob** will be rotatable (via mouse drag/scroll) and will control the actual Windows system volume.
- The **Audio Visualizer** will listen to the PC's audio output (loopback) and display a real-time frequency spectrum.

## User Review Required

> [!IMPORTANT]
> **Real Audio Analysis & System Control**
> Implementing real audio analysis and volume control requires interacting deeply with the Windows API (WASAPI and Endpoint Volume). 
> This is a major update to the Rust backend. Please approve this plan to proceed with these complex integrations.

## Proposed Implementation Phases

### Phase 1: Eject Bugfix & Power Button (Completed/In Progress)
- **Eject Fix**: Simplified the window resizing logic to prevent out-of-bounds errors. The eject button should now reliably trigger the pop-up screen (expanding downwards for safety).
- **Power Button**: Hook up the Power button to `getCurrentWindow().close()` to safely exit the app.

### Phase 2: System Volume Control
- **Rust Backend**: Use the `windows` crate (`IMMDeviceEnumerator`, `IAudioEndpointVolume`) to get and set the Windows master volume.
- **React Frontend**: Make the Rotary Knob interactive using `framer-motion` (drag) or mouse wheel events to dial the volume up and down.

### Phase 3: Real Audio Visualizer (cpal + rustfft)
- **Audio Capture**: Use the `cpal` crate to listen to the default output device (WASAPI loopback).
- **Frequency Analysis**: Use `rustfft` to convert the audio waveform into frequency bands (e.g., 16 bands for the VFD, 32 bands for the modern pop-up).
- **Data Streaming**: Send the frequency data continuously from Rust to React via Tauri events (`app_handle.emit()`).
- **Frontend Sync**: Update the CSS/Framer Motion visualizers to react to the incoming real data instead of random numbers.
