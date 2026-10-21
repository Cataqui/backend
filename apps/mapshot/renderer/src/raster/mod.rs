//! Geometry rasterization into device-integer clip rectangles.
//! The caller supplies the fresh scene background. Each disjoint clip is drawn
//! without an alpha mask and copied back without filtering. Integer origin shifts
//! and earlier vector clipping can change edge antialiasing from full-frame draw.

mod shadow;
mod webp;

pub(super) use shadow::{badge_shadow, text_shadow};
pub(super) use webp::encode_webp;

use std::collections::HashMap;

use serde::Serialize;
use tiny_skia::{FillRule, Mask, PathBuilder, Pixmap, Rect, Transform};

use crate::scene::{_color, _draw_geometry, Command, Scene};

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Metrics {
    pub(super) workers: usize,
    pub(super) clip_groups: usize,
    pub(super) roi_pixels: u64,
    pub(super) frame_pixels: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Bounds {
    _x: u32,
    _y: u32,
    _width: u32,
    _height: u32,
}

struct Group<'a> {
    _commands: Vec<&'a Command>,
    _bounds: Option<Bounds>,
    _cost: usize,
    _worker: usize,
}

pub(super) fn draw_geometry(
    scene: &Scene,
    target: &mut Pixmap,
    workers: usize,
) -> Result<Metrics, String> {
    let (width, height) = (target.width(), target.height());
    let background = _color(&scene.background, 1.0)?;
    if background.alpha() != 1.0 {
        return Err("ROI geometry requires an opaque scene background".to_string());
    }
    let density = scene.pixel_ratio as f32;
    let transform = Transform::from_scale(density, density);
    let mut labels_started = false;
    let mut groups = Vec::<Group<'_>>::new();
    let mut keys = HashMap::<[u32; 4], usize>::new();
    let mut mask = Mask::new(width, height).ok_or("cannot allocate ROI clip mask")?;
    for command in &scene.commands {
        let (clip, cost) = match command {
            Command::Landmarks { .. } => return Err("landmark command was not expanded".into()),
            Command::Fill { clip, paths, .. } => (clip, paths.iter().map(|path| path.len()).sum()),
            Command::Stroke { clip, paths, .. } => {
                (clip, paths.iter().map(|path| path.len()).sum::<usize>() * 2)
            }
            Command::Text { .. } | Command::Image { .. } => {
                labels_started = true;
                continue;
            }
        };
        if labels_started {
            return Err("ROI geometry requires geometry before labels and markers".to_string());
        }
        let clip = clip.ok_or("ROI geometry requires a clip for every path")?;
        let key = clip.map(f32::to_bits);
        let index = if let Some(index) = keys.get(&key) {
            *index
        } else {
            let rect = Rect::from_ltrb(clip[0], clip[1], clip[2], clip[3])
                .ok_or("invalid ROI clip rectangle")?;
            mask.data_mut().fill(0);
            mask.fill_path(
                &PathBuilder::from_rect(rect),
                FillRule::Winding,
                false,
                transform,
            );
            let bounds = _bounds(&mask)?;
            if bounds.is_some_and(|bounds| {
                groups
                    .iter()
                    .filter_map(|group| group._bounds)
                    .any(|other| {
                        bounds._x < other._x + other._width
                            && bounds._x + bounds._width > other._x
                            && bounds._y < other._y + other._height
                            && bounds._y + bounds._height > other._y
                    })
            }) {
                return Err("ROI geometry requires disjoint clip rectangles".to_string());
            }
            let index = groups.len();
            keys.insert(key, index);
            groups.push(Group {
                _commands: Vec::new(),
                _bounds: bounds,
                _cost: 0,
                _worker: 0,
            });
            index
        };
        groups[index]._commands.push(command);
        groups[index]._cost += cost;
    }
    drop(mask);
    let available = std::thread::available_parallelism().map_or(1, usize::from);
    let workers = workers.min(available).min(groups.len()).max(1);
    let mut loads = vec![0_usize; workers];
    let mut indices = (0..groups.len()).collect::<Vec<_>>();
    indices.sort_by_key(|index| std::cmp::Reverse(groups[*index]._cost));
    for index in indices {
        let worker = loads
            .iter()
            .enumerate()
            .min_by_key(|(_, load)| *load)
            .map(|(index, _)| index)
            .unwrap_or(0);
        groups[index]._worker = worker;
        loads[worker] += groups[index]._cost;
    }
    let outputs = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for worker in 1..workers {
            let groups = &groups;
            handles.push(scope.spawn(move || _draw_groups(groups, worker, density, background)));
        }
        let mut outputs = _draw_groups(&groups, 0, density, background)?;
        for handle in handles {
            outputs.extend(
                handle
                    .join()
                    .map_err(|_| "ROI geometry worker panicked".to_string())??,
            );
        }
        Ok::<_, String>(outputs)
    })?;
    for (bounds, image) in &outputs {
        let row_bytes = bounds._width as usize * 4;
        for (row, source) in image.data().chunks_exact(row_bytes).enumerate() {
            let first = ((bounds._y as usize + row) * width as usize + bounds._x as usize) * 4;
            target.data_mut()[first..first + row_bytes].copy_from_slice(source);
        }
    }
    Ok(Metrics {
        workers: workers,
        clip_groups: groups.len(),
        roi_pixels: outputs
            .iter()
            .map(|(bounds, _)| u64::from(bounds._width) * u64::from(bounds._height))
            .sum(),
        frame_pixels: u64::from(width) * u64::from(height),
    })
}

fn _bounds(mask: &Mask) -> Result<Option<Bounds>, String> {
    let mut result: Option<Bounds> = None;
    let mut ended = false;
    for (y, row) in mask.data().chunks_exact(mask.width() as usize).enumerate() {
        let Some(x) = row.iter().position(|coverage| *coverage != 0) else {
            if result.is_some() {
                ended = true;
            }
            continue;
        };
        if ended {
            return Err("ROI geometry requires rectangular binary clip masks".to_string());
        }
        let end = row
            .iter()
            .rposition(|coverage| *coverage != 0)
            .ok_or("ROI clip row is inconsistent")?
            + 1;
        if row[x..end].iter().any(|coverage| *coverage != 255) {
            return Err("ROI geometry requires rectangular binary clip masks".to_string());
        }
        if let Some(bounds) = &mut result {
            if bounds._x as usize != x || bounds._width as usize != end - x {
                return Err("ROI geometry requires rectangular binary clip masks".to_string());
            }
            bounds._height += 1;
        } else {
            result = Some(Bounds {
                _x: x as u32,
                _y: y as u32,
                _width: (end - x) as u32,
                _height: 1,
            });
        }
    }
    Ok(result)
}

fn _draw_groups(
    groups: &[Group<'_>],
    worker: usize,
    density: f32,
    background: tiny_skia::Color,
) -> Result<Vec<(Bounds, Pixmap)>, String> {
    let mut outputs = Vec::new();
    for group in groups {
        if group._worker != worker {
            continue;
        }
        let Some(bounds) = group._bounds else {
            // Keep ordinary invalid-paint/dash failures visible even when the
            // clip is outside the frame and no pixels can be copied back.
            let mut empty = Pixmap::new(1, 1).ok_or("cannot allocate empty ROI")?;
            for command in &group._commands {
                _draw_geometry(
                    command,
                    &mut empty,
                    Transform::from_scale(density, density),
                    None,
                )?;
            }
            continue;
        };
        let mut image =
            Pixmap::new(bounds._width, bounds._height).ok_or("cannot allocate geometry ROI")?;
        image.fill(background);
        let transform = Transform::from_row(
            density,
            0.0,
            0.0,
            density,
            -(bounds._x as f32),
            -(bounds._y as f32),
        );
        for command in &group._commands {
            _draw_geometry(command, &mut image, transform, None)?;
        }
        outputs.push((bounds, image));
    }
    Ok(outputs)
}

#[cfg(test)]
mod tests;
