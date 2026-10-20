use super::*;
use serde_json::json;

#[test]
fn unrelated_provider_features_do_not_select_visual_layers() {
    for layer in LAYERS {
        for (geometry, properties) in [
            (GeometryType::Point, json!({"kind":"unknown"})),
            (
                GeometryType::LineString,
                json!({"kind":"unknown","name":"Hidden","min_zoom":99}),
            ),
        ] {
            assert!(
                _paint(layer, geometry, 15.0, properties).unwrap().is_none(),
                "{layer:?}"
            );
        }
    }
}

#[test]
fn unnamed_and_out_of_zoom_places_do_not_create_labels() {
    for (layer, kind) in [
        (Layer::PlaceIsland, "island"),
        (Layer::PlaceNeighborhood, "neighbourhood"),
        (Layer::PlaceCity, "locality"),
        (Layer::PlaceRegion, "region"),
        (Layer::PlaceCountry, "country"),
    ] {
        for values in [
            json!({"kind":kind,"kind_detail":"city","min_zoom":0}),
            json!({"kind":kind,"kind_detail":"city","min_zoom":99,"name":"Hidden"}),
        ] {
            if matches!(layer, Layer::PlaceIsland) && values.get("name").is_some() {
                continue;
            }
            assert!(
                _paint(layer, GeometryType::Point, 15.0, values)
                    .unwrap()
                    .is_none(),
                "{layer:?}"
            );
        }
    }
}

fn _properties(input: serde_json::Value) -> HashMap<String, Property> {
    input
        .as_object()
        .unwrap()
        .iter()
        .map(|(key, value)| {
            let property = match value {
                serde_json::Value::String(value) => Property::String(value.clone()),
                serde_json::Value::Number(value) => Property::Number(value.as_f64().unwrap()),
                serde_json::Value::Bool(value) => Property::Bool(*value),
                serde_json::Value::Null => Property::Null,
                _ => panic!("scalar test properties"),
            };
            (key.clone(), property)
        })
        .collect()
}

fn _paint(
    layer: Layer,
    geometry_type: GeometryType,
    zoom: f64,
    values: serde_json::Value,
) -> Result<Option<StylePaint>, String> {
    let properties = _properties(values);
    let context = FeatureContext {
        properties: &properties,
        geometry_type: geometry_type,
        zoom: zoom,
    };
    if layer.selected(&context)? {
        layer.paint_selected(&context)
    } else {
        Ok(None)
    }
}

fn _fill(layer: Layer, values: serde_json::Value) -> FillStyle {
    match _paint(layer, GeometryType::Polygon, 15.0, values)
        .unwrap()
        .unwrap()
    {
        StylePaint::Fill(paint) => paint,
        _ => panic!("fill layer"),
    }
}

fn _stroke(layer: Layer, values: serde_json::Value) -> StrokeStyle {
    match _paint(layer, GeometryType::LineString, 15.0, values)
        .unwrap()
        .unwrap()
    {
        StylePaint::Stroke(paint) => paint,
        _ => panic!("stroke layer"),
    }
}

fn _symbol(layer: Layer, values: serde_json::Value) -> SymbolStyle {
    let geometry = if matches!(
        layer,
        Layer::WaterNameLine | Layer::RoadNameMajor | Layer::RoadNameMinor
    ) {
        GeometryType::LineString
    } else {
        GeometryType::Point
    };
    let zoom = if matches!(layer, Layer::PlaceRegion | Layer::PlaceCountry) {
        10.0
    } else {
        15.0
    };
    match _paint(layer, geometry, zoom, values).unwrap().unwrap() {
        StylePaint::Symbol(paint) => paint,
        _ => panic!("symbol layer"),
    }
}

#[test]
fn retains_the_qualified_layer_order_and_landmark_priority_boundary() {
    assert_eq!(
        LAYERS,
        [
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
            Layer::PlaceCountry
        ]
    );
    assert_eq!(BACKGROUND, "#f5f1f0");
    assert_eq!(
        LAYERS.iter().position(|layer| layer.is_landmark_boundary()),
        Some(19)
    );
    assert_eq!(
        LAYERS
            .iter()
            .filter(|layer| layer.is_landmark_boundary())
            .count(),
        1
    );
    assert_eq!(LAYERS.iter().filter(|layer| layer.is_symbol()).count(), 9);
    assert_eq!(Layer::Background.source_layer(), None);
    assert_eq!(Layer::Earth.source_layer(), Some("earth"));
    assert_eq!(Layer::LanduseGreen.source_layer(), Some("landuse"));
    assert_eq!(Layer::Waterways.source_layer(), Some("water"));
    assert_eq!(Layer::Buildings.source_layer(), Some("buildings"));
    assert_eq!(Layer::RoadNameMajor.source_layer(), Some("roads"));
    assert_eq!(Layer::PlaceCity.source_layer(), Some("places"));
    assert!(
        _paint(Layer::Background, GeometryType::Point, 15.0, json!({}))
            .unwrap()
            .is_none()
    );
}

#[test]
fn selects_geographic_features_by_source_geometry_kind_and_zoom() {
    for (layer, kind, geometry, zoom, expected) in [
        (Layer::Earth, "earth", GeometryType::Polygon, 13.0, true),
        (Layer::Earth, "earth", GeometryType::Point, 13.0, false),
        (
            Layer::LanduseContext,
            "school",
            GeometryType::Polygon,
            13.0,
            true,
        ),
        (
            Layer::LanduseContext,
            "other",
            GeometryType::Polygon,
            13.0,
            false,
        ),
        (
            Layer::LanduseContext,
            "school",
            GeometryType::Point,
            13.0,
            false,
        ),
        (
            Layer::LanduseGreen,
            "park",
            GeometryType::Polygon,
            13.0,
            true,
        ),
        (
            Layer::LanduseGreen,
            "other",
            GeometryType::Polygon,
            13.0,
            false,
        ),
        (
            Layer::AerowayArea,
            "runway",
            GeometryType::Polygon,
            13.0,
            true,
        ),
        (
            Layer::AerowayArea,
            "other",
            GeometryType::Polygon,
            13.0,
            false,
        ),
        (Layer::Water, "lake", GeometryType::Polygon, 13.0, true),
        (Layer::Water, "lake", GeometryType::LineString, 13.0, false),
        (
            Layer::Waterways,
            "ditch",
            GeometryType::LineString,
            13.0,
            true,
        ),
        (
            Layer::Waterways,
            "lake",
            GeometryType::LineString,
            13.0,
            false,
        ),
        (
            Layer::Buildings,
            "building",
            GeometryType::Polygon,
            14.0,
            false,
        ),
        (
            Layer::Buildings,
            "building",
            GeometryType::Polygon,
            15.0,
            true,
        ),
        (
            Layer::Buildings,
            "building_part",
            GeometryType::Polygon,
            15.0,
            true,
        ),
        (
            Layer::Buildings,
            "other",
            GeometryType::Polygon,
            15.0,
            false,
        ),
        (Layer::Paths, "path", GeometryType::LineString, 13.0, true),
        (
            Layer::Railways,
            "rail",
            GeometryType::LineString,
            13.0,
            true,
        ),
        (Layer::Ferry, "ferry", GeometryType::LineString, 13.0, true),
        (
            Layer::AerowayLines,
            "aeroway",
            GeometryType::LineString,
            13.0,
            true,
        ),
    ] {
        assert_eq!(
            _paint(layer, geometry, zoom, json!({"kind":kind}))
                .unwrap()
                .is_some(),
            expected,
            "{layer:?} {kind}"
        );
    }
}

#[test]
fn preserves_landuse_water_and_building_palette_and_opacity() {
    assert_eq!(_fill(Layer::Earth, json!({})).color, BACKGROUND);
    assert_eq!(_fill(Layer::Water, json!({})).color, "#99ddff");
    assert_eq!(
        _fill(Layer::Buildings, json!({"kind":"building"})).opacity,
        0.85
    );
    assert_eq!(
        _fill(Layer::Buildings, json!({"kind":"building"})).color,
        "#f5f0e5"
    );
    assert_eq!(
        _fill(Layer::AerowayArea, json!({"kind":"aerodrome"})).color,
        "#e8e9ee"
    );
    for (kind, expected) in [
        ("commercial", "#ffede0"),
        ("industrial", "#e8e9ee"),
        ("railway", "#e8e9ee"),
        ("hospital", "#f5e0e0"),
        ("school", "#f0e6d1"),
    ] {
        let paint = _fill(Layer::LanduseContext, json!({"kind":kind}));
        assert_eq!(paint.color, expected);
        assert_eq!(paint.opacity, 1.0);
    }
    for (kind, expected) in [
        ("wood", "#55be3e"),
        ("forest", "#55be3e"),
        ("cemetery", "#c5ebc2"),
        ("grass", "#a8e397"),
        ("grassland", "#a8e397"),
        ("meadow", "#a8e397"),
        ("scrub", "#a8e397"),
        ("park", "#72ce59"),
    ] {
        let paint = _fill(Layer::LanduseGreen, json!({"kind":kind}));
        assert_eq!(paint.color, expected);
        assert_eq!(paint.opacity, 0.7);
    }
}

#[test]
fn distinguishes_tunnel_and_bridge_property_presence_from_boolean_value() {
    for (values, expected) in [
        (json!({"kind":"major_road"}), vec![Layer::RoadsGround]),
        (
            json!({"kind":"major_road","is_tunnel":false}),
            vec![Layer::RoadsTunnel],
        ),
        (
            json!({"kind":"major_road","is_bridge":null}),
            vec![Layer::RoadsBridge],
        ),
        (
            json!({"kind":"major_road","is_tunnel":true,"is_bridge":true}),
            vec![Layer::RoadsTunnel, Layer::RoadsBridge],
        ),
        (json!({"kind":null}), vec![]),
    ] {
        let actual = [Layer::RoadsTunnel, Layer::RoadsGround, Layer::RoadsBridge]
            .into_iter()
            .filter(|layer| {
                _paint(*layer, GeometryType::LineString, 13.0, values.clone())
                    .unwrap()
                    .is_some()
            })
            .collect::<Vec<_>>();
        assert_eq!(actual, expected);
    }
    assert!(
        _paint(
            Layer::RoadsGround,
            GeometryType::Polygon,
            13.0,
            json!({"kind":"major_road"})
        )
        .unwrap()
        .is_none()
    );
}

#[test]
fn retains_road_hierarchy_link_width_and_stroke_units() {
    for layer in [Layer::RoadsTunnel, Layer::RoadsGround, Layer::RoadsBridge] {
        for (kind, width) in [
            ("highway", 4.0),
            ("major_road", 3.0),
            ("minor_road", 1.0),
            ("other", 1.0),
        ] {
            let mut values = json!({"kind":kind});
            if layer == Layer::RoadsTunnel {
                values["is_tunnel"] = json!(false);
            }
            if layer == Layer::RoadsBridge {
                values["is_bridge"] = json!(false);
            }
            let paint = _stroke(layer, values.clone());
            assert_eq!(paint.width, width);
            assert!(matches!(paint.cap, Cap::Round));
            assert!(matches!(paint.join, Join::Round));
            assert_eq!(
                paint.opacity,
                if layer == Layer::RoadsTunnel {
                    0.65
                } else {
                    1.0
                }
            );
            assert_eq!(
                paint.dash,
                if layer == Layer::RoadsTunnel {
                    &[2.0, 2.0][..]
                } else {
                    &[]
                }
            );
            values["is_link"] = json!(true);
            assert_eq!(_stroke(layer, values).width, 2.0);
        }
    }
    for (detail, color) in [
        ("motorway", "#b4c0d0"),
        ("motorway_link", "#b4c0d0"),
        ("trunk", "#b5b8ce"),
        ("trunk_link", "#b5b8ce"),
        ("primary", "#d3d7e4"),
    ] {
        assert_eq!(
            _stroke(
                Layer::RoadsGround,
                json!({"kind":"major_road","kind_detail":detail})
            )
            .color,
            color
        );
    }
    for (kind, width) in [("river", 2.0), ("canal", 1.2), ("stream", 0.8)] {
        assert_eq!(_stroke(Layer::Waterways, json!({"kind":kind})).width, width);
    }
    for (detail, width) in [("runway", 4.0), ("taxiway", 1.5)] {
        assert_eq!(
            _stroke(
                Layer::AerowayLines,
                json!({"kind":"aeroway","kind_detail":detail})
            )
            .width,
            width
        );
    }
    assert_eq!(
        _stroke(Layer::Paths, json!({"kind":"path"})).dash,
        &[1.5, 1.5]
    );
    for (layer, kind, color, width, dash) in [
        (Layer::Railways, "rail", "#b1adb5", 0.8, &[3.0, 2.0][..]),
        (Layer::Ferry, "ferry", "#6c9fb6", 1.1, &[2.0, 2.0][..]),
    ] {
        let paint = _stroke(layer, json!({"kind":kind}));
        assert_eq!((paint.color, paint.width, paint.dash), (color, width, dash));
        assert!(matches!(paint.cap, Cap::Butt));
        assert!(matches!(paint.join, Join::Miter));
    }
}

#[test]
fn assembles_multilingual_scalar_names_with_native_number_formatting() {
    let values = json!({"kind":"island","name":"São Paulo","name2":"東京","name3":"القاهرة"});
    assert_eq!(
        _symbol(Layer::PlaceIsland, values).text,
        "São Paulo 東京 القاهرة"
    );
    assert_eq!(
        _symbol(
            Layer::PlaceIsland,
            json!({"kind":"island","name":10,"name2":false})
        )
        .text,
        "10 false"
    );
    for (value, expected) in [
        (1e21, "1000000000000000000000"),
        (1e20, "100000000000000000000"),
        (1e-7, "0.0000001"),
        (1e-6, "0.000001"),
        (-0.0, "-0"),
    ] {
        assert_eq!(
            _symbol(Layer::PlaceIsland, json!({"kind":"island","name":value})).text,
            expected
        );
    }
    assert!(
        _paint(
            Layer::PlaceIsland,
            GeometryType::Point,
            13.0,
            json!({"kind":"island","name":null})
        )
        .unwrap()
        .is_none()
    );
    assert!(
        _paint(
            Layer::PlaceIsland,
            GeometryType::Point,
            13.0,
            json!({"kind":"island","name":"Ilha","name2":null})
        )
        .is_err()
    );
}

#[test]
fn preserves_bom_and_trims_unicode_nel_from_map_labels() {
    assert_eq!(
        _symbol(
            Layer::PlaceIsland,
            json!({"kind":"island","name":"\u{feff} Ilha \u{feff}"})
        )
        .text,
        "\u{feff} Ilha \u{feff}"
    );
    assert_eq!(
        _symbol(
            Layer::PlaceIsland,
            json!({"kind":"island","name":"\u{85}Ilha\u{85}"})
        )
        .text,
        "Ilha"
    );
}

#[test]
fn validates_numeric_water_zoom_and_preserves_named_waterway_selection() {
    for (kind, selected) in [
        ("river", true),
        ("canal", true),
        ("stream", true),
        ("ditch", false),
    ] {
        assert_eq!(
            _paint(
                Layer::WaterNameLine,
                GeometryType::LineString,
                13.0,
                json!({"kind":kind,"name":"Tietê","min_zoom":13})
            )
            .unwrap()
            .is_some(),
            selected
        );
    }
    for minimum in [json!("13"), json!(false), json!(null)] {
        assert!(
            _paint(
                Layer::WaterNamePoint,
                GeometryType::Point,
                13.0,
                json!({"name":"Lago","min_zoom":minimum})
            )
            .is_err()
        );
    }
    assert!(
        _paint(
            Layer::WaterNamePoint,
            GeometryType::Point,
            13.0,
            json!({"name":"Lago"})
        )
        .is_err()
    );
    assert!(
        _paint(
            Layer::WaterNamePoint,
            GeometryType::Point,
            13.0,
            json!({"name":"Lago","min_zoom":14})
        )
        .unwrap()
        .is_none()
    );
    let line = _symbol(
        Layer::WaterNameLine,
        json!({"kind":"river","name":"Tietê","min_zoom":13}),
    );
    assert_eq!(
        (line.size, line.sort_key, line.spacing, line.max_angle),
        (12.0, 13.0, 350.0, 30.0)
    );
    assert_eq!((line.color, line.placement), ("#0494dc", Placement::Line));
    assert_eq!(
        _symbol(Layer::WaterNamePoint, json!({"name":"Lago","min_zoom":13})).placement,
        Placement::Point
    );
}

#[test]
fn keeps_neighborhood_visibility_one_zoom_ahead_and_unicode_uppercase() {
    for (minimum, selected) in [
        (json!(13), true),
        (json!(14), true),
        (json!(15), false),
        (json!(null), false),
    ] {
        assert_eq!(
            _paint(
                Layer::PlaceNeighborhood,
                GeometryType::Point,
                13.0,
                json!({"kind":"neighbourhood","name":"Sé","min_zoom":minimum})
            )
            .unwrap()
            .is_some(),
            selected
        );
    }
    assert!(
        _paint(
            Layer::PlaceNeighborhood,
            GeometryType::Point,
            13.0,
            json!({"kind":"macrohood","name":"Sé"})
        )
        .unwrap()
        .is_none()
    );
    assert!(
        _paint(
            Layer::PlaceNeighborhood,
            GeometryType::Point,
            13.0,
            json!({"kind":"macrohood","name":"Sé","min_zoom":false})
        )
        .is_err()
    );
    let paint = _symbol(
        Layer::PlaceNeighborhood,
        json!({"kind":"macrohood","name":"Sé Straße σς ı","min_zoom":1}),
    );
    assert_eq!(paint.text, "SÉ STRASSE ΣΣ I");
    assert_eq!(
        (paint.size, paint.max_width, paint.padding, paint.weight),
        (11.5, 92.0, 5.0, 700)
    );
    assert_eq!(paint.letter_spacing, 0.035 * 11.5);
}

#[test]
fn retains_major_minor_road_visibility_and_typography() {
    for (layer, kind, detail, zoom, selected) in [
        (Layer::RoadNameMajor, "highway", "primary", 13.0, true),
        (Layer::RoadNameMajor, "highway", "other", 13.0, false),
        (Layer::RoadNameMajor, "highway", "trunk", 10.0, false),
        (Layer::RoadNameMinor, "path", "other", 15.0, true),
        (Layer::RoadNameMinor, "path", "other", 14.0, false),
    ] {
        assert_eq!(
            _paint(
                layer,
                GeometryType::LineString,
                zoom,
                json!({"name":"Rua","kind":kind,"kind_detail":detail})
            )
            .unwrap()
            .is_some(),
            selected
        );
    }
    let major = _symbol(
        Layer::RoadNameMajor,
        json!({"kind":"major_road","kind_detail":"primary","name":"Rua"}),
    );
    assert_eq!(
        (
            major.size,
            major.spacing,
            major.color,
            major.weight,
            major.sort_key
        ),
        (11.0, 500.0, "#626262", 400, 0.0)
    );
    let minor = _symbol(
        Layer::RoadNameMinor,
        json!({"kind":"other","name":"Rua","min_zoom":7}),
    );
    assert_eq!(
        (minor.size, minor.spacing, minor.color, minor.sort_key),
        (12.0, 400.0, "#737373", 7.0)
    );
    assert!(
        _paint(
            Layer::RoadNameMinor,
            GeometryType::LineString,
            15.0,
            json!({"kind":"other","name":"Rua","min_zoom":false})
        )
        .is_err()
    );
}

#[test]
fn preserves_locality_sizes_overview_visibility_and_source_sort_values() {
    for (detail, size) in [("city", 22.0), ("town", 15.0), ("village", 13.0)] {
        let paint = _symbol(
            Layer::PlaceCity,
            json!({"kind":"locality","kind_detail":detail,"name":"São Paulo","min_zoom":8}),
        );
        assert_eq!(
            (paint.size, paint.sort_key, paint.color),
            (size, 8.0, "#000000")
        );
    }
    assert!(
        _paint(
            Layer::PlaceCity,
            GeometryType::Point,
            13.0,
            json!({"kind":"locality","kind_detail":"other","name":"Local","min_zoom":8})
        )
        .unwrap()
        .is_none()
    );
    assert_eq!(
        _symbol(
            Layer::PlaceCity,
            json!({"kind":"locality","kind_detail":"city","name":"São Paulo","min_zoom":8,"sort_key":0})
        ).sort_key,
        0.0
    );
    assert!(
        _paint(
            Layer::PlaceCity,
            GeometryType::Point,
            13.0,
            json!({"kind":"locality","kind_detail":"city","name":"São Paulo","min_zoom":8,"sort_key":false})
        ).is_err()
    );
    for (layer, kind, size, weight, padding) in [
        (Layer::PlaceRegion, "region", 13.0, 400, 5.0),
        (Layer::PlaceCountry, "country", 18.0, 700, 6.0),
    ] {
        let paint = _symbol(layer, json!({"kind":kind,"name":"Brasil","min_zoom":8}));
        assert_eq!(
            (
                paint.size,
                paint.weight,
                paint.padding,
                paint.halo_color,
                paint.halo_width,
                paint.line_height
            ),
            (size, weight, padding, "#ffffff", 1.2, 1.2 * size)
        );
        assert!(
            _paint(
                layer,
                GeometryType::Point,
                11.0,
                json!({"kind":kind,"name":"Brasil","min_zoom":8})
            )
            .unwrap()
            .is_none()
        );
    }
    let island = _symbol(Layer::PlaceIsland, json!({"kind":"island","name":"Ilha"}));
    assert_eq!(
        (island.size, island.weight, island.sort_key, island.color),
        (12.0, 700, 0.0, "#666666")
    );
}

#[test]
fn rejects_nonfinite_minimum_zoom_and_sort_keys_without_coercion() {
    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let mut properties = _properties(json!({"kind":"river","name":"Rio"}));
        properties.insert("min_zoom".into(), Property::Number(value));
        assert!(
            Layer::WaterNameLine
                .selected(&FeatureContext {
                    properties: &properties,
                    geometry_type: GeometryType::LineString,
                    zoom: 15.0
                })
                .is_err()
        );
        properties.insert("kind".into(), Property::String("other".into()));
        assert!(
            Layer::RoadNameMinor
                .paint_selected(&FeatureContext {
                    properties: &properties,
                    geometry_type: GeometryType::LineString,
                    zoom: 15.0
                })
                .is_err()
        );
    }
}

#[test]
fn formats_nonfinite_scalar_names_with_native_number_formatting() {
    for (value, expected) in [
        (f64::NAN, "NaN"),
        (f64::INFINITY, "inf"),
        (f64::NEG_INFINITY, "-inf"),
    ] {
        let mut properties = _properties(json!({"kind": "island"}));
        properties.insert("name".into(), Property::Number(value));
        let context = FeatureContext {
            properties: &properties,
            geometry_type: GeometryType::Point,
            zoom: 15.0,
        };
        assert!(Layer::PlaceIsland.selected(&context).unwrap());
        let Some(StylePaint::Symbol(paint)) = Layer::PlaceIsland.paint_selected(&context).unwrap()
        else {
            panic!("selected island label");
        };
        assert_eq!(paint.text, expected);
    }
}
