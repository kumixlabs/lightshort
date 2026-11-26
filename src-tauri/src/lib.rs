use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use serde_json::json;
use tauri::Emitter;

#[derive(Default)]
struct ComposeState {
    pid: Arc<Mutex<Option<u32>>>,
    cancelled: Arc<AtomicBool>,
}

fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

fn get_lightshort_config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let base = app.path().config_dir().map_err(|e| e.to_string())?;
    Ok(base.join("lightshort").join("config.json"))
}

#[tauri::command]
fn read_app_config(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let config_path = get_lightshort_config_path(&app)?;
    if !config_path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&config_path)
        .map(Some)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_app_config(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let config_path = get_lightshort_config_path(&app)?;
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&config_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_default_video_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let path = app.path().video_dir().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        let _ = std::fs::create_dir_all(&p);
    }
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("explorer");
        let win_path = path.replace('/', "\\");
        cmd.arg(&win_path);
        no_window(&mut cmd);
        cmd.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn check_ffmpeg() -> Result<String, String> {
    // Both binaries are required: ffmpeg composes, ffprobe probes.
    let find = |bin: &str| -> Option<String> {
        let mut cmd = Command::new(if cfg!(windows) { "where.exe" } else { "which" });
        cmd.arg(bin);
        no_window(&mut cmd);
        let out = cmd.output().ok()?;
        out.status.success().then(|| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string()
        })
    };
    let ffmpeg = find("ffmpeg").filter(|p| !p.is_empty()).ok_or("FFmpeg not found in system PATH")?;
    find("ffprobe").filter(|p| !p.is_empty()).ok_or("FFprobe not found in system PATH")?;
    Ok(ffmpeg)
}

#[tauri::command]
fn probe(path: String) -> Result<serde_json::Value, String> {
    let mut cmd = Command::new("ffprobe");
    cmd.args([
        "-v", "error",
        "-show_entries", "stream=codec_type,width,height,avg_frame_rate,duration:format=duration",
        "-of", "json", &path,
    ]);
    no_window(&mut cmd);
    let out = cmd.output().map_err(|e| format!("failed to execute ffprobe: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    parse_probe(&out.stdout)
}

/// Parses `ffprobe -show_entries stream=codec_type,width,height,avg_frame_rate,duration:format=duration -of json`.
pub fn parse_probe(bytes: &[u8]) -> Result<serde_json::Value, String> {
    let info: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|e| format!("ffprobe: invalid output: {e}"))?;
    let streams = info["streams"].as_array().cloned().unwrap_or_default();
    let video = streams
        .iter()
        .find(|s| s["codec_type"] == "video")
        .ok_or("ffprobe: no video stream")?;
    let w = video["width"].as_i64().ok_or("failed to parse width")?;
    let h = video["height"].as_i64().ok_or("failed to parse height")?;
    // Some containers report "0/0"; the fps filter only needs a sane target.
    let fps = video["avg_frame_rate"]
        .as_str()
        .and_then(|s| match s.split_once('/') {
            Some((n, d)) => Some(n.parse::<f64>().ok()? / d.parse::<f64>().ok()?),
            None => s.parse().ok(),
        })
        .filter(|f| f.is_finite() && *f > 0.0)
        .unwrap_or(30.0);
    // Stream duration can be "N/A"; fall back to the container duration.
    // Without one the filtergraph would trim to nothing, so fail loudly instead.
    let dur = std::iter::once(video["duration"].as_str())
        .chain(std::iter::once(info["format"]["duration"].as_str()))
        .flatten()
        .filter_map(|s| s.parse::<f64>().ok())
        .find(|d| *d > 0.0)
        .ok_or("ffprobe: no duration")?;
    let audio = streams.iter().any(|s| s["codec_type"] == "audio");
    Ok(json!({ "w": w, "h": h, "fps": fps, "dur": dur, "audio": audio }))
}

#[tauri::command]
async fn compose(
    app: tauri::AppHandle,
    state: tauri::State<'_, ComposeState>,
    args: Vec<String>,
) -> Result<(), String> {
    let pid_slot = Arc::clone(&state.pid);
    let cancelled = Arc::clone(&state.cancelled);
    cancelled.store(false, Ordering::SeqCst);

    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("ffmpeg");
        cmd.args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        no_window(&mut cmd);
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("ffmpeg not found or failed to execute: {e}"))?;

        let pid = child.id();
        *pid_slot.lock().unwrap() = Some(pid);

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();

        let err_handle = std::thread::spawn(move || {
            let mut tail = String::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if tail.len() < 4000 {
                    tail.push_str(&line);
                    tail.push('\n');
                }
            }
            tail
        });

        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let secs = line
                .strip_prefix("out_time_us=")
                .and_then(|v| v.parse::<f64>().ok())
                .map(|us| us / 1_000_000.0)
                .or_else(|| {
                    line.strip_prefix("out_time_ms=")
                        .and_then(|v| v.parse::<f64>().ok())
                        .map(|ms| ms / 1000.0)
                });
            if let Some(s) = secs {
                let _ = app.emit("compose-progress", s);
            }
        }

        let status = child.wait().map_err(|e| e.to_string())?;
        *pid_slot.lock().unwrap() = None;
        let is_cancelled = cancelled.load(Ordering::SeqCst);
        let tail = err_handle.join().unwrap_or_default();

        if is_cancelled {
            if let Some(out_path) = args.last() {
                std::thread::sleep(std::time::Duration::from_millis(50));
                let _ = std::fs::remove_file(out_path);
            }
            return Err("cancelled".to_string());
        }

        if status.success() {
            Ok(())
        } else {
            Err(format!("ffmpeg error:\n{tail}"))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cancel_compose(state: tauri::State<'_, ComposeState>) -> Result<(), String> {
    state.cancelled.store(true, Ordering::SeqCst);
    if let Some(pid) = *state.pid.lock().unwrap() {
        #[cfg(windows)]
        {
            let mut cmd = Command::new("taskkill");
            cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
            no_window(&mut cmd);
            let _ = cmd.output();
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ComposeState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            probe,
            compose,
            cancel_compose,
            check_ffmpeg,
            read_app_config,
            write_app_config,
            get_default_video_dir,
            open_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
