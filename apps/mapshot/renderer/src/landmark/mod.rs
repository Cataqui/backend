mod selection;

pub(super) use selection::{Coverage, LandmarkReference, Selection};

use crate::text::{TextAlternative, TextCommand, TextEngine, TextJustify};
use serde::Deserialize;
use std::{path::PathBuf, sync::Arc};

/// One source-level batch: the engine owns all visual landmark decisions.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LandmarkLayoutCommand {
    pub candidates: Vec<LandmarkCandidate>,
    pub style: LandmarkStyle,
    pub view_zoom: f64,
    pub priority: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LandmarkCandidate {
    pub id: String,
    pub labels: Vec<LandmarkLabel>,
    pub center: [f64; 2],
    pub badge: LandmarkBadge,
    pub text_color: String,
    pub rank: f64,
    pub source_min_zoom: Option<f64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LandmarkLabel {
    pub text: String,
    // Exact ICU segmentation from the qualified Node runtime, in UTF-8 bytes.
    // Preserve dictionary boundaries and grapheme versions without duplicating ICU.
    pub word_ends: Vec<usize>,
    pub grapheme_ends: Vec<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LandmarkBadge {
    pub path: PathBuf,
    pub logical_size: f64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LandmarkStyle {
    pub badge_radius: f64,
    pub badge_stroke_width: f64,
    pub label_gap: f64,
    pub edge_margin: f64,
    pub label_font_size: f64,
    pub label_max_width: f64,
    pub label_max_lines: usize,
    pub label_line_height: f64,
    pub label_letter_spacing: f64,
    pub label_halo_width: f64,
}

pub(super) struct PreparedLandmark {
    pub text: Box<TextCommand>,
    pub image: PreparedBadge,
}

pub(super) struct PreparedBadge {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub path: PathBuf,
    pub label_id: String,
}

pub(super) fn expand(command: &LandmarkLayoutCommand, viewport: [f64; 2]) -> Vec<PreparedLandmark> {
    let style = &command.style;
    let mut candidates = command.candidates.iter().collect::<Vec<_>>();
    candidates.sort_by(|left, right| left.id.cmp(&right.id));
    let shared_style = Arc::new(style.clone());
    let mut prepared = Vec::with_capacity(candidates.len());
    for candidate in candidates {
        let [x, y] = candidate.center;
        let radius = style.badge_radius;
        let label_offset = radius + style.label_gap;
        let half_height = radius + style.badge_stroke_width;
        if x - radius < style.edge_margin
            || x + radius > viewport[0] - style.edge_margin
            || y - half_height < style.edge_margin
            || y + half_height > viewport[1] - style.edge_margin
        {
            continue;
        }
        let half = candidate.badge.logical_size / 2.0;
        let text = TextCommand {
            landmark: Some(Arc::new(LandmarkTextInput {
                labels: candidate.labels.clone(),
                reference: LandmarkReference {
                    anchor: candidate.center,
                    source_min_zoom: candidate.source_min_zoom,
                    view_zoom: command.view_zoom,
                    font_size: style.label_font_size,
                },
                rank: candidate.rank,
                radius: radius,
                style: shared_style.clone(),
            })),
            locality: false,
            id: Some(candidate.id.clone()),
            edge_margin: Some(style.edge_margin as f32),
            alternatives: vec![
                TextAlternative {
                    x: (x + label_offset) as f32,
                    y: y as f32,
                    anchor: "left".into(),
                },
                TextAlternative {
                    x: (x - label_offset) as f32,
                    y: y as f32,
                    anchor: "right".into(),
                },
            ],
            collision_boxes: vec![[
                (x - half - 2.0) as f32,
                (y - half - 2.0) as f32,
                (x + half + 2.0) as f32,
                (y + half + 2.0) as f32,
            ]],
            // Shape source labels only when their badge remains admissible.
            text: String::new(),
            x: Some((x + label_offset) as f32),
            y: Some(y as f32),
            size: style.label_font_size as f32,
            weight: 600,
            color: candidate.text_color.clone(),
            halo_color: Some("#ffffff".into()),
            halo_width: 1.1,
            angle: 0.0,
            path: None,
            anchor: "left".into(),
            justify: TextJustify::Auto,
            letter_spacing: style.label_letter_spacing as f32,
            max_width: Some(style.label_max_width as f32),
            line_height: Some(style.label_line_height as f32),
            padding: 2.0,
            collide: true,
            priority: command.priority,
            max_angle: None,
            opacity: 1.0,
            clip: None,
        };
        prepared.push(PreparedLandmark {
            text: Box::new(text),
            image: PreparedBadge {
                x: (x - half) as f32,
                y: (y - half) as f32,
                width: candidate.badge.logical_size as f32,
                height: candidate.badge.logical_size as f32,
                path: candidate.badge.path.clone(),
                label_id: candidate.id.clone(),
            },
        });
    }
    prepared
}

#[derive(Clone, Debug)]
pub(super) struct LandmarkTextInput {
    labels: Vec<LandmarkLabel>,
    pub reference: LandmarkReference,
    pub rank: f64,
    radius: f64,
    style: Arc<LandmarkStyle>,
}

/// Called only after collision priority admission, avoiding work for
/// candidates that cannot be displayed. Shaping caches remain TextEngine-owned.
pub(super) fn prepare_text(
    command: &TextCommand,
    viewport: [f64; 2],
    text_engine: &mut TextEngine,
) -> Result<Option<TextCommand>, String> {
    let Some(options) = &command.landmark else {
        return Ok(Some(command.clone()));
    };
    'labels: for label in &options.labels {
        if !label.text.chars().any(crate::text::_visible_character) {
            continue;
        }
        let mut prepared = command.clone();
        prepared.landmark = None;
        prepared.text = label.text.clone();
        let mut admission = prepared.clone();
        admission.max_width = None;
        admission.letter_spacing = 0.0;
        if !text_engine.supports(&admission)? {
            continue;
        }
        let style = options.style.as_ref();
        let radius = options.radius;
        let mut measuring = prepared.clone();
        measuring.max_width = None;
        measuring.letter_spacing = 0.0;
        let limit = style.label_max_width / 1.15;
        let mut lines = Vec::<(String, usize)>::new();
        let mut current = String::new();
        let mut current_start = 0;
        let trim_line = |text: &str, source_start: usize| -> (String, usize) {
            let leading = text.len() - text.trim_start().len();
            (text.trim().to_owned(), source_start + leading)
        };
        let mut start = 0;
        'words: for end in &label.word_ends {
            let part = prepared
                .text
                .get(start..*end)
                .ok_or("invalid landmark word boundary")?;
            if current.is_empty() {
                current_start = start;
            }
            let next = format!("{current}{part}");
            let Some(next_width) = _width(&next, &mut measuring, text_engine)? else {
                continue 'labels;
            };
            if next_width <= limit {
                current = next;
                start = *end;
                continue;
            }
            if !current.trim().is_empty() {
                lines.push(trim_line(&current, current_start));
                current.clear();
                current_start = start;
                if lines.len() > style.label_max_lines {
                    break;
                }
            }
            let Some(part_width) = _width(part, &mut measuring, text_engine)? else {
                continue 'labels;
            };
            if part_width <= limit {
                current = part.to_owned();
                start = *end;
                continue;
            }
            let mut grapheme_start = start;
            for grapheme_end in label
                .grapheme_ends
                .iter()
                .copied()
                .filter(|value| *value > start && *value <= *end)
            {
                let grapheme = prepared
                    .text
                    .get(grapheme_start..grapheme_end)
                    .ok_or("invalid landmark grapheme boundary")?;
                if current.is_empty() {
                    current_start = grapheme_start;
                }
                let next = format!("{current}{grapheme}");
                let Some(next_width) = _width(&next, &mut measuring, text_engine)? else {
                    continue 'labels;
                };
                if !current.is_empty() && next_width > limit {
                    lines.push(trim_line(&current, current_start));
                    current.clear();
                    current_start = grapheme_start;
                    if lines.len() > style.label_max_lines {
                        break 'words;
                    }
                }
                current.push_str(grapheme);
                grapheme_start = grapheme_end;
            }
            start = *end;
        }
        if !current.trim().is_empty() {
            lines.push(trim_line(&current, current_start));
        }
        if lines.len() > style.label_max_lines {
            lines.truncate(style.label_max_lines);
            let last = lines.last_mut().ok_or("missing landmark line")?;
            let end = last.1 + last.0.len();
            let previous = label
                .grapheme_ends
                .iter()
                .rev()
                .copied()
                .find(|boundary| *boundary > last.1 && *boundary < end)
                .unwrap_or(last.1);
            last.0.truncate(previous - last.1);
            last.0 = format!("{}…", last.0.trim_end());
        }
        let mut width = 0.0_f64;
        for (line, _) in &lines {
            let Some(line_width) = _width(line, &mut measuring, text_engine)? else {
                continue 'labels;
            };
            width = width.max(line_width * 1.15);
        }
        if !lines.is_empty() {
            width += style.label_halo_width;
        }
        let height = lines.len() as f64 * style.label_line_height;
        let half_height =
            (radius + style.badge_stroke_width).max(height / 2.0 + style.label_halo_width);
        let [x, y] = options.reference.anchor;
        if y - half_height < style.edge_margin || y + half_height > viewport[1] - style.edge_margin
        {
            return Ok(None);
        }
        let extent = radius + style.label_gap + width + style.label_halo_width;
        prepared
            .alternatives
            .retain(|alternative| match alternative.anchor.as_str() {
                "left" => x + extent <= viewport[0] - style.edge_margin,
                "right" => x - extent >= style.edge_margin,
                _ => false,
            });
        let Some(first) = prepared.alternatives.first() else {
            return Ok(None);
        };
        // Keep the prepared prepared coherent when edge admission removes its
        // original side. Collision placement can still select a later alternative.
        prepared.x = Some(first.x);
        prepared.y = Some(first.y);
        prepared.anchor = first.anchor.clone();
        prepared.text = lines
            .iter()
            .map(|(line, _)| line.as_str())
            .collect::<Vec<_>>()
            .join("\n");

        // A line break can change contextual shaping; validate the actual
        // wrapped output with the same native fallback and outline checks.
        if !text_engine.supports(&prepared)? {
            continue;
        }
        return Ok(Some(prepared));
    }
    Ok(None)
}

fn _width(
    text: &str,
    measuring: &mut TextCommand,
    engine: &mut TextEngine,
) -> Result<Option<f64>, String> {
    measuring.text = text.to_owned();
    let measured = engine.measure(measuring)?;
    if measured.missing_glyphs != 0 {
        return Ok(None);
    }
    Ok(Some(f64::from(measured.width)))
}

#[cfg(test)]
mod tests;
