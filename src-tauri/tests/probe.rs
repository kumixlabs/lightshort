//! ffprobe output parsing; run with `cargo test --manifest-path src-tauri/Cargo.toml`.
use lightshort_lib::parse_probe;
use serde_json::json;

#[test]
fn parses_video_stream_and_detects_audio() {
    let v = parse_probe(
        br#"{"streams":[{"codec_type":"video","width":1920,"height":1080,"avg_frame_rate":"30000/1001","duration":"10.0"},{"codec_type":"audio"}],"format":{"duration":"10.02"}}"#,
    )
    .unwrap();
    assert_eq!(v["w"], json!(1920));
    assert_eq!(v["h"], json!(1080));
    assert_eq!(v["fps"].as_f64(), Some(30000.0 / 1001.0));
    assert_eq!(v["dur"], json!(10.0));
    assert_eq!(v["audio"], json!(true));
}

#[test]
fn falls_back_for_unknown_fps_and_stream_duration() {
    let v = parse_probe(
        br#"{"streams":[{"codec_type":"video","width":1080,"height":1920,"avg_frame_rate":"0/0","duration":"N/A"}],"format":{"duration":"12.5"}}"#,
    )
    .unwrap();
    assert_eq!(v["fps"], json!(30.0));
    assert_eq!(v["dur"], json!(12.5));
    assert_eq!(v["audio"], json!(false));
}

#[test]
fn rejects_files_without_video_or_duration() {
    let no_duration =
        br#"{"streams":[{"codec_type":"video","width":1,"height":1,"avg_frame_rate":"25/1"}],"format":{}}"#;
    let no_video = br#"{"streams":[],"format":{"duration":"1.0"}}"#;
    assert!(parse_probe(no_duration).is_err());
    assert!(parse_probe(no_video).is_err());
}
