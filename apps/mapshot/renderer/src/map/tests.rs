use super::*;
use crate::map::style::{GeometryType, Property};
use crate::map::vector_tile::Feature;

fn _camera() -> _Camera {
    _Camera {
        latitude: 0.0,
        longitude: 0.0,
        zoom: 0.0,
        width: 512.0,
        height: 512.0,
        pixel_ratio: 2.0,
    }
}

fn _input() -> MapSceneInput {
    MapSceneInput {
        camera: _camera(),
        tiles: Vec::new(),
        landmarks: _LandmarksInput {
            candidates: Vec::new(),
            style: LandmarkStyle {
                badge_radius: 9.0,
                badge_stroke_width: 1.25,
                label_gap: 3.0,
                edge_margin: 6.0,
                label_font_size: 10.0,
                label_max_width: 80.0,
                label_max_lines: 3,
                label_line_height: 12.0,
                label_letter_spacing: -0.2,
                label_halo_width: 2.0,
            },
        },
    }
}

fn _feature(
    kind: GeometryType,
    properties: &[(&str, Property)],
    paths: Vec<Vec<_Point>>,
) -> Feature {
    let path_bounds = paths
        .iter()
        .map(|path| {
            path.iter().fold(
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
            )
        })
        .collect::<Vec<_>>();
    let bounds = path_bounds.iter().fold(
        [
            f64::INFINITY,
            f64::INFINITY,
            f64::NEG_INFINITY,
            f64::NEG_INFINITY,
        ],
        |bounds, path| {
            [
                bounds[0].min(path[0]),
                bounds[1].min(path[1]),
                bounds[2].max(path[2]),
                bounds[3].max(path[3]),
            ]
        },
    );
    Feature::from_geometry(
        properties
            .iter()
            .map(|(key, value)| ((*key).into(), value.clone()))
            .collect(),
        kind,
        512.0,
        bounds,
        Geometry {
            paths: paths,
            path_bounds: path_bounds,
        },
    )
}

fn _compile(layers: Vec<(&str, Vec<Feature>)>) -> Scene {
    let mut compiler = SceneCompiler::default();
    compiler._tiles.push_back(_CachedTile {
        key: "pinned".into(),
        bytes: 0,
        tile: Arc::new(DecodedTile::from_features(
            layers
                .into_iter()
                .map(|(name, features)| (name.into(), features))
                .collect(),
        )),
    });
    let mut input = _input();
    input.tiles.push(_TileInput {
        world_offset: 0,
        key: "pinned".into(),
        address: _Address { z: 0, x: 0, y: 0 },
        bytes: String::new(),
    });
    compiler.compile(input).unwrap()
}

fn _labels(paths: &[Vec<_Point>]) -> Vec<TextCommand> {
    _compiled_labels(paths, false)
}

fn _compiled_labels(paths: &[Vec<_Point>], point: bool) -> Vec<TextCommand> {
    let mut compiler = SceneCompiler::default();
    let properties = if point {
        vec![
            ("name", Property::String("Rua São Paulo".into())),
            ("kind", Property::String("locality".into())),
            ("kind_detail", Property::String("city".into())),
            ("min_zoom", Property::Number(0.0)),
        ]
    } else {
        vec![
            ("name", Property::String("Rua São Paulo".into())),
            ("kind", Property::String("minor_road".into())),
        ]
    };
    compiler._tiles.push_back(_CachedTile {
        key: "labels".into(),
        bytes: 0,
        tile: Arc::new(DecodedTile::from_features(HashMap::from([(
            if point {
                "places".into()
            } else {
                "roads".into()
            },
            vec![_feature(
                if point {
                    GeometryType::Point
                } else {
                    GeometryType::LineString
                },
                &properties,
                paths
                    .iter()
                    .map(|path| {
                        path.iter()
                            .map(|point| point.map(|value| value / 2.0))
                            .collect()
                    })
                    .collect(),
            )],
        )]))),
    });
    let mut input = _input();
    let world = 512.0 * 2.0_f64.powi(16);
    input.camera.zoom = 16.0;
    input.camera.width = 1024.0;
    input.camera.height = 1024.0;
    input.camera.longitude = 512.0 / world * 360.0;
    input.camera.latitude = (-2.0 * std::f64::consts::PI * 512.0 / world)
        .sinh()
        .atan()
        .to_degrees();
    input.tiles.push(_TileInput {
        world_offset: 0,
        key: "labels".into(),
        address: _Address {
            z: 15,
            x: 16384,
            y: 16384,
        },
        bytes: String::new(),
    });
    compiler
        .compile(input)
        .unwrap()
        .commands
        .into_iter()
        .filter_map(|command| match command {
            Command::Text { text, .. } => Some(*text),
            _ => None,
        })
        .collect()
}

#[test]
fn empty_authoritative_tile_produces_only_the_fixed_background() {
    let mut input = _input();
    input.tiles.push(_TileInput {
        world_offset: 0,
        key: "empty".into(),
        address: _Address { z: 0, x: 0, y: 0 },
        bytes: String::new(),
    });
    let mut compiler = SceneCompiler::default();
    let scene = compiler.compile(input).unwrap();
    assert!(scene.commands.is_empty());
    assert_eq!(scene.background, "#f5f1f0");
    assert_eq!(
        (scene.width, scene.height, scene.pixel_ratio),
        (512.0, 512.0, 2.0)
    );
    assert_eq!(compiler._tiles.len(), 1);
}

#[test]
fn malformed_vector_tiles_fail_without_caching() {
    let mut compiler = SceneCompiler::default();
    let mut input = _input();
    input.tiles.push(_TileInput {
        world_offset: 0,
        key: "bad".into(),
        address: _Address { z: 0, x: 0, y: 0 },
        bytes: "/w==".into(),
    });
    assert!(compiler.compile(input).is_err());
    assert!(compiler._tiles.is_empty());
}

#[test]
fn negative_half_pixels_follow_javascript_rounding_before_float32_conversion() {
    assert_eq!(SceneCompiler::_round(-1.5), -1.0);
    assert_eq!(SceneCompiler::_round(-0.5), 0.0);
    assert_eq!(SceneCompiler::_round(0.5), 1.0);
    assert_eq!(SceneCompiler::_round(0.49999999999999994), 0.0);
    assert_eq!(SceneCompiler::_round(-0.5000000000000001), -1.0);
    assert_eq!(
        SceneCompiler::_round(4503599627370495.0),
        4503599627370495.0
    );
    let scene = _compile(vec![(
        "earth",
        vec![_feature(
            GeometryType::Polygon,
            &[],
            vec![vec![
                [-0.5 / 64.0, 0.0],
                [1.5 / 64.0, 0.0],
                [1.5 / 64.0, 20.0],
                [-0.5 / 64.0, 0.0],
            ]],
        )],
    )]);
    let Command::Fill { paths, clip, .. } = &scene.commands[0] else {
        panic!("earth polygon should be a fill");
    };
    assert_eq!(paths[0][0], [0.0, 0.0]);
    assert_eq!(paths[0][1], [2.0 / 64.0, 0.0]);
    assert_eq!(*clip, Some([0.0, 0.0, 512.0, 512.0]));
}

#[test]
fn culling_keeps_visible_polygon_holes_and_the_four_pixel_paint_margin() {
    let scene = _compile(vec![(
        "earth",
        vec![_feature(
            GeometryType::Polygon,
            &[],
            vec![
                vec![[-4.0, 0.0], [-4.0, 20.0], [20.0, 20.0]],
                vec![[5.0, 5.0], [10.0, 10.0], [5.0, 10.0]],
                vec![[-5.0, 0.0], [-5.0, 10.0], [-5.0, 20.0]],
            ],
        )],
    )]);
    let Command::Fill { paths, .. } = &scene.commands[0] else {
        panic!("earth polygon should be a fill");
    };
    assert_eq!(paths.len(), 2);
    assert_eq!(paths[0][0], [-4.0, 0.0]);
    assert_eq!(paths[1][0], [5.0, 5.0]);
}

#[test]
fn line_clipping_preserves_disconnected_runs_and_boundary_segments() {
    let labels = _labels(&[vec![
        [-1024.0, 512.0],
        [1024.0, 512.0],
        [1024.0, 2048.0],
        [512.0, 512.0],
    ]]);
    let mut paths = Vec::new();
    for label in labels {
        let path = label.path.unwrap();
        if !paths.contains(&path) {
            paths.push(path);
        }
    }
    assert_eq!(paths.len(), 2);
    assert_eq!(
        paths[0],
        vec![[0.0, 512.0], [1024.0, 512.0], [1024.0, 1024.0]]
    );
    assert!((paths[1][0][0] - 2048.0 / 3.0).abs() < 0.001);
    assert_eq!(paths[1][0][1], 1024.0);
    assert_eq!(paths[1][1], [512.0, 512.0]);
    assert!(_labels(&[vec![[-512.0, -102.4], [1536.0, -102.4]]]).is_empty());
}

#[test]
fn line_labels_stitch_all_endpoint_orientations_before_repeating() {
    for paths in [
        vec![
            vec![[0.0, 5.0], [150.0, 5.0]],
            vec![[150.0, 5.0], [300.0, 5.0]],
        ],
        vec![
            vec![[0.0, 5.0], [150.0, 5.0]],
            vec![[300.0, 5.0], [150.0, 5.0]],
        ],
        vec![
            vec![[150.0, 5.0], [300.0, 5.0]],
            vec![[0.0, 5.0], [150.0, 5.0]],
        ],
        vec![
            vec![[150.0, 5.0], [300.0, 5.0]],
            vec![[150.0, 5.0], [0.0, 5.0]],
        ],
    ] {
        let labels = _labels(&paths);
        assert_eq!(labels.len(), 1);
        assert_eq!((labels[0].x, labels[0].y), (Some(150.0), Some(5.0)));
        assert_eq!(
            labels[0].path.as_ref().unwrap(),
            &[[0.0, 5.0], [150.0, 5.0], [300.0, 5.0]]
        );
    }
    let labels = _labels(&[vec![[0.0, 5.0], [1000.0, 5.0]]]);
    assert_eq!(labels.len(), 2);
    assert_eq!((labels[0].x, labels[1].x), (Some(250.0), Some(750.0)));
    assert!(_labels(&[vec![[0.0, 5.0], [19.0, 5.0]]]).is_empty());
}

#[test]
fn duplicate_point_labels_use_first_encounter_and_closed_viewport_edges() {
    let output = _compiled_labels(
        &[vec![
            [0.0, 0.0],
            [0.1, 0.1],
            [1024.0, 1024.0],
            [-0.1, 0.0],
            [1024.1, 1024.0],
        ]],
        true,
    );
    assert_eq!(output.len(), 2);
    assert_eq!((output[0].x, output[0].y), (Some(0.0), Some(0.0)));
    assert_eq!((output[1].x, output[1].y), (Some(1024.0), Some(1024.0)));
}

#[test]
fn city_town_and_village_labels_carry_native_locality_metadata() {
    let scene = _compile(vec![(
        "places",
        ["city", "town", "village"]
            .into_iter()
            .enumerate()
            .map(|(index, detail)| {
                _feature(
                    GeometryType::Point,
                    &[
                        ("kind", Property::String("locality".into())),
                        ("kind_detail", Property::String(detail.into())),
                        ("name", Property::String(detail.into())),
                        ("min_zoom", Property::Number(0.0)),
                    ],
                    vec![vec![[100.0 + index as f64 * 100.0, 100.0]]],
                )
            })
            .collect(),
    )]);
    let metadata = scene
        .commands
        .iter()
        .filter_map(|command| match command {
            Command::Text { text } => Some((text.text.as_str(), text.locality)),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(
        metadata,
        [("city", true), ("town", true), ("village", true)]
    );
}

#[test]
fn neighborhood_point_labels_allow_locality_placement_while_roads_keep_their_geometry() {
    let scene = _compile(vec![(
        "places",
        vec![_feature(
            GeometryType::Point,
            &[
                ("kind", Property::String("neighbourhood".into())),
                ("name", Property::String("Centro".into())),
                ("min_zoom", Property::Number(0.0)),
            ],
            vec![vec![[100.0, 100.0]]],
        )],
    )]);
    let neighborhood_metadata = scene.commands.iter().filter_map(|command| match command {
        Command::Text { text } => Some(text.locality),
        _ => None,
    });
    let road_metadata = _labels(&[vec![[0.0, 5.0], [300.0, 5.0]]])
        .into_iter()
        .map(|text| text.locality);
    assert_eq!(
        neighborhood_metadata
            .chain(road_metadata)
            .collect::<Vec<_>>(),
        [true, false]
    );
}

#[test]
fn wire_text_cannot_enable_native_locality_metadata() {
    let text: TextCommand = serde_json::from_value(serde_json::json!({
        "text":"City", "size":22, "color":"#000", "locality":true
    }))
    .unwrap();
    assert!(!text.locality);
}

#[test]
fn tied_source_sort_keys_preserve_feature_encounter_order_and_layer_priority() {
    let scene = _compile(vec![(
        "places",
        vec![
            _feature(
                GeometryType::Point,
                &[
                    ("kind", Property::String("locality".into())),
                    ("kind_detail", Property::String("city".into())),
                    ("name", Property::String("Primeira".into())),
                    ("min_zoom", Property::Number(0.0)),
                ],
                vec![vec![[100.0, 100.0]]],
            ),
            _feature(
                GeometryType::Point,
                &[
                    ("kind", Property::String("locality".into())),
                    ("kind_detail", Property::String("city".into())),
                    ("name", Property::String("Segunda".into())),
                    ("min_zoom", Property::Number(0.0)),
                ],
                vec![vec![[300.0, 300.0]]],
            ),
        ],
    )]);
    let labels = scene
        .commands
        .iter()
        .filter_map(|command| match command {
            Command::Text { text } => Some(text),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(labels.len(), 2);
    assert!(labels.iter().all(|label| label.id.is_none()));
    assert_eq!(
        (&*labels[0].text, &*labels[1].text),
        ("Primeira", "Segunda")
    );
    assert!(labels[0].priority > labels[1].priority);
    assert!(
        labels
            .iter()
            .all(|label| label.priority > 21.0 * 100000.0 && label.priority < 22.0 * 100000.0)
    );
}

#[test]
fn landmarks_cross_the_antimeridian_and_keep_relevance_metadata() {
    for height in [512.0, 768.0] {
        let mut input = _input();
        input.camera.longitude = 179.9;
        input.camera.zoom = 3.0;
        input.camera.height = height;
        input.landmarks.candidates.push(_LandmarkInput {
            id: "landmark:museum".into(),
            labels: Vec::new(),
            coordinates: _Coordinates {
                latitude: 0.0,
                longitude: -179.9,
            },
            badge: LandmarkBadge {
                path: "/assets/museum.png".into(),
                logical_size: 22.0,
            },
            text_color: "#008236".into(),
            rank: 1.0,
            source_min_zoom: Some(15.0),
        });
        let scene = SceneCompiler::default().compile(input).unwrap();
        assert_eq!(
            scene
                .commands
                .iter()
                .filter(|command| matches!(command, Command::Landmarks { .. }))
                .count(),
            1,
        );
        let Command::Landmarks { layout } = &scene.commands[0] else {
            panic!("landmarks should be inserted");
        };
        assert_eq!(layout.view_zoom, 3.0);
        assert_eq!(layout.candidates[0].source_min_zoom, Some(15.0));
        assert!((layout.candidates[0].center[0] - (256.0 + 0.2 / 360.0 * 4096.0)).abs() < 1e-9);
        assert_eq!(layout.candidates[0].center[1], height / 2.0);
        assert_eq!(layout.priority, 19.0 * 100000.0 - 1.0);
    }
}

#[test]
fn repeated_cached_tiles_keep_each_world_copy_at_normal_and_negative_zooms() {
    for zoom in [0.0, -1.0] {
        let world = 512.0 * 2.0_f64.powf(zoom);
        let mut compiler = SceneCompiler::default();
        compiler._tiles.push_back(_CachedTile {
            key: "world".into(),
            bytes: 0,
            tile: Arc::new(DecodedTile::from_features(HashMap::from([(
                "water".into(),
                vec![_feature(
                    GeometryType::Polygon,
                    &[],
                    vec![vec![[0.0, 0.0], [512.0, 0.0], [512.0, 512.0], [0.0, 512.0]]],
                )],
            )]))),
        });
        let mut input = _input();
        input.camera.zoom = zoom;
        input.camera.width = world * 3.0;
        input.camera.height = world;
        for world_offset in [-1, 0, 1] {
            input.tiles.push(_TileInput {
                key: "world".into(),
                address: _Address { z: 0, x: 0, y: 0 },
                world_offset: world_offset,
                bytes: String::new(),
            });
        }
        let scene = compiler.compile(input).unwrap();
        assert_eq!(scene.commands.len(), 3);
        for (index, command) in scene.commands.iter().enumerate() {
            let Command::Fill { paths, clip, .. } = command else {
                panic!("each world copy must retain its water polygon");
            };
            let x = (index as f64 * world) as f32;
            assert_eq!(paths[0][0], [x, 0.0]);
            assert_eq!(paths[0][2], [x + world as f32, world as f32]);
            assert_eq!(*clip, Some([x, 0.0, x + world as f32, world as f32]));
        }
    }
}

#[test]
fn nonfinite_world_copy_projection_is_rejected_before_drawing() {
    let mut input = _input();
    input.camera.zoom = 1014.0;
    input.camera.longitude = -180.0;
    input.tiles.push(_TileInput {
        key: "world".into(),
        address: _Address { z: 0, x: 0, y: 0 },
        world_offset: 2,
        bytes: String::new(),
    });
    let mut compiler = SceneCompiler::default();
    assert!(compiler.compile(input).err().unwrap().contains("finite"));
}

#[test]
fn adjacent_world_tiles_remain_contiguous_across_the_antimeridian() {
    for (longitude, boundary_offset, west_x, east_x) in [
        (179.5, 0.5, -253.15625, 258.84375),
        (-179.5, -0.5, -258.84375, 253.15625),
    ] {
        let mut compiler = SceneCompiler::default();
        let mut input = _input();
        input.camera.longitude = longitude;
        input.camera.zoom = 2.0;
        for (key, x) in [("west", 3), ("east", 0)] {
            let feature = _feature(
                GeometryType::Polygon,
                &[],
                vec![vec![[0.0, 0.0], [512.0, 0.0], [512.0, 512.0], [0.0, 512.0]]],
            );
            compiler._tiles.push_back(_CachedTile {
                key: key.into(),
                bytes: 0,
                tile: Arc::new(DecodedTile::from_features(HashMap::from([(
                    "water".into(),
                    vec![feature],
                )]))),
            });
            input.tiles.push(_TileInput {
                world_offset: 0,
                key: key.into(),
                address: _Address { z: 2, x: x, y: 2 },
                bytes: String::new(),
            });
        }
        let scene = compiler.compile(input).unwrap();
        let [
            Command::Fill {
                paths: west,
                clip: Some(west_clip),
                ..
            },
            Command::Fill {
                paths: east,
                clip: Some(east_clip),
                ..
            },
        ] = scene.commands.as_slice()
        else {
            panic!("both adjacent water tiles must remain visible");
        };
        let boundary = 256.0 + boundary_offset / 360.0 * 2048.0;
        assert!((f64::from(east_clip[0]) - boundary).abs() < 1e-4);
        assert_eq!(west_clip[2], east_clip[0]);
        assert_eq!(west[0][0][0], west_x);
        assert_eq!(east[0][0][0], east_x);
        assert_eq!(west[0][1][0], east[0][0][0]);
    }
}

#[test]
fn cache_hits_refresh_recency_and_new_pinned_revisions_evict_oldest_entries() {
    let mut compiler = SceneCompiler::default();
    let maximum_cache_entries = 128;
    for index in 0..maximum_cache_entries {
        compiler
            .compile({
                let mut input = _input();
                input.tiles.push(_TileInput {
                    world_offset: 0,
                    key: index.to_string(),
                    address: _Address { z: 0, x: 0, y: 0 },
                    bytes: String::new(),
                });
                input
            })
            .unwrap();
    }
    compiler
        .compile({
            let mut input = _input();
            input.tiles.push(_TileInput {
                world_offset: 0,
                key: "0".into(),
                address: _Address { z: 0, x: 0, y: 0 },
                bytes: String::new(),
            });
            input
        })
        .unwrap();
    compiler
        .compile({
            let mut input = _input();
            input.tiles.push(_TileInput {
                world_offset: 0,
                key: "new-revision".into(),
                address: _Address { z: 0, x: 0, y: 0 },
                bytes: String::new(),
            });
            input
        })
        .unwrap();
    assert_eq!(compiler._tiles.len(), maximum_cache_entries);
    assert_eq!(compiler._tiles.front().unwrap().key, "2");
    assert!(compiler._tiles.iter().any(|entry| entry.key == "0"));
    assert!(!compiler._tiles.iter().any(|entry| entry.key == "1"));
}

#[test]
fn drawing_coordinates_outside_the_raster_number_range_fail_before_drawing() {
    let record = _feature(
        GeometryType::Polygon,
        &[],
        vec![vec![
            [-f64::from(f32::MAX) * 2.0, 0.0],
            [10.0, 10.0],
            [10.0, 20.0],
        ]],
    );
    let tile = _ProjectedTile {
        tile: Arc::new(DecodedTile::from_features(HashMap::new())),
        x: 0.0,
        y: 0.0,
        size: 512.0,
        clip: [0.0, 0.0, 512.0, 512.0],
    };
    let mut projection = _Projection::default();
    let result = SceneCompiler::_draw_paths(
        &mut projection,
        record.geometry().unwrap(),
        &tile,
        1.0,
        &_camera(),
    );
    assert!(result.err().unwrap().contains("finite float32"));
}

#[test]
fn decoded_tile_byte_budget_evicts_before_adding_a_new_pinned_body() {
    let mut compiler = SceneCompiler::default();
    let retained_bytes = 64 * 1024 * 1024 - 2;
    compiler._tiles.push_back(_CachedTile {
        key: "old".into(),
        tile: Arc::new(DecodedTile::from_features(HashMap::new())),
        bytes: retained_bytes,
    });
    compiler._cached_bytes = retained_bytes;
    compiler
        .compile({
            let mut input = _input();
            input.tiles.push(_TileInput {
                world_offset: 0,
                key: "new".into(),
                address: _Address { z: 0, x: 0, y: 0 },
                bytes: base64::engine::general_purpose::STANDARD.encode([8, 1, 8, 1]),
            });
            input
        })
        .unwrap();
    assert_eq!(compiler._tiles.len(), 1);
    assert_eq!(compiler._tiles[0].key, "new");
    assert_eq!(compiler._cached_bytes, 4);
}

#[test]
fn inactive_building_geometry_is_not_interpreted_until_its_style_zoom() {
    // A well-framed protobuf feature with a truncated MoveTo command. The layer
    // exists in the tile, but buildings have no visual role below zoom 15.
    let bytes = [
        0x1a, 21, 0x0a, 9, b'b', b'u', b'i', b'l', b'd', b'i', b'n', b'g', b's', 0x12, 6, 0x18, 3,
        0x22, 2, 9, 1, 0x78, 2,
    ];
    let mut compiler = SceneCompiler::default();
    let mut input = _input();
    input.tiles.push(_TileInput {
        world_offset: 0,
        key: "same-pinned-resource".into(),
        address: _Address { z: 0, x: 0, y: 0 },
        bytes: base64::engine::general_purpose::STANDARD.encode(bytes),
    });
    assert!(compiler.compile(input).unwrap().commands.is_empty());
    let mut input = _input();
    input.camera.zoom = 15.0;
    input.tiles.push(_TileInput {
        world_offset: 0,
        key: "same-pinned-resource".into(),
        address: _Address { z: 0, x: 0, y: 0 },
        bytes: base64::engine::general_purpose::STANDARD.encode(bytes),
    });
    assert!(
        compiler
            .compile(input)
            .err()
            .unwrap()
            .contains("truncated coordinates")
    );
}
