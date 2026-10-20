use serde::{Deserialize, Serialize};
use skrifa::{
    FontRef, GlyphId, MetadataProvider,
    instance::{LocationRef, Size},
    outline::{DrawSettings, OutlinePen},
};
use std::{
    collections::{HashMap, VecDeque},
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};
use tiny_skia::{
    FillRule, LineCap, LineJoin, Mask, Paint, Path as SkiaPath, PathBuilder, Pixmap, Point, Stroke,
    Transform,
};
use unicode_bidi::BidiInfo;
use unicode_script::{Script, UnicodeScript};
use unicode_segmentation::UnicodeSegmentation;

const _OUTLINE_ENTRIES: usize = 8192;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextCommand {
    #[serde(skip)]
    pub(super) locality: bool,
    // Native-only options created when expanding a landmarks block.
    #[serde(default, deserialize_with = "_reject_wire_landmark")]
    pub(super) landmark: Option<Arc<crate::landmark::LandmarkTextInput>>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub edge_margin: Option<f32>,
    #[serde(default)]
    pub alternatives: Vec<TextAlternative>,
    #[serde(default)]
    pub collision_boxes: Vec<[f32; 4]>,
    pub text: String,
    #[serde(default)]
    pub x: Option<f32>,
    #[serde(default)]
    pub y: Option<f32>,
    pub size: f32,
    #[serde(default = "_regular")]
    pub weight: u16,
    pub color: String,
    #[serde(default)]
    pub halo_color: Option<String>,
    #[serde(default)]
    pub halo_width: f32,
    #[serde(default)]
    pub angle: f32,
    #[serde(default)]
    pub path: Option<Vec<[f32; 2]>>,
    #[serde(default = "_center")]
    pub anchor: String,
    #[serde(default)]
    pub justify: TextJustify,
    #[serde(default)]
    pub letter_spacing: f32,
    #[serde(default)]
    pub max_width: Option<f32>,
    #[serde(default)]
    pub line_height: Option<f32>,
    #[serde(default = "_padding")]
    pub padding: f32,
    #[serde(default)]
    pub collide: bool,
    #[serde(default)]
    pub priority: f64,
    #[serde(default)]
    pub max_angle: Option<f32>,
    #[serde(default = "_one")]
    pub opacity: f32,
    #[serde(default)]
    pub clip: Option<[f32; 4]>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextJustify {
    Auto,
    #[default]
    Center,
    Left,
    Right,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TextAlternative {
    pub x: f32,
    pub y: f32,
    #[serde(default = "_center")]
    pub anchor: String,
}

fn _reject_wire_landmark<'de, D>(
    _deserializer: D,
) -> Result<Option<Arc<crate::landmark::LandmarkTextInput>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Err(serde::de::Error::custom(
        "landmark layout is native-only; use a landmarks command",
    ))
}

fn _regular() -> u16 {
    400
}
fn _center() -> String {
    "center".into()
}
fn _padding() -> f32 {
    2.0
}
fn _one() -> f32 {
    1.0
}

#[derive(Debug)]
pub struct TextMetrics {
    pub width: f32,
    pub missing_glyphs: usize,
}

pub struct Layout {
    pub bounds: [f32; 4],
    pub glyph_count: usize,
    pub fully_supported: bool,
    pub missing_glyphs: usize,
    pub skipped_reason: Option<String>,
    _glyphs: Vec<_PlacedGlyph>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextCacheMetrics {
    pub font_bytes: usize,
    pub fonts: usize,
    pub outline_bytes: usize,
    pub outlines: usize,
    pub outline_hits: u64,
    pub outline_misses: u64,
    pub shape_bytes: usize,
    pub shapes: usize,
    pub shape_hits: u64,
    pub shape_misses: u64,
    pub shape_plans: usize,
    pub shape_plan_hits: u64,
    pub shape_plan_misses: u64,
}

#[derive(Deserialize)]
struct _FontSet {
    manifest: _Manifest,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct _Manifest {
    fonts: Vec<_ManifestFont>,
    primary_coverage: Vec<[u32; 2]>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct _ManifestFont {
    family: String,
    weight: u16,
    sha256: String,
    #[serde(default)]
    face_index: u32,
    ranges: Vec<[u32; 2]>,
}
struct _Font {
    _path: PathBuf,
    _body_index: usize,
    _face_index: u32,
    _family: String,
    _weight: u16,
    _ranges: Vec<[u32; 2]>,
}
struct _Body {
    _data: Arc<Vec<u8>>,
    _last_use: u64,
}
struct _Outline {
    _path: Option<Arc<SkiaPath>>,
    _bytes: usize,
}
struct _PlacedGlyph {
    _font: usize,
    _id: u16,
    _transform: Transform,
}
struct _Glyph {
    _font: usize,
    _id: u16,
    _x: f32,
    _y: f32,
    _scale: f32,
    _advance: f32,
    _requires_outline: bool,
}
struct _Line {
    _glyphs: Vec<_Glyph>,
    _width: f32,
    _missing: usize,
}
#[derive(Clone, PartialEq, Eq, Hash)]
struct _ShapeKey {
    _text: String,
    _weight: u16,
    _region: String,
    _size: u32,
    _spacing: u32,
    _context: String,
    _start: usize,
}
struct _Shape {
    _line: Arc<_Line>,
    _bytes: usize,
}
#[derive(Clone, PartialEq, Eq, Hash)]
struct _PlanKey {
    _font: usize,
    _direction: harfrust::Direction,
    _script: Option<harfrust::Script>,
    _language: Option<harfrust::Language>,
}
struct _Run {
    _start: usize,
    _end: usize,
    _font: usize,
    _script: Script,
}

pub struct TextEngine {
    _fonts: Vec<_Font>,
    _bodies: HashMap<usize, _Body>,
    _shaping_fonts: HashMap<usize, harfrust::Font>,
    _font_bytes: usize,
    _clock: u64,
    _outlines: HashMap<(usize, u32, u16), _Outline>,
    _boxes: HashMap<(usize, u32, u16), Option<[f32; 4]>>,
    _box_order: VecDeque<(usize, u32, u16)>,
    _outline_order: VecDeque<(usize, u32, u16)>,
    _outline_bytes: usize,
    _outline_hits: u64,
    _outline_misses: u64,
    _assignments: HashMap<(u32, u16, String), usize>,
    _shapes: HashMap<_ShapeKey, _Shape>,
    _shape_order: VecDeque<_ShapeKey>,
    _shape_bytes: usize,
    _shape_hits: u64,
    _shape_misses: u64,
    _plans: HashMap<_PlanKey, harfrust::ShapePlan>,
    _plan_order: VecDeque<_PlanKey>,
    _plan_hits: u64,
    _plan_misses: u64,
    _buffer: Option<harfrust::Buffer>,
}

impl TextEngine {
    pub fn new(font_dir: &Path) -> Result<Self, String> {
        let font_set: _FontSet = serde_json::from_reader(
            fs::File::open(font_dir.join("fallback-font-set.json"))
                .map_err(|error| format!("font manifest unavailable: {error}"))?,
        )
        .map_err(|error| format!("invalid font manifest: {error}"))?;
        let manifest = font_set.manifest;
        let mut fonts = Vec::new();
        let mut body_indexes: HashMap<PathBuf, usize> = HashMap::new();
        for (weight, name) in [(400, "regular"), (600, "semibold"), (700, "bold")] {
            let path = font_dir.join(format!("inter-{name}.ttf"));
            if !path.is_file() {
                return Err(format!("missing primary font: {}", path.display()));
            }
            body_indexes.insert(path.clone(), fonts.len());
            fonts.push(_Font {
                _body_index: fonts.len(),
                _face_index: 0,
                _path: path,
                _family: "Inter".into(),
                _weight: weight,
                _ranges: manifest.primary_coverage.clone(),
            });
        }
        for font in manifest.fonts {
            let path = font_dir.join(format!("{}.font", font.sha256));
            if path.is_file() {
                let body_index = *body_indexes.entry(path.clone()).or_insert(fonts.len());
                fonts.push(_Font {
                    _body_index: body_index,
                    _face_index: font.face_index,
                    _path: path,
                    _family: font.family,
                    _weight: font.weight,
                    _ranges: font.ranges,
                });
            }
        }
        Ok(Self {
            _fonts: fonts,
            _bodies: HashMap::new(),
            _shaping_fonts: HashMap::new(),
            _font_bytes: 0,
            _clock: 0,
            _outlines: HashMap::new(),
            _boxes: HashMap::new(),
            _box_order: VecDeque::new(),
            _outline_order: VecDeque::new(),
            _outline_bytes: 0,
            _outline_hits: 0,
            _outline_misses: 0,
            _assignments: HashMap::new(),
            _shapes: HashMap::new(),
            _shape_order: VecDeque::new(),
            _shape_bytes: 0,
            _shape_hits: 0,
            _shape_misses: 0,
            _plans: HashMap::new(),
            _plan_order: VecDeque::new(),
            _plan_hits: 0,
            _plan_misses: 0,
            _buffer: None,
        })
    }

    pub fn cache_stats(&self) -> TextCacheMetrics {
        TextCacheMetrics {
            font_bytes: self._font_bytes,
            fonts: self._bodies.len(),
            outline_bytes: self._outline_bytes,
            outlines: self._outlines.len(),
            outline_hits: self._outline_hits,
            outline_misses: self._outline_misses,
            shape_bytes: self._shape_bytes,
            shapes: self._shapes.len(),
            shape_hits: self._shape_hits,
            shape_misses: self._shape_misses,
            shape_plans: self._plans.len(),
            shape_plan_hits: self._plan_hits,
            shape_plan_misses: self._plan_misses,
        }
    }

    pub fn measure(&mut self, command: &TextCommand) -> Result<TextMetrics, String> {
        self._validate(command)?;
        let lines = self._lines(command)?;
        let width = lines.iter().map(|line| line._width).fold(0.0, f32::max);
        Ok(TextMetrics {
            width: width,
            missing_glyphs: lines.iter().map(|line| line._missing).sum(),
        })
    }

    /// Uses the actual shaper and outline inventory without allocating placed
    /// glyphs or transforming bounds for names that may never be displayed.
    pub(super) fn supports(&mut self, command: &TextCommand) -> Result<bool, String> {
        self._validate(command)?;
        for line in self._lines(command)? {
            if line._missing != 0 {
                return Ok(false);
            }
            for glyph in &line._glyphs {
                if glyph._requires_outline && self._glyph_box(glyph._font, glyph._id)?.is_none() {
                    return Ok(false);
                }
            }
        }
        Ok(true)
    }

    pub fn layout(&mut self, command: &TextCommand) -> Result<Layout, String> {
        self._validate(command)?;
        let lines = self._lines(command)?;
        let x = command.x.unwrap_or(0.0);
        let y = command.y.unwrap_or(0.0);
        let glyph_count = lines.iter().map(|line| line._glyphs.len()).sum();
        let missing = lines.iter().map(|line| line._missing).sum();
        let mut layout = Layout {
            bounds: [x, y, x, y],
            glyph_count: glyph_count,
            fully_supported: missing == 0,
            missing_glyphs: missing,
            skipped_reason: None,
            _glyphs: Vec::new(),
        };
        if missing > 0 {
            layout.skipped_reason = Some("unsupported-glyph".into());
            return Ok(layout);
        }
        if command.path.is_some() && lines.len() != 1 {
            layout.skipped_reason = Some("multiline-path".into());
            return Ok(layout);
        }
        let width = lines.iter().map(|line| line._width).fold(0.0, f32::max);
        let step = command.line_height.unwrap_or(command.size * 1.2);
        let height = step * lines.len() as f32;
        let (anchor_x, anchor_y) = match command.anchor.as_str() {
            "center" => (0.5, 0.5),
            "left" => (0.0, 0.5),
            "right" => (1.0, 0.5),
            "top" => (0.5, 0.0),
            "bottom" => (0.5, 1.0),
            "top-left" => (0.0, 0.0),
            "top-right" => (1.0, 0.0),
            "bottom-left" => (0.0, 1.0),
            "bottom-right" => (1.0, 1.0),
            _ => return Err("unsupported text anchor".into()),
        };
        let left = -width * anchor_x;
        let top = -height * anchor_y;
        let angle = command.angle.to_radians();
        let (sin, cos) = angle.sin_cos();
        let mut bounds = [
            f32::INFINITY,
            f32::INFINITY,
            f32::NEG_INFINITY,
            f32::NEG_INFINITY,
        ];
        if let Some(points) = &command.path {
            let mut path = points.clone();
            let mut lengths = _path_lengths(&path);
            let total = lengths.last().copied().unwrap_or(0.0);
            if path.len() < 2 || total < width {
                layout.skipped_reason = Some("path-too-short".into());
                return Ok(layout);
            }
            let mut center = match (command.x, command.y) {
                (Some(x), Some(y)) => {
                    let mut nearest = (f32::INFINITY, 0.0);
                    for (index, pair) in path.windows(2).enumerate() {
                        let dx = pair[1][0] - pair[0][0];
                        let dy = pair[1][1] - pair[0][1];
                        let square = dx * dx + dy * dy;
                        let ratio = if square > 0.0 {
                            ((x - pair[0][0]) * dx + (y - pair[0][1]) * dy) / square
                        } else {
                            0.0
                        }
                        .clamp(0.0, 1.0);
                        let distance =
                            (pair[0][0] + dx * ratio - x).hypot(pair[0][1] + dy * ratio - y);
                        if distance < nearest.0 {
                            nearest = (distance, lengths[index] + square.sqrt() * ratio);
                        }
                    }
                    nearest.1
                }
                _ => total / 2.0,
            };
            let (_, _, tangent) = _path_point(&path, &lengths, center);
            if tangent.cos() < 0.0 {
                path.reverse();
                lengths = _path_lengths(&path);
                center = total - center;
            }
            let start = center - width / 2.0;
            if start < 0.0 || start + width > total {
                layout.skipped_reason = Some("path-too-short".into());
                return Ok(layout);
            }
            let mut previous_angle: Option<f32> = None;
            for glyph in &lines[0]._glyphs {
                let distance = start + glyph._x + glyph._advance / 2.0;
                let (x, y, direction) = _path_point(&path, &lengths, distance.clamp(0.0, total));
                if let Some(previous) = previous_angle
                    && ((direction - previous + std::f32::consts::PI)
                        .rem_euclid(std::f32::consts::TAU)
                        - std::f32::consts::PI)
                        .abs()
                        > command.max_angle.unwrap_or(45.0).to_radians()
                {
                    layout.skipped_reason = Some("path-too-sharp".into());
                    return Ok(layout);
                }
                previous_angle = Some(direction);
                let (s, c) = (direction + angle).sin_cos();
                let offset_x = -glyph._advance / 2.0;
                let offset_y = glyph._y + command.size * 0.35;
                let transform = Transform::from_row(
                    glyph._scale * c,
                    glyph._scale * s,
                    glyph._scale * s,
                    -glyph._scale * c,
                    x + c * offset_x - s * offset_y,
                    y + s * offset_x + c * offset_y,
                );
                self._place(glyph, transform, &mut layout, &mut bounds)?;
            }
        } else {
            for (index, line) in lines.iter().enumerate() {
                let justify = match command.justify {
                    TextJustify::Auto => anchor_x,
                    TextJustify::Center => 0.5,
                    TextJustify::Left => 0.0,
                    TextJustify::Right => 1.0,
                };
                let line_x = left + (width - line._width) * justify;
                let baseline = top + index as f32 * step + command.size * 0.85;
                for glyph in &line._glyphs {
                    let x = line_x + glyph._x;
                    let y = baseline + glyph._y;
                    let transform = Transform::from_row(
                        glyph._scale * cos,
                        glyph._scale * sin,
                        glyph._scale * sin,
                        -glyph._scale * cos,
                        command.x.unwrap_or(0.0) + cos * x - sin * y,
                        command.y.unwrap_or(0.0) + sin * x + cos * y,
                    );
                    self._place(glyph, transform, &mut layout, &mut bounds)?;
                }
            }
        }
        if !layout._glyphs.is_empty() {
            let pad = command.padding + command.halo_width;
            layout.bounds = [
                bounds[0] - pad,
                bounds[1] - pad,
                bounds[2] + pad,
                bounds[3] + pad,
            ];
        }
        Ok(layout)
    }

    pub fn draw(
        &mut self,
        pixmap: &mut Pixmap,
        command: &TextCommand,
        layout: &Layout,
        ratio: f32,
        clip: Option<&Mask>,
    ) -> Result<(), String> {
        if layout.skipped_reason.is_some() {
            return Ok(());
        }
        let fill = _paint(&command.color, command.opacity)?;
        let halo = command
            .halo_color
            .as_deref()
            .map(|color| _paint(color, command.opacity))
            .transpose()?;
        let mut builder = PathBuilder::new();
        for glyph in &layout._glyphs {
            let outline = 'outline: {
                let index = glyph._font;
                let id = glyph._id;
                let key = (
                    self._fonts[index]._body_index,
                    self._fonts[index]._face_index,
                    id,
                );
                if let Some(cached) = self._outlines.get(&key) {
                    self._outline_hits += 1;
                    break 'outline cached._path.clone();
                }
                self._outline_misses += 1;
                let data = self._body(index)?;
                let font = FontRef::from_index(data.as_slice(), self._fonts[index]._face_index)
                    .map_err(|_| "invalid font face")?;
                let mut builder = _OutlineBuilder {
                    _builder: PathBuilder::new(),
                };
                if let Some(glyph) = font.outline_glyphs().get(GlyphId::new(u32::from(id))) {
                    glyph
                        .draw(
                            DrawSettings::unhinted(Size::unscaled(), LocationRef::default()),
                            &mut builder,
                        )
                        .map_err(|_| "unrenderable glyph outline")?;
                }
                let path = builder._builder.finish().map(Arc::new);
                let bytes = path
                    .as_ref()
                    .map(|path| path.points().len() * 9 + 64)
                    .unwrap_or(16);
                while self._outlines.len() >= _OUTLINE_ENTRIES
                    || self._outline_bytes + bytes > 16 * 1024 * 1024
                {
                    let Some(oldest) = self._outline_order.pop_front() else {
                        break;
                    };
                    if let Some(outline) = self._outlines.remove(&oldest) {
                        self._outline_bytes -= outline._bytes;
                    }
                }
                self._outline_bytes += bytes;
                self._outline_order.push_back(key);
                self._outlines.insert(
                    key,
                    _Outline {
                        _path: path.clone(),
                        _bytes: bytes,
                    },
                );
                path
            };
            if let Some(path) = outline
                && let Some(path) = path.as_ref().clone().transform(glyph._transform)
            {
                builder.push_path(&path);
            }
        }
        let Some(path) = builder.finish() else {
            return Ok(());
        };
        if command.landmark.is_some() {
            crate::raster::text_shadow(pixmap, &path, ratio, clip)?;
        }
        let transform = Transform::from_scale(ratio, ratio);
        if let Some(halo) = halo.as_ref().filter(|_| command.halo_width > 0.0) {
            let stroke = Stroke {
                width: 2.0 * command.halo_width,
                line_cap: LineCap::Round,
                line_join: LineJoin::Round,
                ..Stroke::default()
            };
            pixmap.stroke_path(&path, halo, &stroke, transform, clip);
        }
        pixmap.fill_path(&path, &fill, FillRule::Winding, transform, clip);
        Ok(())
    }

    fn _validate(&self, command: &TextCommand) -> Result<(), String> {
        if !command.size.is_finite() || command.size <= 0.0 {
            return Err("invalid text size".into());
        }
        if ![
            command.x.unwrap_or(0.0),
            command.y.unwrap_or(0.0),
            command.angle,
            command.letter_spacing,
            command.padding,
            command.halo_width,
            command.opacity,
        ]
        .iter()
        .all(|value| value.is_finite())
        {
            return Err("non-finite text parameter".into());
        }
        if command
            .max_width
            .is_some_and(|value| !value.is_finite() || value <= 0.0)
            || command
                .line_height
                .is_some_and(|value| !value.is_finite() || value <= 0.0)
            || command
                .max_angle
                .is_some_and(|value| !value.is_finite() || value < 0.0)
            || command
                .path
                .as_ref()
                .is_some_and(|points| points.iter().flatten().any(|point| !point.is_finite()))
        {
            return Err("invalid text layout parameter".into());
        }
        Ok(())
    }

    fn _lines(&mut self, command: &TextCommand) -> Result<Vec<Arc<_Line>>, String> {
        let mut result = Vec::new();
        // Line labels follow their full path; text-max-width only wraps point labels.
        if command.path.is_some() {
            for paragraph in command.text.split('\n') {
                result.push(self._shape(paragraph, command)?);
            }
            return Ok(result);
        }
        for paragraph in command.text.split('\n') {
            let Some(max_width) = command.max_width else {
                result.push(self._shape(paragraph, command)?);
                continue;
            };
            let whole = self._shape(paragraph, command)?;
            if whole._width <= max_width {
                result.push(whole);
                continue;
            }
            let mut cursor = 0;
            let mut current = String::new();
            for grapheme in paragraph.graphemes(true) {
                let candidate = format!("{current}{grapheme}");
                if !current.is_empty() && self._shape(&candidate, command)?._width > max_width {
                    if let Some((position, _)) = current
                        .char_indices()
                        .rev()
                        .find(|(_, character)| character.is_whitespace())
                        && position > 0
                    {
                        result.push(self._shape_paragraph(
                            current[..position].trim_end(),
                            command,
                            paragraph,
                            &mut cursor,
                        )?);
                        current = format!("{}{grapheme}", current[position..].trim_start());
                        continue;
                    }
                    result.push(self._shape_paragraph(
                        current.trim_end(),
                        command,
                        paragraph,
                        &mut cursor,
                    )?);
                    current = grapheme.trim_start().into();
                } else {
                    current = candidate;
                }
            }
            result.push(self._shape_paragraph(&current, command, paragraph, &mut cursor)?);
        }
        Ok(result)
    }

    fn _shape_paragraph(
        &mut self,
        text: &str,
        command: &TextCommand,
        paragraph: &str,
        cursor: &mut usize,
    ) -> Result<Arc<_Line>, String> {
        let relative = paragraph[*cursor..]
            .find(text)
            .ok_or("invalid wrapped paragraph range")?;
        let start = *cursor + relative;
        *cursor = start + text.len();
        self._shape_context(text, command, Some((paragraph, start)))
    }

    fn _shape(&mut self, text: &str, command: &TextCommand) -> Result<Arc<_Line>, String> {
        self._shape_context(text, command, None)
    }

    fn _shape_context(
        &mut self,
        text: &str,
        command: &TextCommand,
        context: Option<(&str, usize)>,
    ) -> Result<Arc<_Line>, String> {
        let mut output = _Line {
            _glyphs: Vec::new(),
            _width: 0.0,
            _missing: 0,
        };
        if text.is_empty() {
            return Ok(Arc::new(output));
        }
        let weight = command.weight;
        let (source, start) = context.unwrap_or((text, 0));
        let end = start + text.len();
        let region = _region(source);
        let key = _ShapeKey {
            _text: text.to_owned(),
            _weight: weight,
            _region: region.clone(),
            _size: command.size.to_bits(),
            _spacing: command.letter_spacing.to_bits(),
            _context: if context.is_some() {
                source.to_owned()
            } else {
                String::new()
            },
            _start: start,
        };
        if let Some(cached) = self._shapes.get(&key) {
            self._shape_hits += 1;
            return Ok(Arc::clone(&cached._line));
        }
        self._shape_misses += 1;
        let bidi = BidiInfo::new(source, None);
        for paragraph in &bidi.paragraphs {
            let range = paragraph.range.start.max(start)..paragraph.range.end.min(end);
            if range.start >= range.end {
                continue;
            }
            let (levels, visual_runs) = bidi.visual_runs(paragraph, range);
            for visual in visual_runs {
                let rtl = levels[visual.start].is_rtl();
                let mut runs: Vec<_Run> = Vec::new();
                for (offset, character) in source[visual.clone()].char_indices() {
                    let position = visual.start + offset;
                    let script = character.script();
                    let inherited =
                        matches!(script, Script::Inherited | Script::Common | Script::Unknown);
                    let previous = runs.last();
                    let inherit_font =
                        script == Script::Inherited || matches!(character, '\u{200c}' | '\u{200d}');
                    let font = if inherit_font
                        && let Some(previous) = previous
                        && {
                            let index = previous._font;
                            let data = self._body(index)?;
                            FontRef::from_index(data.as_slice(), self._fonts[index]._face_index)
                                .map_err(|_| "invalid font face")?
                                .charmap()
                                .map(character)
                                .is_some()
                                || matches!(
                                    character,
                                    '\u{200c}' | '\u{200d}' | '\u{fe0e}' | '\u{fe0f}'
                                )
                        } {
                        previous._font
                    } else {
                        'font_selection: {
                            let key = (character as u32, weight, region.to_owned());
                            if let Some(index) = self._assignments.get(&key) {
                                break 'font_selection *index;
                            }
                            let primary = match weight {
                                600 => 1,
                                700 => 2,
                                _ => 0,
                            };
                            let index = if _covered(&self._fonts[primary]._ranges, character as u32)
                            {
                                primary
                            } else {
                                self._fonts
                                    .iter()
                                    .enumerate()
                                    .skip(3)
                                    .filter(|(_, font)| _covered(&font._ranges, character as u32))
                                    .min_by_key(|(_, font)| {
                                        let regional = if font._family.starts_with("NotoSansCJK") {
                                            if font._family == format!("NotoSansCJK{region}") {
                                                0
                                            } else {
                                                1000
                                            }
                                        } else {
                                            0
                                        };
                                        regional + font._weight.abs_diff(weight) as usize
                                    })
                                    .map(|(index, _)| index)
                                    .unwrap_or(primary)
                            };
                            if self._assignments.len() >= 65536 {
                                self._assignments.clear();
                            }
                            self._assignments.insert(key, index);
                            index
                        }
                    };
                    let resolved_script = if inherited {
                        previous.map(|run| run._script).unwrap_or(script)
                    } else {
                        script
                    };
                    if let Some(run) = runs.last_mut().filter(|run| {
                        run._font == font && (inherited || run._script == resolved_script)
                    }) {
                        run._end = position + character.len_utf8();
                    } else {
                        runs.push(_Run {
                            _start: position,
                            _end: position + character.len_utf8(),
                            _font: font,
                            _script: resolved_script,
                        });
                    }
                }
                if rtl {
                    runs.reverse();
                }
                for run in runs {
                    let bytes = self._body(run._font)?;
                    let face = if let Some(face) = self._shaping_fonts.get(&run._font) {
                        face.clone()
                    } else {
                        let face = harfrust::Font::new(
                            harfrust::font::Blob::Shared(bytes),
                            self._fonts[run._font]._face_index,
                        )
                        .ok_or("invalid font face")?;
                        self._shaping_fonts.insert(run._font, face.clone());
                        face
                    };
                    let scale = command.size / face.units_per_em() as f32;
                    let mut buffer = self._buffer.take().unwrap_or_default();
                    buffer.push_str(&source[run._start..run._end]);
                    // Joiners/selectors still participate in shaping; HarfRust removes only
                    // their invisible output glyphs after substitutions and positioning.
                    buffer.set_flags(harfrust::BufferFlags::REMOVE_DEFAULT_IGNORABLES);
                    buffer.set_direction(if rtl {
                        harfrust::Direction::RightToLeft
                    } else {
                        harfrust::Direction::LeftToRight
                    });
                    buffer.guess_segment_properties();
                    let plan_key = _PlanKey {
                        _font: run._font,
                        _direction: buffer.direction(),
                        _script: buffer.script(),
                        _language: buffer.language().cloned(),
                    };
                    if self._plans.contains_key(&plan_key) {
                        self._plan_hits += 1;
                    } else {
                        self._plan_misses += 1;
                        while self._plans.len() >= 128 {
                            if let Some(oldest) = self._plan_order.pop_front() {
                                self._plans.remove(&oldest);
                            }
                        }
                        self._plans.insert(
                            plan_key.clone(),
                            harfrust::ShapePlan::new(
                                &face,
                                plan_key._direction,
                                plan_key._script,
                                plan_key._language.as_ref(),
                                &[],
                            ),
                        );
                        self._plan_order.push_back(plan_key.clone());
                    }
                    harfrust::shape(
                        &harfrust::ShaperFont::new(&face),
                        &mut buffer,
                        harfrust::ShapeOptions::new().plan(self._plans.get(&plan_key)),
                    )
                    .map_err(|error| format!("text shaping failed: {error}"))?;
                    let infos = buffer.glyph_infos();
                    for (index, (info, position)) in
                        infos.iter().zip(buffer.glyph_positions()).enumerate()
                    {
                        let advance = position.x_advance as f32 * scale;
                        output._glyphs.push(_Glyph {
                            _font: run._font,
                            _id: info.glyph_id as u16,
                            _x: output._width + position.x_offset as f32 * scale,
                            _y: -position.y_offset as f32 * scale,
                            _scale: scale,
                            _advance: advance,
                            _requires_outline: source[run._start + info.cluster as usize..run._end]
                                .chars()
                                .next()
                                .is_some_and(_visible_character),
                        });
                        if info.glyph_id == 0 {
                            output._missing += 1;
                        }
                        output._width += advance;
                        if infos
                            .get(index + 1)
                            .is_none_or(|next| next.cluster != info.cluster)
                        {
                            output._width += command.letter_spacing;
                        }
                    }
                    buffer.clear();
                    self._buffer = Some(buffer);
                }
            }
        }
        if !output._glyphs.is_empty() {
            output._width -= command.letter_spacing;
        }
        let bytes = output._glyphs.capacity() * std::mem::size_of::<_Glyph>()
            + (text.len() + key._context.len()) * 2
            + 256;
        let output = Arc::new(output);
        while self._shapes.len() >= 4096 || self._shape_bytes + bytes > 8 * 1024 * 1024 {
            let Some(oldest) = self._shape_order.pop_front() else {
                break;
            };
            if let Some(shape) = self._shapes.remove(&oldest) {
                self._shape_bytes -= shape._bytes;
            }
        }
        self._shape_order.push_back(key.clone());
        self._shape_bytes += bytes;
        self._shapes.insert(
            key,
            _Shape {
                _line: Arc::clone(&output),
                _bytes: bytes,
            },
        );
        Ok(output)
    }

    fn _body(&mut self, index: usize) -> Result<Arc<Vec<u8>>, String> {
        let index = self._fonts[index]._body_index;
        self._clock += 1;
        if let Some(body) = self._bodies.get_mut(&index) {
            body._last_use = self._clock;
            return Ok(Arc::clone(&body._data));
        }
        let bytes = fs::read(&self._fonts[index]._path)
            .map_err(|error| format!("font unavailable: {error}"))?;
        let maximum_font_bytes = 64 * 1024 * 1024;
        FontRef::from_index(&bytes, 0).map_err(|_| "invalid font face")?;
        while self._font_bytes + bytes.len() > maximum_font_bytes {
            let Some(oldest) = self
                ._bodies
                .iter()
                .min_by_key(|(_, body)| body._last_use)
                .map(|(index, _)| *index)
            else {
                break;
            };
            if let Some(old) = self._bodies.remove(&oldest) {
                self._font_bytes -= old._data.len();
                self._shaping_fonts
                    .retain(|font, _| self._fonts[*font]._body_index != oldest);
            }
        }
        let data = Arc::new(bytes);
        self._font_bytes += data.len();
        self._bodies.insert(
            index,
            _Body {
                _data: Arc::clone(&data),
                _last_use: self._clock,
            },
        );
        Ok(data)
    }

    fn _glyph_box(&mut self, index: usize, id: u16) -> Result<Option<[f32; 4]>, String> {
        let key = (
            self._fonts[index]._body_index,
            self._fonts[index]._face_index,
            id,
        );
        if let Some(bounds) = self._boxes.get(&key) {
            return Ok(*bounds);
        }
        let data = self._body(index)?;
        let font = FontRef::from_index(data.as_slice(), self._fonts[index]._face_index)
            .map_err(|_| "invalid font face")?;
        let bounds = font
            .glyph_metrics(Size::unscaled(), LocationRef::default())
            .bounds(GlyphId::new(u32::from(id)))
            .filter(|bounds| bounds.x_min < bounds.x_max && bounds.y_min < bounds.y_max)
            .map(|bounds| [bounds.x_min, bounds.y_min, bounds.x_max, bounds.y_max]);
        if self._boxes.len() >= _OUTLINE_ENTRIES
            && let Some(oldest) = self._box_order.pop_front()
        {
            self._boxes.remove(&oldest);
        }
        self._box_order.push_back(key);
        self._boxes.insert(key, bounds);
        Ok(bounds)
    }

    fn _place(
        &mut self,
        glyph: &_Glyph,
        transform: Transform,
        layout: &mut Layout,
        bounds: &mut [f32; 4],
    ) -> Result<(), String> {
        let Some(rectangle) = self._glyph_box(glyph._font, glyph._id)? else {
            if glyph._requires_outline {
                layout.missing_glyphs += 1;
                layout.fully_supported = false;
                layout.skipped_reason = Some("unrenderable-glyph".into());
            }
            return Ok(());
        };
        let mut corners = [
            Point::from_xy(rectangle[0], rectangle[1]),
            Point::from_xy(rectangle[2], rectangle[1]),
            Point::from_xy(rectangle[2], rectangle[3]),
            Point::from_xy(rectangle[0], rectangle[3]),
        ];
        transform.map_points(&mut corners);
        for point in corners {
            bounds[0] = bounds[0].min(point.x);
            bounds[1] = bounds[1].min(point.y);
            bounds[2] = bounds[2].max(point.x);
            bounds[3] = bounds[3].max(point.y);
        }
        layout._glyphs.push(_PlacedGlyph {
            _font: glyph._font,
            _id: glyph._id,
            _transform: transform,
        });
        Ok(())
    }
}

struct _OutlineBuilder {
    _builder: PathBuilder,
}
impl OutlinePen for _OutlineBuilder {
    fn move_to(&mut self, x: f32, y: f32) {
        self._builder.move_to(x, y);
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self._builder.line_to(x, y);
    }
    fn quad_to(&mut self, cx: f32, cy: f32, x: f32, y: f32) {
        self._builder.quad_to(cx, cy, x, y);
    }
    fn curve_to(&mut self, cx0: f32, cy0: f32, cx1: f32, cy1: f32, x: f32, y: f32) {
        self._builder.cubic_to(cx0, cy0, cx1, cy1, x, y);
    }
    fn close(&mut self) {
        self._builder.close();
    }
}
pub(super) fn _visible_character(character: char) -> bool {
    !character.is_whitespace()
        && !character.is_control()
        && !matches!(character,
        '\u{00ad}' | '\u{034f}' | '\u{061c}' | '\u{180e}' | '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' |
        '\u{2060}'..='\u{206f}' | '\u{fe00}'..='\u{fe0f}' | '\u{feff}' | '\u{e0100}'..='\u{e01ef}')
}

fn _covered(ranges: &[[u32; 2]], character: u32) -> bool {
    ranges
        .binary_search_by(|range| {
            if range[1] < character {
                return std::cmp::Ordering::Less;
            }
            if range[0] > character {
                return std::cmp::Ordering::Greater;
            }
            std::cmp::Ordering::Equal
        })
        .is_ok()
}
// Shared Han code points use one deterministic default. Kana and Hangul provide
// enough context to retain their existing Japanese and Korean font selection.
fn _region(text: &str) -> String {
    if text
        .chars()
        .any(|character| matches!(character.script(), Script::Hiragana | Script::Katakana))
    {
        return "jp".into();
    }
    if text
        .chars()
        .any(|character| character.script() == Script::Hangul)
    {
        return "kr".into();
    }
    "sc".into()
}

fn _paint(value: &str, opacity: f32) -> Result<Paint<'static>, String> {
    let color = value
        .parse::<csscolorparser::Color>()
        .map_err(|_| "invalid text color")?;
    let [r, g, b, a] = color.to_rgba8();
    let mut paint = Paint::default();
    paint.set_color_rgba8(r, g, b, (a as f32 * opacity.clamp(0.0, 1.0)).round() as u8);
    paint.anti_alias = true;
    Ok(paint)
}
fn _path_lengths(points: &[[f32; 2]]) -> Vec<f32> {
    let mut lengths = vec![0.0];
    for pair in points.windows(2) {
        lengths.push(
            lengths.last().copied().unwrap_or(0.0)
                + (pair[1][0] - pair[0][0]).hypot(pair[1][1] - pair[0][1]),
        );
    }
    lengths
}
fn _path_point(points: &[[f32; 2]], lengths: &[f32], distance: f32) -> (f32, f32, f32) {
    let index = lengths
        .partition_point(|length| *length <= distance)
        .saturating_sub(1)
        .min(points.len() - 2);
    let dx = points[index + 1][0] - points[index][0];
    let dy = points[index + 1][1] - points[index][1];
    let span = lengths[index + 1] - lengths[index];
    let ratio = if span > 0.0 {
        (distance - lengths[index]) / span
    } else {
        0.0
    };
    (
        points[index][0] + dx * ratio,
        points[index][1] + dy * ratio,
        dy.atan2(dx),
    )
}

#[cfg(test)]
mod tests;
