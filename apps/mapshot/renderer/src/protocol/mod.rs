//! Private NDJSON ingress and the engine wire contract.

use std::io::{self, BufRead, Write};
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::renderer::{_cpu_ms, _ms, Renderer};
use crate::{map, raster, text};

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Request {
    Ready {
        #[serde(default)]
        id: serde_json::Value,
    },
    Render {
        #[serde(default)]
        id: serde_json::Value,
        map: map::MapSceneInput,
    },
}

impl Request {
    pub(super) fn id(&self) -> &serde_json::Value {
        match self {
            Self::Ready { id } | Self::Render { id, .. } => id,
        }
    }
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Metrics {
    pub(super) input_bytes: usize,
    pub(super) parse_ms: f64,
    pub(super) compile_ms: f64,
    pub(super) placement_ms: f64,
    pub(super) geometry_ms: f64,
    pub(super) text_raster_ms: f64,
    pub(super) render_ms: f64,
    pub(super) encode_ms: f64,
    pub(super) total_ms: f64,
    pub(super) cpu_ms: f64,
    pub(super) peak_rss_bytes: u64,
    pub(super) accepted_labels: usize,
    pub(super) accepted_label_ids: Vec<String>,
    pub(super) skipped_labels: usize,
    pub(super) missing_glyphs: usize,
    pub(super) text_cache: Option<text::TextCacheMetrics>,
    pub(super) shaped_glyphs: usize,
    pub(super) unsupported_labels: usize,
    pub(super) clip_masks: usize,
    pub(super) roi_geometry: Option<raster::Metrics>,
    pub(super) roi_fallback: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Reply {
    pub(super) id: serde_json::Value,
    pub(super) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) bytes: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) image_base64: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) metrics: Option<Metrics>,
}

fn _error(id: serde_json::Value, error: String) -> Reply {
    Reply {
        id: id,
        ok: false,
        error: Some(error),
        width: None,
        height: None,
        bytes: None,
        image_base64: None,
        metrics: None,
    }
}
pub(super) fn serve(
    renderer: &mut Renderer,
    input: &mut impl BufRead,
    output: &mut impl Write,
) -> io::Result<()> {
    let mut line = Vec::new();
    loop {
        line.clear();
        loop {
            let available = input.fill_buf()?;
            if available.is_empty() {
                break;
            }
            let length = available
                .iter()
                .position(|byte| *byte == b'\n')
                .map_or(available.len(), |index| index + 1);
            let ended = available[length - 1] == b'\n';
            line.try_reserve(length)
                .map_err(|_| io::Error::other("cannot allocate native request buffer"))?;
            line.extend_from_slice(&available[..length]);
            input.consume(length);
            if ended {
                break;
            }
        }
        if line.is_empty() {
            break;
        }
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        let start = Instant::now();
        let parse_cpu_start = _cpu_ms();
        let reply = match serde_json::from_slice::<Request>(&line) {
            Ok(request) => {
                let id = request.id().clone();
                match renderer.handle(request, _ms(start), _cpu_ms() - parse_cpu_start) {
                    Ok(mut reply) => {
                        if let Some(metrics) = &mut reply.metrics {
                            metrics.input_bytes = line.len();
                        }
                        reply
                    }
                    Err(error) => _error(id, error),
                }
            }
            Err(error) => _error(serde_json::Value::Null, format!("invalid request: {error}")),
        };
        serde_json::to_writer(&mut *output, &reply).map_err(io::Error::other)?;
        output.write_all(b"\n")?;
        output.flush()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
