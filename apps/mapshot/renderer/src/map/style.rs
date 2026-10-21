//! The fixed snapshot appearance, evaluated directly by the native map compiler.

use std::collections::HashMap;

use crate::scene::{Cap, Join};

pub(super) const BACKGROUND: &str = "#f5f1f0";

#[derive(Clone, Debug, PartialEq)]
pub(super) enum Property {
    String(String),
    Number(f64),
    Bool(bool),
    Null,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum GeometryType {
    Point,
    LineString,
    Polygon,
}

pub(super) struct FeatureContext<'a> {
    pub(super) properties: &'a HashMap<String, Property>,
    pub(super) geometry_type: GeometryType,
    pub(super) zoom: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Layer {
    Background,
    Earth,
    LanduseContext,
    LanduseGreen,
    AerowayArea,
    Water,
    Waterways,
    Buildings,
    Paths,
    Railways,
    Ferry,
    AerowayLines,
    RoadsTunnel,
    RoadsGround,
    RoadsBridge,
    WaterNameLine,
    WaterNamePoint,
    RoadNameMajor,
    RoadNameMinor,
    PlaceIsland,
    PlaceNeighborhood,
    PlaceCity,
    PlaceRegion,
    PlaceCountry,
}

/// Drawing order also establishes label priority: context, landmarks, then roads.
pub(super) const LAYERS: [Layer; 24] = [
    Layer::Background,
    Layer::Earth,
    Layer::LanduseContext,
    Layer::LanduseGreen,
    Layer::AerowayArea,
    Layer::Water,
    Layer::Waterways,
    Layer::Buildings,
    Layer::Paths,
    Layer::Railways,
    Layer::Ferry,
    Layer::AerowayLines,
    Layer::RoadsTunnel,
    Layer::RoadsGround,
    Layer::RoadsBridge,
    Layer::WaterNameLine,
    Layer::WaterNamePoint,
    Layer::RoadNameMajor,
    Layer::RoadNameMinor,
    Layer::PlaceIsland,
    Layer::PlaceNeighborhood,
    Layer::PlaceCity,
    Layer::PlaceRegion,
    Layer::PlaceCountry,
];

pub(super) enum StylePaint {
    Fill(FillStyle),
    Stroke(StrokeStyle),
    Symbol(SymbolStyle),
}

pub(super) struct FillStyle {
    pub(super) color: &'static str,
    pub(super) opacity: f32,
}

pub(super) struct StrokeStyle {
    pub(super) color: &'static str,
    pub(super) width: f32,
    pub(super) opacity: f32,
    pub(super) dash: &'static [f32],
    pub(super) cap: Cap,
    pub(super) join: Join,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Placement {
    Point,
    Line,
}

pub(super) struct SymbolStyle {
    pub(super) text: String,
    pub(super) size: f64,
    pub(super) sort_key: f64,
    pub(super) weight: u16,
    pub(super) color: &'static str,
    pub(super) halo_color: &'static str,
    pub(super) halo_width: f64,
    pub(super) padding: f64,
    pub(super) max_width: f64,
    pub(super) line_height: f64,
    pub(super) letter_spacing: f64,
    pub(super) placement: Placement,
    pub(super) spacing: f64,
    pub(super) max_angle: f64,
}

impl Layer {
    pub(super) fn source_layer(self) -> Option<&'static str> {
        match self {
            Self::Background => None,
            Self::Earth | Self::PlaceIsland => Some("earth"),
            Self::LanduseContext | Self::LanduseGreen | Self::AerowayArea => Some("landuse"),
            Self::Water | Self::Waterways | Self::WaterNameLine | Self::WaterNamePoint => {
                Some("water")
            }
            Self::Buildings => Some("buildings"),
            Self::Paths
            | Self::Railways
            | Self::Ferry
            | Self::AerowayLines
            | Self::RoadsTunnel
            | Self::RoadsGround
            | Self::RoadsBridge
            | Self::RoadNameMajor
            | Self::RoadNameMinor => Some("roads"),
            Self::PlaceNeighborhood | Self::PlaceCity | Self::PlaceRegion | Self::PlaceCountry => {
                Some("places")
            }
        }
    }

    pub(super) fn visible(self, zoom: f64) -> bool {
        match self {
            Self::Buildings | Self::RoadNameMinor => zoom >= 15.0,
            Self::RoadNameMajor => zoom >= 11.0,
            Self::PlaceRegion | Self::PlaceCountry => zoom < 11.0,
            Self::Background
            | Self::Earth
            | Self::LanduseContext
            | Self::LanduseGreen
            | Self::AerowayArea
            | Self::Water
            | Self::Waterways
            | Self::Paths
            | Self::Railways
            | Self::Ferry
            | Self::AerowayLines
            | Self::RoadsTunnel
            | Self::RoadsGround
            | Self::RoadsBridge
            | Self::WaterNameLine
            | Self::WaterNamePoint
            | Self::PlaceIsland
            | Self::PlaceNeighborhood
            | Self::PlaceCity => true,
        }
    }

    pub(super) fn is_landmark_boundary(self) -> bool {
        self == Self::PlaceIsland
    }

    pub(super) fn is_symbol(self) -> bool {
        matches!(
            self,
            Self::WaterNameLine
                | Self::WaterNamePoint
                | Self::RoadNameMajor
                | Self::RoadNameMinor
                | Self::PlaceIsland
                | Self::PlaceNeighborhood
                | Self::PlaceCity
                | Self::PlaceRegion
                | Self::PlaceCountry
        )
    }

    pub(super) fn selected(self, context: &FeatureContext<'_>) -> Result<bool, String> {
        if !self.visible(context.zoom) {
            return Ok(false);
        }
        let kind = context._string("kind");
        let detail = context._string("kind_detail");
        let point = context.geometry_type == GeometryType::Point;
        let line = context.geometry_type == GeometryType::LineString;
        let polygon = context.geometry_type == GeometryType::Polygon;
        let named = context.properties.contains_key("name");
        let road = line && matches!(kind, "highway" | "major_road" | "minor_road" | "other");
        Ok(match self {
            Self::Background => false,
            Self::Earth | Self::Water => polygon,
            Self::LanduseContext => {
                polygon
                    && matches!(
                        kind,
                        "commercial"
                            | "industrial"
                            | "railway"
                            | "hospital"
                            | "school"
                            | "kindergarten"
                            | "university"
                            | "college"
                    )
            }
            Self::LanduseGreen => {
                polygon
                    && matches!(
                        kind,
                        "park"
                            | "national_park"
                            | "nature_reserve"
                            | "protected_area"
                            | "wood"
                            | "forest"
                            | "grass"
                            | "grassland"
                            | "meadow"
                            | "scrub"
                            | "garden"
                            | "recreation_ground"
                            | "village_green"
                            | "allotments"
                            | "golf_course"
                            | "dog_park"
                            | "playground"
                            | "cemetery"
                    )
            }
            Self::AerowayArea => polygon && matches!(kind, "runway" | "taxiway" | "aerodrome"),
            Self::Waterways => {
                line && matches!(kind, "river" | "canal" | "stream" | "ditch" | "drain")
            }
            Self::Buildings => polygon && matches!(kind, "building" | "building_part"),
            Self::Paths => line && kind == "path",
            Self::Railways => line && kind == "rail",
            Self::Ferry => line && kind == "ferry",
            Self::AerowayLines => line && kind == "aeroway",
            Self::RoadsTunnel => road && context.properties.contains_key("is_tunnel"),
            Self::RoadsGround => {
                road && !context.properties.contains_key("is_tunnel")
                    && !context.properties.contains_key("is_bridge")
            }
            Self::RoadsBridge => road && context.properties.contains_key("is_bridge"),
            Self::WaterNameLine => {
                line && named
                    && matches!(kind, "river" | "canal" | "stream")
                    && context._minimum_zoom()? <= context.zoom
            }
            Self::WaterNamePoint => point && named && context._minimum_zoom()? <= context.zoom,
            Self::RoadNameMajor => {
                line && named
                    && matches!(kind, "highway" | "major_road")
                    && matches!(
                        detail,
                        "motorway"
                            | "motorway_link"
                            | "trunk"
                            | "trunk_link"
                            | "primary"
                            | "primary_link"
                            | "secondary"
                            | "secondary_link"
                    )
            }
            Self::RoadNameMinor => line && named && matches!(kind, "minor_road" | "other" | "path"),
            Self::PlaceIsland => point && named && kind == "island",
            Self::PlaceNeighborhood => {
                if !point || !named || !matches!(kind, "neighbourhood" | "macrohood") {
                    false
                } else {
                    let minimum = match context._non_null("min_zoom") {
                        None => 99.0,
                        Some(Property::Number(value)) if value.is_finite() => *value,
                        _ => return Err("map label minimum zoom must be a finite number".into()),
                    };
                    minimum <= context.zoom + 1.0
                }
            }
            Self::PlaceCity => {
                point
                    && named
                    && kind == "locality"
                    && context._minimum_zoom()? <= context.zoom
                    && matches!(detail, "city" | "town" | "village")
            }
            Self::PlaceRegion => {
                point && named && kind == "region" && context._minimum_zoom()? <= context.zoom
            }
            Self::PlaceCountry => {
                point && named && kind == "country" && context._minimum_zoom()? <= context.zoom
            }
        })
    }

    /// Materializes paint after selection and viewport geometry culling.
    pub(super) fn paint_selected(
        self,
        context: &FeatureContext<'_>,
    ) -> Result<Option<StylePaint>, String> {
        let kind = context._string("kind");
        let detail = context._string("kind_detail");
        let (size, color, padding, spacing, sort_key) = match self {
            Self::Background => return Ok(None),
            Self::Earth => {
                return Ok(Some(StylePaint::Fill(FillStyle {
                    color: BACKGROUND,
                    opacity: 1.0,
                })));
            }
            Self::LanduseContext => {
                return Ok(Some(StylePaint::Fill(FillStyle {
                    color: match kind {
                        "commercial" => "#ffede0",
                        "industrial" | "railway" => "#e8e9ee",
                        "hospital" => "#f5e0e0",
                        _ => "#f0e6d1",
                    },
                    opacity: 1.0,
                })));
            }
            Self::LanduseGreen => {
                return Ok(Some(StylePaint::Fill(FillStyle {
                    color: match kind {
                        "wood" | "forest" => "#55be3e",
                        "cemetery" => "#c5ebc2",
                        "grass" | "grassland" | "meadow" | "scrub" => "#a8e397",
                        _ => "#72ce59",
                    },
                    opacity: 0.7,
                })));
            }
            Self::AerowayArea => {
                return Ok(Some(StylePaint::Fill(FillStyle {
                    color: "#e8e9ee",
                    opacity: 1.0,
                })));
            }
            Self::Water => {
                return Ok(Some(StylePaint::Fill(FillStyle {
                    color: "#99ddff",
                    opacity: 1.0,
                })));
            }
            Self::Buildings => {
                return Ok(Some(StylePaint::Fill(FillStyle {
                    color: "#f5f0e5",
                    opacity: 0.85,
                })));
            }
            Self::Waterways => {
                return Ok(Some(StylePaint::Stroke(StrokeStyle {
                    color: "#99ddff",
                    width: match kind {
                        "river" => 2.0,
                        "canal" => 1.2,
                        _ => 0.8,
                    },
                    opacity: 1.0,
                    dash: &[],
                    cap: Cap::Round,
                    join: Join::Round,
                })));
            }
            Self::Paths => {
                return Ok(Some(StylePaint::Stroke(StrokeStyle {
                    color: "#d3d7e4",
                    width: 1.0,
                    opacity: 1.0,
                    dash: &[1.5, 1.5],
                    cap: Cap::Round,
                    join: Join::Round,
                })));
            }
            Self::Railways => {
                return Ok(Some(StylePaint::Stroke(StrokeStyle {
                    color: "#b1adb5",
                    width: 0.8,
                    opacity: 1.0,
                    dash: &[3.0, 2.0],
                    cap: Cap::Butt,
                    join: Join::Miter,
                })));
            }
            Self::Ferry => {
                return Ok(Some(StylePaint::Stroke(StrokeStyle {
                    color: "#6c9fb6",
                    width: 1.1,
                    opacity: 1.0,
                    dash: &[2.0, 2.0],
                    cap: Cap::Butt,
                    join: Join::Miter,
                })));
            }
            Self::AerowayLines => {
                return Ok(Some(StylePaint::Stroke(StrokeStyle {
                    color: "#d3d7e4",
                    width: if detail == "runway" { 4.0 } else { 1.5 },
                    opacity: 1.0,
                    dash: &[],
                    cap: Cap::Butt,
                    join: Join::Miter,
                })));
            }
            Self::RoadsTunnel | Self::RoadsGround | Self::RoadsBridge => {
                return Ok(Some(StylePaint::Stroke(StrokeStyle {
                    color: match detail {
                        "motorway" | "motorway_link" => "#b4c0d0",
                        "trunk" | "trunk_link" => "#b5b8ce",
                        _ => "#d3d7e4",
                    },
                    width: if context.properties.get("is_link") == Some(&Property::Bool(true)) {
                        2.0
                    } else {
                        match kind {
                            "highway" => 4.0,
                            "major_road" => 3.0,
                            _ => 1.0,
                        }
                    },
                    opacity: if self == Self::RoadsTunnel { 0.65 } else { 1.0 },
                    dash: if self == Self::RoadsTunnel {
                        &[2.0, 2.0]
                    } else {
                        &[]
                    },
                    cap: Cap::Round,
                    join: Join::Round,
                })));
            }
            Self::WaterNameLine => (
                12.0,
                "#0494dc",
                4.0,
                350.0,
                context.properties.get("min_zoom"),
            ),
            Self::WaterNamePoint => (
                12.0,
                "#0494dc",
                4.0,
                250.0,
                context.properties.get("min_zoom"),
            ),
            Self::RoadNameMajor => (11.0, "#626262", 4.0, 500.0, context._non_null("min_zoom")),
            Self::RoadNameMinor => (12.0, "#737373", 4.0, 400.0, context._non_null("min_zoom")),
            Self::PlaceIsland => (12.0, "#666666", 6.0, 250.0, None),
            Self::PlaceNeighborhood => (
                11.5,
                "#666666",
                5.0,
                250.0,
                context
                    ._non_null("sort_key")
                    .or_else(|| context._non_null("min_zoom")),
            ),
            Self::PlaceCity => (
                match detail {
                    "city" => 22.0,
                    "town" => 15.0,
                    "village" => 13.0,
                    _ => 11.0,
                },
                "#000000",
                4.0,
                250.0,
                context
                    ._non_null("sort_key")
                    .or_else(|| context._non_null("min_zoom")),
            ),
            Self::PlaceRegion => (
                13.0,
                "#666666",
                5.0,
                250.0,
                context
                    ._non_null("sort_key")
                    .or_else(|| context._non_null("min_zoom")),
            ),
            Self::PlaceCountry => (
                18.0,
                "#666666",
                6.0,
                250.0,
                context
                    ._non_null("sort_key")
                    .or_else(|| context._non_null("min_zoom")),
            ),
        };
        let mut name = match context._non_null("name") {
            Some(value) => _label_part(value)?,
            None => String::new(),
        };
        for key in ["name2", "name3"] {
            if let Some(value) = context.properties.get(key) {
                name.push(' ');
                name.push_str(&_label_part(value)?);
            }
        }
        let mut text = name.trim().to_string();
        if text.is_empty() {
            return Ok(None);
        }
        if self == Self::PlaceNeighborhood {
            text = text.to_uppercase();
        }
        let sort_key = match sort_key {
            Some(Property::Number(value)) if value.is_finite() => *value,
            None if !matches!(self, Self::WaterNameLine | Self::WaterNamePoint) => 0.0,
            _ => return Err("map label sort key must be a finite number".into()),
        };
        Ok(Some(StylePaint::Symbol(SymbolStyle {
            text: text,
            size: size,
            sort_key: sort_key,
            weight: if matches!(
                self,
                Self::PlaceIsland | Self::PlaceNeighborhood | Self::PlaceCountry
            ) {
                700
            } else {
                400
            },
            color: color,
            halo_color: "#ffffff",
            halo_width: 1.2,
            padding: padding,
            max_width: if self == Self::PlaceNeighborhood {
                8.0
            } else {
                9.0
            } * size,
            line_height: 1.2 * size,
            letter_spacing: if self == Self::PlaceNeighborhood {
                0.035
            } else {
                0.0
            } * size,
            placement: if matches!(
                self,
                Self::WaterNameLine | Self::RoadNameMajor | Self::RoadNameMinor
            ) {
                Placement::Line
            } else {
                Placement::Point
            },
            spacing: spacing,
            max_angle: 30.0,
        })))
    }
}

impl FeatureContext<'_> {
    fn _string(&self, key: &str) -> &str {
        match self.properties.get(key) {
            Some(Property::String(value)) => value,
            _ => "",
        }
    }

    fn _non_null(&self, key: &str) -> Option<&Property> {
        self.properties
            .get(key)
            .filter(|value| !matches!(value, Property::Null))
    }

    fn _minimum_zoom(&self) -> Result<f64, String> {
        match self.properties.get("min_zoom") {
            Some(Property::Number(value)) if value.is_finite() => Ok(*value),
            _ => Err("map label minimum zoom must be a finite number".into()),
        }
    }
}

fn _label_part(value: &Property) -> Result<String, String> {
    match value {
        Property::String(value) => Ok(value.clone()),
        Property::Number(value) => Ok(value.to_string()),
        Property::Bool(value) => Ok(value.to_string()),
        Property::Null => Err("map label requires scalar name values".into()),
    }
}

#[cfg(test)]
mod tests;
