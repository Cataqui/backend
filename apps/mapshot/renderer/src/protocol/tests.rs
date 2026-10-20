use super::*;
use std::io::Read;
use std::path::PathBuf;

fn _replies(input: &mut impl BufRead) -> Vec<serde_json::Value> {
    let fonts = std::env::var_os("MAPSHOT_FONT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist/native/assets/fonts")
        });
    let mut renderer = Renderer::new(&fonts).expect("prepared Mapshot fonts");
    let mut output = Vec::new();
    serve(&mut renderer, input, &mut output).unwrap();
    output
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_slice(line).unwrap())
        .collect()
}

#[test]
fn malformed_request_is_consumed_before_the_next_protocol_operation() {
    let mut input = io::BufReader::with_capacity(
        8,
        io::Cursor::new(b"invalid JSON\n{\"id\":7,\"op\":\"ready\"}\n"),
    );
    let replies = _replies(&mut input);
    assert_eq!(replies.len(), 2);
    assert!(
        replies[0]["error"]
            .as_str()
            .unwrap()
            .starts_with("invalid request:")
    );
    assert_eq!(replies[1]["id"], 7);
    assert_eq!(replies[1]["ok"], true);
}

#[test]
fn accepts_valid_requests_larger_than_the_former_frame_cap_and_final_operations_without_newlines() {
    let request = b"{\"id\":1,\"op\":\"ready\"}\n";
    let padding = io::repeat(b' ').take(128 * 1024 * 1024 + 1);
    let mut input = io::BufReader::with_capacity(
        64 * 1024,
        padding
            .chain(io::Cursor::new(request))
            .chain(io::Cursor::new(b"{\"id\":2,\"op\":\"ready\"}")),
    );
    let replies = _replies(&mut input);
    assert_eq!(replies.len(), 2);
    assert_eq!(replies[0]["id"], 1);
    assert_eq!(replies[0]["ok"], true);
    assert_eq!(replies[1]["id"], 2);
    assert_eq!(replies[1]["ok"], true);
}

#[test]
fn reports_malformed_final_operations_without_newlines() {
    let mut input = io::Cursor::new(b"invalid JSON");
    let replies = _replies(&mut input);
    assert_eq!(replies.len(), 1);
    assert!(
        replies[0]["error"]
            .as_str()
            .unwrap()
            .starts_with("invalid request:")
    );
}
