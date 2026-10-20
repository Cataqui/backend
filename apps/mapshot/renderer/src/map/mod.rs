//! Compiles authoritative vector tiles into Mapshot's fixed render-local scene.
//!
//! Resource reads and ICU segmentation remain with Node; projection, drawing
//! order, line stitching, label priority and fixed basemap appearance live here.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use base64::Engine;
use serde::Deserialize;

use self::style::{FeatureContext, Placement, StylePaint};
use self::vector_tile::{DecodedTile, Geometry};
use crate::landmark::{
    LandmarkBadge, LandmarkCandidate, LandmarkLabel, LandmarkLayoutCommand, LandmarkStyle,
};
use crate::scene::{Command, Scene};
use crate::text::{TextCommand, TextJustify};

mod style;
mod vector_tile;

type _Point = [f64; 2];
type _DrawPaths = Vec<Arc<[[f32; 2]]>>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct MapSceneInput {
    camera: _Camera,
    tiles: Vec<_TileInput>,
    landmarks: _LandmarksInput,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct _Camera {
    latitude: f64,
    longitude: f64,
    zoom: f64,
    width: f64,
    height: f64,
    pixel_ratio: f64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct _Address {
    z: u8,
    x: u32,
    y: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct _TileInput {
    key: String,
    address: _Address,
    #[serde(rename = "worldOffset", default)]
    world_offset: i64,
    bytes: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct _Coordinates {
    latitude: f64,
    longitude: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct _LandmarksInput {
    candidates: Vec<_LandmarkInput>,
    style: LandmarkStyle,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct _LandmarkInput {
    id: String,
    labels: Vec<LandmarkLabel>,
    coordinates: _Coordinates,
    badge: LandmarkBadge,
    #[serde(rename = "textColor")]
    text_color: String,
    rank: f64,
    #[serde(rename = "sourceMinZoom")]
    source_min_zoom: Option<f64>,
}

struct _CachedTile {
    key: String,
    tile: Arc<DecodedTile>,
    bytes: usize,
}

struct _ProjectedTile {
    tile: Arc<DecodedTile>,
    x: f64,
    y: f64,
    size: f64,
    clip: [f64; 4],
}

#[derive(Default)]
struct _Projection {
    draw: Option<_DrawPaths>,
    symbols: Option<Vec<Vec<_Point>>>,
}

struct _LabelCandidate {
    command: TextCommand,
    path: Option<Vec<_Point>>,
    point: _Point,
    key: String,
    spacing: f64,
    size: f64,
}

/// Retains decoded tiles using the same pinned identity and byte budget as the
/// authoritative reader. Every request reaches that reader before this cache.
#[derive(Default)]
pub(super) struct SceneCompiler {
    _tiles: VecDeque<_CachedTile>,
    _cached_bytes: usize,
}

impl SceneCompiler {
    pub(super) fn compile(&mut self, input: MapSceneInput) -> Result<Scene, String> {
        let camera = &input.camera;
        let mut projected = Vec::with_capacity(input.tiles.len());
        let world = 512.0 * 2.0_f64.powf(camera.zoom);
        let center = Self::_project(camera.longitude, camera.latitude, camera.zoom);
        for tile in input.tiles {
            let size = 512.0 * 2.0_f64.powf(camera.zoom - f64::from(tile.address.z));
            let mut offset = f64::from(tile.address.x) * size - center[0];
            if offset > world / 2.0 {
                offset -= world;
            }
            if offset < -world / 2.0 {
                offset += world;
            }
            let x = offset + tile.world_offset as f64 * world + camera.width / 2.0;
            let y = f64::from(tile.address.y) * size - center[1] + camera.height / 2.0;
            let clip = [x, y, x + size, y + size];
            if !size.is_finite() || clip.iter().any(|value| !value.is_finite()) {
                return Err("map tile projection must be finite".into());
            }
            projected.push(_ProjectedTile {
                tile: 'decoded_tile: {
                    let input = tile;
                    if let Some(index) = self._tiles.iter().position(|entry| entry.key == input.key)
                    {
                        let cached = self
                            ._tiles
                            .remove(index)
                            .ok_or("invalid decoded tile cache")?;
                        let tile = Arc::clone(&cached.tile);
                        self._tiles.push_back(cached);
                        break 'decoded_tile tile;
                    }
                    let bytes = base64::engine::general_purpose::STANDARD
                        .decode(input.bytes)
                        .map_err(|_| "invalid vector tile base64")?;
                    let tile = Arc::new(self::vector_tile::decode(&bytes)?);
                    let maximum_cache_bytes = 64 * 1024 * 1024;
                    if bytes.len() <= maximum_cache_bytes {
                        while self._tiles.len() >= 128
                            || self._cached_bytes + bytes.len() > maximum_cache_bytes
                        {
                            let oldest = self
                                ._tiles
                                .pop_front()
                                .ok_or("invalid decoded tile cache budget")?;
                            self._cached_bytes -= oldest.bytes;
                        }
                        self._cached_bytes += bytes.len();
                        self._tiles.push_back(_CachedTile {
                            key: input.key,
                            tile: Arc::clone(&tile),
                            bytes: bytes.len(),
                        });
                    }
                    tile
                },
                x: x,
                y: y,
                size: size,
                clip: clip,
            });
        }
        let mut landmarks = Some(input.landmarks);
        let mut commands = Vec::new();
        let mut projections = HashMap::<(usize, usize), _Projection>::new();
        for (layer_index, layer) in style::LAYERS.iter().copied().enumerate() {
            if !layer.visible(camera.zoom) {
                continue;
            }
            if layer.is_landmark_boundary()
                && let Some(candidates) = landmarks
                    .take()
                    .filter(|landmarks| !landmarks.candidates.is_empty())
            {
                commands.push({
                    let world = 512.0 * 2.0_f64.powf(camera.zoom);
                    let center = Self::_project(camera.longitude, camera.latitude, camera.zoom);
                    let mut projected = Vec::with_capacity(candidates.candidates.len());
                    for candidate in candidates.candidates {
                        let point = Self::_project(
                            candidate.coordinates.longitude,
                            candidate.coordinates.latitude,
                            camera.zoom,
                        );
                        projected.push(LandmarkCandidate {
                            id: candidate.id,
                            labels: candidate.labels,
                            center: [
                                (((point[0] - center[0] + world / 2.0) % world + world) % world)
                                    - world / 2.0
                                    + camera.width / 2.0,
                                point[1] - center[1] + camera.height / 2.0,
                            ],
                            badge: candidate.badge,
                            text_color: candidate.text_color,
                            rank: candidate.rank,
                            source_min_zoom: candidate.source_min_zoom,
                        });
                    }
                    Command::Landmarks {
                        layout: Box::new(LandmarkLayoutCommand {
                            candidates: projected,
                            style: candidates.style,
                            view_zoom: camera.zoom,
                            priority: layer_index as f64 * 100000.0 - 1.0,
                        }),
                    }
                });
            }
            let Some(source_layer) = layer.source_layer() else {
                continue;
            };
            let mut candidates = Vec::new();
            for (tile_index, tile) in projected.iter().enumerate() {
                let features = tile.tile.features(source_layer)?;
                for record in features {
                    let unit = tile.size / record.extent;
                    let margin = if layer.is_symbol() { 160.0 } else { 4.0 };
                    if !Self::_intersects(record.bounds, tile, unit, camera, margin) {
                        continue;
                    }
                    let context = FeatureContext {
                        properties: &record.properties,
                        geometry_type: record.geometry_type,
                        zoom: camera.zoom,
                    };
                    if !layer.selected(&context)? {
                        continue;
                    }
                    let geometry = record.geometry()?;
                    let projection = projections
                        .entry((tile_index, std::ptr::from_ref(record) as usize))
                        .or_default();
                    let has_visible_geometry = if layer.is_symbol() {
                        !projection
                            .symbols
                            .get_or_insert_with(|| {
                                Self::_project_paths(geometry, tile, unit, camera, true)
                            })
                            .is_empty()
                    } else {
                        !Self::_draw_paths(projection, geometry, tile, unit, camera)?.is_empty()
                    };
                    if !has_visible_geometry {
                        continue;
                    }
                    let Some(paint) = layer.paint_selected(&context)? else {
                        continue;
                    };
                    match paint {
                        StylePaint::Fill(paint) => {
                            let paths =
                                Self::_draw_paths(projection, geometry, tile, unit, camera)?;
                            commands.push(Command::Fill {
                                paths: paths.clone(),
                                color: paint.color.into(),
                                opacity: paint.opacity,
                                clip: Some(tile.clip.map(|value| value as f32)),
                            });
                        }
                        StylePaint::Stroke(paint) => {
                            let paths =
                                Self::_draw_paths(projection, geometry, tile, unit, camera)?;
                            commands.push(Command::Stroke {
                                paths: paths.clone(),
                                color: paint.color.into(),
                                width: paint.width,
                                opacity: paint.opacity,
                                dash: paint.dash.to_vec(),
                                cap: paint.cap,
                                join: paint.join,
                                clip: Some(tile.clip.map(|value| value as f32)),
                            });
                        }
                        StylePaint::Symbol(paint) => {
                            let paths = projection.symbols.get_or_insert_with(|| {
                                Self::_project_paths(geometry, tile, unit, camera, true)
                            });
                            let clip = tile.clip;
                            let command = TextCommand {
                                locality: matches!(
                                    layer,
                                    style::Layer::PlaceCity | style::Layer::PlaceNeighborhood
                                ),
                                landmark: None,
                                id: None,
                                edge_margin: None,
                                alternatives: Vec::new(),
                                collision_boxes: Vec::new(),
                                text: paint.text.clone(),
                                x: Some(0.0),
                                y: Some(0.0),
                                size: paint.size as f32,
                                weight: paint.weight,
                                color: paint.color.into(),
                                halo_color: Some(paint.halo_color.into()),
                                halo_width: paint.halo_width as f32,
                                angle: 0.0,
                                path: None,
                                anchor: "center".into(),
                                justify: TextJustify::Center,
                                letter_spacing: paint.letter_spacing as f32,
                                max_width: Some(paint.max_width as f32),
                                line_height: Some(paint.line_height as f32),
                                padding: paint.padding as f32,
                                collide: true,
                                priority: layer_index as f64 * 100000.0 - paint.sort_key,
                                max_angle: if paint.placement == Placement::Line {
                                    Some(paint.max_angle as f32)
                                } else {
                                    None
                                },
                                opacity: 1.0,
                                clip: None,
                            };
                            for path in paths {
                                if paint.placement == Placement::Line {
                                    for clipped in {
                                        let mut output = Vec::new();
                                        let mut current: Vec<_Point> = Vec::new();
                                        for segment in path.windows(2) {
                                            let [a, b] = [segment[0], segment[1]];
                                            let [dx, dy] = [b[0] - a[0], b[1] - a[1]];
                                            let (mut t0, mut t1) = (0.0_f64, 1.0_f64);
                                            let mut visible = true;
                                            for [p, q] in [
                                                [-dx, a[0] - clip[0]],
                                                [dx, clip[2] - a[0]],
                                                [-dy, a[1] - clip[1]],
                                                [dy, clip[3] - a[1]],
                                            ] {
                                                if p == 0.0 {
                                                    if q < 0.0 {
                                                        visible = false;
                                                    }
                                                    continue;
                                                }
                                                let t = q / p;
                                                if p < 0.0 {
                                                    t0 = t0.max(t);
                                                } else {
                                                    t1 = t1.min(t);
                                                }
                                                if t0 > t1 {
                                                    visible = false;
                                                }
                                            }
                                            if !visible {
                                                if current.len() > 1 {
                                                    output.push(std::mem::take(&mut current));
                                                } else {
                                                    current.clear();
                                                }
                                                continue;
                                            }
                                            let from = [a[0] + t0 * dx, a[1] + t0 * dy];
                                            let to = [a[0] + t1 * dx, a[1] + t1 * dy];
                                            if current.last().is_some_and(|last| {
                                                (last[0] - from[0]).hypot(last[1] - from[1]) > 0.1
                                            }) {
                                                if current.len() > 1 {
                                                    output.push(std::mem::take(&mut current));
                                                } else {
                                                    current.clear();
                                                }
                                            }
                                            if current.is_empty() {
                                                current.push(from);
                                            }
                                            current.push(to);
                                        }
                                        if current.len() > 1 {
                                            output.push(current);
                                        }
                                        output
                                    } {
                                        candidates.push(_LabelCandidate {
                                            command: command.clone(),
                                            path: Some(clipped),
                                            point: [0.0, 0.0],
                                            key: paint.text.clone(),
                                            spacing: paint.spacing,
                                            size: paint.size,
                                        });
                                    }
                                } else {
                                    for point in path {
                                        if point[0] < 0.0
                                            || point[0] > camera.width
                                            || point[1] < 0.0
                                            || point[1] > camera.height
                                        {
                                            continue;
                                        }
                                        candidates.push(_LabelCandidate {
                                            command: command.clone(),
                                            path: None,
                                            point: *point,
                                            key: format!(
                                                "{}:{}:{}",
                                                paint.text,
                                                Self::_round(point[0]) as i64,
                                                Self::_round(point[1]) as i64
                                            ),
                                            spacing: 0.0,
                                            size: paint.size,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            let mut placed = {
                enum PathJoin {
                    Append,
                    AppendReversed,
                    Prepend,
                    PrependReversed,
                }

                let mut output = Vec::new();
                let mut groups: Vec<VecDeque<(_LabelCandidate, Vec<_Point>)>> = Vec::new();
                let mut group_indices = HashMap::new();
                let mut points = HashSet::new();
                for mut candidate in candidates {
                    let Some(path) = candidate.path.take() else {
                        if points.insert(candidate.key) {
                            candidate.command.x = Some(candidate.point[0] as f32);
                            candidate.command.y = Some(candidate.point[1] as f32);
                            output.push(candidate.command);
                        }
                        continue;
                    };
                    let next_index = groups.len();
                    let index = *group_indices
                        .entry(candidate.key.clone())
                        .or_insert_with(|| {
                            groups.push(VecDeque::new());
                            next_index
                        });
                    groups[index].push_back((candidate, path));
                }
                for mut group in groups {
                    while let Some((candidate, mut path)) = group.pop_front() {
                        while let Some((index, join)) =
                            group.iter().enumerate().find_map(|(index, (_, next))| {
                                let (first, last, next_first, next_last) =
                                    (path[0], path[path.len() - 1], next[0], next[next.len() - 1]);
                                let near = |a: _Point, b: _Point| -> bool {
                                    (a[0] - b[0]).hypot(a[1] - b[1]) < 0.5
                                };
                                if near(last, next_first) {
                                    return Some((index, PathJoin::Append));
                                }
                                if near(last, next_last) {
                                    return Some((index, PathJoin::AppendReversed));
                                }
                                if near(first, next_last) {
                                    return Some((index, PathJoin::Prepend));
                                }
                                if near(first, next_first) {
                                    return Some((index, PathJoin::PrependReversed));
                                }
                                None
                            })
                        {
                            let next = &group[index].1;
                            match join {
                                PathJoin::Append => path.extend_from_slice(&next[1..]),
                                PathJoin::AppendReversed => {
                                    path.extend(next.iter().rev().skip(1).copied())
                                }
                                PathJoin::Prepend => {
                                    path.splice(0..0, next[..next.len() - 1].iter().copied());
                                }
                                PathJoin::PrependReversed => {
                                    path.splice(
                                        0..0,
                                        next.iter().rev().take(next.len() - 1).copied(),
                                    );
                                }
                            }
                            group.remove(index);
                        }
                        let length = path
                            .windows(2)
                            .map(|segment| {
                                (segment[1][0] - segment[0][0]).hypot(segment[1][1] - segment[0][1])
                            })
                            .sum::<f64>();
                        if length < candidate.size * 2.0 {
                            continue;
                        }
                        let count = (length / candidate.spacing).floor().max(1.0) as usize;
                        let raster_path = path
                            .iter()
                            .map(|point| point.map(|value| value as f32))
                            .collect::<Vec<_>>();
                        for repeat in 0..count {
                            let target = length * (repeat as f64 + 0.5) / count as f64;
                            let mut walked = 0.0;
                            for segment in path.windows(2) {
                                let (a, b) = (segment[0], segment[1]);
                                let distance = (b[0] - a[0]).hypot(b[1] - a[1]);
                                if walked + distance >= target {
                                    let ratio = (target - walked) / distance;
                                    let mut command = candidate.command.clone();
                                    command.path = Some(raster_path.clone());
                                    command.x = Some((a[0] + ratio * (b[0] - a[0])) as f32);
                                    command.y = Some((a[1] + ratio * (b[1] - a[1])) as f32);
                                    output.push(command);
                                    break;
                                }
                                walked += distance;
                            }
                        }
                    }
                }
                output
            };
            placed.sort_by(|left, right| right.priority.total_cmp(&left.priority));
            let count = placed.len();
            for (index, mut text) in placed.into_iter().enumerate() {
                text.priority =
                    layer_index as f64 * 100000.0 + (count - index) as f64 / (count + 1) as f64;
                commands.push(Command::Text {
                    text: Box::new(text),
                });
            }
        }
        Ok(Scene {
            width: camera.width,
            height: camera.height,
            pixel_ratio: camera.pixel_ratio,
            background: style::BACKGROUND.into(),
            commands: commands,
        })
    }

    fn _project(longitude: f64, latitude: f64, zoom: f64) -> _Point {
        let world = 512.0 * 2.0_f64.powf(zoom);
        [
            ((longitude + 180.0) / 360.0) * world,
            ((1.0
                - (latitude * std::f64::consts::PI / 180.0).tan().asinh() / std::f64::consts::PI)
                / 2.0)
                * world,
        ]
    }

    fn _intersects(
        bounds: [f64; 4],
        tile: &_ProjectedTile,
        unit: f64,
        camera: &_Camera,
        margin: f64,
    ) -> bool {
        tile.x + bounds[2] * unit >= -margin
            && tile.y + bounds[3] * unit >= -margin
            && tile.x + bounds[0] * unit <= camera.width + margin
            && tile.y + bounds[1] * unit <= camera.height + margin
    }

    fn _project_paths(
        geometry: &Geometry,
        tile: &_ProjectedTile,
        unit: f64,
        camera: &_Camera,
        symbols: bool,
    ) -> Vec<Vec<_Point>> {
        geometry
            .paths
            .iter()
            .zip(&geometry.path_bounds)
            .filter(|(_, bounds)| {
                symbols || Self::_intersects(**bounds, tile, unit, camera, 4.0 + 1.0 / 64.0)
            })
            .map(|path| {
                path.0
                    .iter()
                    .map(|point| {
                        [
                            Self::_round((tile.x + point[0] * unit) * 64.0) / 64.0,
                            Self::_round((tile.y + point[1] * unit) * 64.0) / 64.0,
                        ]
                    })
                    .collect::<Vec<_Point>>()
            })
            .filter(|path| {
                symbols || {
                    let bounds = path.iter().fold(
                        [
                            f64::INFINITY,
                            f64::INFINITY,
                            f64::NEG_INFINITY,
                            f64::NEG_INFINITY,
                        ],
                        |bounds, point| {
                            [
                                bounds[0].min(point[0]),
                                bounds[1].min(point[1]),
                                bounds[2].max(point[0]),
                                bounds[3].max(point[1]),
                            ]
                        },
                    );
                    bounds[2] >= -4.0
                        && bounds[3] >= -4.0
                        && bounds[0] <= camera.width + 4.0
                        && bounds[1] <= camera.height + 4.0
                }
            })
            .collect()
    }

    fn _round(value: f64) -> f64 {
        // Adding 0.5 first can round a value immediately below a half upward.
        let floor = value.floor();
        if value - floor < 0.5 {
            floor
        } else {
            floor + 1.0
        }
    }

    fn _draw_paths<'a>(
        projection: &'a mut _Projection,
        geometry: &Geometry,
        tile: &_ProjectedTile,
        unit: f64,
        camera: &_Camera,
    ) -> Result<&'a _DrawPaths, String> {
        if projection.draw.is_none() {
            let paths = Self::_project_paths(geometry, tile, unit, camera, false);
            projection.draw = Some(
                paths
                    .into_iter()
                    .map(|path| {
                        let points = path
                            .into_iter()
                            .map(|point| {
                                let converted = point
                                    .map(|value| if value == 0.0 { 0.0 } else { value as f32 });
                                if converted.iter().any(|value| !value.is_finite()) {
                                    return Err(
                                        "map coordinates must be finite float32 values".to_string()
                                    );
                                }
                                Ok(converted)
                            })
                            .collect::<Result<Vec<_>, String>>()?;
                        Ok(Arc::from(points))
                    })
                    .collect::<Result<_DrawPaths, String>>()?,
            );
        }
        projection
            .draw
            .as_ref()
            .ok_or("missing projected geometry".into())
    }
}

#[cfg(test)]
mod tests;
