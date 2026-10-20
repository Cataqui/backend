//! Mapbox Vector Tile 2.1 decoding into render-local, transport-independent geometry.

use std::collections::HashMap;
use std::sync::OnceLock;

use prost::Message;

use crate::map::style::{GeometryType, Property};

pub(super) struct DecodedTile {
    _layers: HashMap<String, _DecodedLayer>,
}

struct _DecodedLayer {
    _wire: _Layer,
    _features: OnceLock<Result<Vec<Feature>, String>>,
}

impl DecodedTile {
    pub(super) fn features(&self, source_layer: &str) -> Result<&[Feature], String> {
        let Some(layer) = self._layers.get(source_layer) else {
            return Ok(&[]);
        };
        match layer._features.get_or_init(|| _features(&layer._wire)) {
            Ok(features) => Ok(features.as_slice()),
            Err(error) => Err(error.clone()),
        }
    }

    #[cfg(test)]
    pub(super) fn from_features(layers: HashMap<String, Vec<Feature>>) -> Self {
        Self {
            _layers: layers
                .into_iter()
                .map(|(name, features)| {
                    (
                        name,
                        _DecodedLayer {
                            _wire: _Layer::default(),
                            _features: OnceLock::from(Ok(features)),
                        },
                    )
                })
                .collect(),
        }
    }
}

pub(super) struct Feature {
    pub(super) properties: HashMap<String, Property>,
    pub(super) geometry_type: GeometryType,
    pub(super) extent: f64,
    pub(super) bounds: [f64; 4],
    _commands: Vec<u32>,
    _geometry: OnceLock<Result<Geometry, String>>,
}

pub(super) struct Geometry {
    pub(super) paths: Vec<Vec<[f64; 2]>>,
    pub(super) path_bounds: Vec<[f64; 4]>,
}

impl Feature {
    pub(super) fn geometry(&self) -> Result<&Geometry, String> {
        match self
            ._geometry
            .get_or_init(|| _geometry(&self._commands, true).map(|(geometry, _bounds)| geometry))
        {
            Ok(geometry) => Ok(geometry),
            Err(error) => Err(error.clone()),
        }
    }

    #[cfg(test)]
    pub(super) fn from_geometry(
        properties: HashMap<String, Property>,
        geometry_type: GeometryType,
        extent: f64,
        bounds: [f64; 4],
        geometry: Geometry,
    ) -> Self {
        Self {
            properties: properties,
            geometry_type: geometry_type,
            extent: extent,
            bounds: bounds,
            _commands: Vec::new(),
            _geometry: OnceLock::from(Ok(geometry)),
        }
    }
}

// These wire fields follow the authoritative 2.1/vector_tile.proto. Prost owns
// protobuf parsing, including unknown fields, varints and packed repeated fields.
#[derive(Message)]
struct _Tile {
    #[prost(message, repeated, tag = "3")]
    layers: Vec<_Layer>,
}

#[derive(Message)]
struct _Layer {
    #[prost(uint32, required, tag = "15", default = "1")]
    version: u32,
    #[prost(string, required, tag = "1")]
    name: String,
    #[prost(bytes = "vec", repeated, tag = "2")]
    features: Vec<Vec<u8>>,
    #[prost(string, repeated, tag = "3")]
    keys: Vec<String>,
    #[prost(message, repeated, tag = "4")]
    values: Vec<_Value>,
    #[prost(uint32, optional, tag = "5", default = "4096")]
    extent: Option<u32>,
}

#[derive(Message)]
struct _Feature {
    #[prost(uint64, optional, tag = "1", default = "0")]
    id: Option<u64>,
    #[prost(uint32, repeated, packed = "true", tag = "2")]
    tags: Vec<u32>,
    #[prost(enumeration = "_GeometryType", optional, tag = "3")]
    r#type: Option<i32>,
    #[prost(uint32, repeated, packed = "true", tag = "4")]
    geometry: Vec<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
enum _GeometryType {
    Unknown = 0,
    Point = 1,
    LineString = 2,
    Polygon = 3,
}

#[derive(Message)]
struct _Value {
    // MVT permits exactly one scalar. A wire-compatible oneof also preserves
    // vector-tile-js's last-scalar-wins behavior for nonconforming values.
    #[prost(oneof = "_ValueKind", tags = "1, 2, 3, 4, 5, 6, 7")]
    value: Option<_ValueKind>,
}

#[derive(Clone, PartialEq, prost::Oneof)]
enum _ValueKind {
    #[prost(string, tag = "1")]
    String(String),
    #[prost(float, tag = "2")]
    Float(f32),
    #[prost(double, tag = "3")]
    Double(f64),
    #[prost(int64, tag = "4")]
    Int(i64),
    #[prost(uint64, tag = "5")]
    Uint(u64),
    #[prost(sint64, tag = "6")]
    Sint(i64),
    #[prost(bool, tag = "7")]
    Bool(bool),
}

pub(super) fn decode(bytes: &[u8]) -> Result<DecodedTile, String> {
    let tile = _Tile::decode(bytes).map_err(|_| "invalid vector tile protobuf".to_string())?;
    let mut layers = HashMap::with_capacity(tile.layers.len());
    for mut layer in tile.layers {
        // Match vector-tile-js: an empty duplicate never replaces a populated layer.
        if layer.features.is_empty() {
            continue;
        }
        layers.insert(
            std::mem::take(&mut layer.name),
            _DecodedLayer {
                _wire: layer,
                _features: OnceLock::new(),
            },
        );
    }
    Ok(DecodedTile { _layers: layers })
}

fn _features(layer: &_Layer) -> Result<Vec<Feature>, String> {
    let extent = layer.extent.unwrap_or(4096);
    if extent == 0 {
        return Err("vector tile extent must be positive".to_string());
    }
    let values: Vec<Property> = layer.values.iter().map(_property).collect();
    let mut features = Vec::with_capacity(layer.features.len());
    for bytes in &layer.features {
        let feature = _Feature::decode(bytes.as_slice())
            .map_err(|_| "invalid vector tile feature protobuf".to_string())?;
        let geometry_type = match feature.r#type.unwrap_or(0) {
            0 => continue,
            1 => GeometryType::Point,
            2 => GeometryType::LineString,
            3 => GeometryType::Polygon,
            _ => return Err("unsupported vector tile geometry type".to_string()),
        };
        if feature.tags.len() % 2 != 0 {
            return Err("vector tile tags require key and value pairs".to_string());
        }
        let mut properties = HashMap::with_capacity(feature.tags.len() / 2);
        for pair in feature.tags.chunks_exact(2) {
            let key = layer
                .keys
                .get(pair[0] as usize)
                .ok_or("vector tile property key index is out of bounds")?;
            let value = values
                .get(pair[1] as usize)
                .ok_or("vector tile property value index is out of bounds")?;
            properties.insert(key.clone(), value.clone());
        }
        let (_geometry, bounds) = _geometry(&feature.geometry, false)?;
        features.push(Feature {
            properties: properties,
            geometry_type: geometry_type,
            extent: f64::from(extent),
            bounds: bounds,
            _commands: feature.geometry,
            _geometry: OnceLock::new(),
        });
    }
    Ok(features)
}

fn _property(value: &_Value) -> Property {
    match &value.value {
        Some(_ValueKind::String(value)) => Property::String(value.clone()),
        Some(_ValueKind::Float(value)) => Property::Number(f64::from(*value)),
        Some(_ValueKind::Double(value)) => Property::Number(*value),
        Some(_ValueKind::Int(value)) => Property::Number(*value as f64),
        Some(_ValueKind::Sint(value)) => Property::Number(*value as f64),
        Some(_ValueKind::Uint(value)) => Property::Number(*value as f64),
        Some(_ValueKind::Bool(value)) => Property::Bool(*value),
        None => Property::Null,
    }
}

fn _geometry(commands: &[u32], load_paths: bool) -> Result<(Geometry, [f64; 4]), String> {
    let mut paths: Vec<Vec<[f64; 2]>> = Vec::new();
    let mut bounds = [
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    ];
    let mut path_bounds: Vec<[f64; 4]> = Vec::new();
    let mut cursor = [0_f64, 0_f64];
    let mut index = 0;
    let mut has_path = false;
    while let Some(command) = commands.get(index) {
        index += 1;
        let id = command & 7;
        let count = (command >> 3) as usize;
        if count == 0 {
            continue;
        }
        match id {
            1 | 2 => {
                if count > (commands.len() - index) / 2 {
                    return Err("vector tile geometry has truncated coordinates".to_string());
                }
                if id == 2 && !has_path {
                    return Err("vector tile line requires a starting point".to_string());
                }
                for _ in 0..count {
                    for axis in 0..2 {
                        let value = commands[index + axis];
                        cursor[axis] += f64::from(((value >> 1) as i32) ^ -((value & 1) as i32));
                        bounds[axis] = bounds[axis].min(cursor[axis]);
                        bounds[axis + 2] = bounds[axis + 2].max(cursor[axis]);
                    }
                    index += 2;
                    if id == 1 {
                        has_path = true;
                    }
                    if !load_paths {
                        continue;
                    }
                    if id == 1 {
                        paths.push(vec![cursor]);
                        path_bounds.push([cursor[0], cursor[1], cursor[0], cursor[1]]);
                    } else {
                        let path = paths
                            .last_mut()
                            .ok_or("vector tile line requires a starting point")?;
                        path.push(cursor);
                        let bounds = path_bounds
                            .last_mut()
                            .ok_or("vector tile line requires path bounds")?;
                        bounds[0] = bounds[0].min(cursor[0]);
                        bounds[1] = bounds[1].min(cursor[1]);
                        bounds[2] = bounds[2].max(cursor[0]);
                        bounds[3] = bounds[3].max(cursor[1]);
                    }
                }
            }
            7 => {
                if count != 1 {
                    return Err("vector tile close command requires one repetition".to_string());
                }
                if !has_path {
                    return Err("vector tile ring requires a starting point".to_string());
                }
                if !load_paths {
                    continue;
                }
                let path = paths
                    .last_mut()
                    .ok_or("vector tile ring requires a starting point")?;
                path.push(path[0]);
            }
            _ => return Err("unsupported vector tile geometry command".to_string()),
        }
    }
    Ok((
        Geometry {
            paths: paths,
            path_bounds: path_bounds,
        },
        bounds,
    ))
}

#[cfg(test)]
mod tests;
