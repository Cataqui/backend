//! Persistent render orchestration, label placement and bounded image retention.

use std::borrow::Cow;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Instant;

use base64::Engine;
use tiny_skia::{FillRule, Mask, PathBuilder, Pixmap, PixmapPaint, Rect, Transform};

use crate::landmark::{Coverage, LandmarkReference, Selection};
use crate::protocol::{Metrics, Reply, Request};
use crate::scene::{_color, _dimensions, _draw_geometry, Command, Scene};
use crate::text::{Layout, TextAlternative, TextCommand, TextEngine, TextJustify};
use crate::{landmark, map, raster};

#[cfg(test)]
use crate::scene::_path;
#[cfg(test)]
use std::sync::Arc;

pub(super) struct Renderer {
    _text: TextEngine,
    _compiler: map::SceneCompiler,
    _assets: HashMap<(PathBuf, bool), _Asset>,
    _asset_bytes: usize,
}

struct _Asset {
    image: Pixmap,
    shadow: Option<Pixmap>,
}

struct _LandmarkPlacement<'a> {
    index: usize,
    source: &'a TextCommand,
    reference: &'a LandmarkReference,
    coverage: Coverage,
    layouts: Option<Vec<Layout>>,
}

struct _LandmarkChoice<'a> {
    candidate: usize,
    id: &'a str,
    score: f64,
    revision: Option<usize>,
    position: usize,
}

impl PartialEq for _LandmarkChoice<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.score.total_cmp(&other.score) == Ordering::Equal && self.id == other.id
    }
}

impl Eq for _LandmarkChoice<'_> {}

impl PartialOrd for _LandmarkChoice<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for _LandmarkChoice<'_> {
    fn cmp(&self, other: &Self) -> Ordering {
        self.score
            .total_cmp(&other.score)
            .then_with(|| other.id.cmp(self.id))
    }
}

impl Renderer {
    pub(super) fn new(font_dir: &Path) -> Result<Self, String> {
        let text = TextEngine::new(font_dir)?;
        Ok(Self {
            _text: text,
            _compiler: map::SceneCompiler::default(),
            _assets: HashMap::new(),
            _asset_bytes: 0,
        })
    }

    pub(super) fn handle(
        &mut self,
        request: Request,
        parse_ms: f64,
        parse_cpu_ms: f64,
    ) -> Result<Reply, String> {
        match request {
            Request::Render { id, map } => {
                let compile_start = Instant::now();
                let compile_cpu_start = _cpu_ms();
                let mut scene = self._compiler.compile(map)?;
                scene.expand_landmarks();
                let compile_ms = _ms(compile_start);
                let compile_cpu_ms = _cpu_ms() - compile_cpu_start;
                let mut reply = self._render(&id, &scene, parse_ms, parse_cpu_ms)?;
                if let Some(metrics) = &mut reply.metrics {
                    metrics.compile_ms = compile_ms;
                    metrics.render_ms += compile_ms;
                    metrics.total_ms += compile_ms;
                    metrics.cpu_ms += compile_cpu_ms;
                }
                Ok(reply)
            }
            Request::Ready { id } => {
                let scene = Scene {
                    width: 16.0,
                    height: 16.0,
                    pixel_ratio: 1.0,
                    background: "#ffffff".into(),
                    commands: vec![Command::Text {
                        text: Box::new(TextCommand {
                            landmark: None,
                            locality: false,
                            id: None,
                            edge_margin: None,
                            alternatives: Vec::new(),
                            collision_boxes: Vec::new(),
                            text: "Aa".into(),
                            x: Some(8.0),
                            y: Some(8.0),
                            size: 12.0,
                            weight: 600,
                            color: "#333333".into(),
                            halo_color: Some("#ffffff".into()),
                            halo_width: 0.0,
                            angle: 0.0,
                            path: None,
                            anchor: "center".into(),
                            justify: TextJustify::Center,
                            letter_spacing: 0.0,
                            max_width: Some(100.0),
                            line_height: Some(14.0),
                            padding: 0.0,
                            collide: false,
                            priority: 0.0,
                            max_angle: None,
                            opacity: 1.0,
                            clip: None,
                        }),
                    }],
                };
                self._render(&id, &scene, parse_ms, parse_cpu_ms)
            }
        }
    }

    fn _render(
        &mut self,
        id: &serde_json::Value,
        scene: &Scene,
        parse_ms: f64,
        parse_cpu_ms: f64,
    ) -> Result<Reply, String> {
        let start = Instant::now();
        let cpu_start = _cpu_ms();
        let (width, height) = _dimensions(scene)?;
        let mut pixmap = Pixmap::new(width, height).ok_or("cannot allocate output image")?;
        pixmap.fill(_color(&scene.background, 1.0)?);
        let transform = Transform::from_scale(scene.pixel_ratio as f32, scene.pixel_ratio as f32);
        let mut metrics = Metrics {
            parse_ms: parse_ms,
            ..Metrics::default()
        };

        let placement_start = Instant::now();
        let mut labels = Vec::new();
        for (index, command) in scene.commands.iter().enumerate() {
            if let Command::Text { text } = command {
                labels.push((index, text));
            }
        }
        labels.sort_by(|left, right| {
            right
                .1
                .priority
                .total_cmp(&left.1.priority)
                .then_with(|| right.0.cmp(&left.0))
        });
        let mut accepted = HashMap::<usize, Layout>::new();
        let mut accepted_ids = HashSet::<&str>::new();
        let mut locality_primaries = HashMap::<&str, Vec<[f32; 4]>>::new();
        let mut collision = CollisionGrid::_new();
        let mut joint_complete = false;
        for (index, text) in &labels {
            let index = *index;
            let text = text.as_ref();
            if text.landmark.is_some() {
                if joint_complete {
                    continue;
                }
                joint_complete = true;
                let landmarks = labels
                    .iter()
                    .filter_map(|(index, text)| {
                        let landmark = text.landmark.as_ref()?;
                        Some((*index, text.as_ref(), landmark.as_ref()))
                    })
                    .collect::<Vec<_>>();
                let mut selection = Selection::new([scene.width, scene.height]);
                let mut prepared = HashMap::<usize, Vec<Layout>>::new();
                let mut ranked_by_salience = landmarks
                    .iter()
                    .enumerate()
                    .map(|(candidate, (_, _, landmark))| {
                        (landmark.reference.salience(), candidate, landmark.rank)
                    })
                    .collect::<Vec<_>>();
                ranked_by_salience.sort_by(|left, right| {
                    right
                        .0
                        .total_cmp(&left.0)
                        .then_with(|| left.2.total_cmp(&right.2))
                        .then_with(|| landmarks[left.1].1.id.cmp(&landmarks[right.1].1.id))
                });
                for (salience, candidate, _) in ranked_by_salience {
                    let (index, source, _) = landmarks[candidate];
                    let layouts = self._landmark_layouts(
                        source,
                        [scene.width, scene.height],
                        &collision,
                        &mut metrics,
                    )?;
                    let viable = !layouts.is_empty();
                    prepared.insert(index, layouts);
                    if viable {
                        selection.set_maximum_salience(salience);
                        break;
                    }
                }
                let mut candidates = landmarks
                    .iter()
                    .map(|(index, source, landmark)| _LandmarkPlacement {
                        index: *index,
                        source: source,
                        reference: &landmark.reference,
                        coverage: selection.prepare(&landmark.reference),
                        layouts: prepared.remove(index),
                    })
                    .collect::<Vec<_>>();
                let mut heap = BinaryHeap::new();
                for (candidate, placement) in candidates.iter().enumerate() {
                    if placement.layouts.as_ref().is_some_and(Vec::is_empty) {
                        continue;
                    }
                    let score = selection.gain(&placement.coverage)
                        - selection.cost(
                            placement.reference,
                            [0.0; 4],
                            &placement.source.collision_boxes,
                        );
                    if score <= 0.0 {
                        continue;
                    }
                    heap.push(_LandmarkChoice {
                        candidate: candidate,
                        id: placement.source.id.as_deref().unwrap_or_default(),
                        score: score,
                        revision: None,
                        position: 0,
                    });
                }
                let mut revision = 0;
                let mut selected = 0;
                while let Some(mut choice) = heap.pop() {
                    if choice.score <= 0.0 {
                        break;
                    }
                    let placement = &mut candidates[choice.candidate];
                    if placement
                        .source
                        .id
                        .as_deref()
                        .is_some_and(|id| accepted_ids.contains(id))
                    {
                        continue;
                    }
                    let badge_blocks_every_position = placement.source.collide
                        && placement
                            .source
                            .collision_boxes
                            .iter()
                            .any(|bounds| collision._intersects(*bounds));
                    if badge_blocks_every_position {
                        continue;
                    }
                    if choice.revision != Some(revision) {
                        if placement.layouts.is_none() {
                            placement.layouts = Some(self._landmark_layouts(
                                placement.source,
                                [scene.width, scene.height],
                                &collision,
                                &mut metrics,
                            )?);
                        }
                        let Some(layouts) = &placement.layouts else {
                            continue;
                        };
                        let gain = selection.gain(&placement.coverage);
                        let mut best = None;
                        for (position, layout) in layouts.iter().enumerate() {
                            if placement.source.collide && collision._intersects(layout.bounds) {
                                continue;
                            }
                            let score = gain
                                - selection.cost(
                                    placement.reference,
                                    layout.bounds,
                                    &placement.source.collision_boxes,
                                );
                            if score > 0.0 && best.is_none_or(|(_, previous)| score > previous) {
                                best = Some((position, score));
                            }
                        }
                        let Some((position, score)) = best else {
                            continue;
                        };
                        choice.score = score;
                        choice.position = position;
                        choice.revision = Some(revision);
                        if heap
                            .peek()
                            .is_some_and(|next| choice.cmp(next) == Ordering::Less)
                        {
                            heap.push(choice);
                            continue;
                        }
                    }
                    let Some(layouts) = &mut placement.layouts else {
                        continue;
                    };
                    let layout = layouts.swap_remove(choice.position);
                    if placement.source.collide {
                        collision._insert(layout.bounds);
                        for bounds in &placement.source.collision_boxes {
                            collision._insert(*bounds);
                        }
                    }
                    selection.record(&placement.coverage);
                    if let Some(id) = placement.source.id.as_deref() {
                        accepted_ids.insert(id);
                        metrics.accepted_label_ids.push(id.to_owned());
                    }
                    accepted.insert(placement.index, layout);
                    metrics.accepted_labels += 1;
                    selected += 1;
                    revision += 1;
                }
                metrics.skipped_labels += landmarks.len() - selected;
                continue;
            }
            if text
                .id
                .as_deref()
                .is_some_and(|id| accepted_ids.contains(id))
            {
                metrics.skipped_labels += 1;
                continue;
            }
            let mut chosen = None;
            let mut candidate = Cow::Borrowed(text);
            let locality_references = if text.locality {
                labels
                    .iter()
                    .filter_map(|(_, source)| {
                        let reference = source.landmark.as_ref()?;
                        Some((source.as_ref(), reference.reference.salience()))
                    })
                    .collect::<Vec<_>>()
            } else {
                Vec::new()
            };
            let locality_primary = if locality_references.is_empty() {
                None
            } else {
                Some(self._text.layout(text)?.bounds)
            };
            // Alternatives must not separate indistinguishable context names
            // that would collide at their original geographic anchors.
            let repeated_primary = locality_primary.is_some_and(|primary| {
                locality_primaries
                    .get(text.text.as_str())
                    .is_some_and(|bounds| {
                        bounds
                            .iter()
                            .any(|bounds| CollisionGrid::_overlaps(primary, *bounds))
                    })
            });
            if repeated_primary {
                metrics.skipped_labels += 1;
                continue;
            }
            let mut locality_viability = HashMap::<usize, bool>::new();
            let mut least_obstruction = f64::INFINITY;
            let mut least_displacement = f32::INFINITY;
            if let (Some(primary), Some(x), Some(y)) = (locality_primary, text.x, text.y) {
                let half_badge = locality_references
                    .iter()
                    .flat_map(|(source, _)| &source.collision_boxes)
                    .fold([0.0_f32; 2], |extent, bounds| {
                        [
                            extent[0].max((bounds[2] - bounds[0]) / 2.0),
                            extent[1].max((bounds[3] - bounds[1]) / 2.0),
                        ]
                    });
                let alternatives = [
                    [x, y],
                    [x, y + y - half_badge[1] - text.padding - primary[3]],
                    [x, y + y + half_badge[1] + text.padding - primary[1]],
                    [x + x - half_badge[0] - text.padding - primary[2], y],
                    [x + x + half_badge[0] + text.padding - primary[0], y],
                ];
                candidate.to_mut().alternatives = alternatives
                    .into_iter()
                    .map(|[x, y]| TextAlternative {
                        x: x,
                        y: y,
                        anchor: text.anchor.clone(),
                    })
                    .collect();
            }
            let alternatives = if locality_references.is_empty() {
                Cow::Borrowed(text.alternatives.as_slice())
            } else {
                Cow::Owned(candidate.alternatives.clone())
            };
            for position in 0..alternatives.len().max(1) {
                if let Some(alternative) = alternatives.get(position) {
                    let candidate = candidate.to_mut();
                    candidate.x = Some(alternative.x);
                    candidate.y = Some(alternative.y);
                    candidate.anchor.clone_from(&alternative.anchor);
                }
                let layout = self._text.layout(candidate.as_ref())?;
                metrics.missing_glyphs += layout.missing_glyphs;
                metrics.shaped_glyphs += layout.glyph_count;
                metrics.unsupported_labels += usize::from(!layout.fully_supported);
                if layout.skipped_reason.is_some() {
                    continue;
                }
                if let Some(margin) = text.edge_margin
                    && (layout.bounds[0] < margin
                        || layout.bounds[1] < margin
                        || layout.bounds[2] > scene.width as f32 - margin
                        || layout.bounds[3] > scene.height as f32 - margin)
                {
                    continue;
                }
                let mut bounds =
                    std::iter::once(layout.bounds).chain(text.collision_boxes.iter().copied());
                if text.collide && bounds.any(|bounds| collision._intersects(bounds)) {
                    continue;
                }
                if !locality_references.is_empty() {
                    let visible_alternative = position == 0
                        || (layout.bounds[0] >= 0.0
                            && layout.bounds[1] >= 0.0
                            && layout.bounds[2] <= scene.width as f32
                            && layout.bounds[3] <= scene.height as f32);
                    if !visible_alternative {
                        continue;
                    }
                    let mut obstruction = 0.0_f64;
                    for (reference_index, (source, salience)) in
                        locality_references.iter().enumerate()
                    {
                        let badge_obstructed = source
                            .collision_boxes
                            .iter()
                            .any(|bounds| CollisionGrid::_overlaps(layout.bounds, *bounds));
                        if !badge_obstructed || *salience <= obstruction {
                            continue;
                        }
                        let viable = if let Some(viable) = locality_viability.get(&reference_index)
                        {
                            *viable
                        } else {
                            let viable = !self
                                ._landmark_layouts(
                                    source,
                                    [scene.width, scene.height],
                                    &collision,
                                    &mut metrics,
                                )?
                                .is_empty();
                            locality_viability.insert(reference_index, viable);
                            viable
                        };
                        if viable {
                            obstruction = *salience;
                        }
                    }
                    let displacement = (candidate.x.unwrap_or_default()
                        - text.x.unwrap_or_default())
                    .powi(2)
                        + (candidate.y.unwrap_or_default() - text.y.unwrap_or_default()).powi(2);
                    let preserves_more_reference_space = obstruction < least_obstruction
                        || (obstruction == least_obstruction && displacement < least_displacement);
                    if !preserves_more_reference_space {
                        continue;
                    }
                    least_obstruction = obstruction;
                    least_displacement = displacement;
                    chosen = Some(layout);
                    if obstruction == 0.0 && displacement == 0.0 {
                        break;
                    }
                    continue;
                }
                chosen = Some(layout);
                break;
            }
            let Some(layout) = chosen else {
                metrics.skipped_labels += 1;
                continue;
            };
            if let Some(primary) = locality_primary {
                locality_primaries
                    .entry(text.text.as_str())
                    .or_default()
                    .push(primary);
            }
            if text.collide {
                collision._insert(layout.bounds);
                for bounds in &text.collision_boxes {
                    collision._insert(*bounds);
                }
            }
            if let Some(id) = text.id.as_deref() {
                accepted_ids.insert(id);
                metrics.accepted_label_ids.push(id.to_owned());
            }
            accepted.insert(index, layout);
            metrics.accepted_labels += 1;
        }
        metrics.placement_ms = _ms(placement_start);

        let mut clips = HashMap::<[u32; 4], Mask>::new();
        let geometry_start = Instant::now();
        let geometry_drawn = match raster::draw_geometry(scene, &mut pixmap, 2) {
            Ok(roi) => {
                metrics.roi_geometry = Some(roi);
                true
            }
            Err(reason) => {
                // Preserve ordered drawing for clips that cannot own disjoint rectangles.
                pixmap.fill(_color(&scene.background, 1.0)?);
                metrics.roi_fallback = Some(reason);
                false
            }
        };
        metrics.geometry_ms += _ms(geometry_start);
        for (index, command) in scene.commands.iter().enumerate() {
            if geometry_drawn && matches!(command, Command::Fill { .. } | Command::Stroke { .. }) {
                continue;
            }
            let clip = match command {
                Command::Landmarks { .. } => {
                    return Err("landmark command was not expanded".into());
                }
                Command::Fill { clip, .. }
                | Command::Stroke { clip, .. }
                | Command::Image { clip, .. } => *clip,
                Command::Text { text } => text.clip,
            };
            let mask_key = clip.map(|values| values.map(f32::to_bits));
            if let (Some(bounds), Some(key)) = (clip, mask_key)
                && !clips.contains_key(&key)
            {
                let total_bytes = (clips.len() as u64 + 1) * u64::from(width) * u64::from(height);
                let clip_cache_is_full = total_bytes > 64 * 1024 * 1024;
                if clip_cache_is_full {
                    clips.clear();
                }
                let rect = Rect::from_ltrb(bounds[0], bounds[1], bounds[2], bounds[3])
                    .ok_or("invalid clip rectangle")?;
                let mut mask = Mask::new(width, height).ok_or("cannot allocate clip mask")?;
                mask.fill_path(
                    &PathBuilder::from_rect(rect),
                    FillRule::Winding,
                    false,
                    transform,
                );
                clips.insert(key, mask);
            }
            let mask = mask_key.as_ref().and_then(|key| clips.get(key));
            match command {
                Command::Landmarks { .. } => {
                    return Err("landmark command was not expanded".into());
                }
                Command::Fill { .. } | Command::Stroke { .. } => {
                    let geometry_start = Instant::now();
                    _draw_geometry(command, &mut pixmap, transform, mask)?;
                    metrics.geometry_ms += _ms(geometry_start);
                }
                Command::Text { text } => {
                    if let Some(layout) = accepted.get(&index) {
                        let text_start = Instant::now();
                        self._text.draw(
                            &mut pixmap,
                            text,
                            layout,
                            scene.pixel_ratio as f32,
                            mask,
                        )?;
                        metrics.text_raster_ms += _ms(text_start);
                    }
                }
                Command::Image {
                    landmark,
                    x,
                    y,
                    width,
                    height,
                    path,
                    label_id,
                    opacity,
                    ..
                } => {
                    if label_id
                        .as_ref()
                        .is_some_and(|id| !accepted_ids.contains(id.as_str()))
                    {
                        continue;
                    }
                    if *width <= 0.0 || *height <= 0.0 {
                        continue;
                    }
                    self._load_asset(path, *landmark)?;
                    let asset = self
                        ._assets
                        .get(&(path.clone(), *landmark))
                        .ok_or("image asset was not retained")?;
                    let image_transform = Transform::from_row(
                        width * scene.pixel_ratio as f32 / asset.image.width() as f32,
                        0.0,
                        0.0,
                        height * scene.pixel_ratio as f32 / asset.image.height() as f32,
                        x * scene.pixel_ratio as f32,
                        y * scene.pixel_ratio as f32,
                    );
                    if let Some(shadow) = &asset.shadow {
                        let padding = (shadow.width() - asset.image.width()) as f32 / 2.0;
                        pixmap.draw_pixmap(
                            0,
                            0,
                            shadow.as_ref(),
                            &PixmapPaint::default(),
                            image_transform.pre_translate(-padding, -padding),
                            mask,
                        );
                    }
                    pixmap.draw_pixmap(
                        0,
                        0,
                        asset.image.as_ref(),
                        &PixmapPaint {
                            opacity: *opacity,
                            quality: tiny_skia::FilterQuality::Bicubic,
                            ..PixmapPaint::default()
                        },
                        image_transform,
                        mask,
                    );
                }
            }
        }
        metrics.render_ms = _ms(start);
        metrics.text_cache = Some(self._text.cache_stats());
        metrics.clip_masks = clips.len();
        let encode_start = Instant::now();
        let opaque = pixmap.pixels().iter().all(|pixel| pixel.alpha() == 255);
        let rgba = if opaque {
            pixmap.take()
        } else {
            pixmap.take_demultiplied()
        };
        let encoded = raster::encode_webp(&rgba, width, height, 80.0, 2)?;
        metrics.encode_ms = _ms(encode_start);
        metrics.total_ms = _ms(start) + parse_ms;
        metrics.cpu_ms = _cpu_ms() - cpu_start + parse_cpu_ms;
        metrics.peak_rss_bytes = _peak_rss_bytes();
        let image_base64 = base64::engine::general_purpose::STANDARD.encode(&encoded);
        Ok(Reply {
            id: id.clone(),
            ok: true,
            error: None,
            width: Some(width),
            height: Some(height),
            bytes: Some(encoded.len()),
            image_base64: Some(image_base64),
            metrics: Some(metrics),
        })
    }

    fn _landmark_layouts(
        &mut self,
        source: &TextCommand,
        viewport: [f64; 2],
        collision: &CollisionGrid,
        metrics: &mut Metrics,
    ) -> Result<Vec<Layout>, String> {
        if source.collide
            && source
                .collision_boxes
                .iter()
                .any(|bounds| collision._intersects(*bounds))
        {
            return Ok(Vec::new());
        }
        let Some(mut text) = landmark::prepare_text(source, viewport, &mut self._text)? else {
            return Ok(Vec::new());
        };
        let mut layouts = Vec::new();
        for position in 0..text.alternatives.len().max(1) {
            if let Some(alternative) = text.alternatives.get(position) {
                text.x = Some(alternative.x);
                text.y = Some(alternative.y);
                text.anchor.clone_from(&alternative.anchor);
            }
            let layout = self._text.layout(&text)?;
            metrics.missing_glyphs += layout.missing_glyphs;
            metrics.shaped_glyphs += layout.glyph_count;
            metrics.unsupported_labels += usize::from(!layout.fully_supported);
            if layout.skipped_reason.is_some() {
                continue;
            }
            if let Some(margin) = text.edge_margin
                && (layout.bounds[0] < margin
                    || layout.bounds[1] < margin
                    || layout.bounds[2] > viewport[0] as f32 - margin
                    || layout.bounds[3] > viewport[1] as f32 - margin)
            {
                continue;
            }
            if text.collide && collision._intersects(layout.bounds) {
                continue;
            }
            layouts.push(layout);
        }
        Ok(layouts)
    }

    fn _load_asset(&mut self, path: &Path, landmark: bool) -> Result<(), String> {
        let key = (path.to_path_buf(), landmark);
        if self._assets.contains_key(&key) {
            return Ok(());
        }
        let asset =
            Pixmap::load_png(path).map_err(|error| format!("cannot decode PNG asset: {error}"))?;
        let shadow = if landmark {
            Some(crate::raster::badge_shadow(&asset)?)
        } else {
            None
        };
        let bytes = asset.data().len() + shadow.as_ref().map_or(0, |shadow| shadow.data().len());
        let maximum_asset_bytes = 16 * 1024 * 1024;
        if self._asset_bytes + bytes > maximum_asset_bytes {
            self._assets.clear();
            self._asset_bytes = 0;
        }
        self._asset_bytes += bytes;
        self._assets.insert(
            key,
            _Asset {
                image: asset,
                shadow,
            },
        );
        Ok(())
    }
}

struct CollisionGrid {
    _cells: HashMap<(i32, i32), Vec<usize>>,
    _bounds: Vec<[f32; 4]>,
}

impl CollisionGrid {
    fn _new() -> Self {
        Self {
            _cells: HashMap::new(),
            _bounds: Vec::new(),
        }
    }
    fn _range(bounds: [f32; 4]) -> (i32, i32, i32, i32) {
        (
            (bounds[0] / 32.0).floor() as i32,
            (bounds[1] / 32.0).floor() as i32,
            (bounds[2] / 32.0).floor() as i32,
            (bounds[3] / 32.0).floor() as i32,
        )
    }
    fn _intersects(&self, bounds: [f32; 4]) -> bool {
        let (left, top, right, bottom) = Self::_range(bounds);
        for y in top..=bottom {
            for x in left..=right {
                if let Some(indices) = self._cells.get(&(x, y)) {
                    for index in indices {
                        let other = self._bounds[*index];
                        if Self::_overlaps(bounds, other) {
                            return true;
                        }
                    }
                }
            }
        }
        false
    }
    fn _overlaps(left: [f32; 4], right: [f32; 4]) -> bool {
        left[0] < right[2] && left[2] > right[0] && left[1] < right[3] && left[3] > right[1]
    }
    fn _insert(&mut self, bounds: [f32; 4]) {
        let index = self._bounds.len();
        self._bounds.push(bounds);
        let (left, top, right, bottom) = Self::_range(bounds);
        for y in top..=bottom {
            for x in left..=right {
                self._cells.entry((x, y)).or_default().push(index);
            }
        }
    }
}

pub(super) fn _cpu_ms() -> f64 {
    let mut time = libc::timespec {
        tv_sec: 0,
        tv_nsec: 0,
    };
    // CLOCK_PROCESS_CPUTIME_ID measures this persistent child including encoder threads.
    let status = unsafe { libc::clock_gettime(libc::CLOCK_PROCESS_CPUTIME_ID, &mut time) };
    if status == 0 {
        time.tv_sec as f64 * 1000.0 + time.tv_nsec as f64 / 1_000_000.0
    } else {
        0.0
    }
}
fn _peak_rss_bytes() -> u64 {
    let mut usage = std::mem::MaybeUninit::<libc::rusage>::uninit();
    // getrusage initializes the complete structure on success.
    if unsafe { libc::getrusage(libc::RUSAGE_SELF, usage.as_mut_ptr()) } != 0 {
        return 0;
    }
    let usage = unsafe { usage.assume_init() };
    #[cfg(target_os = "macos")]
    {
        usage.ru_maxrss as u64
    }
    #[cfg(not(target_os = "macos"))]
    {
        usage.ru_maxrss as u64 * 1024
    }
}
pub(super) fn _ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}
#[cfg(test)]
mod tests;
