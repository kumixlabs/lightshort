use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use serde_json::json;
use tauri::Emitter;

fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

#[tauri::command]
fn probe(path: String) -> Result<serde_json::Value, String> {
    let mut cmd = Command::new("ffprobe");
    cmd.args([
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,avg_frame_rate:format=duration",
        "-of", "csv=p=0", &path,
    ]);
    no_window(&mut cmd);
    let out = cmd.output().map_err(|e| format!("failed to execute ffprobe: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mut lines = text.lines();
    let stream = lines.next().ok_or("ffprobe: empty output")?;
    let dur_line = lines.next().unwrap_or("");
    let parts: Vec<&str> = stream.split(',').collect();
    let w: i64 = parts.first().and_then(|s| s.parse().ok()).ok_or("failed to parse width")?;
    let h: i64 = parts.get(1).and_then(|s| s.parse().ok()).ok_or("failed to parse height")?;
    let fps_raw = parts.get(2).ok_or("failed to parse fps")?.to_string();
    let fps = match fps_raw.split_once('/') {
        Some((n, d)) => n.parse::<f64>().unwrap_or(0.0) / d.parse::<f64>().unwrap_or(1.0),
        None => fps_raw.parse().unwrap_or(0.0),
    };
    let dur: f64 = dur_line.split(',').last().unwrap_or("0").trim().parse().unwrap_or(0.0);
    Ok(json!({ "w": w, "h": h, "fps": fps, "dur": dur }))
}

#[tauri::command]
async fn compose(app: tauri::AppHandle, args: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("ffmpeg");
        cmd.args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        no_window(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| format!("ffmpeg not found or failed to execute: {e}"))?;
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
        let tail = err_handle.join().unwrap_or_default();
        if status.success() {
            Ok(())
        } else {
            Err(format!("ffmpeg error:\n{tail}"))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![probe, compose])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
