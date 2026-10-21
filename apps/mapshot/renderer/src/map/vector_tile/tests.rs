use super::*;

fn _feature(geometry_type: i32, geometry: &[u32]) -> _Feature {
    _Feature {
        r#type: Some(geometry_type),
        geometry: geometry.to_vec(),
        ..Default::default()
    }
}

fn _layer(features: Vec<_Feature>) -> _Layer {
    _Layer {
        version: 2,
        name: "roads".to_string(),
        features: features
            .into_iter()
            .map(|feature| feature.encode_to_vec())
            .collect(),
        ..Default::default()
    }
}

fn _decode_layer(layer: _Layer) -> Result<DecodedTile, String> {
    let tile = decode(
        &_Tile {
            layers: vec![layer],
        }
        .encode_to_vec(),
    )?;
    tile.features("roads")?;
    Ok(tile)
}

#[test]
fn point_and_multipoint_commands_preserve_cursor_deltas_and_feature_order() {
    let tile = _decode_layer(_layer(vec![
        _feature(1, &[9, 20, 30]),
        _feature(1, &[17, 20, 30, 9, 10]),
    ]))
    .unwrap();
    let features = tile.features("roads").unwrap();
    assert_eq!(features.len(), 2);
    assert!(matches!(features[0].geometry_type, GeometryType::Point));
    assert_eq!(features[0].extent, 4096.0);
    assert_eq!(
        features[0].geometry().unwrap().paths,
        vec![vec![[10.0, 15.0]]]
    );
    assert_eq!(features[0].bounds, [10.0, 15.0, 10.0, 15.0]);
    assert_eq!(
        features[1].geometry().unwrap().paths,
        vec![vec![[10.0, 15.0]], vec![[5.0, 20.0]]]
    );
    assert_eq!(features[1].bounds, [5.0, 15.0, 10.0, 20.0]);
    assert_eq!(
        features[1].geometry().unwrap().path_bounds,
        vec![[10.0, 15.0, 10.0, 15.0], [5.0, 20.0, 5.0, 20.0]]
    );
}

#[test]
fn multilinestring_coordinates_extend_beyond_extent_without_clipping() {
    let mut layer = _layer(vec![_feature(
        2,
        &[9, 3, 6, 18, 20, 0, 0, 9, 9, 21, 4, 10, 0, 12],
    )]);
    layer.extent = Some(8);
    let tile = _decode_layer(layer).unwrap();
    let feature = &tile.features("roads").unwrap()[0];
    assert!(matches!(feature.geometry_type, GeometryType::LineString));
    assert_eq!(feature.extent, 8.0);
    assert_eq!(
        feature.geometry().unwrap().paths,
        vec![
            vec![[-2.0, 3.0], [8.0, 3.0], [8.0, -2.0]],
            vec![[-3.0, 0.0], [-3.0, 6.0]]
        ]
    );
    assert_eq!(feature.bounds, [-3.0, -2.0, 8.0, 6.0]);
    assert_eq!(
        feature.geometry().unwrap().path_bounds,
        vec![[-2.0, -2.0, 8.0, 3.0], [-3.0, 0.0, -3.0, 6.0]]
    );
}

#[test]
fn polygon_close_repeats_first_vertex_and_preserves_cursor_for_next_ring() {
    let tile = _decode_layer(_layer(vec![_feature(
        3,
        &[9, 20, 30, 18, 10, 0, 0, 9, 15, 9, 45, 0, 18, 4, 0, 0, 6, 15],
    )]))
    .unwrap();
    let feature = &tile.features("roads").unwrap()[0];
    assert!(matches!(feature.geometry_type, GeometryType::Polygon));
    assert_eq!(
        feature.geometry().unwrap().paths,
        vec![
            vec![[10.0, 15.0], [15.0, 15.0], [15.0, 10.0], [10.0, 15.0]],
            vec![[-8.0, 10.0], [-6.0, 10.0], [-6.0, 13.0], [-8.0, 10.0]],
        ]
    );
    assert_eq!(feature.bounds, [-8.0, 10.0, 15.0, 15.0]);
    assert_eq!(
        feature.geometry().unwrap().path_bounds,
        vec![[10.0, 10.0, 15.0, 15.0], [-8.0, 10.0, -6.0, 13.0]]
    );
}

#[test]
fn all_scalar_wire_types_map_to_style_properties_and_last_duplicate_tag_wins() {
    let values = vec![
        _Value {
            value: Some(_ValueKind::String("first".to_string())),
        },
        _Value {
            value: Some(_ValueKind::Float(1.25)),
        },
        _Value {
            value: Some(_ValueKind::Double(-2.5)),
        },
        _Value {
            value: Some(_ValueKind::Int(-3)),
        },
        _Value {
            value: Some(_ValueKind::Uint(u64::MAX)),
        },
        _Value {
            value: Some(_ValueKind::Sint(-5)),
        },
        _Value {
            value: Some(_ValueKind::Bool(false)),
        },
        _Value::default(),
        _Value {
            value: Some(_ValueKind::String("last".to_string())),
        },
    ];
    let mut feature = _feature(1, &[9, 0, 0]);
    feature.id = Some(17);
    feature.tags = vec![0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 0, 8];
    let mut layer = _layer(vec![feature]);
    layer.keys = [
        "string", "float", "double", "int", "uint", "sint", "bool", "null",
    ]
    .into_iter()
    .map(str::to_string)
    .collect();
    layer.values = values;
    let tile = _decode_layer(layer).unwrap();
    let properties = &tile.features("roads").unwrap()[0].properties;
    assert_eq!(properties.len(), 8);
    assert!(matches!(&properties["string"], Property::String(value) if value == "last"));
    for (key, expected) in [
        ("float", 1.25),
        ("double", -2.5),
        ("int", -3.0),
        ("uint", u64::MAX as f64),
        ("sint", -5.0),
    ] {
        assert!(matches!(properties[key], Property::Number(value) if value == expected));
    }
    assert!(matches!(properties["bool"], Property::Bool(false)));
    assert!(matches!(properties["null"], Property::Null));
}

#[test]
fn duplicate_populated_layers_replace_prior_features_and_empty_layers_do_not() {
    let bytes = _Tile {
        layers: vec![
            _layer(vec![_feature(1, &[9, 2, 2])]),
            _layer(vec![_feature(1, &[9, 4, 6])]),
            _layer(Vec::new()),
        ],
    }
    .encode_to_vec();
    let tile = decode(&bytes).unwrap();
    assert_eq!(
        tile.features("roads").unwrap()[0].geometry().unwrap().paths,
        vec![vec![[2.0, 3.0]]]
    );
}

#[test]
fn unknown_features_are_skipped_without_interpreting_experimental_geometry() {
    let tile = _decode_layer(_layer(vec![
        _feature(0, &[8]),
        _Feature::default(),
        _feature(1, &[9, 0, 0]),
    ]))
    .unwrap();
    assert_eq!(tile.features("roads").unwrap().len(), 1);
    let tile = _decode_layer(_layer(vec![_feature(0, &[8])])).unwrap();
    assert!(tile.features("roads").unwrap().is_empty());
}

#[test]
fn protobuf_unknown_fields_are_ignored_and_truncated_messages_are_rejected() {
    let mut bytes = _Tile {
        layers: vec![_layer(vec![_feature(1, &[9, 0, 0])])],
    }
    .encode_to_vec();
    bytes.extend_from_slice(&[128, 1, 7]);
    assert!(decode(&bytes).is_ok());
    for bytes in [vec![26, 3, 10], vec![128], vec![26, 255, 255, 255, 255, 15]] {
        assert_eq!(
            decode(&bytes).err().unwrap(),
            "invalid vector tile protobuf"
        );
    }
    assert!(decode(&[]).unwrap().features("roads").unwrap().is_empty());
}

#[test]
fn invalid_property_indices_and_unpaired_tags_are_rejected() {
    for (tags, message) in [
        (vec![0], "vector tile tags require key and value pairs"),
        (
            vec![1, 0],
            "vector tile property key index is out of bounds",
        ),
        (
            vec![0, 1],
            "vector tile property value index is out of bounds",
        ),
    ] {
        let mut feature = _feature(1, &[9, 0, 0]);
        feature.tags = tags;
        let mut layer = _layer(vec![feature]);
        layer.keys = vec!["name".to_string()];
        layer.values = vec![_Value::default()];
        assert_eq!(_decode_layer(layer).err().unwrap(), message);
    }
}

#[test]
fn zero_extents_and_unsupported_geometry_types_are_rejected() {
    let mut layer = _layer(vec![_feature(1, &[9, 0, 0])]);
    layer.extent = Some(0);
    assert_eq!(
        _decode_layer(layer).err().unwrap(),
        "vector tile extent must be positive"
    );
    assert_eq!(
        _decode_layer(_layer(vec![_feature(4, &[9, 0, 0])]))
            .err()
            .unwrap(),
        "unsupported vector tile geometry type"
    );
}

#[test]
fn malformed_geometry_fails_before_reading_coordinates_or_expanding_commands() {
    for (geometry, message) in [
        (vec![9, 0], "vector tile geometry has truncated coordinates"),
        (
            vec![u32::MAX - 6],
            "vector tile geometry has truncated coordinates",
        ),
        (vec![10, 0, 0], "vector tile line requires a starting point"),
        (vec![15], "vector tile ring requires a starting point"),
        (
            vec![9, 0, 0, 23],
            "vector tile close command requires one repetition",
        ),
        (vec![11], "unsupported vector tile geometry command"),
    ] {
        assert_eq!(
            _decode_layer(_layer(vec![_feature(3, &geometry)]))
                .err()
                .unwrap(),
            message
        );
    }
}

#[test]
fn zero_count_commands_and_empty_geometry_preserve_empty_bounds() {
    let tile = _decode_layer(_layer(vec![_feature(1, &[0, 1, 2, 7]), _feature(2, &[])])).unwrap();
    for feature in tile.features("roads").unwrap() {
        assert!(feature.geometry().unwrap().paths.is_empty());
        assert!(feature.geometry().unwrap().path_bounds.is_empty());
        assert_eq!(
            feature.bounds,
            [
                f64::INFINITY,
                f64::INFINITY,
                f64::NEG_INFINITY,
                f64::NEG_INFINITY
            ]
        );
    }
}

#[test]
fn multiple_scalar_fields_preserve_the_last_wire_value_in_both_orders() {
    let string = _Value {
        value: Some(_ValueKind::String("name".to_string())),
    }
    .encode_to_vec();
    let number = _Value {
        value: Some(_ValueKind::Double(17.25)),
    }
    .encode_to_vec();
    let string_then_number = [string.as_slice(), number.as_slice()].concat();
    let number_then_string = [number.as_slice(), string.as_slice()].concat();
    assert!(matches!(
        _property(&_Value::decode(string_then_number.as_slice()).unwrap()),
        Property::Number(17.25)
    ));
    assert!(matches!(
        _property(&_Value::decode(number_then_string.as_slice()).unwrap()),
        Property::String(value) if value == "name"
    ));
}

#[test]
fn sint64_properties_preserve_decoded_sign_and_value() {
    for (input, expected) in [
        (0, 0.0),
        (-1, -1.0),
        (1, 1.0),
        (-4_503_599_627_370_496, -4_503_599_627_370_496.0),
        (-4_503_599_627_370_497, -4_503_599_627_370_497.0),
        (-9_007_199_254_740_992, -9_007_199_254_740_992.0),
        (9_007_199_254_740_991, 9_007_199_254_740_991.0),
        (i64::MIN, -9_223_372_036_854_775_808.0),
        (i64::MAX, 9_223_372_036_854_775_808.0),
    ] {
        let bytes = _Value {
            value: Some(_ValueKind::Sint(input)),
        }
        .encode_to_vec();
        let property = _property(&_Value::decode(bytes.as_slice()).unwrap());
        assert!(
            matches!(property, Property::Number(value) if value == expected),
            "sint64 {input}"
        );
    }
}

#[test]
fn unused_layers_do_not_validate_feature_wire_tags_geometry_or_extents() {
    let mut invalid_tags = _layer(vec![_feature(1, &[9, 0, 0])]);
    let mut feature = _feature(1, &[9, 0, 0]);
    feature.tags = vec![0];
    invalid_tags.features[0] = feature.encode_to_vec();
    let invalid_geometry = _layer(vec![_feature(3, &[9, 0])]);
    let mut invalid_extent = _layer(vec![_feature(1, &[9, 0, 0])]);
    invalid_extent.extent = Some(0);
    let mut invalid_wire = _layer(Vec::new());
    invalid_wire.features = vec![vec![34, 1, 128]];
    for mut unused in [invalid_tags, invalid_geometry, invalid_extent, invalid_wire] {
        unused.name = "unused".to_string();
        let tile = decode(
            &_Tile {
                layers: vec![_layer(vec![_feature(1, &[9, 2, 4])]), unused],
            }
            .encode_to_vec(),
        )
        .unwrap();
        assert_eq!(
            tile.features("roads").unwrap()[0].geometry().unwrap().paths,
            vec![vec![[1.0, 2.0]]]
        );
        assert!(tile.features("absent").unwrap().is_empty());
        let error = tile.features("unused").err().unwrap();
        assert_eq!(tile.features("unused").err().unwrap(), error);
    }
}

#[test]
fn repeated_layer_reads_reuse_the_same_materialized_features() {
    let tile = _decode_layer(_layer(vec![_feature(1, &[9, 0, 0])])).unwrap();
    assert!(std::ptr::eq(
        tile.features("roads").unwrap(),
        tile.features("roads").unwrap()
    ));
}

#[test]
fn layer_features_compute_bounds_without_allocating_paths_until_geometry_is_requested() {
    let tile = _decode_layer(_layer(vec![_feature(2, &[9, 2, 4, 10, 8, 12])])).unwrap();
    let feature = &tile.features("roads").unwrap()[0];
    assert_eq!(feature.bounds, [1.0, 2.0, 5.0, 8.0]);
    assert!(feature._geometry.get().is_none());
    let geometry = feature.geometry().unwrap();
    assert_eq!(geometry.paths, vec![vec![[1.0, 2.0], [5.0, 8.0]]]);
    assert!(std::ptr::eq(geometry, feature.geometry().unwrap()));
}
