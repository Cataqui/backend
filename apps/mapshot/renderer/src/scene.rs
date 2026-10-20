//! Render-local scene model, geometry paint and landmark expansion.

use std::path::PathBuf;
use std::sync::Arc;

use serde::Deserialize;
use tiny_skia::{
    FillRule, LineCap, LineJoin, Mask, Paint, PathBuilder, Pixmap, Stroke, StrokeDash, Transform,
};

use crate::{landmark, text::TextCommand};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Scene {
    pub(super) width: f64,
    pub(super) height: f64,
    #[serde(default = "_one_f64")]
    pub(super) pixel_ratio: f64,
    pub(super) background: String,
    pub(super) commands: Vec<Command>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub(super) enum Command {
    Landmarks {
        #[serde(flatten)]
        layout: Box<landmark::LandmarkLayoutCommand>,
    },
    Fill {
        paths: Vec<Arc<[[f32; 2]]>>,
        color: String,
        #[serde(default = "_one")]
        opacity: f32,
        clip: Option<[f32; 4]>,
    },
    Stroke {
        paths: Vec<Arc<[[f32; 2]]>>,
        color: String,
        width: f32,
        #[serde(default = "_one")]
        opacity: f32,
        #[serde(default)]
        dash: Vec<f32>,
        #[serde(default)]
        cap: Cap,
        #[serde(default)]
        join: Join,
        clip: Option<[f32; 4]>,
    },
    Text {
        #[serde(flatten)]
        text: Box<TextCommand>,
    },
    Image {
        #[serde(skip)]
        landmark: bool,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        path: PathBuf,
        #[serde(default, rename = "labelId")]
        label_id: Option<String>,
        #[serde(default = "_one")]
        opacity: f32,
        clip: Option<[f32; 4]>,
    },
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum Cap {
    #[default]
    Round,
    Butt,
    Square,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum Join {
    #[default]
    Round,
    Miter,
    Bevel,
}

pub(super) fn _draw_geometry(
    command: &Command,
    pixmap: &mut Pixmap,
    transform: Transform,
    mask: Option<&Mask>,
) -> Result<(), String> {
    match command {
        Command::Fill {
            paths,
            color,
            opacity,
            ..
        } => {
            if let Some(path) = _path(paths, true) {
                pixmap.fill_path(
                    &path,
                    &_paint(color, *opacity)?,
                    FillRule::EvenOdd,
                    transform,
                    mask,
                );
            }
            Ok(())
        }
        Command::Stroke {
            paths,
            color,
            width,
            opacity,
            dash,
            cap,
            join,
            ..
        } => {
            if *width <= 0.0 {
                return Ok(());
            }
            let dash = if dash.is_empty() {
                None
            } else {
                Some(
                    StrokeDash::new(dash.iter().map(|value| value * width).collect(), 0.0)
                        .ok_or("invalid stroke dash")?,
                )
            };
            let stroke = Stroke {
                width: *width,
                line_cap: match cap {
                    Cap::Round => LineCap::Round,
                    Cap::Butt => LineCap::Butt,
                    Cap::Square => LineCap::Square,
                },
                line_join: match join {
                    Join::Round => LineJoin::Round,
                    Join::Miter => LineJoin::Miter,
                    Join::Bevel => LineJoin::Bevel,
                },
                dash: dash,
                ..Stroke::default()
            };
            if let Some(path) = _path(paths, false) {
                pixmap.stroke_path(&path, &_paint(color, *opacity)?, &stroke, transform, mask);
            }
            Ok(())
        }
        Command::Text { .. } | Command::Image { .. } => Ok(()),
        Command::Landmarks { .. } => Err("landmark command was not expanded".into()),
    }
}

pub(super) fn _path(paths: &[Arc<[[f32; 2]]>], closed: bool) -> Option<tiny_skia::Path> {
    let mut builder = PathBuilder::new();
    for points in paths {
        if points.len() < if closed { 3 } else { 2 } {
            continue;
        }
        builder.move_to(points[0][0], points[0][1]);
        for point in &points[1..] {
            builder.line_to(point[0], point[1]);
        }
        if closed {
            builder.close();
        }
    }
    builder.finish()
}

pub(super) fn _paint(color: &str, opacity: f32) -> Result<Paint<'static>, String> {
    Ok(Paint {
        shader: tiny_skia::Shader::SolidColor(_color(color, opacity)?),
        anti_alias: true,
        ..Paint::default()
    })
}

pub(super) fn _color(color: &str, opacity: f32) -> Result<tiny_skia::Color, String> {
    let parsed = color
        .parse::<csscolorparser::Color>()
        .map_err(|_| "invalid CSS color")?;
    tiny_skia::Color::from_rgba(
        parsed.r,
        parsed.g,
        parsed.b,
        parsed.a * opacity.clamp(0.0, 1.0),
    )
    .ok_or("invalid color components".to_string())
}

pub(super) fn _dimensions(scene: &Scene) -> Result<(u32, u32), String> {
    if scene.width <= 0.0 || scene.height <= 0.0 || scene.pixel_ratio <= 0.0 {
        return Err("width, height and pixelRatio must be positive".to_string());
    }
    let width = (scene.width * scene.pixel_ratio).floor();
    let height = (scene.height * scene.pixel_ratio).floor();
    if !width.is_finite()
        || !height.is_finite()
        || width < 1.0
        || height < 1.0
        || width > f64::from(libwebp_sys::WEBP_MAX_DIMENSION)
        || height > f64::from(libwebp_sys::WEBP_MAX_DIMENSION)
    {
        return Err("output dimensions must be positive finite WebP dimensions".to_string());
    }
    Ok((width as u32, height as u32))
}

pub(super) fn _one() -> f32 {
    1.0
}
pub(super) fn _one_f64() -> f64 {
    1.0
}
impl Scene {
    pub(super) fn expand_landmarks(&mut self) {
        let scene = self;
        let has_landmarks = scene
            .commands
            .iter()
            .any(|command| matches!(command, Command::Landmarks { .. }));
        if !has_landmarks {
            return;
        }
        let mut commands = Vec::with_capacity(scene.commands.len() + 192);
        for command in std::mem::take(&mut scene.commands) {
            match command {
                Command::Landmarks { layout } => {
                    for prepared in landmark::expand(&layout, [scene.width, scene.height]) {
                        let badge = prepared.image;
                        commands.push(Command::Image {
                            landmark: true,
                            x: badge.x,
                            y: badge.y,
                            width: badge.width,
                            height: badge.height,
                            path: badge.path,
                            label_id: Some(badge.label_id),
                            opacity: 1.0,
                            clip: None,
                        });
                        commands.push(Command::Text {
                            text: prepared.text,
                        });
                    }
                }
                command => commands.push(command),
            }
        }
        scene.commands = commands;
    }
}
