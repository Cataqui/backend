use base64::Engine;
use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn private_protocol_recovers_after_bad_requests_and_preserves_operation_ids() {
    let requests = [
        " ".to_owned(),
        serde_json::json!({"id":1,"op":"ready"}).to_string(),
        "{".to_owned(),
        serde_json::json!({"id":2,"op":"render"}).to_string(),
        serde_json::json!({"id":3,"op":"measure","texts":[]}).to_string(),
        serde_json::json!({"id":4,"op":"render","map":{
            "camera":{"latitude":0,"longitude":0,"zoom":13,"width":0,"height":480,"pixelRatio":2},
            "tiles":[],"landmarks":{"candidates":[],"style":{"badgeRadius":9,
                "badgeStrokeWidth":1.25,"labelGap":3,"edgeMargin":6,"labelFontSize":10,"labelMaxWidth":80,
                "labelMaxLines":3,"labelLineHeight":12,"labelLetterSpacing":-0.2,"labelHaloWidth":2}}
        }})
        .to_string(),
        serde_json::json!({"id":5,"op":"ready"}).to_string(),
    ];
    let mut child = Command::new(env!("CARGO_BIN_EXE_mapshot-renderer"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(requests.join("\n").as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let replies = output
        .stdout
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_slice::<serde_json::Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(replies.len(), 6);
    assert_eq!(replies[0]["id"], 1);
    assert_eq!(replies[0]["ok"], true);
    assert_eq!(replies[0]["width"], 16);
    for reply in &replies[1..4] {
        assert_eq!(reply["id"], serde_json::Value::Null);
        assert_eq!(reply["ok"], false);
    }
    assert_eq!(replies[4]["id"], 4);
    assert_eq!(replies[4]["ok"], false);
    assert_eq!(replies[5]["id"], 5);
    assert_eq!(replies[5]["ok"], true);
    assert_eq!(replies[5]["width"], 16);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(replies[5]["imageBase64"].as_str().unwrap())
        .unwrap();
    assert_eq!(&bytes[8..12], b"WEBP");
}
